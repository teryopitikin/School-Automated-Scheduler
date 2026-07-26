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
        """Create schedule entries for one or more days.

        A HARD conflict (same day + overlapping time on the same room, faculty,
        or section) blocks the add — nothing is saved. A soft warning such as
        faculty overload does NOT block; the class is still added. Pass
        ``allow_conflicts: true`` to force-save past a hard conflict.
        """
        import uuid
        from django.db import transaction

        data = request.data
        days = data.get('days')
        if not days:
            single = data.get('day_of_week')
            days = [single] if single else []
        if isinstance(days, str):
            days = [days]
        if not days:
            return Response({'detail': 'At least one day is required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        tenant = getattr(request, 'tenant', None) or request.user.tenant
        allow_conflicts = str(data.get('allow_conflicts', '')).lower() in ('1', 'true', 'yes')
        group = uuid.uuid4()

        common = {
            'academic_period': data.get('academic_period'),
            'course': data.get('course'),
            'faculty': data.get('faculty') or None,
            'room': data.get('room'),
            'time_start': data.get('time_start'),
            'time_end': data.get('time_end'),
            'entry_type': data.get('entry_type', 'LECTURE'),
            'load_classification': data.get('load_classification', 'REGULAR'),
            'class_size': data.get('class_size', 0),
            'faculty_credits': data.get('faculty_credits', 0),
            'remarks': data.get('remarks', ''),
            'sections': data.get('sections', []),
        }

        created, hard, warnings = [], [], []
        with transaction.atomic():
            for day in days:
                serializer = self.get_serializer(data={**common, 'day_of_week': day})
                serializer.is_valid(raise_exception=True)
                serializer.save(tenant=tenant, group_id=group)
                created.append(serializer.instance)
            for entry in created:
                result = detect_conflicts(entry)
                hard.extend(result['hard'])
                warnings.extend(result['warnings'])
            if hard and not allow_conflicts:
                transaction.set_rollback(True)

        if hard and not allow_conflicts:
            return Response({
                'detail': 'Not added — this class clashes with an existing schedule '
                          '(same time on the same room, faculty, or section).',
                'blocked': True,
                'hard': hard,
                'warnings': warnings,
            }, status=status.HTTP_409_CONFLICT)

        return Response({
            'created': len(created),
            'group_id': str(group),
            'warnings': warnings,
            'entries': [self.get_serializer(e).data for e in created],
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Edit a single day-slot. Same rule as create: a hard clash blocks the
        save (unless allow_conflicts) — overload does not."""
        from django.db import transaction

        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        allow = str(request.data.get('allow_conflicts', '')).lower() in ('1', 'true', 'yes')

        with transaction.atomic():
            self.perform_update(serializer)
            entry = serializer.instance
            conflicts = detect_conflicts(entry)
            if conflicts['hard'] and not allow:
                transaction.set_rollback(True)

        if conflicts['hard'] and not allow:
            return Response({
                'detail': 'Not saved — this class clashes with an existing schedule.',
                'blocked': True, 'hard': conflicts['hard'],
            }, status=status.HTTP_409_CONFLICT)

        data = serializer.data
        data['conflicts'] = conflicts
        return Response(data)

    @action(detail=True, methods=['post'], url_path='edit-group')
    def edit_group(self, request, pk=None):
        """Apply faculty/room/time/load changes to EVERY day of this class
        (all entries sharing its group_id). Day stays per-slot."""
        from datetime import datetime
        from django.db import transaction

        entry = self.get_object()
        tenant = getattr(request, 'tenant', None) or request.user.tenant
        allow = str(request.data.get('allow_conflicts', '')).lower() in ('1', 'true', 'yes')

        def parse_t(v):
            return datetime.strptime(str(v)[:5], '%H:%M').time()

        updates = {}
        if 'faculty' in request.data:
            updates['faculty_id'] = request.data['faculty'] or None
        if 'room' in request.data:
            updates['room_id'] = request.data['room'] or None
        if 'time_start' in request.data and request.data['time_start']:
            updates['time_start'] = parse_t(request.data['time_start'])
        if 'time_end' in request.data and request.data['time_end']:
            updates['time_end'] = parse_t(request.data['time_end'])
        if 'load_classification' in request.data:
            updates['load_classification'] = request.data['load_classification']

        targets = list(ScheduleEntry.objects.filter(tenant=tenant, group_id=entry.group_id))
        hard = []
        with transaction.atomic():
            for t in targets:
                for k, v in updates.items():
                    setattr(t, k, v)
                t.save()
            for t in targets:
                hard.extend(detect_conflicts(t)['hard'])
            if hard and not allow:
                transaction.set_rollback(True)

        if hard and not allow:
            return Response({
                'detail': 'Not saved — a day of this class clashes with an existing schedule.',
                'blocked': True, 'hard': hard,
            }, status=status.HTTP_409_CONFLICT)
        return Response({'updated': len(targets)})

    @action(detail=True, methods=['post'], url_path='delete-group')
    def delete_group(self, request, pk=None):
        """Delete every day of this class (all entries sharing its group_id)."""
        entry = self.get_object()
        tenant = getattr(request, 'tenant', None) or request.user.tenant
        qs = ScheduleEntry.objects.filter(tenant=tenant, group_id=entry.group_id)
        count = qs.count()
        qs.delete()
        return Response({'deleted': count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='free-rooms')
    def free_rooms(self, request, pk=None):
        """Rooms with no class overlapping this entry's day/time — candidates
        for resolving a room double-booking. Same room-type as the entry's
        current room ranks first; the entry's own room is excluded."""
        entry = self.get_object()
        busy_room_ids = set(
            ScheduleEntry.objects.filter(
                tenant=entry.tenant,
                academic_period=entry.academic_period,
                day_of_week=entry.day_of_week,
                time_start__lt=entry.time_end,
                time_end__gt=entry.time_start,
            ).values_list('room_id', flat=True)
        )
        rooms = Room.objects.filter(tenant=entry.tenant).exclude(
            pk__in=busy_room_ids | {entry.room_id},
        )
        current_type = entry.room.room_type if entry.room else ''
        data = sorted(
            ({'id': r.pk, 'name': r.name, 'room_type': r.room_type,
              'capacity': r.capacity} for r in rooms),
            key=lambda r: (r['room_type'] != current_type, r['name']),
        )
        return Response({'rooms': data})

    @action(detail=False, methods=['get'])
    def conflicts(self, request):
        """List all conflicts across the current academic period.

        Each item carries `entry_detail` (course, sections, faculty, room,
        day, times) for the flagged entry, and each hard conflict carries the
        same details for the clashing entry under `other`.
        """
        period_id = request.query_params.get('academic_period')
        if not period_id:
            return Response(
                {'detail': 'academic_period query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entries = list(
            self.get_queryset().filter(academic_period_id=period_id)
            .select_related('course', 'faculty', 'room')
            .prefetch_related('sections__program')
        )

        def brief(e):
            return {
                'id': e.pk,
                'course_code': e.course.code,
                'section_names': [str(s) for s in e.sections.all()],
                'faculty_name': e.faculty.name if e.faculty else 'TBA',
                'room_name': e.room.name if e.room else '',
                'day_of_week': e.day_of_week,
                'time_start': str(e.time_start),
                'time_end': str(e.time_end),
            }

        from .conflicts import analyze_period
        tenant = getattr(request, 'tenant', None) or request.user.tenant
        analysis = analyze_period(tenant, AcademicPeriod.objects.get(pk=period_id), entries=entries)

        briefs = {e.pk: brief(e) for e in entries}
        all_conflicts = []
        for entry in entries:
            result = analysis[entry.pk]
            if result['hard'] or result['warnings']:
                for h in result['hard']:
                    h['other'] = briefs.get(h.get('conflicting_entry_id'))
                all_conflicts.append({
                    'entry_id': entry.pk,
                    'entry': str(entry),
                    'entry_detail': briefs[entry.pk],
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

    from .cleaned_importer import import_cleaned

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

    result = import_cleaned(wb, tenant, period)
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_excel_view(request):
    from .exporters import (
        export_schedule, export_faculty_loading, export_room_utilization,
        export_conflicts,
    )

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
        'conflicts': export_conflicts,
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
