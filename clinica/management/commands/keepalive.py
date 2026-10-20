from django.core.management.base import BaseCommand

from clinica import keepalive


class Command(BaseCommand):
    help = 'Ejecuta una ronda de actividad keep-alive (latido en BD + Appwrite + /healthz).'

    def add_arguments(self, parser):
        parser.add_argument('--url', default='', help='URL de /healthz a visitar (opcional).')

    def handle(self, *args, **opts):
        self.stdout.write(str(keepalive.run_once(opts['url'])))
