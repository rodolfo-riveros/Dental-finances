from django.contrib import admin

from .models import Clinic, Debt, Expense, Service, Treatment, TreatmentCost


@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'phone', 'owner', 'created_at')
    search_fields = ('name', 'owner__email')


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ('title', 'specialty', 'price', 'category', 'clinic')
    list_filter = ('specialty', 'category', 'clinic')
    search_fields = ('title',)


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ('description', 'category', 'amount', 'date', 'clinic')
    list_filter = ('category',)
    date_hierarchy = 'date'


class TreatmentCostInline(admin.TabularInline):
    model = TreatmentCost
    extra = 0


@admin.register(Treatment)
class TreatmentAdmin(admin.ModelAdmin):
    list_display = ('patient', 'type', 'source', 'date', 'total', 'paid', 'next_appointment', 'clinic')
    list_filter = ('source',)
    search_fields = ('patient', 'type')
    date_hierarchy = 'date'
    inlines = [TreatmentCostInline]


@admin.register(Debt)
class DebtAdmin(admin.ModelAdmin):
    list_display = ('patient', 'description', 'amount', 'due_date', 'source', 'status', 'clinic')
    list_filter = ('status', 'source')
    search_fields = ('patient', 'description')

