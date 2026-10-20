"""Carga en la base de datos (MySQL) el respaldo creado con ``exportar_appwrite``.

    python manage.py importar_appwrite respaldo_appwrite --email dueño@correo.com
    python manage.py importar_appwrite respaldo_appwrite --email dueño@correo.com --dry-run

- Cuentas: cada usuario de Appwrite se crea en Django con su mismo correo. Si la contraseña
  estaba en Argon2 (lo normal en Appwrite) sigue funcionando; si no, hay que restablecerla
  (``manage.py changepassword <correo>``).
- Datos: todo va a una clínica del usuario ``--email`` (o al dueño indicado en los permisos
  del documento, si cada documento tenía permisos por usuario).
- Tratamientos: costLab/costTech/costOther pasan a ser gastos del tratamiento.
- Comprobantes: se copian desde <carpeta>/archivos al almacenamiento de Django (MEDIA_ROOT).
Todo se hace en una sola transacción: si algo falla no queda nada a medias.
"""
import json
import re
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.dateparse import parse_datetime

from clinica.models import Clinic, Debt, Expense, Service, Treatment, TreatmentCost

TREATMENT_COSTS = [('costLab', 'Laboratorio'), ('costTech', 'Técnico'), ('costOther', 'Otros')]
USER_PERMISSION = re.compile(r'user:([A-Za-z0-9._-]+)')


class DryRun(Exception):
    pass


def money(value):
    try:
        return max(Decimal(str(value or 0)), Decimal('0')).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return Decimal('0.00')


def text(value, limit):
    return str(value or '').strip()[:limit]


def to_date(value, fallback=None):
    """Acepta '2025-10-05', ISO con hora o el $createdAt de Appwrite."""
    for candidate in (value, fallback):
        if candidate and re.match(r'^\d{4}-\d{2}-\d{2}', str(candidate)):
            return date.fromisoformat(str(candidate)[:10])
    return date.today()


def source(value):
    v = str(value or '').strip().lower()
    return 'Externo' if v.startswith('ext') else 'Clínica'


def owner_ids(doc):
    return {m.group(1) for p in doc.get('$permissions', []) for m in [USER_PERMISSION.search(p)] if m}


