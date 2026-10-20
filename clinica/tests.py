import json
import sys
import unittest
import tempfile
from pathlib import Path
from datetime import date

import django

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from .models import Clinic, Debt, Expense, Service, Treatment
from .services_catalog import CATALOG

TOTAL_SERVICES = sum(len(g['services']) for g in CATALOG)


class ApiTests(TestCase):
    def setUp(self):
        resp = self.client.post('/api/auth/register', json.dumps({
            'firstName': 'Ana', 'lastName': 'Pérez', 'email': 'ana@test.local', 'password': 'clave-segura-1',
            'clinic': 'Sonrisas Centro',
        }), content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        self.user = get_user_model().objects.get(email='ana@test.local')
        self.clinic = Clinic.objects.get(owner=self.user)

    def post_json(self, url, data):
        return self.client.post(url, json.dumps(data), content_type='application/json')

    def create_treatment(self, **overrides):
        data = {
            'patient': 'Juan Díaz', 'type': 'Tratamiento de conducto radicular', 'source': 'Clínica',
            'date': date.today().isoformat(), 'total': '450', 'paid': '200',
            'costs': json.dumps([{'concept': 'Laboratorio', 'amount': 50}, {'concept': 'Materiales', 'amount': 30},
                                 {'concept': 'Anestesia', 'amount': 20}]),
            'nextAppointment': '2030-01-15T10:30', 'appointmentNote': 'Segunda sesión',
        }
        data.update(overrides)
        return self.client.post('/api/treatments', data)

    def test_register_creates_named_clinic(self):
        self.assertEqual(self.clinic.name, 'Sonrisas Centro')

    def test_catalog_seeded_on_register(self):
        self.assertEqual(Service.objects.filter(clinic=self.clinic).count(), TOTAL_SERVICES)
        specialties = set(Service.objects.filter(clinic=self.clinic).values_list('specialty', flat=True))
        self.assertIn('Implantología Oral', specialties)
        self.assertEqual(len(specialties), len(CATALOG))

    def test_treatment_with_multiple_costs_and_balance_creates_debt(self):
        resp = self.create_treatment()
        self.assertEqual(resp.status_code, 201, resp.content)
        t = resp.json()
        self.assertEqual(len(t['costs']), 3)
        self.assertEqual(t['totalCosts'], 100)
        self.assertEqual(t['balance'], 250)
        self.assertEqual(t['estimatedProfit'], 350)   # 450 - 100
        self.assertEqual(t['collectedProfit'], 100)   # 200 - 100
        self.assertEqual(t['nextAppointment'], '2030-01-15T10:30')

        debts = self.client.get('/api/debts').json()
        self.assertEqual(len(debts), 1)
        self.assertEqual(debts[0]['amount'], 250)
        self.assertEqual(debts[0]['status'], 'Pendiente')
        self.assertEqual(debts[0]['dueDate'], '2030-01-15')
        self.assertEqual(debts[0]['treatmentId'], t['id'])

    def test_paying_debt_settles_treatment(self):
        t = self.create_treatment().json()
        debt = Debt.objects.get(treatment_id=t['id'])
        self.assertEqual(self.post_json(f'/api/debts/{debt.id}/pay', {}).status_code, 200)
        treatment = Treatment.objects.get(pk=t['id'])
        self.assertEqual(treatment.paid, treatment.total)
        self.assertEqual(treatment.balance, 0)

    def test_full_payment_on_edit_marks_debt_paid(self):
        t = self.create_treatment().json()
        resp = self.client.post(f'/api/treatments/{t["id"]}', {
            'patient': 'Juan Díaz', 'type': t['type'], 'source': 'Clínica', 'date': t['date'],
            'total': '450', 'paid': '450', 'costs': '[]',
        })
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(Debt.objects.get(treatment_id=t['id']).status, 'Pagado')

    def test_paid_greater_than_total_rejected(self):
        resp = self.create_treatment(paid='500')
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(Treatment.objects.exists())

    def test_no_debt_when_fully_paid(self):
        self.create_treatment(paid='450')
        self.assertFalse(Debt.objects.exists())

    def test_summary_profit(self):
        self.create_treatment()
        self.client.post('/api/expenses', {
            'description': 'Guantes', 'category': 'Materiales', 'amount': '40', 'date': date.today().isoformat(),
        })
        data = self.client.get('/api/summary').json()
        m = data['months'][str(date.today().month - 1)]
        self.assertEqual(m['ingresos'], 450)
        self.assertEqual(m['cobrado'], 200)
        self.assertEqual(m['ganancia'], 100)
        self.assertEqual(m['gastos'], 40)
        self.assertEqual(data['totals']['deudasPendientes'], 250)

    def test_data_is_per_user(self):
        self.create_treatment()
        self.client.post('/api/auth/logout')
        self.post_json('/api/auth/register', {
            'firstName': 'Luis', 'lastName': 'Rojas', 'email': 'luis@test.local', 'password': 'clave-segura-2',
        })
        self.assertEqual(self.client.get('/api/treatments').json(), [])
        self.assertEqual(self.client.get('/api/debts').json(), [])

    @unittest.skipIf(sys.version_info >= (3, 14) and django.VERSION < (5, 2),
                     'El test client de Django < 5.2 no es compatible con Python 3.14 al renderizar plantillas')
    def test_pages_render(self):
        for url in ['/dashboard', '/gastos', '/tratamiento', '/deudas', '/ajustes']:
            self.assertEqual(self.client.get(url).status_code, 200, url)
        self.client.post('/api/auth/logout')
        self.assertEqual(self.client.get('/').status_code, 200)
        self.assertEqual(self.client.get('/dashboard').status_code, 302)


class MultiClinicTests(ApiTests):
    """Varias clínicas por usuario: los datos de cada una están separados."""

    def test_second_clinic_has_own_data(self):
        self.create_treatment()
        resp = self.post_json('/api/clinics', {'name': 'Sede Norte', 'phone': '999'})
        self.assertEqual(resp.status_code, 201)
        norte = resp.json()
        self.assertTrue(norte['active'])
        self.assertEqual(self.client.get('/api/treatments').json(), [])
        self.assertEqual(len(self.client.get('/api/services').json()), TOTAL_SERVICES)
        self.post_json(f'/api/clinics/{self.clinic.id}/activate', {})
        self.assertEqual(len(self.client.get('/api/treatments').json()), 1)
        clinics = self.client.get('/api/clinics').json()
        self.assertEqual([c['active'] for c in clinics], [True, False])

    def test_cannot_touch_other_users_clinic(self):
        self.client.post('/api/auth/logout')
        self.post_json('/api/auth/register', {
            'firstName': 'Luis', 'lastName': 'Rojas', 'email': 'luis@test.local', 'password': 'clave-segura-2',
        })
        self.assertEqual(self.post_json(f'/api/clinics/{self.clinic.id}/activate', {}).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/clinics/{self.clinic.id}').status_code, 404)

    def test_cannot_delete_last_clinic(self):
        self.assertEqual(self.client.delete(f'/api/clinics/{self.clinic.id}').status_code, 400)

    def test_delete_active_clinic_switches(self):
        norte = self.post_json('/api/clinics', {'name': 'Sede Norte'}).json()
        self.assertEqual(self.client.delete(f'/api/clinics/{norte["id"]}').status_code, 200)
        self.assertEqual(self.client.get('/api/clinic').json()['id'], self.clinic.id)


@override_settings(STORAGES={
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
})
class VoucherAccessTests(ApiTests):
    def test_only_owner_can_download_voucher(self):
        resp = self.client.post('/api/expenses', {
            'description': 'Luz', 'category': 'Luz', 'amount': '50', 'date': date.today().isoformat(),
            'voucher': SimpleUploadedFile('recibo.png', b'fake-png-bytes', content_type='image/png'),
        })
        url = resp.json()['voucher']
        self.assertTrue(url.startswith('/comprobantes/vouchers/'))
        self.assertEqual(self.client.get(url).status_code, 200)
        self.client.post('/api/auth/logout')
        self.post_json('/api/auth/register', {
            'firstName': 'Luis', 'lastName': 'Rojas', 'email': 'luis@test.local', 'password': 'clave-segura-2',
        })
        self.assertEqual(self.client.get(url).status_code, 404)


class HealthTests(TestCase):
    def test_healthz_checks_db(self):
        resp = self.client.get('/healthz')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'app': 'ok', 'db': 'ok'})


