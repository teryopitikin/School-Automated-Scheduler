from django.contrib import admin
from .models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig,
)


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


@admin.register(Faculty)
class FacultyAdmin(admin.ModelAdmin):
    list_display = ['name', 'employment_type', 'priority_level', 'max_load_units', 'tenant']
    list_filter = ['employment_type', 'tenant']
    search_fields = ['name']


@admin.register(FacultyAvailability)
class FacultyAvailabilityAdmin(admin.ModelAdmin):
    list_display = ['faculty', 'day_of_week', 'time_start', 'time_end', 'availability_type']
    list_filter = ['day_of_week', 'availability_type']


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ['name', 'room_type', 'capacity', 'building', 'floor', 'tenant']
    list_filter = ['room_type', 'building', 'tenant']
    search_fields = ['name']


@admin.register(ScheduleEntry)
class ScheduleEntryAdmin(admin.ModelAdmin):
    list_display = ['course', 'faculty', 'room', 'day_of_week', 'time_start', 'time_end', 'entry_type']
    list_filter = ['day_of_week', 'entry_type', 'load_classification']


@admin.register(ScheduleConfig)
class ScheduleConfigAdmin(admin.ModelAdmin):
    list_display = ['academic_period', 'earliest_start_time', 'latest_end_time', 'tenant']
