"""Almacenamiento de comprobantes en Appwrite Storage.

Render Free no tiene disco persistente: todo lo que se guarda en disco se pierde
en cada deploy o reinicio. Con este backend los comprobantes se guardan en un bucket
de Appwrite y Django los sirve a través de /comprobantes/... (solo al dueño).

Nombre guardado en la BD: ``vouchers/<clinica>/<tipo>/<fileId>__<archivo>``.
"""
import mimetypes
import posixpath
import re
import uuid

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible

CHUNK_SIZE = 5 * 1024 * 1024  # Appwrite exige subir por partes los archivos > 5 MB
TIMEOUT = 30


@deconstructible
class AppwriteStorage(Storage):
    def __init__(self):
        self.endpoint = settings.APPWRITE_ENDPOINT
        self.project = settings.APPWRITE_PROJECT_ID
        self.key = settings.APPWRITE_API_KEY
        self.bucket = settings.APPWRITE_BUCKET_ID

    # --- helpers ---
    def _headers(self, **extra):
        return {'X-Appwrite-Project': self.project, 'X-Appwrite-Key': self.key, **extra}

    def _files_url(self, file_id=''):
        url = f'{self.endpoint}/storage/buckets/{self.bucket}/files'
        return f'{url}/{file_id}' if file_id else url

    @staticmethod
    def file_id(name):
        base = posixpath.basename(name)
        return base.split('__', 1)[0] if '__' in base else base

    # --- API de Storage ---
    def _save(self, name, content):
        directory, filename = posixpath.split(name.replace('\\', '/'))
        filename = re.sub(r'[^\w.\-]', '_', filename)[-80:] or 'archivo'
        file_id = uuid.uuid4().hex
        content.seek(0)
        data = content.read()
        size = len(data)
        mime = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        start = 0
        while True:
            chunk = data[start:start + CHUNK_SIZE]
            end = start + len(chunk)
            headers = self._headers()
            if size > CHUNK_SIZE:
                headers['Content-Range'] = f'bytes {start}-{end - 1}/{size}'
                if start > 0:
                    headers['X-Appwrite-ID'] = file_id
            resp = requests.post(
                self._files_url(), headers=headers, data={'fileId': file_id},
                files={'file': (filename, chunk, mime)}, timeout=TIMEOUT,
            )
            resp.raise_for_status()
            start = end
            if start >= size:
                break
        return posixpath.join(directory, f'{file_id}__{filename}')

    def _open(self, name, mode='rb'):
        resp = requests.get(self._files_url(self.file_id(name)) + '/download',
                            headers=self._headers(), timeout=TIMEOUT)
        resp.raise_for_status()
        f = ContentFile(resp.content, name=posixpath.basename(name))
        f.content_type = resp.headers.get('Content-Type')
        return f

    def delete(self, name):
        if not name:
            return
        resp = requests.delete(self._files_url(self.file_id(name)), headers=self._headers(), timeout=TIMEOUT)
        if resp.status_code not in (200, 204, 404):
            resp.raise_for_status()

    def exists(self, name):
        # Cada archivo recibe un id único, nunca hay colisiones de nombre.
        return False

    def size(self, name):
        resp = requests.get(self._files_url(self.file_id(name)), headers=self._headers(), timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.json().get('sizeOriginal', 0)

    def url(self, name):
        return settings.MEDIA_URL + name

    def ping(self):
        """Petición liviana a Appwrite para registrar actividad en el proyecto."""
        resp = requests.get(self._files_url(), headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return True
