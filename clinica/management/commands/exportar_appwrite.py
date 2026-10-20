"""Descarga TODO lo que la versión anterior (Astro) guardaba en Appwrite a una carpeta local.

    python manage.py exportar_appwrite respaldo_appwrite

Crea un respaldo completo que no depende de Appwrite:
    <carpeta>/treatments.json, expenses.json, debts.json, services.json, clinics.json
    <carpeta>/users.json            (cuentas, con el hash de la contraseña)
    <carpeta>/files.json            (metadatos de los comprobantes)
    <carpeta>/archivos/<fileId>     (los comprobantes)

Luego se cargan en la base de datos (MySQL) con ``importar_appwrite``.

Variables (en .env o en el entorno). Se aceptan también los nombres PUBLIC_* del .env de Astro:
    APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, APPWRITE_BUCKET_ID
    APPWRITE_TREATMENTS_COLLECTION_ID, ..._EXPENSES_..., ..._DEBTS_..., ..._SERVICES_..., ..._CLINICS_...
Si faltan los ids de las colecciones se buscan por nombre dentro de la base de datos.
La API key necesita los permisos: databases.read, collections.read, documents.read, files.read y users.read.
"""
import json
import os
from pathlib import Path

import requests
from django.core.management.base import BaseCommand, CommandError

COLLECTIONS = ['treatments', 'expenses', 'debts', 'services', 'clinics']
PAGE = 100
TIMEOUT = 60


def env(*names):
    for name in names:
        value = os.environ.get(name, '').strip()
        if value:
            return value
    return ''


class Appwrite:
    def __init__(self, endpoint, project, key):
        self.endpoint = endpoint.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({'X-Appwrite-Project': project, 'X-Appwrite-Key': key})
        self.json_queries = True  # Appwrite >= 1.5; las versiones viejas usan 'limit(100)'

    def get(self, path, **params):
        resp = self.session.get(self.endpoint + path, params=params, timeout=TIMEOUT)
        if resp.status_code >= 400:
            raise CommandError(f'Appwrite {resp.status_code} en {path}: {resp.text[:300]}')
        return resp

    def _queries(self, offset):
        if self.json_queries:
            return [json.dumps({'method': 'limit', 'values': [PAGE]}),
                    json.dumps({'method': 'offset', 'values': [offset]})]
        return [f'limit({PAGE})', f'offset({offset})']

    def list_all(self, path, key):
        items, offset = [], 0
        while True:
            try:
                data = self.get(path, **{'queries[]': self._queries(offset)}).json()
            except CommandError:
                if offset or not self.json_queries:
                    raise
                self.json_queries = False
                continue
            batch = data.get(key, [])
            items.extend(batch)
            offset += len(batch)
            if not batch or offset >= data.get('total', 0):
                return items


class Command(BaseCommand):
    help = 'Respalda los datos de Appwrite (documentos, usuarios y comprobantes) en una carpeta local.'

    def add_arguments(self, parser):
        parser.add_argument('carpeta', help='Carpeta donde se guardará el respaldo.')
        parser.add_argument('--sin-usuarios', action='store_true',
                            help='No exportar las cuentas (si la API key no tiene users.read).')

    def handle(self, *args, **opts):
        endpoint = env('APPWRITE_ENDPOINT', 'PUBLIC_APPWRITE_ENDPOINT')
        project = env('APPWRITE_PROJECT_ID', 'PUBLIC_APPWRITE_PROJECT_ID')
        key = env('APPWRITE_API_KEY')
        database = env('APPWRITE_DATABASE_ID', 'PUBLIC_APPWRITE_DATABASE_ID')
        bucket = env('APPWRITE_BUCKET_ID', 'PUBLIC_APPWRITE_BUCKET_ID')
        missing = [n for n, v in [('APPWRITE_ENDPOINT', endpoint), ('APPWRITE_PROJECT_ID', project),
                                  ('APPWRITE_API_KEY', key), ('APPWRITE_DATABASE_ID', database)] if not v]
        if missing:
            raise CommandError('Faltan variables: ' + ', '.join(missing))

        out = Path(opts['carpeta'])
        (out / 'archivos').mkdir(parents=True, exist_ok=True)
        api = Appwrite(endpoint, project, key)

        collection_ids = self.resolve_collections(api, database)
        for name in COLLECTIONS:
            cid = collection_ids.get(name)
            if not cid:
                self.stderr.write(self.style.WARNING(f'  {name}: colección no encontrada, se omite'))
                docs = []
            else:
                docs = api.list_all(f'/databases/{database}/collections/{cid}/documents', 'documents')
            self.dump(out / f'{name}.json', docs)
            self.stdout.write(f'  {name}: {len(docs)} documentos')

        if opts['sin_usuarios']:
            users = []
        else:
            try:
                users = api.list_all('/users', 'users')
            except CommandError as exc:
                self.stderr.write(self.style.WARNING(f'  usuarios: no se pudieron leer ({exc}). '
                                                     'Agrega users.read a la API key o usa --sin-usuarios.'))
                users = []
        self.dump(out / 'users.json', users)
        self.stdout.write(f'  usuarios: {len(users)}')

        files = []
        if bucket:
            files = api.list_all(f'/storage/buckets/{bucket}/files', 'files')
            for i, f in enumerate(files, 1):
                target = out / 'archivos' / f['$id']
                if not target.exists():
                    resp = api.get(f'/storage/buckets/{bucket}/files/{f["$id"]}/download')
                    target.write_bytes(resp.content)
                if i % 20 == 0:
                    self.stdout.write(f'    {i}/{len(files)} archivos...')
        else:
            self.stderr.write(self.style.WARNING('  APPWRITE_BUCKET_ID no definido: no se descargan comprobantes'))
        self.dump(out / 'files.json', files)
        self.stdout.write(f'  comprobantes: {len(files)}')
        self.stdout.write(self.style.SUCCESS(f'Respaldo listo en {out.resolve()}'))

    def resolve_collections(self, api, database):
        ids = {}
        for name in COLLECTIONS:
            ids[name] = env(f'APPWRITE_{name.upper()}_COLLECTION_ID', f'PUBLIC_{name.upper()}_COLLECTION_ID')
        if all(ids.values()):
            return ids
        found = api.list_all(f'/databases/{database}/collections', 'collections')
        for col in found:
            label = (col.get('name') or '').strip().lower()
            for name in COLLECTIONS:
                if not ids[name] and name in (label, col['$id'].lower()):
                    ids[name] = col['$id']
        return ids

    @staticmethod
    def dump(path, data):
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
