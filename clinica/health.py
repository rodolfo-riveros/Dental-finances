"""Endpoint de salud para monitoreo (systemd, Nginx, UptimeRobot...)."""
import logging

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.cache import never_cache

log = logging.getLogger('clinica')


@never_cache
def healthz(request):
    status = {'app': 'ok'}
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        status['db'] = 'ok'
    except Exception as exc:
        log.error('La base de datos no responde: %s', exc)
        status['db'] = 'error'
    return JsonResponse(status, status=200 if status['db'] == 'ok' else 503)
