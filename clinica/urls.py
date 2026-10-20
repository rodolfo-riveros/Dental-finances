from django.contrib.auth import views as auth_views
from django.urls import path, reverse_lazy

from . import api, health, views

urlpatterns = [
    path('', views.index, name='index'),
    path('dashboard', views.dashboard, name='dashboard'),
    path('gastos', views.gastos, name='gastos'),
    path('tratamiento', views.tratamiento, name='tratamiento'),
    path('deudas', views.deudas, name='deudas'),
    path('ajustes', views.ajustes, name='ajustes'),
    path('terminos', views.terminos, name='terminos'),
    path('privacidad', views.privacidad, name='privacidad'),
    path('healthz', health.healthz, name='healthz'),
    path('comprobantes/<path:name>', views.voucher, name='voucher'),

    path('recuperar/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(
        template_name='registration/password_reset_confirm.html',
        success_url=reverse_lazy('password_reset_complete'),
    ), name='password_reset_confirm'),
    path('recuperar/listo/', auth_views.PasswordResetCompleteView.as_view(
        template_name='registration/password_reset_complete.html',
    ), name='password_reset_complete'),

    path('api/auth/login', api.auth_login),
    path('api/auth/register', api.auth_register),
    path('api/auth/logout', api.auth_logout),
    path('api/auth/recovery', api.auth_recovery),
    path('api/profile', api.profile),
    path('api/clinic', api.clinic_view),
    path('api/clinics', api.clinics),
    path('api/clinics/<int:pk>', api.clinic_detail),
    path('api/clinics/<int:pk>/activate', api.clinic_activate),
    path('api/services', api.services),
    path('api/services/restore', api.services_restore),
    path('api/services/<int:pk>', api.service_detail),
    path('api/expenses', api.expenses),
    path('api/expenses/<int:pk>', api.expense_detail),
    path('api/treatments', api.treatments),
    path('api/treatments/<int:pk>', api.treatment_detail),
    path('api/debts', api.debts),
    path('api/debts/<int:pk>', api.debt_detail),
    path('api/debts/<int:pk>/pay', api.debt_pay),
    path('api/summary', api.summary),
    path('api/notifications', api.notifications),
]
