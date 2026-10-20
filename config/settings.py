import mimetypes
import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path):
    """Carga KEY=valor desde .env (en local y en el VPS).

    Las variables ya definidas en el entorno tienen prioridad y los valores vacíos se ignoran.
    """
    if not path.exists():
        return
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        value = value.split(' #', 1)[0].strip().strip('"').strip("'")
        if value:
            os.environ.setdefault(key.strip(), value)


_load_env_file(BASE_DIR / '.env')

# En Windows el registro a veces asigna text/plain a .js y el navegador
# rechaza los <script type="module">.
mimetypes.add_type('text/javascript', '.js', True)
mimetypes.add_type('text/css', '.css', True)

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '')
# Sin DJANGO_SECRET_KEY se asume desarrollo local (DEBUG activo); en el VPS siempre se define.
DEBUG = os.environ.get('DJANGO_DEBUG', '0' if SECRET_KEY else '1') == '1'
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError('Define DJANGO_SECRET_KEY en producción')
    SECRET_KEY = 'django-insecure-dev-only-cambia-esta-clave-en-produccion'


def _env_list(name, default=''):
    return [v.strip() for v in os.environ.get(name, default).split(',') if v.strip()]


ALLOWED_HOSTS = _env_list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,[::1]')
# Por defecto se confía en https://<cada host> (dominio del VPS detrás de Nginx).
CSRF_TRUSTED_ORIGINS = _env_list('DJANGO_CSRF_TRUSTED_ORIGINS') or [
    f'https://{h.lstrip(".")}' for h in ALLOWED_HOSTS if h not in ('localhost', '127.0.0.1', '[::1]', '*')
]

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

# Producción (VPS): MySQL con DB_NAME/DB_USER/DB_PASSWORD/DB_HOST/DB_PORT o DATABASE_URL
# (mysql://usuario:clave@host:3306/db). Local sin nada definido: SQLite (DJANGO_SQLITE_PATH para otro archivo).
MYSQL_OPTIONS = {
    'charset': 'utf8mb4',
    'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
}


def _database():
    if os.environ.get('DB_NAME'):
        return {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': os.environ['DB_NAME'],
            'USER': os.environ.get('DB_USER', ''),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ.get('DB_HOST', '127.0.0.1'),
            'PORT': os.environ.get('DB_PORT', '3306'),
            'OPTIONS': MYSQL_OPTIONS,
            'CONN_MAX_AGE': 600,
            'CONN_HEALTH_CHECKS': True,
        }
    url = os.environ.get('DATABASE_URL', '').strip().strip('"').strip("'")
    if url:
        db = dj_database_url.parse(url, conn_max_age=600, conn_health_checks=True)
        if db['ENGINE'] == 'django.db.backends.mysql':
            db['OPTIONS'] = {**MYSQL_OPTIONS, **db.get('OPTIONS', {})}
        return db
    path = Path(os.environ.get('DJANGO_SQLITE_PATH') or BASE_DIR / 'db.sqlite3').as_posix()
    return dj_database_url.parse('sqlite:///' + path)


DATABASES = {'default': _database()}

# Argon2 permite iniciar sesión con las contraseñas importadas de Appwrite (importar_appwrite);
# al entrar, Django las vuelve a guardar con su algoritmo por defecto.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.ScryptPasswordHasher',
]

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

# Los comprobantes se guardan en disco (MEDIA_ROOT) y se sirven siempre por una vista
# protegida (solo el dueño de la clínica). En el VPS conviene incluir MEDIA_ROOT en los respaldos.
MEDIA_URL = '/comprobantes/'
MEDIA_ROOT = Path(os.environ.get('DJANGO_MEDIA_ROOT') or BASE_DIR / 'media')

STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
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

# --- Seguridad en producción (Nginx termina HTTPS y envía X-Forwarded-Proto) ---
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    # DJANGO_HTTPS=0 solo mientras el VPS no tenga certificado (p. ej. probando por IP).
    USE_HTTPS = os.environ.get('DJANGO_HTTPS', '1') == '1'
    SECURE_SSL_REDIRECT = USE_HTTPS
    SECURE_REDIRECT_EXEMPT = [r'^healthz$']
    SESSION_COOKIE_SECURE = USE_HTTPS
    CSRF_COOKIE_SECURE = USE_HTTPS
    SECURE_CONTENT_TYPE_NOSNIFF = True

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'loggers': {'clinica': {'handlers': ['console'], 'level': 'INFO'}},
}
