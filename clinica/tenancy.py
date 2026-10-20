"""Clínica activa del usuario (multi-clínica).

Cada usuario puede administrar varias clínicas; todos los datos (servicios, gastos,
tratamientos y deudas) pertenecen a una clínica. La clínica activa se guarda en la sesión.
"""
from .models import Clinic

SESSION_KEY = 'active_clinic_id'


def user_clinics(user):
    return Clinic.objects.filter(owner=user)


def get_active_clinic(request):
    user = request.user
    if not user.is_authenticated:
        return None
    cached = getattr(request, '_active_clinic', None)
    if cached is not None:
        return cached
    clinics = user_clinics(user)
    clinic_id = request.session.get(SESSION_KEY)
    clinic = clinics.filter(pk=clinic_id).first() if clinic_id else None
    if clinic is None:
        clinic = clinics.first() or Clinic.objects.create(owner=user, email=user.email)
        request.session[SESSION_KEY] = clinic.pk
    request._active_clinic = clinic
    return clinic


def set_active_clinic(request, clinic):
    request.session[SESSION_KEY] = clinic.pk
    request._active_clinic = clinic