# Hash real de Argon2 (formato de Appwrite) de la contraseña "clave-appwrite-1".
APPWRITE_HASH = None


def appwrite_backup(folder):
    from argon2 import PasswordHasher

    global APPWRITE_HASH
    APPWRITE_HASH = APPWRITE_HASH or PasswordHasher().hash('clave-appwrite-1')
    created = '2025-03-10T15:20:00.000+00:00'
    data = {
        'users': [{'$id': 'u1', 'email': 'Doc@Appwrite.test', 'name': 'Rosa Quispe Huamán',
                   'password': APPWRITE_HASH, 'hash': 'argon2'}],
        'clinics': [{'$id': 'c1', 'name': 'Dental Rosa', 'email': 'rosa@clinica.test', '$createdAt': created}],
        'services': [{'$id': 's1', 'title': 'Blanqueamiento', 'desc': 'LED', 'price': 450,
                      'category': 'Clínica', 'color': '#123456'}],
        'expenses': [{'$id': 'e1', 'description': 'Luz', 'category': 'Servicios', 'amount': 85.5,
                      'date': '2025-03-01', 'voucher': 'f1', '$createdAt': created}],
        'treatments': [{'$id': 't1', 'patient': 'Juan', 'type': 'Corona', 'source': 'Externo',
                        'date': '2025-03-05T00:00:00.000+00:00', 'total': 800, 'paid': 900, 'balance': 0,
                        'costLab': 200, 'costTech': 0, 'costOther': 15, '$createdAt': created},
                       {'$id': 't2', 'patient': 'Ana', 'type': 'Resina', 'source': 'Clínica',
                        'date': '2025-03-06', 'total': 300, 'paid': 100, '$createdAt': created}],
        'debts': [{'$id': 'd1', 'patient': 'Luis', 'description': 'Ortodoncia', 'amount': 1200,
                   'dueDate': '2025-04-01', 'source': 'Clínica', 'status': 'Pagado', '$createdAt': created}],
        'files': [{'$id': 'f1', 'name': 'recibo luz.png'}],
    }
    for name, docs in data.items():
        (folder / f'{name}.json').write_text(json.dumps(docs), encoding='utf-8')
    (folder / 'archivos').mkdir()
    (folder / 'archivos' / 'f1').write_bytes(b'png-bytes')


