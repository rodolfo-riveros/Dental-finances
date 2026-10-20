import json
import sys
import unittest
from unittest import mock
from datetime import date

import django

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from .models import Clinic, Debt, Service, Treatment
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
    def test_healthz_writes_heartbeat(self):
        from .models import Heartbeat

        for _ in range(2):
            resp = self.client.get('/healthz')
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()['db'], 'ok')
            self.assertEqual(resp.json()['appwrite'], 'disabled')
        self.assertEqual(Heartbeat.objects.get(source='healthz').count, 2)

    def test_internal_activity_without_visits(self):
        from . import keepalive
        from .models import Heartbeat

        result = keepalive.run_once()
        self.assertEqual(result['db'], 'ok')
        self.assertEqual(Heartbeat.objects.get(source='interno').count, 1)

    @override_settings(USE_APPWRITE_STORAGE=True)
    def test_internal_activity_pings_appwrite(self):
        from . import keepalive

        with mock.patch('clinica.health.default_storage') as storage:
            self.assertEqual(keepalive.run_once()['appwrite'], 'ok')
            storage.ping.assert_called_once()


@override_settings(APPWRITE_ENDPOINT='https://appwrite.test/v1', APPWRITE_PROJECT_ID='proj',
                   APPWRITE_API_KEY='key', APPWRITE_BUCKET_ID='bucket')
class AppwriteStorageTests(TestCase):
    def test_save_open_delete(self):
        from django.core.files.base import ContentFile

        from .storage import AppwriteStorage

        storage = AppwriteStorage()
        with mock.patch('clinica.storage.requests') as req:
            req.post.return_value.status_code = 201
            name = storage.save('vouchers/1/expense/mi recibo.png', ContentFile(b'abc'))
            self.assertRegex(name, r'^vouchers/1/expense/[0-9a-f]{32}__mi_recibo\.png$')
            args, kwargs = req.post.call_args
            self.assertEqual(args[0], 'https://appwrite.test/v1/storage/buckets/bucket/files')
            self.assertEqual(kwargs['headers']['X-Appwrite-Key'], 'key')
            file_id = name.split('/')[-1].split('__')[0]
            self.assertEqual(kwargs['data']['fileId'], file_id)

            req.get.return_value.content = b'abc'
            req.get.return_value.headers = {'Content-Type': 'image/png'}
            self.assertEqual(storage.open(name).read(), b'abc')
            self.assertTrue(req.get.call_args[0][0].endswith(f'/files/{file_id}/download'))

            req.delete.return_value.status_code = 204
            storage.delete(name)
            self.assertTrue(req.delete.call_args[0][0].endswith(f'/files/{file_id}'))

    def test_large_file_uploaded_in_chunks(self):
        from django.core.files.base import ContentFile

        from .storage import CHUNK_SIZE, AppwriteStorage

        with mock.patch('clinica.storage.requests') as req:
            AppwriteStorage().save('vouchers/1/debt/a.pdf', ContentFile(b'x' * (CHUNK_SIZE + 10)))
            self.assertEqual(req.post.call_count, 2)
            second = req.post.call_args_list[1][1]['headers']
            self.assertEqual(second['Content-Range'], f'bytes {CHUNK_SIZE}-{CHUNK_SIZE + 9}/{CHUNK_SIZE + 10}')
            self.assertIn('X-Appwrite-ID', second)
