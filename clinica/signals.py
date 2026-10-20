from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Clinic, Debt, Expense, Treatment
from .services_catalog import seed_services


@receiver(post_save, sender=Clinic)
def seed_new_clinic(sender, instance, created, **kwargs):
    """Cada clínica nueva recibe el catálogo de servicios odontológicos."""
    if created:
        seed_services(instance)


@receiver(post_delete, sender=Expense)
@receiver(post_delete, sender=Treatment)
@receiver(post_delete, sender=Debt)
def delete_voucher_file(sender, instance, **kwargs):
    if instance.voucher:
        try:
            instance.voucher.delete(save=False)
        except Exception:  # el archivo remoto pudo haberse borrado antes
            pass
