"""API JSON que consume el frontend (reemplaza a Appwrite)."""
import json
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from functools import wraps

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.forms import PasswordResetForm
from django.db import transaction
from django.db.models import Prefetch
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.views.decorators.http import require_http_methods

from .models import Clinic, Debt, Expense, Service, Treatment, TreatmentCost
from .tenancy import get_active_clinic as active, set_active_clinic, user_clinics

User = get_user_model()


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def api_view(methods, auth=True):
    def decorator(fn):
        @wraps(fn)
        @require_http_methods(methods)
        def wrapper(request, *args, **kwargs):
            if auth and not request.user.is_authenticated:
                return JsonResponse({'error': 'No autenticado'}, status=401)
            try:
                result = fn(request, *args, **kwargs)
            except ApiError as exc:
                return JsonResponse({'error': str(exc)}, status=exc.status)
            if isinstance(result, JsonResponse):
                return result
            return JsonResponse(result, safe=False)
        return wrapper
    return decorator


# ---------- helpers ----------

def payload(request):
    """Datos de la petición: JSON o multipart (cuando viene un comprobante)."""
    if request.content_type == 'application/json':
        try:
            return json.loads(request.body or b'{}')
        except json.JSONDecodeError:
            raise ApiError('JSON inválido')
    return request.POST


def to_decimal(value, field, required=True, minimum=Decimal('0')):
    if value in (None, ''):
        if required:
            raise ApiError(f'El campo {field} es obligatorio')
        return Decimal('0')
    try:
        dec = Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        raise ApiError(f'El campo {field} no es un número válido')
    if dec < minimum:
        raise ApiError(f'El campo {field} no puede ser negativo')
    return dec


def to_date(value, field, required=True):
    if not value:
        if required:
            raise ApiError(f'El campo {field} es obligatorio')
        return None
    parsed = parse_date(str(value)[:10])
    if parsed is None:
        raise ApiError(f'El campo {field} no es una fecha válida')
    return parsed


def to_datetime(value, field):
    if not value:
        return None
    parsed = parse_datetime(str(value))
    if parsed is None:
        d = parse_date(str(value))
        if d is None:
            raise ApiError(f'El campo {field} no es una fecha válida')
        parsed = datetime.combine(d, datetime.min.time().replace(hour=9))
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def required_text(data, key, label):
    value = (data.get(key) or '').strip()
    if not value:
        raise ApiError(f'El campo {label} es obligatorio')
    return value


def source_value(value):
    return 'Externo' if value == 'Externo' else 'Clínica'


def num(value):
    return float(value) if value is not None else 0.0


def voucher_url(obj):
    return obj.voucher.url if obj.voucher else ''


def apply_voucher(request, obj, data):
    upload = request.FILES.get('voucher')
    if upload:
        if obj.voucher:
            obj.voucher.delete(save=False)
        obj.voucher = upload
    elif data.get('removeVoucher') in ('1', 'true', True) and obj.voucher:
        obj.voucher.delete(save=False)
        obj.voucher = ''


# ---------- serializers ----------

def ser_service(s):
    return {
        'id': s.id, 'specialty': s.specialty, 'title': s.title, 'desc': s.desc,
        'price': num(s.price), 'category': s.category, 'color': s.color,
    }


def ser_expense(e):
    return {
        'id': e.id, 'description': e.description, 'category': e.category,
        'amount': num(e.amount), 'date': e.date.isoformat(),
        'voucher': voucher_url(e), 'createdAt': e.created_at.isoformat(),
    }


def ser_treatment(t):
    costs = list(t.costs.all())
    total_costs = sum((c.amount for c in costs), Decimal('0'))
    appt = timezone.localtime(t.next_appointment) if t.next_appointment else None
    return {
        'id': t.id, 'patient': t.patient, 'type': t.type, 'source': t.source,
        'date': t.date.isoformat(), 'total': num(t.total), 'paid': num(t.paid),
        'balance': num(t.balance),
        'costs': [{'id': c.id, 'concept': c.concept, 'amount': num(c.amount)} for c in costs],
        'totalCosts': num(total_costs),
        'estimatedProfit': num(t.total - total_costs),
        'collectedProfit': num(min(t.paid, t.total) - total_costs),
        'nextAppointment': appt.strftime('%Y-%m-%dT%H:%M') if appt else '',
        'appointmentNote': t.appointment_note,
        'voucher': voucher_url(t), 'createdAt': t.created_at.isoformat(),
    }


