import mimetypes
import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

# En Windows el registro a veces asigna text/plain a .js y el navegador
# rechaza los <script type="module">.
mimetypes.add_type('text/javascript', '.js', True)
mimetypes.add_type('text/css', '.css', True)

SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-dev-only-cambia-esta-clave-en-produccion',
)
ON_RENDER = bool(os.environ.get('RENDER'))
DEBUG = os.environ.get('DJANGO_DEBUG', '0' if ON_RENDER else '1') == '1'
if not DEBUG and SECRET_KEY.startswith('django-insecure'):
    raise RuntimeError('Define DJANGO_SECRET_KEY en producción')

ALLOWED_HOSTS = [h for h in os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,[::1]').split(',') if h]
CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get('DJANGO_CSRF_TRUSTED_ORIGINS', '').split(',') if o]
# Render publica el dominio del servicio en esta variable.
RENDER_EXTERNAL_HOSTNAME = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)
    CSRF_TRUSTED_ORIGINS.append(f'https://{RENDER_EXTERNAL_HOSTNAME}')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'clinica',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'clinica.context_processors.clinic',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Producción: DATABASE_URL (PostgreSQL). Local: SQLite (DJANGO_SQLITE_PATH para usar otro archivo).
DATABASES = {
    'default': dj_database_url.config(
        default='sqlite:///' + Path(os.environ.get('DJANGO_SQLITE_PATH') or BASE_DIR / 'db.sqlite3').as_posix(),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
]

LANGUAGE_CODE = 'es-pe'
TIME_ZONE = 'America/Lima'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Los comprobantes se sirven siempre por una vista protegida (solo el dueño de la clínica).
MEDIA_URL = '/comprobantes/'
MEDIA_ROOT = Path(os.environ.get('DJANGO_MEDIA_ROOT') or BASE_DIR / 'media')

# Comprobantes: si hay credenciales de Appwrite se guardan en su Storage (persistente);
# si no, en disco local. En Render Free el disco se borra en cada reinicio/deploy.
APPWRITE_ENDPOINT = os.environ.get('APPWRITE_ENDPOINT', '').rstrip('/')
APPWRITE_PROJECT_ID = os.environ.get('APPWRITE_PROJECT_ID', '')
APPWRITE_API_KEY = os.environ.get('APPWRITE_API_KEY', '')
APPWRITE_BUCKET_ID = os.environ.get('APPWRITE_BUCKET_ID', '')
USE_APPWRITE_STORAGE = all([APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_BUCKET_ID])

STORAGES = {
    'default': {
        'BACKEND': 'clinica.storage.AppwriteStorage' if USE_APPWRITE_STORAGE
        else 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage' if not DEBUG
        else 'django.contrib.staticfiles.storage.StaticFilesStorage',
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LOGIN_URL = 'index'
LOGIN_REDIRECT_URL = 'dashboard'

# Correos de recuperación de contraseña: en desarrollo se imprimen en la consola.
EMAIL_BACKEND = os.environ.get('DJANGO_EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = os.environ.get('DJANGO_DEFAULT_FROM_EMAIL', 'DentFinance <no-reply@dentfinance.local>')

DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# --- Seguridad en producción (Render termina HTTPS en su proxy) ---
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = os.environ.get('DJANGO_SSL_REDIRECT', '1') == '1'
    SECURE_REDIRECT_EXEMPT = [r'^healthz$']
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

# --- Keep-alive: evita que Render Free / Appwrite Free / la BD se suspendan ---
# El propio servidor visita KEEPALIVE_URL (por defecto https://<RENDER_EXTERNAL_HOSTNAME>/healthz)
# cada KEEPALIVE_INTERVAL segundos. Render apaga el servicio tras 15 min sin tráfico.
KEEPALIVE_ENABLED = os.environ.get('KEEPALIVE_ENABLED', '1' if ON_RENDER else '0') == '1'
KEEPALIVE_URL = os.environ.get('KEEPALIVE_URL') or (
    f'https://{RENDER_EXTERNAL_HOSTNAME}/healthz' if RENDER_EXTERNAL_HOSTNAME else '')
KEEPALIVE_INTERVAL = int(os.environ.get('KEEPALIVE_INTERVAL', '600'))

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'loggers': {'clinica': {'handlers': ['console'], 'level': 'INFO'}},
}
