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

## Despliegue en Render (Free) 24/7

### 1. Base de datos (PostgreSQL)

En Render Free el disco **se borra en cada deploy/reinicio**, así que SQLite no sirve en producción.
Usa un PostgreSQL externo y pon su URL en `DATABASE_URL`:

- **Neon** (recomendado): plan gratis sin fecha de expiración; se suspende solo y despierta en la primera consulta.
- **Supabase**: pausa el proyecto tras 7 días sin actividad → el keep-alive de abajo lo evita.
- **Render PostgreSQL Free**: ⚠️ la base expira a los 30 días; no la uses para datos reales.

### 2. Comprobantes en Appwrite Storage

Los comprobantes (fotos/PDF) se guardan en tu bucket de Appwrite para que no se pierdan.
En Appwrite crea una **API Key** con los permisos `files.read` y `files.write`, y define:

| Variable | Valor |
|----------|-------|
| `APPWRITE_ENDPOINT` | ej. `https://cloud.appwrite.io/v1` |
| `APPWRITE_PROJECT_ID` | id del proyecto |
| `APPWRITE_API_KEY` | la API key (secreta, nunca en el frontend) |
| `APPWRITE_BUCKET_ID` | id del bucket |

Los archivos solo se descargan a través de Django (`/comprobantes/...`) y solo para el dueño de la clínica.

### 3. Crear el servicio

Render → **New → Blueprint** → selecciona este repositorio (usa `render.yaml` de la raíz).
Completa `DATABASE_URL` y las variables de Appwrite. `DJANGO_SECRET_KEY` se genera solo.

### 4. Mantenerlo siempre encendido

Render Free apaga el servicio tras 15 minutos sin tráfico y Appwrite/Supabase pausan proyectos inactivos.
La app genera **actividad interna permanente aunque nadie la use**:

1. **Hilo interno** (automático en Render, `KEEPALIVE_ENABLED=1`): cada 10 minutos (`KEEPALIVE_INTERVAL=600`)
   - escribe un latido en la base de datos (tabla `Heartbeat`: UPDATE real, no solo lectura),
   - consulta Appwrite Storage (actividad en el proyecto de Appwrite),
   - visita su propia URL pública `/healthz`, que Render cuenta como tráfico y no apaga el servicio.
2. **`GET /healthz`**: cada visita también escribe un latido en la BD y (máx. cada 10 min) consulta Appwrite.
3. **GitHub Actions** (`.github/workflows/keepalive.yml`): visita `/healthz` cada 10 min. Agrega el secreto
   `KEEPALIVE_URL` = `https://<tu-servicio>.onrender.com/healthz`. Si Render reinicia el servicio, esto lo vuelve a despertar.
4. **Monitor externo** (respaldo recomendado): monitor HTTP gratis en [UptimeRobot](https://uptimerobot.com)
   o [cron-job.org](https://cron-job.org) a la misma URL cada 5–10 min.

Puedes ver los latidos en `/admin` → *Latidos keep-alive*, o forzar una ronda con
`python manage.py keepalive`.

Notas: el plan Free de Render da 750 horas/mes, suficiente para **un** servicio encendido todo el mes.
GitHub desactiva los workflows programados si el repositorio pasa 60 días sin commits.

## Estructura

| Ruta | Contenido |
|------|-----------|
| `config/` | settings (variables de entorno), urls, wsgi (arranca el keep-alive) |
| `clinica/models.py` | Clinic, Service, Expense, Treatment, TreatmentCost, Debt |
| `clinica/tenancy.py` | Clínica activa del usuario (multi-clínica) |
| `clinica/api.py` | API JSON (auth, clínicas, servicios, gastos, tratamientos, deudas, resumen) |
| `clinica/storage.py` | Backend de archivos en Appwrite Storage |
| `clinica/health.py`, `clinica/keepalive.py` | `/healthz` y auto-ping |
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
