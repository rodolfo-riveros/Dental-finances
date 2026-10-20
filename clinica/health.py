"""Endpoint de salud y actividad para el keep-alive.

Cada llamada a /healthz escribe un latido en la base de datos (UPDATE real, no solo
SELECT) y, como máximo cada 10 minutos, hace una consulta liviana a Appwrite.
Así la BD y Appwrite registran actividad aunque ningún usuario esté usando la app.
"""
import logging
import threading
import time

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import close_old_connections
from django.db.models import F
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.cache import never_cache

log = logging.getLogger('clinica.keepalive')

APPWRITE_PING_EVERY = 600
_last_appwrite_ping = 0.0
_lock = threading.Lock()


def beat(source):
    """Registra un latido (escritura) en la BD. Devuelve el total de latidos de esa fuente."""
    from .models import Heartbeat

    now = timezone.now()
    updated = Heartbeat.objects.filter(source=source).update(last_beat=now, count=F('count') + 1)
    if not updated:
        Heartbeat.objects.get_or_create(source=source, defaults={'last_beat': now, 'count': 1})
    return Heartbeat.objects.values_list('count', flat=True).get(source=source)


def ping_appwrite(force=False):
    """Devuelve 'ok', 'skipped' (ya se hizo hace poco), 'disabled' o 'error'."""
    global _last_appwrite_ping
    if not getattr(settings, 'USE_APPWRITE_STORAGE', False):
        return 'disabled'
    with _lock:
        if not force and time.time() - _last_appwrite_ping < APPWRITE_PING_EVERY:
            return 'skipped'
        _last_appwrite_ping = time.time()
    try:
        default_storage.ping()
        return 'ok'
    except Exception as exc:  # no tumbar el healthcheck por Appwrite
        log.warning('Ping a Appwrite falló: %s', exc)
        return 'error'


def internal_activity():
    """Actividad interna completa (la ejecuta el hilo keep-alive sin depender de visitas)."""
    close_old_connections()
    result = {}
    try:
        result['db'] = 'ok'
        result['beats'] = beat('interno')
    except Exception as exc:
        log.error('Latido en la BD falló: %s', exc)
        result['db'] = 'error'
    finally:
        close_old_connections()
    result['appwrite'] = ping_appwrite(force=True)
    return result


@never_cache
def healthz(request):
    status = {'app': 'ok'}
    try:
        beat('healthz')
        status['db'] = 'ok'
    except Exception as exc:
        log.error('Latido en la BD falló: %s', exc)
        status['db'] = 'error'
    status['appwrite'] = ping_appwrite()
    return JsonResponse(status, status=200 if status['db'] == 'ok' else 503)