@override_settings(STORAGES={
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
})
class ImportAppwriteTests(TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.folder = Path(tmp.name)
        appwrite_backup(self.folder)

    def run_import(self, *extra):
        call_command('importar_appwrite', str(self.folder), '--email', 'doc@appwrite.test', *extra,
                     stdout=open(Path(tempfile.gettempdir()) / 'importar.log', 'w', encoding='utf-8'))

    def test_imports_everything(self):
        self.run_import()
        user = get_user_model().objects.get(email='doc@appwrite.test')
        self.assertEqual((user.first_name, user.last_name), ('Rosa', 'Quispe Huamán'))
        self.assertTrue(self.client.login(username='doc@appwrite.test', password='clave-appwrite-1'))
        user.refresh_from_db()
        self.assertTrue(user.password.startswith('pbkdf2_sha256$'))  # se re-guarda al iniciar sesión

        clinic = Clinic.objects.get(owner=user)
        self.assertEqual((clinic.name, clinic.email), ('Dental Rosa', 'rosa@clinica.test'))
        self.assertEqual(Service.objects.filter(clinic=clinic).count(), TOTAL_SERVICES + 1)

        expense = Expense.objects.get(clinic=clinic)
        self.assertEqual((str(expense.amount), expense.date), ('85.50', date(2025, 3, 1)))
        self.assertEqual(expense.created_at.year, 2025)
        self.assertRegex(expense.voucher.name, rf'^vouchers/{clinic.id}/expense/recibo_luz.*\.png$')
        self.assertEqual(b''.join(self.client.get(expense.voucher.url).streaming_content), b'png-bytes')

        corona = Treatment.objects.get(patient='Juan')
        self.assertEqual((corona.source, corona.date, corona.paid), ('Externo', date(2025, 3, 5), corona.total))
        self.assertEqual(sorted((c.concept, int(c.amount)) for c in corona.costs.all()),
                         [('Laboratorio', 200), ('Otros', 15)])
        debt = Debt.objects.get(clinic=clinic)
        self.assertEqual((debt.patient, debt.status, debt.treatment), ('Luis', 'Pagado', None))

    def test_reuses_empty_registered_clinic_and_refuses_reimport(self):
        self.client.post('/api/auth/register', json.dumps({
            'firstName': 'Rosa', 'lastName': 'Q', 'email': 'doc@appwrite.test', 'password': 'clave-nueva-1',
        }), content_type='application/json')
        self.run_import('--deudas-de-saldos')
        user = get_user_model().objects.get(email='doc@appwrite.test')
        self.assertEqual(Clinic.objects.filter(owner=user).count(), 1)
        self.assertTrue(user.check_password('clave-nueva-1'))  # una cuenta existente no se toca
        self.assertEqual(Debt.objects.get(treatment__patient='Ana').amount, 200)
        with self.assertRaises(CommandError):
            self.run_import()

    def test_dry_run_saves_nothing(self):
        self.run_import('--dry-run')
        self.assertFalse(get_user_model().objects.exists())
        self.assertFalse(Clinic.objects.exists())
