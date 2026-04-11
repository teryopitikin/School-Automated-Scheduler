from rest_framework import viewsets

from apps.core.mixins import TenantQuerySetMixin
from .models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig,
)
from .serializers import (
    AcademicPeriodSerializer, ProgramSerializer, DepartmentSerializer,
    CourseSerializer, SectionSerializer,
    FacultySerializer, FacultyAvailabilitySerializer,
    RoomSerializer, ScheduleEntrySerializer, ScheduleConfigSerializer,
)


class AcademicPeriodViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = AcademicPeriod.objects.all()
    serializer_class = AcademicPeriodSerializer
    search_fields = ['name']
    ordering_fields = ['year_start', 'year_end', 'semester', 'created_at']
    filterset_fields = ['status', 'semester']


class ProgramViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Program.objects.all()
    serializer_class = ProgramSerializer
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name']


class DepartmentViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name']


class CourseViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Course.objects.select_related('department').all()
    serializer_class = CourseSerializer
    search_fields = ['code', 'title']
    ordering_fields = ['code', 'title']
    filterset_fields = ['department', 'has_lab']


class SectionViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Section.objects.select_related('program', 'academic_period').all()
    serializer_class = SectionSerializer
    ordering_fields = ['year_level', 'section_number']
    filterset_fields = ['program', 'academic_period', 'year_level']


class FacultyViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Faculty.objects.all()
    serializer_class = FacultySerializer
    search_fields = ['name']
    ordering_fields = ['name', 'priority_level']
    filterset_fields = ['employment_type']


class FacultyAvailabilityViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    """FacultyAvailability has no direct tenant FK; tenant is reached via faculty__tenant."""
    queryset = FacultyAvailability.objects.select_related('faculty', 'academic_period').all()
    serializer_class = FacultyAvailabilitySerializer
    filterset_fields = ['faculty', 'academic_period', 'day_of_week', 'availability_type']

    def get_queryset(self):
        # Override TenantQuerySetMixin: filter through faculty__tenant instead of tenant
        qs = self.queryset.all()
        tenant = getattr(self.request, 'tenant', None)
        if not tenant and hasattr(self.request.user, 'tenant'):
            tenant = self.request.user.tenant
        if tenant:
            qs = qs.filter(faculty__tenant=tenant)
        else:
            return qs.none()

        faculty_pk = self.kwargs.get('faculty_pk')
        if faculty_pk:
            qs = qs.filter(faculty_id=faculty_pk)
        return qs

    def perform_create(self, serializer):
        faculty_pk = self.kwargs.get('faculty_pk')
        if faculty_pk:
            serializer.save(faculty_id=faculty_pk)
        else:
            serializer.save()


class RoomViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    search_fields = ['name', 'building']
    ordering_fields = ['name', 'building', 'floor', 'capacity']
    filterset_fields = ['room_type', 'building']


class ScheduleEntryViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = ScheduleEntry.objects.select_related(
        'course', 'faculty', 'room', 'academic_period',
    ).prefetch_related('sections').all()
    serializer_class = ScheduleEntrySerializer
    filterset_fields = ['academic_period', 'faculty', 'room', 'day_of_week', 'entry_type', 'group_id']
    ordering_fields = ['day_of_week', 'time_start']


class ScheduleConfigViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = ScheduleConfig.objects.select_related('academic_period').all()
    serializer_class = ScheduleConfigSerializer
    filterset_fields = ['academic_period']