def ser_debt(d):
    return {
        'id': d.id, 'patient': d.patient, 'description': d.description,
        'amount': num(d.amount), 'dueDate': d.due_date.isoformat(),
        'source': d.source, 'status': d.status, 'voucher': voucher_url(d),
        'treatmentId': d.treatment_id, 'createdAt': d.created_at.isoformat(),
    }


# ---------- auth ----------

@api_view(['POST'], auth=False)
def auth_login(request):
    data = payload(request)
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    user_obj = User.objects.filter(email__iexact=email).first()
    user = authenticate(request, username=user_obj.username if user_obj else email, password=password)
    if user is None:
        raise ApiError('Correo o contraseña incorrectos', 401)
    login(request, user)
    if not data.get('remember'):
        request.session.set_expiry(0)
    return {'ok': True, 'name': user.get_full_name() or user.username, 'email': user.email}


@api_view(['POST'], auth=False)
def auth_register(request):
    data = payload(request)
    first = required_text(data, 'firstName', 'nombre')
    last = required_text(data, 'lastName', 'apellido')
    email = required_text(data, 'email', 'correo').lower()
    password = data.get('password') or ''
    if len(password) < 8:
        raise ApiError('La contraseña debe tener al menos 8 caracteres')
    if User.objects.filter(email__iexact=email).exists() or User.objects.filter(username__iexact=email).exists():
        raise ApiError('Este correo ya está registrado', 409)
    clinic_name = (data.get('clinic') or '').strip()[:150] or f'Clínica de {first}'
    with transaction.atomic():
        user = User.objects.create_user(username=email, email=email, password=password,
                                        first_name=first, last_name=last)
        clinic = Clinic.objects.create(owner=user, name=clinic_name, email=email)
    login(request, user)
    set_active_clinic(request, clinic)
    return {'ok': True, 'name': user.get_full_name(), 'email': user.email}


@api_view(['POST'], auth=False)
def auth_logout(request):
    logout(request)
    return {'ok': True}


@api_view(['POST'], auth=False)
def auth_recovery(request):
    data = payload(request)
    form = PasswordResetForm({'email': (data.get('email') or '').strip()})
    if not form.is_valid():
        raise ApiError('Ingresa un correo válido')
    form.save(request=request, use_https=request.is_secure(),
              email_template_name='registration/password_reset_email.txt',
              subject_template_name='registration/password_reset_subject.txt')
    # Respuesta idéntica exista o no la cuenta, para no revelar correos registrados.
    return {'ok': True}


# ---------- perfil y clínicas ----------

def ser_clinic(c, active_id=None):
    return {
        'id': c.id, 'name': c.name, 'email': c.email, 'phone': c.phone,
        'address': c.address, 'color': c.color, 'active': c.id == active_id,
    }


@api_view(['GET', 'POST'])
def profile(request):
    user = request.user
    clinic = active(request)
    if request.method == 'POST':
        data = payload(request)
        name = (data.get('name') or '').strip()
        email = (data.get('email') or '').strip().lower()
        if name:
            first, _, last = name.partition(' ')
            user.first_name, user.last_name = first, last
        if email and email != user.email:
            if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                raise ApiError('Ese correo ya está en uso', 409)
            user.email = email
            user.username = email
        user.save()
        if (data.get('clinic') or '').strip():
            clinic.name = data['clinic'].strip()[:150]
            clinic.save()
    return {'name': user.get_full_name() or user.username, 'email': user.email, 'clinic': clinic.name}


