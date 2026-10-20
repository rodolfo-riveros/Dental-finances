"""Catálogo de servicios odontológicos que se carga a cada clínica nueva.

Los precios son referenciales (S/) y cada clínica puede editarlos en Ajustes.
"""

CATALOG = [
    {
        'specialty': 'Odontología Integral (General y Preventiva)',
        'color': '#0D9488',
        'services': [
            ('Limpieza dental profesional (profilaxis)', 'Eliminación de placa bacteriana y sarro con pulido final.', 120),
            ('Aplicación de flúor y selladores de fosas y fisuras', 'Prevención de caries con barniz de flúor y sellado de surcos.', 80),
            ('Obturaciones dentales (resinas o calzas)', 'Restauración de piezas con caries usando resina compuesta.', 150),
            ('Extracciones dentales simples', 'Extracción de piezas dentales erupcionadas sin cirugía.', 120),
            ('Examen clínico y diagnóstico radiográfico', 'Evaluación bucal completa con radiografías de apoyo.', 60),
        ],
    },
    {
        'specialty': 'Periodoncia',
        'color': '#EF4444',
        'services': [
            ('Raspaje y alisado radicular (limpieza profunda)', 'Limpieza subgingival para tratar la enfermedad periodontal.', 350),
            ('Cirugía periodontal de acceso', 'Cirugía para limpiar bolsas periodontales profundas.', 900),
            ('Injertos de tejido conectivo y encía', 'Cobertura de recesiones gingivales con injerto de tejido.', 1200),
            ('Gingivoplastia y gingivectomía', 'Remodelado y recorte de encía para salud y estética.', 600),
        ],
    },
    {
        'specialty': 'Endodoncia',
        'color': '#F59E0B',
        'services': [
            ('Tratamiento de conducto radicular', 'Eliminación de la pulpa infectada y sellado de conductos.', 450),
            ('Retratamiento de conductos', 'Nuevo tratamiento de conductos previamente tratados.', 650),
            ('Cirugía apical (apicectomía)', 'Remoción quirúrgica del ápice radicular y lesión periapical.', 900),
        ],
    },
    {
        'specialty': 'Rehabilitación Oral y Prótesis Dental',
        'color': '#3B82F6',
        'services': [
            ('Coronas y puentes fijos', 'Restauraciones fijas de porcelana, zirconio o metal-cerámica.', 1200),
            ('Prótesis totales y parciales removibles', 'Reposición removible de piezas dentales perdidas.', 1500),
            ('Incrustaciones dentales (inlays, onlays, overlays)', 'Restauraciones indirectas de cerámica o resina.', 800),
            ('Prótesis híbridas', 'Prótesis fija atornillada sobre implantes.', 9000),
        ],
    },
    {
        'specialty': 'Implantología Oral',
        'color': '#EC4899',
        'services': [
            ('Colocación de implantes dentales de titanio o zirconio', 'Implante osteointegrado para reponer una pieza dental.', 3500),
            ('Injertos óseos y regeneración ósea guiada', 'Aumento de hueso para recibir implantes.', 1500),
            ('Elevación de seno maxilar', 'Ganancia de hueso en el maxilar superior posterior.', 2500),
            ('Rehabilitación protésica sobre implantes', 'Corona o prótesis definitiva sobre implantes.', 2000),
        ],
    },
    {
        'specialty': 'Ortodoncia y Ortopedia Maxilar',
        'color': '#8B5CF6',
        'services': [
            ('Ortodoncia fija (brackets metálicos, cerámicos o de zafiro)', 'Corrección de la posición dental con brackets.', 3500),
            ('Ortodoncia con alineadores invisibles', 'Tratamiento con alineadores transparentes removibles.', 7000),
            ('Ortopedia funcional de los maxilares', 'Aparatología para guiar el crecimiento de los maxilares.', 2000),
            ('Retenedores de ortodoncia', 'Aparatos fijos o removibles para mantener resultados.', 400),
        ],
    },
    {
        'specialty': 'Cirugía Maxilofacial y Oral',
        'color': '#6366F1',
        'services': [
            ('Extracción de muelas del juicio (cordales) retenidas', 'Cirugía de terceras molares incluidas o retenidas.', 450),
            ('Cirugía ortognática', 'Corrección quirúrgica de la posición de los maxilares.', 15000),
            ('Frenectomía lingual o labial', 'Corte o remodelado del frenillo lingual o labial.', 400),
            ('Toma de biopsias de tejidos bucales', 'Extracción de tejido para estudio histopatológico.', 350),
        ],
    },
    {
        'specialty': 'Odontopediatría',
        'color': '#10B981',
        'services': [
            ('Pulpotomías y pulpectomías en dientes temporales', 'Tratamiento pulpar en dientes de leche.', 200),
            ('Colocación de coronas preformadas (acero o estéticas)', 'Coronas de acero inoxidable o estéticas para niños.', 250),
            ('Mantenedores de espacio', 'Aparato que conserva el espacio de una pieza perdida.', 350),
            ('Aplicación de sellantes de fosas y fisuras', 'Sellado preventivo de molares en niños.', 60),
        ],
    },
    {
        'specialty': 'Odontología Estética',
        'color': '#D946EF',
        'services': [
            ('Blanqueamiento dental (en consultorio o casero)', 'Aclaramiento del color dental con gel blanqueador.', 600),
            ('Carillas dentales (de porcelana o resina compuesta)', 'Láminas estéticas que cubren la cara visible del diente.', 900),
            ('Diseño de sonrisa digital', 'Planificación digital de la estética de la sonrisa.', 500),
            ('Recontorneo estético gingival y dental', 'Remodelado de bordes dentales y contorno de encía.', 400),
        ],
    },
]


def seed_services(clinic, replace=False):
    """Crea el catálogo para la clínica. Devuelve la cantidad de servicios creados.

    Los servicios que ya existan con el mismo nombre no se duplican.
    """
    from .models import Service

    if replace:
        Service.objects.filter(clinic=clinic).delete()
    existing = set(Service.objects.filter(clinic=clinic).values_list('title', flat=True))
    order = 0
    to_create = []
    for group in CATALOG:
        for title, desc, price in group['services']:
            order += 1
            if title in existing:
                continue
            to_create.append(Service(
                clinic=clinic, specialty=group['specialty'], title=title, desc=desc,
                price=price, category='Clínica', color=group['color'], order=order,
            ))
    Service.objects.bulk_create(to_create)
    return len(to_create)
