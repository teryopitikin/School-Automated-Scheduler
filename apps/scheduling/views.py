from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.mixins import TenantQuerySetMixin
from .conflicts import detect_conflicts
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

    @action(detail=True, methods=['post'])
    def clone(self, request, pk=None):
        """Clone sections, config, and optionally faculty availability to a new period."""
        source = self.get_object()
        name = request.data.get('name')
        year_start = request.data.get('year_start')
        year_end = request.data.get('year_end')
        semester = request.data.get('semester')
        clone_availability = request.data.get('clone_availability', False)

        if not all([name, year_start, year_end, semester]):
            return Response(
                {'detail': 'name, year_start, year_end, and semester are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = getattr(request, 'tenant', None) or request.user.tenant

        new_period = AcademicPeriod.objects.create(
            tenant=tenant, name=name, year_start=year_start,
            year_end=year_end, semester=semester, status='DRAFT',
        )

        source_sections = Section.objects.filter(tenant=tenant, academic_period=source)
        sections_created = 0
        for sec in source_sections:
            Section.objects.create(
                tenant=tenant, program=sec.program,
                academic_period=new_period,
                year_level=sec.year_level,
                section_number=sec.section_number,
            )
            sections_created += 1

        config_cloned = False
        try:
            src_config = ScheduleConfig.objects.get(tenant=tenant, academic_period=source)
            ScheduleConfig.objects.create(
                tenant=tenant, academic_period=new_period,
                earliest_start_time=src_config.earliest_start_time,
                latest_end_time=src_config.latest_end_time,
                time_slot_granularity_minutes=src_config.time_slot_granularity_minutes,
                operating_days=src_config.operating_days,
                break_periods=src_config.break_periods,
                weight_faculty_priority=src_config.weight_faculty_priority,
                weight_room_proximity=src_config.weight_room_proximity,
                weight_time_gap_minimization=src_config.weight_time_gap_minimization,
                weight_load_distribution=src_config.weight_load_distribution,
            )
            config_cloned = True
        except ScheduleConfig.DoesNotExist:
            pass

        avail_created = 0
        if clone_availability:
            src_avails = FacultyAvailability.objects.filter(academic_period=source)
            for avail in src_avails:
                FacultyAvailability.objects.create(
                    faculty=avail.faculty, academic_period=new_period,
                    day_of_week=avail.day_of_week,
                    time_start=avail.time_start, time_end=avail.time_end,
                    availability_type=avail.availability_type,
                )
                avail_created += 1

        return Response({
            'academic_period': AcademicPeriodSerializer(new_period).data,
            'cloned': {
                'sections': sections_created,
                'config': config_cloned,
                'faculty_availability': avail_created,
            },
        }, status=status.HTTP_201_CREATED)


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

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None) or self.request.user.tenant
        serializer.save(tenant=tenant)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        entry = serializer.instance
        conflicts = detect_conflicts(entry)
        data = serializer.data
        data['conflicts'] = conflicts
        if conflicts['hard']:
            data['conflict_warning'] = 'This entry has hard conflicts — consider resolving them.'
        return Response(data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        entry = serializer.instance
        conflicts = detect_conflicts(entry)
        data = serializer.data
        data['conflicts'] = conflicts
        return Response(data)

    @action(detail=False, methods=['get'])
    def conflicts(self, request):
        """List all conflicts across the current academic period."""
        period_id = request.query_params.get('academic_period')
        if not period_id:
            return Response(
                {'detail': 'academic_period query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entries = self.get_queryset().filter(academic_period_id=period_id)
        all_conflicts = []
        for entry in entries:
            result = detect_conflicts(entry)
            if result['hard'] or result['warnings']:
                all_conflicts.append({
                    'entry_id': entry.pk,
                    'entry': str(entry),
                    **result,
                })
        return Response(all_conflicts)

    @action(detail=False, methods=['post'])
    def suggest(self, request):
        from .suggestions import generate_suggestions, generate_paired_suggestions

        course_id = request.data.get('course')
        section_ids = request.data.get('sections', [])
        faculty_id = request.data.get('faculty')
        period_id = request.data.get('academic_period')
        num_days = request.data.get('num_days', 1)
        class_size = request.data.get('class_size', 0)

        if not course_id or not period_id:
            return Response(
                {'detail': 'course and academic_period are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant = getattr(request, 'tenant', None) or request.user.tenant

        try:
            course = Course.objects.get(pk=course_id, tenant=tenant)
            period = AcademicPeriod.objects.get(pk=period_id, tenant=tenant)
        except (Course.DoesNotExist, AcademicPeriod.DoesNotExist):
            return Response({'detail': 'Course or period not found.'}, status=status.HTTP_404_NOT_FOUND)

        sections = list(Section.objects.filter(pk__in=section_ids, tenant=tenant))
        faculty = None
        if faculty_id:
            try:
                faculty = Faculty.objects.get(pk=faculty_id, tenant=tenant)
            except Faculty.DoesNotExist:
                return Response({'detail': 'Faculty not found.'}, status=status.HTTP_404_NOT_FOUND)

        if course.has_lab:
            suggestions = generate_paired_suggestions(
                tenant=tenant, period=period, course=course,
                sections=sections, faculty=faculty, class_size=class_size,
            )
        else:
            suggestions = generate_suggestions(
                tenant=tenant, period=period, course=course,
                sections=sections, faculty=faculty,
                num_days=num_days, class_size=class_size,
            )

        return Response({'suggestions': suggestions})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Dashboard statistics for an academic period."""
        from .stats import compute_stats
        period_id = request.query_params.get('academic_period')
        if not period_id:
            return Response(
                {'detail': 'academic_period query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tenant = getattr(request, 'tenant', None) or request.user.tenant
        try:
            period = AcademicPeriod.objects.get(pk=period_id, tenant=tenant)
        except AcademicPeriod.DoesNotExist:
            return Response({'detail': 'Academic period not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(compute_stats(tenant, period))


class ScheduleConfigViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = ScheduleConfig.objects.select_related('academic_period').all()
    serializer_class = ScheduleConfigSerializer
    filterset_fields = ['academic_period']


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def import_excel_view(request):
    import openpyxl

    from .importers import import_excel

    file = request.FILES.get('file')
    period_id = request.data.get('academic_period')

    if not file:
        return Response({'detail': 'No file uploaded.'}, status=status.HTTP_400_BAD_REQUEST)
    if not period_id:
        return Response({'detail': 'academic_period is required.'}, status=status.HTTP_400_BAD_REQUEST)

    tenant = getattr(request, 'tenant', None) or request.user.tenant

    try:
        period = AcademicPeriod.objects.get(pk=period_id, tenant=tenant)
    except AcademicPeriod.DoesNotExist:
        return Response({'detail': 'Academic period not found.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        wb = openpyxl.load_workbook(file)
    except Exception:
        return Response({'detail': 'Invalid Excel file.'}, status=status.HTTP_400_BAD_REQUEST)

    result = import_excel(wb, tenant, period)
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_excel_view(request):
    from .exporters import export_schedule, export_faculty_loading, export_room_utilization

    period_id = request.query_params.get('academic_period')
    export_type = request.query_params.get('type', 'schedule')

    if not period_id:
        return Response({'detail': 'academic_period is required.'}, status=status.HTTP_400_BAD_REQUEST)

    tenant = getattr(request, 'tenant', None) or request.user.tenant

    try:
        period = AcademicPeriod.objects.get(pk=period_id, tenant=tenant)
    except AcademicPeriod.DoesNotExist:
        return Response({'detail': 'Academic period not found.'}, status=status.HTTP_404_NOT_FOUND)

    export_funcs = {
        'schedule': export_schedule,
        'faculty_loading': export_faculty_loading,
        'room_utilization': export_room_utilization,
    }

    func = export_funcs.get(export_type)
    if not func:
        return Response(
            {'detail': f'Invalid type. Choose from: {", ".join(export_funcs.keys())}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    wb = func(tenant, period)

    response = HttpResponse(
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    filename = f'{period.name.replace(" ", "_")}_{export_type}.xlsx'
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    wb.save(response)
    return response