def _fill_clinic(c, data):
    c.name = ((data.get('name') or '').strip() or 'Clínica Dental')[:150]
    c.email = (data.get('email') or '').strip()
    c.phone = (data.get('phone') or '').strip()[:30]
    c.address = (data.get('address') or '').strip()[:255]
    color = (data.get('color') or c.color or '#0D9488').strip()
    if len(color) == 7 and color.startswith('#'):
        c.color = color
    c.save()
    return c


@api_view(['GET', 'POST'])
def clinic_view(request):
    """Clínica activa."""
    clinic = active(request)
    if request.method == 'POST':
        _fill_clinic(clinic, payload(request))
    return ser_clinic(clinic, clinic.id)


@api_view(['GET', 'POST'])
def clinics(request):
    current = active(request)
    if request.method == 'POST':
        data = payload(request)
        if not (data.get('name') or '').strip():
            raise ApiError('El nombre de la clínica es obligatorio')
        c = _fill_clinic(Clinic(owner=request.user), data)
        if data.get('activate', True):
            set_active_clinic(request, c)
        return JsonResponse(ser_clinic(c, c.id if data.get('activate', True) else current.id), status=201)
    return [ser_clinic(c, current.id) for c in user_clinics(request.user)]


@api_view(['PUT', 'POST', 'DELETE'])
def clinic_detail(request, pk):
    c = get_object_or_404(Clinic, pk=pk, owner=request.user)
    current = active(request)
    if request.method == 'DELETE':
        if user_clinics(request.user).count() <= 1:
            raise ApiError('Debes tener al menos una clínica')
        was_active = c.pk == current.pk
        c.delete()
        if was_active:
            set_active_clinic(request, user_clinics(request.user).first())
        return {'ok': True}
    _fill_clinic(c, payload(request))
    return ser_clinic(c, current.id)


@api_view(['POST'])
def clinic_activate(request, pk):
    c = get_object_or_404(Clinic, pk=pk, owner=request.user)
    set_active_clinic(request, c)
    return ser_clinic(c, c.id)


# ---------- servicios ----------

def _service_fields(data):
    title = required_text(data, 'title', 'nombre')
    price = to_decimal(data.get('price'), 'precio')
    color = (data.get('color') or '#0D9488').strip()[:7]
    return {
        'title': title,
        'desc': (data.get('desc') or '').strip(),
        'price': price,
        'category': source_value(data.get('category')),
        'specialty': (data.get('specialty') or '').strip() or 'General',
        'color': color,
    }


@api_view(['GET', 'POST'])
def services(request):
    if request.method == 'POST':
        fields = _service_fields(payload(request))
        last = Service.objects.filter(clinic=active(request)).order_by('-order').first()
        s = Service.objects.create(clinic=active(request), order=(last.order + 1 if last else 1), **fields)
        return JsonResponse(ser_service(s), status=201)
    return [ser_service(s) for s in Service.objects.filter(clinic=active(request))]


@api_view(['PUT', 'POST', 'DELETE'])
def service_detail(request, pk):
    s = get_object_or_404(Service, pk=pk, clinic=active(request))
    if request.method == 'DELETE':
        s.delete()
        return {'ok': True}
    for key, value in _service_fields(payload(request)).items():
        setattr(s, key, value)
    s.save()
    return ser_service(s)


@api_view(['POST'])
def services_restore(request):
    from .services_catalog import seed_services
    created = seed_services(active(request))
    return {'created': created}


# ---------- gastos ----------

def _fill_expense(request, e):
    data = payload(request)
    e.description = required_text(data, 'description', 'descripción')
    e.category = required_text(data, 'category', 'categoría')
    e.amount = to_decimal(data.get('amount'), 'monto')
    if e.amount <= 0:
        raise ApiError('El monto debe ser mayor a 0')
    e.date = to_date(data.get('date'), 'fecha')
    apply_voucher(request, e, data)
    e.save()
    return e


