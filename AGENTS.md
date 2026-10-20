## Proyecto

DentFinance es una app **Django 5.2 + Python** (en la raíz del repositorio). La versión anterior en Astro se eliminó.

- Entorno: `.venv` → `.venv/Scripts/python manage.py <comando>`
- Servidor: config `django` en `.claude/launch.json`; `django-pruebas` usa una BD temporal (no tocar la BD real con datos de prueba)
- Pruebas: `.venv/Scripts/python manage.py test clinica`

## Arquitectura

- **Multi-clínica**: un usuario tiene varias `Clinic`; todo (servicios, gastos, tratamientos, deudas) se filtra por `get_active_clinic(request)` (`clinica/tenancy.py`)
- **API JSON** interna en `clinica/api.py` (`/api/...`), consumida por módulos ES en `static/js/` (`api.js` es el cliente)
- **Plantillas** Django en `templates/` (`base.html` + páginas); CSS por página en `static/css/`, ajustes móviles en `responsive.css` (se carga al final)
- **Íconos**: `{% load icons %}{% icon "receipt" 18 "clase" %}` (Lucide, `clinica/icons/lucide.json`)
- **Archivos**: comprobantes en Appwrite Storage si hay variables `APPWRITE_*` (`clinica/storage.py`), servidos solo al dueño por `/comprobantes/...`
- **Producción**: Render Free (`render.yaml`), PostgreSQL por `DATABASE_URL`, WhiteNoise para estáticos
- **Keep-alive**: `clinica/keepalive.py` (hilo interno) + `/healthz` (`clinica/health.py`) + `.github/workflows/keepalive.yml`