class Command(BaseCommand):
    help = 'Importa a la base de datos el respaldo de Appwrite creado con exportar_appwrite.'

    def add_arguments(self, parser):
        parser.add_argument('carpeta', help='Carpeta creada por exportar_appwrite.')
        parser.add_argument('--email', required=True,
                            help='Correo del dueño de los datos (cuenta de Appwrite o de Django).')
        parser.add_argument('--clinica', default='', help='Nombre de la clínica (por defecto el de Appwrite).')
        parser.add_argument('--deudas-de-saldos', action='store_true',
                            help='Crear una deuda por el saldo pendiente de cada tratamiento '
                                 '(como hace la app nueva). La versión anterior no lo hacía.')
        parser.add_argument('--dry-run', action='store_true', help='Simula la importación sin guardar nada.')

    def handle(self, *args, **opts):
        folder = Path(opts['carpeta'])
        if not (folder / 'treatments.json').exists():
            raise CommandError(f'{folder} no parece un respaldo de exportar_appwrite (falta treatments.json)')
        self.folder = folder
        self.dry = opts['dry_run']
        data = {name: self.load(name) for name in
                ['treatments', 'expenses', 'debts', 'services', 'clinics', 'users', 'files']}
        self.files = {f['$id']: f for f in data['files']}

        try:
            with transaction.atomic():
                users = self.import_users(data['users'])
                default_owner = self.find_owner(opts['email'])
                groups = self.group_by_owner(data, users, default_owner)
                for owner, docs in groups.items():
                    self.import_clinic(owner, docs, opts)
                if self.dry:
                    raise DryRun
        except DryRun:
            self.stdout.write(self.style.WARNING('Simulación (--dry-run): no se guardó nada.'))
            return
        self.stdout.write(self.style.SUCCESS('Importación completa.'))

    # --- carga ---
    def load(self, name):
        path = self.folder / f'{name}.json'
        return json.loads(path.read_text(encoding='utf-8')) if path.exists() else []

    # --- usuarios ---
    def import_users(self, appwrite_users):
        """Devuelve {id de Appwrite: usuario de Django}."""
        User = get_user_model()
        mapping = {}
        for au in appwrite_users:
            email = (au.get('email') or '').strip().lower()
            if not email:
                continue
            user = User.objects.filter(email__iexact=email).first()
            if user is None:
                first, _, last = (au.get('name') or '').strip().partition(' ')
                user = User(username=email, email=email, first_name=first[:150], last_name=last[:150])
                password = self.django_password(au)
                if password:
                    user.password = password
                    note = 'con su misma contraseña'
                else:
                    user.set_unusable_password()
                    note = f'SIN contraseña: usa "manage.py changepassword {email}"'
                user.save()
                self.stdout.write(f'  cuenta creada: {email} ({note})')
            mapping[au['$id']] = user
        return mapping

    @staticmethod
    def django_password(au):
        """Convierte el hash de Appwrite al formato de Django (solo Argon2, el que usa Appwrite)."""
        phc = au.get('password') or ''
        if (au.get('hash') or 'argon2') == 'argon2' and phc.startswith('$argon2'):
            return 'argon2' + phc
        return ''

    def find_owner(self, email):
        User = get_user_model()
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            raise CommandError(f'No existe la cuenta {email} ni en Appwrite ni en Django. '
                               'Créala primero (regístrate en la app o usa createsuperuser).')
        return user

    def group_by_owner(self, data, users, default_owner):
        groups = defaultdict(lambda: defaultdict(list))
        for name in ['treatments', 'expenses', 'debts', 'services', 'clinics']:
            for doc in data[name]:
                owners = [users[i] for i in owner_ids(doc) if i in users]
                groups[owners[0] if len(owners) == 1 else default_owner][name].append(doc)
        return groups

    # --- clínica ---
    def import_clinic(self, owner, docs, opts):
        info = docs['clinics'][0] if docs['clinics'] else {}
        name = text(opts['clinica'] or info.get('name') or 'Clínica Dental', 150)
        clinic = self.target_clinic(owner, name)
        clinic.name = name
        clinic.email = text(info.get('email') or clinic.email or owner.email, 254)
        clinic.save()
        self.stdout.write(f'Clínica "{clinic.name}" de {owner.email}:')

        self.import_services(clinic, docs['services'])
        n_files = 0
        for doc in docs['expenses']:
            e = Expense.objects.create(
                clinic=clinic, description=text(doc.get('description') or doc.get('title'), 255) or 'Gasto',
                category=text(doc.get('category'), 120) or 'Otros', amount=money(doc.get('amount')),
                date=to_date(doc.get('date'), doc.get('$createdAt')))
            n_files += self.attach(e, doc)
        for doc in docs['treatments']:
            total = money(doc.get('total'))
            t = Treatment.objects.create(
                clinic=clinic, patient=text(doc.get('patient') or doc.get('patientName'), 150) or 'Paciente',
                type=text(doc.get('type') or doc.get('serviceType'), 200) or 'Tratamiento',
                source=source(doc.get('source')), date=to_date(doc.get('date'), doc.get('$createdAt')),
                total=total, paid=min(money(doc.get('paid')), total))
            TreatmentCost.objects.bulk_create([
                TreatmentCost(treatment=t, concept=label, amount=money(doc.get(field)))
                for field, label in TREATMENT_COSTS if money(doc.get(field)) > 0])
            n_files += self.attach(t, doc)
            if opts['deudas_de_saldos']:
                t.sync_debt()
        for doc in docs['debts']:
            d = Debt.objects.create(
                clinic=clinic, patient=text(doc.get('patient'), 150) or 'Paciente',
                description=text(doc.get('description'), 255) or 'Deuda', amount=money(doc.get('amount')),
                due_date=to_date(doc.get('dueDate') or doc.get('date'), doc.get('$createdAt')),
                source=source(doc.get('source')),
                status='Pagado' if str(doc.get('status', '')).lower() in ('pagado', 'paid') else 'Pendiente')
            n_files += self.attach(d, doc)

        self.stdout.write(f'  gastos: {len(docs["expenses"])}, tratamientos: {len(docs["treatments"])}, '
                          f'deudas: {len(docs["debts"])}, comprobantes: {n_files}')

    def target_clinic(self, owner, name):
        """Reutiliza la clínica vacía que se crea al registrarse; nunca mezcla con datos existentes."""
        clinics = list(Clinic.objects.filter(owner=owner))
        for clinic in clinics:
            has_data = (clinic.treatments.exists() or clinic.expenses.exists() or clinic.debts.exists())
            if clinic.name == name and has_data:
                raise CommandError(f'{owner.email} ya tiene la clínica "{name}" con datos: parece que ya '
                                   'se importó. Usa --clinica "Otro nombre" si quieres importarla de nuevo.')
        empty = [c for c in clinics if not (c.treatments.exists() or c.expenses.exists() or c.debts.exists())]
        if len(clinics) == 1 and empty:
            return empty[0]
        return Clinic(owner=owner)

    def import_services(self, clinic, services):
        """Los servicios de Appwrite reemplazan a los del catálogo con el mismo nombre."""
        existing = {s.title.lower(): s for s in Service.objects.filter(clinic=clinic)}
        order = max([s.order for s in existing.values()] or [0])
        for doc in services:
            title = text(doc.get('title'), 200)
            if not title:
                continue
            service = existing.get(title.lower())
            if service is None:
                order += 1
                service = Service(clinic=clinic, title=title, order=order)
            service.desc = str(doc.get('desc') or service.desc or '')
            service.price = money(doc.get('price'))
            service.category = source(doc.get('category'))
            if re.match(r'^#[0-9A-Fa-f]{6}$', str(doc.get('color') or '')):
                service.color = doc['color']
            service.save()
        if services:
            self.stdout.write(f'  servicios: {len(services)}')

    # --- comprobantes y fechas ---
    def attach(self, obj, doc):
        """Copia el comprobante y conserva la fecha de creación original. Devuelve 1 si hubo archivo."""
        attached = self.copy_voucher(obj, doc)
        created = parse_datetime(doc.get('$createdAt') or '')
        if created:
            type(obj).objects.filter(pk=obj.pk).update(created_at=created)
        return attached

    def copy_voucher(self, obj, doc):
        ref = str(doc.get('voucher') or '').strip()
        if not ref:
            return 0
        match = re.search(r'/files/([^/?]+)', ref)
        file_id = match.group(1) if match else ref
        path = self.folder / 'archivos' / file_id
        if not path.exists():
            self.stderr.write(self.style.WARNING(f'  comprobante {file_id} no está en el respaldo, se omite'))
            return 0
        if not self.dry:
            meta = self.files.get(file_id, {})
            filename = re.sub(r'[^\w.\-]', '_', meta.get('name') or file_id)[-80:]
            obj.voucher.save(filename, ContentFile(path.read_bytes()), save=True)
        return 1