@api_view(['GET', 'POST'])
def expenses(request):
    if request.method == 'POST':
        e = _fill_expense(request, Expense(clinic=active(request)))
        return JsonResponse(ser_expense(e), status=201)
    return [ser_expense(e) for e in Expense.objects.filter(clinic=active(request))]


@api_view(['POST', 'DELETE'])
def expense_detail(request, pk):
    e = get_object_or_404(Expense, pk=pk, clinic=active(request))
    if request.method == 'DELETE':
        e.delete()
        return {'ok': True}
    return ser_expense(_fill_expense(request, e))


# ---------- tratamientos ----------

def _parse_costs(raw):
    if isinstance(raw, str):
        try:
            raw = json.loads(raw or '[]')
        except json.JSONDecodeError:
            raise ApiError('Lista de gastos inválida')
    costs = []
    for item in raw or []:
        amount = to_decimal(item.get('amount'), 'monto del gasto', required=False)
        concept = (item.get('concept') or '').strip() or 'Gasto'
        if amount > 0:
            costs.append((concept[:150], amount))
    return costs


@transaction.atomic
def _fill_treatment(request, t):
    data = payload(request)
    t.patient = required_text(data, 'patient', 'paciente')
    t.type = required_text(data, 'type', 'tratamiento')
    t.source = source_value(data.get('source'))
    t.date = to_date(data.get('date'), 'fecha')
    t.total = to_decimal(data.get('total'), 'monto total')
    if t.total <= 0:
        raise ApiError('El monto total debe ser mayor a 0')
    t.paid = to_decimal(data.get('paid'), 'monto pagado', required=False)
    if t.paid > t.total:
        raise ApiError('El monto pagado no puede ser mayor que el total')
    t.next_appointment = to_datetime(data.get('nextAppointment'), 'próxima cita')
    t.appointment_note = (data.get('appointmentNote') or '').strip()[:255]
    apply_voucher(request, t, data)
    t.save()
    costs = _parse_costs(data.get('costs'))
    t.costs.all().delete()
    TreatmentCost.objects.bulk_create([TreatmentCost(treatment=t, concept=c, amount=a) for c, a in costs])
    t.sync_debt()
    return Treatment.objects.prefetch_related('costs').get(pk=t.pk)


def _treatments_qs(clinic):
    return Treatment.objects.filter(clinic=clinic).prefetch_related(
        Prefetch('costs', queryset=TreatmentCost.objects.order_by('id')))


@api_view(['GET', 'POST'])
def treatments(request):
    if request.method == 'POST':
        t = _fill_treatment(request, Treatment(clinic=active(request)))
        return JsonResponse(ser_treatment(t), status=201)
    return [ser_treatment(t) for t in _treatments_qs(active(request))]


@api_view(['POST', 'DELETE'])
def treatment_detail(request, pk):
    t = get_object_or_404(Treatment, pk=pk, clinic=active(request))
    if request.method == 'DELETE':
        t.delete()
        return {'ok': True}
    return ser_treatment(_fill_treatment(request, t))


# ---------- deudas ----------

def _fill_debt(request, d):
    data = payload(request)
    d.patient = required_text(data, 'patient', 'paciente')
    d.description = required_text(data, 'description', 'descripción')
    d.amount = to_decimal(data.get('amount'), 'monto')
    if d.amount <= 0:
        raise ApiError('El monto debe ser mayor a 0')
    d.due_date = to_date(data.get('dueDate'), 'vencimiento')
    d.source = source_value(data.get('source'))
    apply_voucher(request, d, data)
    d.save()
    return d


@api_view(['GET', 'POST'])
def debts(request):
    if request.method == 'POST':
        d = _fill_debt(request, Debt(clinic=active(request)))
        return JsonResponse(ser_debt(d), status=201)
    return [ser_debt(d) for d in Debt.objects.filter(clinic=active(request))]


@api_view(['POST', 'DELETE'])
def debt_detail(request, pk):
    d = get_object_or_404(Debt, pk=pk, clinic=active(request))
    if request.method == 'DELETE':
        d.delete()
        return {'ok': True}
    return ser_debt(_fill_debt(request, d))


