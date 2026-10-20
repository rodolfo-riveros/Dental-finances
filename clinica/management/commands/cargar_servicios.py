from django.core.management.base import BaseCommand

from clinica.models import Clinic
from clinica.services_catalog import seed_services


class Command(BaseCommand):
    help = 'Carga el catálogo de servicios odontológicos a las clínicas existentes.'

    def add_arguments(self, parser):
        parser.add_argument('--email', help='Solo las clínicas del usuario con este correo.')
        parser.add_argument('--reemplazar', action='store_true',
                            help='Borra los servicios actuales antes de cargar el catálogo.')

    def handle(self, *args, **opts):
        clinics = Clinic.objects.select_related('owner')
        if opts['email']:
            clinics = clinics.filter(owner__email__iexact=opts['email'])
        for clinic in clinics:
            n = seed_services(clinic, replace=opts['reemplazar'])
            self.stdout.write(f'{clinic.name} ({clinic.owner.email}): {n} servicios agregados')
