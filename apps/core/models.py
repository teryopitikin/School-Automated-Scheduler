from django.contrib.auth.models import AbstractUser
from django.db import models


class Tenant(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active'
        SUSPENDED = 'SUSPENDED', 'Suspended'
        TRIAL = 'TRIAL', 'Trial'

    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_tenants'

    def __str__(self):
        return self.name


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Admin'
        REGISTRAR = 'REGISTRAR', 'Registrar'
        DEPT_HEAD = 'DEPT_HEAD', 'Department Head'
        VIEWER = 'VIEWER', 'Viewer'

    tenant = models.ForeignKey(
        Tenant, on_delete=models.PROTECT, null=True, blank=True, related_name='users',
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    # Assignment CODES (not FKs): imports and schedule wipes delete and
    # recreate the referenced rows, which would sever FK links; codes
    # survive both. A DEPT_HEAD may modify schedules that match ANY of:
    # a section in a managed program, a course in a managed department,
    # or a managed course.
    managed_program_codes = models.JSONField(default=list, blank=True)
    managed_department_codes = models.JSONField(default=list, blank=True)
    managed_course_codes = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = 'core_users'

    def __str__(self):
        return self.username
