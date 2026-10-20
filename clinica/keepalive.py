"""Keep-alive 24/7: actividad interna permanente aunque nadie use la app.

Cada KEEPALIVE_INTERVAL segundos el hilo:
  1. escribe un latido en la base de datos (tabla Heartbeat),
  2. hace una consulta liviana a Appwrite (si está configurado),
  3. visita su propia URL pública /healthz, que Render cuenta como tráfico entrante
     y por eso no apaga el servicio (Render Free lo duerme tras 15 min sin tráfico).

Solo un proceso (worker) ejecuta el hilo gracias a un lock de archivo.
"""
import logging
import os
import random
import tempfile
import threading
import time

import requests
from django.conf import settings

log = logging.getLogger('clinica.keepalive')
_started = False
_lock_file = None


def _acquire_process_lock():
    global _lock_file
    try:
        import fcntl
    except ImportError:  # Windows (desarrollo): no hay varios workers
        return True
    path = os.path.join(tempfile.gettempdir(), 'dentfinance-keepalive.lock')
    _lock_file = open(path, 'w')
    try:
        fcntl.flock(_lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError:
        return False


def run_once(url=''):
    from .health import internal_activity

    result = internal_activity()
    if url:
        try:
            resp = requests.get(url, timeout=30, headers={'User-Agent': 'DentFinance-KeepAlive'})
            result['self_ping'] = resp.status_code
        except Exception as exc:
            result['self_ping'] = f'error: {exc}'
    return result


def _loop(url, interval):
    time.sleep(30)  # dar tiempo a que el servidor termine de arrancar
    while True:
        try:
            log.info('keep-alive %s', run_once(url))
        except Exception as exc:
            log.warning('keep-alive falló: %s', exc)
        time.sleep(interval + random.randint(-30, 30))


def start():
    global _started
    if _started or not getattr(settings, 'KEEPALIVE_ENABLED', False):
        return
    if not _acquire_process_lock():
        return
    _started = True
    url = getattr(settings, 'KEEPALIVE_URL', '')
    interval = max(60, settings.KEEPALIVE_INTERVAL)
    threading.Thread(target=_loop, args=(url, interval), name='keepalive', daemon=True).start()
    log.info('keep-alive activo cada %ss (auto-ping: %s)', interval, url or 'sin URL pública')
