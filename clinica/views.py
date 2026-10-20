import mimetypes

from django.contrib.auth.decorators import login_required
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie

from .models import Clinic

MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
          'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

EXPENSE_CATEGORIES = {
    'Generales': ['Arrendamiento', 'Hoteles', 'Restaurantes', 'Aporte Essalud', 'RH Recibidos', 'Servicios Oficio'],
    'Operativos': ['Materiales', 'Alquiler', 'Sueldo Asistente', 'Agua', 'Luz', 'Internet', 'Publicidad',
                   'Laboratorio Externo'],
}

SERVICE_COLORS = ['#0D9488', '#8B5CF6', '#3B82F6', '#EC4899', '#F59E0B', '#EF4444', '#10B981', '#6366F1']


def _month_ctx():
    today = timezone.localdate()
    return {'months': MONTHS, 'current_month': today.month - 1, 'current_year': today.year}


@ensure_csrf_cookie
def index(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    return render(request, 'index.html')


@login_required
@ensure_csrf_cookie
def dashboard(request):
    now = timezone.localtime()
    hour = now.hour
    greeting = 'Buenos días' if hour < 12 else 'Buenas tardes' if hour < 18 else 'Buenas noches'
    ctx = _month_ctx()
    ctx.update({
        'greeting': greeting,
        'date_str': f'{now.day} de {MONTHS[now.month - 1]} {now.year}',
    })
    return render(request, 'dashboard.html', ctx)


@login_required
@ensure_csrf_cookie
def gastos(request):
    ctx = _month_ctx()
    ctx['expense_categories'] = EXPENSE_CATEGORIES
    return render(request, 'gastos.html', ctx)


@login_required
@ensure_csrf_cookie
def tratamiento(request):
    return render(request, 'tratamiento.html', _month_ctx())


@login_required
@ensure_csrf_cookie
def deudas(request):
    return render(request, 'deudas.html', _month_ctx())


@login_required
@ensure_csrf_cookie
def ajustes(request):
    return render(request, 'ajustes.html', {'colors': SERVICE_COLORS, 'categories': ['Clínica', 'Externo']})


def terminos(request):
    return render(request, 'terminos.html')


def privacidad(request):
    return render(request, 'privacidad.html')


@login_required
def voucher(request, name):
    """Sirve un comprobante solo si pertenece a una clínica del usuario."""
    parts = name.split('/')
    if len(parts) < 4 or parts[0] != 'vouchers' or '..' in parts or not parts[1].isdigit():
        raise Http404
    if not Clinic.objects.filter(pk=int(parts[1]), owner=request.user).exists():
        raise Http404
    try:
        f = default_storage.open(name)
    except Exception:
        raise Http404
    content_type = getattr(f, 'content_type', None) or mimetypes.guess_type(name)[0] or 'application/octet-stream'
    resp = FileResponse(f, content_type=content_type)
    resp['Cache-Control'] = 'private, max-age=3600'
    resp['X-Content-Type-Options'] = 'nosniff'
    return resp
