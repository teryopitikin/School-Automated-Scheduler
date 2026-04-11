from django.contrib import admin
from .models import AcademicPeriod, Program, Department, Course, Section


@admin.register(AcademicPeriod)
class AcademicPeriodAdmin(admin.ModelAdmin):
    list_display = ['name', 'semester', 'year_start', 'year_end', 'status', 'tenant']
    list_filter = ['status', 'semester', 'tenant']


@admin.register(Program)
class ProgramAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'tenant']
    search_fields = ['code', 'name']


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'tenant']
    search_fields = ['code', 'name']


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ['code', 'title', 'department', 'lec_units', 'lab_units', 'has_lab', 'tenant']
    list_filter = ['has_lab', 'department']
    search_fields = ['code', 'title']


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'program', 'year_level', 'section_number', 'academic_period', 'tenant']
    list_filter = ['program', 'year_level', 'academic_period']
