from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Tenant, User


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'status', 'created_at']
    search_fields = ['name', 'slug']
    list_filter = ['status']


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'tenant', 'role', 'is_active']
    list_filter = ['role', 'tenant', 'is_active']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Tenant', {'fields': ('tenant', 'role')}),
    )
