# DentFinance (Django)

Sistema de gestión financiera para clínicas dentales en Django + Python.
Es **multi-clínica**: cada cuenta puede administrar varias clínicas o sedes, y cada una tiene
sus propios servicios, tratamientos, gastos y deudas. La clínica activa se cambia desde el menú lateral
(o el menú móvil) y se administran en **Ajustes → Mis Clínicas**.

## Desarrollo local

```bash
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py runserver
```

Abre http://127.0.0.1:8000 y crea una cuenta. Cada clínica nueva recibe el catálogo de 36 servicios
odontológicos (precios referenciales editables en Ajustes).

Comandos útiles:

```bash
.venv\Scripts\python manage.py test clinica          # pruebas
.venv\Scripts\python manage.py cargar_servicios      # agrega el catálogo a clínicas existentes
.venv\Scripts\python manage.py createsuperuser       # acceso a /admin
```

Para probar sin tocar tu base real usa otra BD: `set DJANGO_SQLITE_PATH=%TEMP%\pruebas.sqlite3`.

## Despliegue en un VPS (Ubuntu/Debian + MySQL)

```bash
git clone <este-repo> ~/dentfinance && cd ~/dentfinance
sudo bash deploy/instalar_vps.sh midominio.com tu@correo.com
```

El script instala MySQL, crea la base `dentfinance` con su usuario, genera el `.env`
(clave secreta y contraseña de la BD), instala dependencias, aplica migraciones, crea el
servicio `dentfinance` (Gunicorn) y el sitio de Nginx, y pide el certificado HTTPS
(el dominio ya debe apuntar al VPS; sin correo se queda en HTTP).
Para **actualizar**: `git pull && sudo bash deploy/instalar_vps.sh midominio.com`.

Los comprobantes se guardan en `media/`: inclúyela en tus respaldos junto con
`mysqldump dentfinance`. Logs: `journalctl -u dentfinance -f`.

### Migrar los datos de Appwrite

1. En Appwrite crea una API key con `databases.read`, `collections.read`, `documents.read`,
   `files.read` y `users.read`, y ponla en el `.env` junto con `APPWRITE_ENDPOINT`,
   `APPWRITE_PROJECT_ID`, `APPWRITE_DATABASE_ID` y `APPWRITE_BUCKET_ID`.
2. `python manage.py exportar_appwrite respaldo_appwrite` → respaldo completo en JSON + archivos.
3. `python manage.py importar_appwrite respaldo_appwrite --email tu@correo.com --dry-run` (simulación)
4. Lo mismo sin `--dry-run`. Las cuentas conservan su contraseña (Argon2).

## Estructura

| Ruta | Contenido |
|------|-----------|
| `config/` | settings (variables de entorno), urls, wsgi (arranca el keep-alive) |
| `clinica/models.py` | Clinic, Service, Expense, Treatment, TreatmentCost, Debt |
| `clinica/tenancy.py` | Clínica activa del usuario (multi-clínica) |
| `clinica/api.py` | API JSON (auth, clínicas, servicios, gastos, tratamientos, deudas, resumen) |
| `clinica/health.py` | `/healthz` (estado de la app y la BD) |
| `clinica/management/commands/` | `exportar_appwrite`, `importar_appwrite`, `cargar_servicios` |
| `deploy/instalar_vps.sh` | Instalación/actualización en el VPS |
| `templates/`, `static/` | Plantillas, CSS (`responsive.css` = ajustes móviles) y JS |

## Reglas de negocio de Tratamientos

- **Gastos asociados**: tantos como se necesite (concepto + monto).
- **Saldo pendiente** = total − pagado (el pagado no puede superar al total).
- **Ganancia estimada** = total − gastos; **ganancia cobrada** = pagado − gastos.
- Si queda saldo se crea una **deuda** vinculada (vence en la fecha de la próxima cita o a los 30 días);
  al pagarla, el tratamiento queda saldado.
- **Próxima cita**: fecha, hora y nota; aparece en el Dashboard y en las notificaciones del día.

---

Desarrollado por [Rodolfo Riveros Mitma](https://portafolio-rodolfo.vercel.app/).
