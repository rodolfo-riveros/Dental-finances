from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import models

SOURCE_CHOICES = [('Clínica', 'Clínica'), ('Externo', 'Externo')]
DEBT_STATUS_CHOICES = [('Pendiente', 'Pendiente'), ('Pagado', 'Pagado')]


def voucher_path(instance, filename):
    return f'vouchers/{instance.clinic_id}/{instance.__class__.__name__.lower()}/{filename}'


class Clinic(models.Model):
    """Clínica (o consultorio) donde trabaja el usuario. Un usuario puede tener varias."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='clinics')
    name = models.CharField('nombre', max_length=150, default='Clínica Dental')
    email = models.EmailField('correo', blank=True)
    phone = models.CharField('teléfono', max_length=30, blank=True)
    address = models.CharField('dirección', max_length=255, blank=True)
    color = models.CharField(max_length=7, default='#0D9488')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        verbose_name = 'clínica'
        verbose_name_plural = 'clínicas'

    def __str__(self):
        return self.name


class Service(models.Model):
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='services')
    specialty = models.CharField('especialidad', max_length=120, default='General')
    title = models.CharField('nombre', max_length=200)
    desc = models.TextField('descripción', blank=True)
    price = models.DecimalField('precio', max_digits=10, decimal_places=2, default=0)
    category = models.CharField('categoría', max_length=20, choices=SOURCE_CHOICES, default='Clínica')
    color = models.CharField(max_length=7, default='#0D9488')
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']
        verbose_name = 'servicio'
        verbose_name_plural = 'servicios'

    def __str__(self):
        return self.title


class Expense(models.Model):
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='expenses')
    description = models.CharField('descripción', max_length=255)
    category = models.CharField('categoría', max_length=120)
    amount = models.DecimalField('monto', max_digits=10, decimal_places=2)
    date = models.DateField('fecha')
    voucher = models.FileField('comprobante', upload_to=voucher_path, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']
        verbose_name = 'gasto'
        verbose_name_plural = 'gastos'

    def __str__(self):
        return f'{self.description} (S/ {self.amount})'


class Treatment(models.Model):
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='treatments')
    patient = models.CharField('paciente', max_length=150)
    type = models.CharField('tratamiento', max_length=200)
    source = models.CharField('ubicación', max_length=20, choices=SOURCE_CHOICES, default='Clínica')
    date = models.DateField('fecha')
    total = models.DecimalField('monto total', max_digits=10, decimal_places=2)
    paid = models.DecimalField('monto pagado', max_digits=10, decimal_places=2, default=0)
    next_appointment = models.DateTimeField('próxima cita', null=True, blank=True)
    appointment_note = models.CharField('nota de la cita', max_length=255, blank=True)
    voucher = models.FileField('comprobante', upload_to=voucher_path, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']
        verbose_name = 'tratamiento'
        verbose_name_plural = 'tratamientos'

    def __str__(self):
        return f'{self.patient} — {self.type}'

    @property
    def total_costs(self):
        return sum((c.amount for c in self.costs.all()), Decimal('0'))

    @property
    def balance(self):
        """Saldo pendiente de cobro (nunca negativo)."""
        return max(self.total - self.paid, Decimal('0'))

    @property
    def estimated_profit(self):
        """Ganancia estimada cuando se cobre todo: total - costos."""
        return self.total - self.total_costs

    @property
    def collected_profit(self):
        """Ganancia real a la fecha: lo cobrado - costos."""
        return min(self.paid, self.total) - self.total_costs

    def sync_debt(self):
        """Mantiene una deuda vinculada con el saldo pendiente del tratamiento."""
        debt = Debt.objects.filter(treatment=self).first()
        balance = self.balance
        if balance > 0:
            due = self.next_appointment.date() if self.next_appointment else self.date + timedelta(days=30)
            if debt is None:
                debt = Debt(clinic=self.clinic, treatment=self)
            debt.patient = self.patient
            debt.description = f'Saldo de tratamiento: {self.type}'
            debt.amount = balance
            debt.due_date = due
            debt.source = self.source
            debt.status = 'Pendiente'
            debt.save()
        elif debt is not None and debt.status != 'Pagado':
            debt.status = 'Pagado'
            debt.save(update_fields=['status'])


class TreatmentCost(models.Model):
    treatment = models.ForeignKey(Treatment, on_delete=models.CASCADE, related_name='costs')
    concept = models.CharField('concepto', max_length=150)
    amount = models.DecimalField('monto', max_digits=10, decimal_places=2)

    class Meta:
        ordering = ['id']
        verbose_name = 'gasto del tratamiento'
        verbose_name_plural = 'gastos del tratamiento'

    def __str__(self):
        return f'{self.concept}: S/ {self.amount}'


class Debt(models.Model):
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='debts')
    treatment = models.OneToOneField(
        Treatment, on_delete=models.CASCADE, null=True, blank=True, related_name='debt',
        help_text='Tratamiento que originó la deuda (saldo pendiente).',
    )
    patient = models.CharField('paciente / deudor', max_length=150)
    description = models.CharField('descripción', max_length=255)
    amount = models.DecimalField('monto', max_digits=10, decimal_places=2)
    due_date = models.DateField('vencimiento')
    source = models.CharField('origen', max_length=20, choices=SOURCE_CHOICES, default='Clínica')
    status = models.CharField('estado', max_length=20, choices=DEBT_STATUS_CHOICES, default='Pendiente')
    voucher = models.FileField('comprobante', upload_to=voucher_path, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['due_date', '-created_at']
        verbose_name = 'deuda'
        verbose_name_plural = 'deudas'

    def __str__(self):
        return f'{self.patient} — S/ {self.amount}'