@api_view(['POST'])
@transaction.atomic
def debt_pay(request, pk):
    d = get_object_or_404(Debt, pk=pk, clinic=active(request))
    d.status = 'Pagado'
    d.save(update_fields=['status'])
    if d.treatment_id:
        # Cobrar la deuda salda el tratamiento de origen.
        t = d.treatment
        t.paid = t.total
        t.save(update_fields=['paid'])
    return ser_debt(d)


# ---------- dashboard ----------

@api_view(['GET'])
def summary(request):
    """Resumen mensual del año: ingresos, ganancia, gastos y deudas."""
    try:
        year = int(request.GET.get('year') or timezone.localdate().year)
    except ValueError:
        raise ApiError('Año inválido')
    months = {str(i): {
        'ingresos': 0.0, 'cobrado': 0.0, 'costos': 0.0, 'ganancia': 0.0, 'gastos': 0.0,
        'deudas': 0.0, 'deudaCount': 0, 'clinica': 0.0, 'externo': 0.0, 'tratamientos': 0,
    } for i in range(12)}

    for t in _treatments_qs(active(request)).filter(date__year=year):
        m = months[str(t.date.month - 1)]
        costs = float(t.total_costs)
        cobrado = float(min(t.paid, t.total))
        m['ingresos'] += float(t.total)
        m['cobrado'] += cobrado
        m['costos'] += costs
        m['ganancia'] += cobrado - costs
        m['tratamientos'] += 1
        m['clinica' if t.source == 'Clínica' else 'externo'] += float(t.total)

    for e in Expense.objects.filter(clinic=active(request), date__year=year):
        months[str(e.date.month - 1)]['gastos'] += float(e.amount)

    pending = Debt.objects.filter(clinic=active(request), status='Pendiente')
    for d in pending.filter(due_date__year=year):
        m = months[str(d.due_date.month - 1)]
        m['deudas'] += float(d.amount)
        m['deudaCount'] += 1

    today = timezone.localdate()
    totals = {
        'deudasPendientes': num(sum((d.amount for d in pending), Decimal('0'))),
        'deudasCount': pending.count(),
        'deudasVencidas': pending.filter(due_date__lt=today).count(),
    }

    activity = []
    for e in Expense.objects.filter(clinic=active(request)).order_by('-created_at')[:5]:
        activity.append({'type': 'expense', 'label': e.description or e.category, 'date': e.date.isoformat(),
                         'amount': -num(e.amount), 'ts': e.created_at.isoformat()})
    for t in Treatment.objects.filter(clinic=active(request)).order_by('-created_at')[:5]:
        activity.append({'type': 'treatment', 'label': f'{t.type} — {t.patient}', 'date': t.date.isoformat(),
                         'amount': num(t.paid), 'ts': t.created_at.isoformat()})
    activity.sort(key=lambda a: a['ts'], reverse=True)

    now = timezone.now()
    upcoming = Treatment.objects.filter(
        clinic=active(request), next_appointment__gte=now - timedelta(hours=2),
    ).order_by('next_appointment')[:6]
    appointments = [{
        'id': t.id, 'patient': t.patient, 'type': t.type, 'note': t.appointment_note,
        'datetime': timezone.localtime(t.next_appointment).strftime('%Y-%m-%dT%H:%M'),
    } for t in upcoming]

    return {'year': year, 'months': months, 'totals': totals,
            'activity': activity[:6], 'appointments': appointments}


@api_view(['GET'])
def notifications(request):
    today = timezone.localdate()
    overdue = Debt.objects.filter(clinic=active(request), status='Pendiente', due_date__lt=today)
    appts_today = Treatment.objects.filter(clinic=active(request), next_appointment__date=today)
    return {
        'overdue': [ser_debt(d) for d in overdue],
        'appointmentsToday': [{
            'id': t.id, 'patient': t.patient, 'type': t.type,
            'time': timezone.localtime(t.next_appointment).strftime('%H:%M'),
        } for t in appts_today.order_by('next_appointment')],
    }
