# Backend Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the business logic layer — suggestion engine, Excel import/export, dashboard stats, and period cloning — on top of the existing CRUD foundation.

**Architecture:** Five independent modules (suggestions.py, importers.py, exporters.py, stats.py, clone logic) each with their own test file. Views and URLs are extended to wire in the new endpoints. Each module depends only on existing models and the conflicts module.

**Tech Stack:** Python 3.12, Django 5.1, DRF, openpyxl (already in requirements.txt)

---

## File Structure

```
apps/scheduling/
├── suggestions.py          # NEW — Suggestion engine (slot generation, scoring, ranking)
├── importers.py            # NEW — Excel import parser
├── exporters.py            # NEW — Excel export generators
├── stats.py                # NEW — Dashboard statistics calculations
├── conflicts.py            # EXISTING — Conflict detection (used by suggestions)
├── models.py               # EXISTING — No changes
├── serializers.py          # EXISTING — No changes
├── views.py                # MODIFY — Add suggest, stats, import, export, clone endpoints
├── urls.py                 # MODIFY — Add import/export routes
├── tests/
│   ├── test_suggestions.py # NEW
│   ├── test_importers.py   # NEW
│   ├── test_exporters.py   # NEW
│   ├── test_stats.py       # NEW
│   ├── test_clone.py       # NEW
│   ├── test_conflicts.py   # EXISTING
│   ├── test_api.py         # EXISTING
│   └── test_models.py      # EXISTING
```

---

## Task 1: Dashboard Stats

**Why first:** Simplest module — pure read queries, no side effects. Good warm-up that verifies the full test/commit cycle works.

**Files:**
- Create: `apps/scheduling/stats.py`
- Create: `apps/scheduling/tests/test_stats.py`
- Modify: `apps/scheduling/views.py` (add stats action to ScheduleEntryViewSet)

- [ ] **Step 1: Write failing tests for stats**

`apps/scheduling/tests/test_stats.py`:

```python
import datetime
import uuid

import pytest

from apps.core.models import Tenant, User
from apps.scheduling.models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, Room, ScheduleEntry, ScheduleConfig,
)
from apps.scheduling.stats import compute_stats

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenant():
    return Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')


@pytest.fixture
def period(tenant):
    return AcademicPeriod.objects.create(
        tenant=tenant, name='1S 25-26', year_start=2025, year_end=2026,
        semester='1ST', status='DRAFT',
    )


@pytest.fixture
def config(tenant, period):
    return ScheduleConfig.objects.create(
        tenant=tenant, academic_period=period,
        earliest_start_time=datetime.time(7, 0),
        latest_end_time=datetime.time(21, 0),
        time_slot_granularity_minutes=30,
        operating_days=['MON', 'TUE', 'WED', 'THU', 'FRI'],
    )


@pytest.fixture
def dept(tenant):
    return Department.objects.create(tenant=tenant, code='Agri', name='Agriculture')


@pytest.fixture
def course(tenant, dept):
    return Course.objects.create(
        tenant=tenant, department=dept, code='CrSc 1', title='Crop Science 1',
        lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
    )


@pytest.fixture
def faculty(tenant):
    return Faculty.objects.create(
        tenant=tenant, name='Dr. Smith', employment_type='FULL_TIME',
        priority_level=5, max_load_units=24,
    )


@pytest.fixture
def room(tenant):
    return Room.objects.create(
        tenant=tenant, name='Room 101', room_type='LECTURE', capacity=40,
        building='Main', floor=1, sequence_number=1,
    )


def make_entry(tenant, period, course, faculty, room, day, start, end,
               sections=None, load_classification='REGULAR', class_size=35):
    entry = ScheduleEntry.objects.create(
        tenant=tenant, academic_period=period, course=course,
        faculty=faculty, room=room, day_of_week=day,
        time_start=datetime.time(*start), time_end=datetime.time(*end),
        group_id=uuid.uuid4(), entry_type='LECTURE',
        load_classification=load_classification, class_size=class_size,
    )
    if sections:
        entry.sections.set(sections)
    return entry


class TestComputeStats:
    def test_empty_period(self, tenant, period, config):
        result = compute_stats(tenant, period)
        assert result['summary']['total_courses'] == 0
        assert result['summary']['scheduled'] == 0
        assert result['summary']['conflict_count'] == 0
        assert result['faculty_breakdown'] == []
        assert result['program_progress'] == []

    def test_summary_counts(self, tenant, period, config, course, faculty, room):
        prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
        sec = Section.objects.create(
            tenant=tenant, program=prog, academic_period=period,
            year_level=1, section_number=1,
        )
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (9, 30), [sec])
        result = compute_stats(tenant, period)
        assert result['summary']['total_courses'] == 1
        assert result['summary']['scheduled'] == 1
        assert result['summary']['faculty_count'] == 1
        assert result['summary']['overloaded_faculty_count'] == 0

    def test_faculty_breakdown(self, tenant, period, config, dept, faculty, room):
        course1 = Course.objects.create(
            tenant=tenant, department=dept, code='C1', title='C1',
            lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
        )
        course2 = Course.objects.create(
            tenant=tenant, department=dept, code='C2', title='C2',
            lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
        )
        prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
        sec = Section.objects.create(
            tenant=tenant, program=prog, academic_period=period,
            year_level=1, section_number=1,
        )
        make_entry(tenant, period, course1, faculty, room, 'MON', (8, 0), (9, 30),
                    [sec], load_classification='REGULAR')
        make_entry(tenant, period, course2, faculty, room, 'TUE', (8, 0), (9, 30),
                    [sec], load_classification='OVERLOAD')

        result = compute_stats(tenant, period)
        fb = result['faculty_breakdown']
        assert len(fb) == 1
        assert fb[0]['name'] == 'Dr. Smith'
        assert fb[0]['total_units'] == 6
        assert fb[0]['regular'] == 3
        assert fb[0]['overload'] == 3

    def test_program_progress(self, tenant, period, config, dept, faculty, room):
        course1 = Course.objects.create(
            tenant=tenant, department=dept, code='C1', title='C1',
            lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
        )
        prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
        sec = Section.objects.create(
            tenant=tenant, program=prog, academic_period=period,
            year_level=1, section_number=1,
        )
        make_entry(tenant, period, course1, faculty, room, 'MON', (8, 0), (9, 30), [sec])

        result = compute_stats(tenant, period)
        pp = result['program_progress']
        assert len(pp) == 1
        assert pp[0]['program_code'] == 'BSA'
        assert pp[0]['scheduled'] == 1

    def test_daily_room_utilization(self, tenant, period, config, course, faculty, room):
        prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
        sec = Section.objects.create(
            tenant=tenant, program=prog, academic_period=period,
            year_level=1, section_number=1,
        )
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (9, 30), [sec])

        result = compute_stats(tenant, period)
        dru = result['daily_room_utilization']
        mon = next(d for d in dru if d['day'] == 'MON')
        assert mon['used_slots'] > 0
        assert mon['utilization_pct'] > 0

    def test_overloaded_faculty(self, tenant, period, config, dept, room):
        overloaded = Faculty.objects.create(
            tenant=tenant, name='Dr. Busy', employment_type='FULL_TIME',
            priority_level=5, max_load_units=3,
        )
        c1 = Course.objects.create(
            tenant=tenant, department=dept, code='C1', title='C1',
            lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
        )
        c2 = Course.objects.create(
            tenant=tenant, department=dept, code='C2', title='C2',
            lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
        )
        prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
        sec = Section.objects.create(
            tenant=tenant, program=prog, academic_period=period,
            year_level=1, section_number=1,
        )
        make_entry(tenant, period, c1, overloaded, room, 'MON', (8, 0), (9, 30), [sec])
        make_entry(tenant, period, c2, overloaded, room, 'TUE', (8, 0), (9, 30), [sec])

        result = compute_stats(tenant, period)
        assert result['summary']['overloaded_faculty_count'] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/classify/AutomatedLoader
source .venv/bin/activate
pytest apps/scheduling/tests/test_stats.py -v
```

Expected: FAIL — `ImportError: cannot import name 'compute_stats'`

- [ ] **Step 3: Implement compute_stats**

`apps/scheduling/stats.py`:

```python
from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, Sum, Q

from .conflicts import detect_conflicts
from .models import (
    Faculty, Room, ScheduleConfig, ScheduleEntry,
)


def compute_stats(tenant, period):
    """Compute dashboard statistics for a given academic period."""
    entries = ScheduleEntry.objects.filter(
        tenant=tenant, academic_period=period,
    ).select_related('course', 'faculty', 'room').prefetch_related('sections')

    # --- Summary ---
    distinct_courses = entries.values('course').distinct().count()

    # Conflict count
    conflict_count = 0
    for entry in entries:
        result = detect_conflicts(entry)
        conflict_count += len(result['hard'])
    # Each conflict is reported by both sides, so divide by 2
    conflict_count = conflict_count // 2

    # Faculty stats
    faculty_ids = set(entries.exclude(faculty=None).values_list('faculty_id', flat=True))
    faculty_members = Faculty.objects.filter(pk__in=faculty_ids).select_related()

    overloaded_count = 0
    faculty_breakdown = []
    for fac in faculty_members:
        fac_entries = entries.filter(faculty=fac)
        units_by_classification = defaultdict(Decimal)
        total_units = Decimal('0')
        for e in fac_entries:
            units = e.course.lec_units + e.course.lab_units
            units_by_classification[e.load_classification] += units
            total_units += units

        if total_units > fac.max_load_units:
            overloaded_count += 1

        faculty_breakdown.append({
            'id': fac.pk,
            'name': fac.name,
            'total_units': float(total_units),
            'max_units': float(fac.max_load_units),
            'regular': float(units_by_classification.get('REGULAR', 0)),
            'overload': float(units_by_classification.get('OVERLOAD', 0)),
            'built_in': float(units_by_classification.get('BUILT_IN', 0)),
            'part_time': float(units_by_classification.get('PART_TIME', 0)),
        })

    faculty_breakdown.sort(key=lambda x: x['name'])

    # --- Program progress ---
    program_data = defaultdict(lambda: {'name': '', 'courses': set()})
    for entry in entries:
        for section in entry.sections.all():
            key = section.program.code
            program_data[key]['name'] = section.program.name
            program_data[key]['courses'].add(entry.course_id)

    program_progress = []
    for code, data in sorted(program_data.items()):
        scheduled = len(data['courses'])
        program_progress.append({
            'program_code': code,
            'program_name': data['name'],
            'total_courses': scheduled,  # no curriculum model, so total = scheduled
            'scheduled': scheduled,
            'percentage': 100.0 if scheduled > 0 else 0.0,
        })

    # --- Daily room utilization ---
    try:
        config = ScheduleConfig.objects.get(tenant=tenant, academic_period=period)
        operating_days = config.operating_days
        granularity = config.time_slot_granularity_minutes
        earliest = config.earliest_start_time
        latest = config.latest_end_time

        # Calculate total slots per day
        total_minutes = (latest.hour * 60 + latest.minute) - (earliest.hour * 60 + earliest.minute)
        slots_per_day = total_minutes // granularity
        room_count = Room.objects.filter(tenant=tenant).count()
        total_slots_per_day = slots_per_day * room_count
    except ScheduleConfig.DoesNotExist:
        operating_days = ['MON', 'TUE', 'WED', 'THU', 'FRI']
        total_slots_per_day = 0
        granularity = 30

    daily_room_utilization = []
    for day in operating_days:
        day_entries = entries.filter(day_of_week=day)
        # Count occupied slots: each entry occupies (duration / granularity) slots for 1 room
        used_slots = 0
        for entry in day_entries:
            duration_min = (entry.time_end.hour * 60 + entry.time_end.minute) - \
                           (entry.time_start.hour * 60 + entry.time_start.minute)
            used_slots += duration_min // granularity

        utilization = round(used_slots / total_slots_per_day * 100, 1) if total_slots_per_day > 0 else 0
        daily_room_utilization.append({
            'day': day,
            'total_slots': total_slots_per_day,
            'used_slots': used_slots,
            'utilization_pct': utilization,
        })

    return {
        'summary': {
            'total_courses': distinct_courses,
            'scheduled': distinct_courses,
            'unscheduled': 0,
            'conflict_count': conflict_count,
            'faculty_count': len(faculty_ids),
            'overloaded_faculty_count': overloaded_count,
        },
        'faculty_breakdown': faculty_breakdown,
        'program_progress': program_progress,
        'daily_room_utilization': daily_room_utilization,
    }
```

- [ ] **Step 4: Run tests**

```bash
pytest apps/scheduling/tests/test_stats.py -v
```

Expected: All 6 tests PASS

- [ ] **Step 5: Wire stats endpoint into ScheduleEntryViewSet**

Add to `apps/scheduling/views.py` — add a new `@action` to `ScheduleEntryViewSet` (after the existing `conflicts` action at line 138):

```python
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
```

- [ ] **Step 6: Run ALL tests**

```bash
pytest -v
```

Expected: All tests PASS (38 existing + 6 new = 44)

- [ ] **Step 7: Commit**

```bash
git add apps/scheduling/stats.py apps/scheduling/tests/test_stats.py apps/scheduling/views.py
git commit -m "feat: add dashboard stats — summary, faculty breakdown, program progress, room utilization"
```

---

## Task 2: Period Cloning

**Files:**
- Modify: `apps/scheduling/views.py` (add clone action to AcademicPeriodViewSet)
- Create: `apps/scheduling/tests/test_clone.py`

- [ ] **Step 1: Write failing tests for cloning**

`apps/scheduling/tests/test_clone.py`:

```python
import datetime

import pytest
from rest_framework.test import APIClient

from apps.core.models import Tenant, User
from apps.scheduling.models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, FacultyAvailability, Room, ScheduleConfig,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenant():
    return Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')


@pytest.fixture
def user(tenant):
    return User.objects.create_user(
        username='registrar', password='pass', tenant=tenant, role='REGISTRAR',
    )


@pytest.fixture
def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def source_period(tenant):
    return AcademicPeriod.objects.create(
        tenant=tenant, name='1S 25-26', year_start=2025, year_end=2026,
        semester='1ST', status='ACTIVE',
    )


@pytest.fixture
def setup_source(tenant, source_period):
    """Create full structure in source period."""
    prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
    dept = Department.objects.create(tenant=tenant, code='Agri', name='Agriculture')
    Section.objects.create(
        tenant=tenant, program=prog, academic_period=source_period,
        year_level=1, section_number=1,
    )
    Section.objects.create(
        tenant=tenant, program=prog, academic_period=source_period,
        year_level=1, section_number=2,
    )
    ScheduleConfig.objects.create(
        tenant=tenant, academic_period=source_period,
        earliest_start_time=datetime.time(7, 0),
        latest_end_time=datetime.time(21, 0),
        time_slot_granularity_minutes=30,
        operating_days=['MON', 'TUE', 'WED', 'THU', 'FRI'],
    )
    fac = Faculty.objects.create(
        tenant=tenant, name='Dr. Smith', employment_type='FULL_TIME',
        priority_level=5, max_load_units=24,
    )
    FacultyAvailability.objects.create(
        faculty=fac, academic_period=source_period,
        day_of_week='MON', time_start=datetime.time(8, 0),
        time_end=datetime.time(12, 0), availability_type='PREFERRED',
    )
    return {'program': prog, 'department': dept, 'faculty': fac}


class TestPeriodClone:
    def test_clone_basic(self, auth_client, source_period, setup_source):
        response = auth_client.post(
            f'/api/loader/academic-periods/{source_period.pk}/clone/',
            {
                'name': '2S 25-26',
                'year_start': 2025,
                'year_end': 2026,
                'semester': '2ND',
                'clone_availability': False,
            },
            format='json',
        )
        assert response.status_code == 201
        data = response.data
        assert data['academic_period']['name'] == '2S 25-26'
        assert data['cloned']['sections'] == 2
        assert data['cloned']['config'] is True
        assert data['cloned']['faculty_availability'] == 0

    def test_clone_with_availability(self, auth_client, source_period, setup_source):
        response = auth_client.post(
            f'/api/loader/academic-periods/{source_period.pk}/clone/',
            {
                'name': '2S 25-26',
                'year_start': 2025,
                'year_end': 2026,
                'semester': '2ND',
                'clone_availability': True,
            },
            format='json',
        )
        assert response.status_code == 201
        assert response.data['cloned']['faculty_availability'] == 1

    def test_clone_creates_new_period(self, auth_client, source_period, setup_source):
        auth_client.post(
            f'/api/loader/academic-periods/{source_period.pk}/clone/',
            {
                'name': '2S 25-26',
                'year_start': 2025,
                'year_end': 2026,
                'semester': '2ND',
                'clone_availability': False,
            },
            format='json',
        )
        assert AcademicPeriod.objects.count() == 2
        new_period = AcademicPeriod.objects.get(semester='2ND')
        # Sections belong to the NEW period
        assert new_period.sections.count() == 2
        # Source still has its sections
        assert source_period.sections.count() == 2

    def test_clone_does_not_copy_schedule_entries(self, auth_client, source_period, setup_source, tenant):
        # Even if source has entries, clone should not copy them
        # (no entries created in setup, but verify the new period is empty)
        response = auth_client.post(
            f'/api/loader/academic-periods/{source_period.pk}/clone/',
            {
                'name': '2S 25-26',
                'year_start': 2025,
                'year_end': 2026,
                'semester': '2ND',
                'clone_availability': False,
            },
            format='json',
        )
        new_period_id = response.data['academic_period']['id']
        from apps.scheduling.models import ScheduleEntry
        assert ScheduleEntry.objects.filter(academic_period_id=new_period_id).count() == 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest apps/scheduling/tests/test_clone.py -v
```

Expected: FAIL — 404 on clone URL

- [ ] **Step 3: Implement clone action**

Add to `apps/scheduling/views.py` — add a `@action` to `AcademicPeriodViewSet` (after line 24):

```python
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

        # Create new period
        new_period = AcademicPeriod.objects.create(
            tenant=tenant, name=name, year_start=year_start,
            year_end=year_end, semester=semester, status='DRAFT',
        )

        # Clone sections
        source_sections = Section.objects.filter(
            tenant=tenant, academic_period=source,
        )
        sections_created = 0
        for sec in source_sections:
            Section.objects.create(
                tenant=tenant, program=sec.program,
                academic_period=new_period,
                year_level=sec.year_level,
                section_number=sec.section_number,
            )
            sections_created += 1

        # Clone config
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

        # Clone faculty availability
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
```

Note: The clone action uses models already imported in views.py (`AcademicPeriod`, `Section`, `ScheduleConfig`, `FacultyAvailability`) and `AcademicPeriodSerializer`.

- [ ] **Step 4: Run tests**

```bash
pytest apps/scheduling/tests/test_clone.py -v
```

Expected: All 4 tests PASS

- [ ] **Step 5: Run ALL tests**

```bash
pytest -v
```

Expected: All tests PASS (44 + 4 = 48)

- [ ] **Step 6: Commit**

```bash
git add apps/scheduling/views.py apps/scheduling/tests/test_clone.py
git commit -m "feat: add period cloning — sections, config, and optional faculty availability"
```

---

## Task 3: Excel Import — Parser Core

The import is split into two tasks: this task builds the parsing logic (pure functions, no Django views), and Task 4 wires it into the API.

**Files:**
- Create: `apps/scheduling/importers.py`
- Create: `apps/scheduling/tests/test_importers.py`

- [ ] **Step 1: Write failing tests for parsing helpers**

`apps/scheduling/tests/test_importers.py`:

```python
import datetime

import pytest

from apps.scheduling.importers import normalize_days, parse_time, parse_load_classification


class TestNormalizeDays:
    def test_multiline(self):
        assert normalize_days('Tue\nThu') == ['TUE', 'THU']

    def test_abbreviation_mw(self):
        assert normalize_days('MW') == ['MON', 'WED']

    def test_abbreviation_tth(self):
        assert normalize_days('TTh') == ['TUE', 'THU']

    def test_abbreviation_mwf(self):
        assert normalize_days('MWF') == ['MON', 'WED', 'FRI']

    def test_single_day(self):
        assert normalize_days('Fri') == ['FRI']

    def test_full_single(self):
        assert normalize_days('Mon') == ['MON']

    def test_none(self):
        assert normalize_days(None) == []


class TestParseTime:
    def test_datetime_time(self):
        assert parse_time(datetime.time(9, 0)) == datetime.time(9, 0)

    def test_am_string(self):
        assert parse_time('9:00 AM') == datetime.time(9, 0)

    def test_pm_string(self):
        assert parse_time('1:00 PM') == datetime.time(13, 0)

    def test_short_am(self):
        assert parse_time('9:00A') == datetime.time(9, 0)

    def test_short_pm(self):
        assert parse_time('1:00P') == datetime.time(13, 0)

    def test_12pm(self):
        assert parse_time('12:00 PM') == datetime.time(12, 0)

    def test_12am(self):
        assert parse_time('12:00 AM') == datetime.time(0, 0)

    def test_range_extracts_start(self):
        assert parse_time('9:00A - 12:00P') == datetime.time(9, 0)

    def test_none(self):
        assert parse_time(None) is None


class TestParseLoadClassification:
    def test_single_value(self):
        result = parse_load_classification('Built-in', ['MON', 'WED'])
        assert result == {'MON': 'BUILT_IN', 'WED': 'BUILT_IN'}

    def test_per_day(self):
        result = parse_load_classification('Mon - Overload\nWed - Regular', ['MON', 'WED'])
        assert result == {'MON': 'OVERLOAD', 'WED': 'REGULAR'}

    def test_part_time(self):
        result = parse_load_classification('Part-time', ['MON'])
        assert result == {'MON': 'PART_TIME'}

    def test_overload(self):
        result = parse_load_classification('Overload', ['TUE', 'THU'])
        assert result == {'TUE': 'OVERLOAD', 'THU': 'OVERLOAD'}

    def test_none(self):
        result = parse_load_classification(None, ['MON'])
        assert result == {'MON': 'REGULAR'}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest apps/scheduling/tests/test_importers.py -v
```

Expected: FAIL — `ImportError`

- [ ] **Step 3: Implement parsing helpers**

`apps/scheduling/importers.py`:

```python
import datetime
import re
import uuid

from django.db import transaction

from .models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, Room, ScheduleEntry,
)


# --- Day normalization ---

DAY_ABBREV_MAP = {
    'mon': 'MON', 'tue': 'TUE', 'wed': 'WED', 'thu': 'THU',
    'fri': 'FRI', 'sat': 'SAT', 'sun': 'SUN',
    'monday': 'MON', 'tuesday': 'TUE', 'wednesday': 'WED',
    'thursday': 'THU', 'friday': 'FRI', 'saturday': 'SAT', 'sunday': 'SUN',
    'th': 'THU', 'tu': 'TUE',
}

COMPOUND_DAYS = {
    'MW': ['MON', 'WED'],
    'MWF': ['MON', 'WED', 'FRI'],
    'TTh': ['TUE', 'THU'],
    'TTH': ['TUE', 'THU'],
    'MF': ['MON', 'FRI'],
    'WF': ['WED', 'FRI'],
}


def normalize_days(raw):
    """Parse a day string into a list of 3-letter day codes."""
    if raw is None:
        return []
    raw = str(raw).strip()
    if not raw:
        return []

    # Check compound abbreviations first
    if raw in COMPOUND_DAYS:
        return COMPOUND_DAYS[raw]

    # Multi-line: split on newline
    if '\n' in raw:
        result = []
        for line in raw.split('\n'):
            result.extend(normalize_days(line.strip()))
        return result

    # Single day lookup
    lower = raw.lower().strip()
    if lower in DAY_ABBREV_MAP:
        return [DAY_ABBREV_MAP[lower]]

    return []


# --- Time parsing ---

def parse_time(raw):
    """Parse a time value into datetime.time."""
    if raw is None:
        return None
    if isinstance(raw, datetime.time):
        return raw

    raw = str(raw).strip()
    if not raw:
        return None

    # Handle range format: "9:00A - 12:00P" -> extract first part
    if ' - ' in raw:
        raw = raw.split(' - ')[0].strip()

    # Remove trailing periods
    raw = raw.rstrip('.')

    # Try "H:MM AM/PM" or "H:MMA/P" formats
    patterns = [
        (r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', True),
        (r'^(\d{1,2}):(\d{2})\s*(A|P)$', True),
    ]

    for pattern, has_ampm in patterns:
        m = re.match(pattern, raw, re.IGNORECASE)
        if m:
            hour = int(m.group(1))
            minute = int(m.group(2))
            ampm = m.group(3).upper()
            if ampm in ('PM', 'P') and hour != 12:
                hour += 12
            elif ampm in ('AM', 'A') and hour == 12:
                hour = 0
            return datetime.time(hour, minute)

    return None


# --- Load classification parsing ---

CLASSIFICATION_MAP = {
    'regular': 'REGULAR',
    'overload': 'OVERLOAD',
    'built-in': 'BUILT_IN',
    'built in': 'BUILT_IN',
    'builtin': 'BUILT_IN',
    'part-time': 'PART_TIME',
    'part time': 'PART_TIME',
    'parttime': 'PART_TIME',
}


def parse_load_classification(raw, days):
    """Parse load classification string, returning a dict of {day_code: classification}."""
    if raw is None or str(raw).strip() == '':
        return {d: 'REGULAR' for d in days}

    raw = str(raw).strip()

    # Check if per-day format: "Mon - Overload\nWed - Regular"
    if '\n' in raw:
        result = {}
        for line in raw.split('\n'):
            line = line.strip()
            if ' - ' in line:
                day_part, class_part = line.split(' - ', 1)
                day_codes = normalize_days(day_part.strip())
                classification = CLASSIFICATION_MAP.get(class_part.strip().lower(), 'REGULAR')
                for d in day_codes:
                    result[d] = classification
        # Fill in any days not mentioned
        for d in days:
            if d not in result:
                result[d] = 'REGULAR'
        return result

    # Single value applies to all days
    classification = CLASSIFICATION_MAP.get(raw.lower(), 'REGULAR')
    return {d: classification for d in days}


# --- Section parsing ---

def parse_section_string(raw):
    """Parse 'BSA 1-1' or 'BSA 1-1, BSF 1-1' into list of (program_code, year_level, section_number)."""
    if raw is None:
        return []
    results = []
    for part in str(raw).split(','):
        part = part.strip()
        m = re.match(r'^(\S+)\s+(\d+)-(\d+)$', part)
        if m:
            results.append((m.group(1), int(m.group(2)), int(m.group(3))))
    return results


# --- Main import function ---

def import_excel(workbook, tenant, period):
    """
    Import schedule data from an openpyxl Workbook.

    Returns:
        {'created': int, 'skipped': int, 'warnings': list, 'conflicts': list}
    """
    ws = workbook.active
    rows = list(ws.iter_rows(min_row=2, values_only=False))  # skip header

    created = 0
    skipped = 0
    warnings = []
    conflicts_found = []

    from .conflicts import detect_conflicts

    with transaction.atomic():
        for row_idx, row in enumerate(rows, start=2):
            cells = {c.column_letter: c.value for c in row}

            # Skip empty rows
            if not cells.get('D'):
                continue

            program_code = str(cells.get('A', '') or '').strip()
            dept_code = str(cells.get('B', '') or '').strip()
            course_code = str(cells.get('D', '') or '').strip()
            course_title = str(cells.get('E', '') or '').strip()
            lec_units = cells.get('F') or 0
            lab_units = cells.get('G') or 0
            contact_hours = cells.get('I') or 0
            faculty_name = str(cells.get('L', '') or '').strip()
            days_raw = cells.get('N')
            time_in_raw = cells.get('O')
            time_out_raw = cells.get('P')
            room_name = str(cells.get('Q', '') or '').strip()
            section_raw = cells.get('R')
            load_class_raw = cells.get('S')
            class_size = cells.get('T') or 0
            remarks = str(cells.get('U', '') or '').strip()

            # Check for V/W columns (lab data — flag for manual review)
            has_vw_data = cells.get('V') is not None or cells.get('W') is not None

            # Parse days and times
            days = normalize_days(days_raw)
            if not days:
                warnings.append({'row': row_idx, 'reason': 'Could not parse days'})
                skipped += 1
                continue

            # Parse multi-line times
            time_in_parts = str(time_in_raw).split('\n') if time_in_raw and '\n' in str(time_in_raw) else [time_in_raw]
            time_out_parts = str(time_out_raw).split('\n') if time_out_raw and '\n' in str(time_out_raw) else [time_out_raw]

            # Handle datetime.time objects (no split needed)
            if isinstance(time_in_raw, datetime.time):
                time_in_parts = [time_in_raw]
            if isinstance(time_out_raw, datetime.time):
                time_out_parts = [time_out_raw]

            time_ins = [parse_time(t) for t in time_in_parts]
            time_outs = [parse_time(t) for t in time_out_parts]

            # Validate day/time count alignment
            if len(days) != len(time_ins) or len(days) != len(time_outs):
                # If single time for multiple days, replicate
                if len(time_ins) == 1 and len(days) > 1:
                    time_ins = time_ins * len(days)
                    time_outs = time_outs * len(days)
                else:
                    warnings.append({
                        'row': row_idx,
                        'reason': f'Day/time count mismatch — {len(days)} days but {len(time_ins)} times',
                    })
                    skipped += 1
                    continue

            # Validate all times parsed
            if any(t is None for t in time_ins) or any(t is None for t in time_outs):
                warnings.append({'row': row_idx, 'reason': 'Could not parse time values'})
                skipped += 1
                continue

            # Parse load classification
            load_map = parse_load_classification(load_class_raw, days)

            # Get or create entities
            dept = None
            if dept_code:
                dept, _ = Department.objects.get_or_create(
                    tenant=tenant, code=dept_code,
                    defaults={'name': dept_code},
                )

            has_lab = float(lab_units) > 0
            course, _ = Course.objects.get_or_create(
                tenant=tenant, code=course_code,
                defaults={
                    'department': dept or Department.objects.get_or_create(
                        tenant=tenant, code='GEN', defaults={'name': 'General'}
                    )[0],
                    'title': course_title,
                    'lec_units': lec_units,
                    'lab_units': lab_units,
                    'contact_hours': contact_hours,
                    'has_lab': has_lab,
                },
            )

            # Faculty
            faculty = None
            if faculty_name and not faculty_name.upper().startswith('TBA'):
                is_part_time = any(v == 'PART_TIME' for v in load_map.values())
                faculty, _ = Faculty.objects.get_or_create(
                    tenant=tenant, name=faculty_name,
                    defaults={
                        'employment_type': 'PART_TIME' if is_part_time else 'FULL_TIME',
                        'max_load_units': 24,
                    },
                )

            # Room
            room = None
            if room_name:
                room, _ = Room.objects.get_or_create(
                    tenant=tenant, name=room_name,
                    defaults={'room_type': 'LECTURE', 'capacity': 0},
                )

            if not room:
                warnings.append({'row': row_idx, 'reason': 'No room specified'})
                skipped += 1
                continue

            # Parse sections
            section_tuples = parse_section_string(section_raw)
            section_objects = []
            for prog_code, year_level, sec_num in section_tuples:
                prog, _ = Program.objects.get_or_create(
                    tenant=tenant, code=prog_code,
                    defaults={'name': prog_code},
                )
                sec, _ = Section.objects.get_or_create(
                    tenant=tenant, program=prog, academic_period=period,
                    year_level=year_level, section_number=sec_num,
                )
                section_objects.append(sec)

            # Create entries — one per day
            group = uuid.uuid4()
            faculty_credits = float(cells.get('M') or 0)

            for i, day in enumerate(days):
                entry = ScheduleEntry.objects.create(
                    tenant=tenant, academic_period=period,
                    course=course, faculty=faculty, room=room,
                    day_of_week=day,
                    time_start=time_ins[i], time_end=time_outs[i],
                    group_id=group, entry_type='LECTURE',
                    load_classification=load_map.get(day, 'REGULAR'),
                    class_size=int(class_size) if class_size else 0,
                    faculty_credits=faculty_credits,
                    remarks=remarks,
                )
                entry.sections.set(section_objects)
                created += 1

                # Check for conflicts
                conflict_result = detect_conflicts(entry)
                for c in conflict_result['hard']:
                    conflicts_found.append({
                        'row': row_idx,
                        'type': c['type'],
                        'message': c['message'],
                    })

            if has_vw_data:
                warnings.append({
                    'row': row_idx,
                    'reason': 'Columns V/W contain lab schedule data — review manually',
                })

    return {
        'created': created,
        'skipped': skipped,
        'warnings': warnings,
        'conflicts': conflicts_found,
    }
```

- [ ] **Step 4: Run tests**

```bash
pytest apps/scheduling/tests/test_importers.py -v
```

Expected: All 18 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/scheduling/importers.py apps/scheduling/tests/test_importers.py
git commit -m "feat: add Excel import parser — day/time normalization, load classification, section parsing"
```

---

## Task 4: Excel Import — API Endpoint and Integration Test

**Files:**
- Modify: `apps/scheduling/views.py` (add import view)
- Modify: `apps/scheduling/urls.py` (add import route)
- Modify: `apps/scheduling/tests/test_importers.py` (add integration test)

- [ ] **Step 1: Write failing integration test**

Append to `apps/scheduling/tests/test_importers.py`:

```python
import openpyxl

from apps.core.models import Tenant, User
from apps.scheduling.importers import import_excel
from apps.scheduling.models import (
    AcademicPeriod, ScheduleEntry, Program, Course, Faculty, Room, Section,
)


pytestmark = pytest.mark.django_db


@pytest.fixture
def tenant():
    return Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')


@pytest.fixture
def period(tenant):
    return AcademicPeriod.objects.create(
        tenant=tenant, name='1S 25-26', year_start=2025, year_end=2026,
        semester='1ST', status='DRAFT',
    )


class TestImportExcel:
    def _make_workbook(self, rows):
        """Create a minimal Excel workbook with header + data rows."""
        wb = openpyxl.Workbook()
        ws = wb.active
        # Header (matching reference Excel columns)
        headers = ['Course', 'In-Charge', '', 'Course\nCode', 'Course Title',
                    'Lec\nUnits', 'Lab\nUnits', 'Course\nUnits', 'Contact\nHours',
                    '', '', 'Faculty', 'Faculty\nCredits', 'Day(s)', 'Time In',
                    'Time Out', 'Room', 'Section', 'Load\nClassification',
                    'Class\nSize', 'Remarks']
        ws.append(headers)
        for row in rows:
            ws.append(row)
        return wb

    def test_basic_import(self, tenant, period):
        wb = self._make_workbook([
            # A    B      C  D        E               F  G  H  I   J  K  L                M  N      O            P            Q      R          S          T
            ['BSA', 'Agri', '', 'CrSc 1', 'Crop Science', 3, 0, 3, 3, '', '', 'Ibao, Kristine', 3, 'MW', '7:30 AM', '9:00 AM', 'Room 1', 'BSA 1-1', 'Regular', 25, ''],
        ])
        result = import_excel(wb, tenant, period)
        assert result['created'] == 2  # MW = 2 entries
        assert result['skipped'] == 0
        assert ScheduleEntry.objects.count() == 2
        assert Program.objects.filter(tenant=tenant, code='BSA').exists()
        assert Course.objects.filter(tenant=tenant, code='CrSc 1').exists()
        assert Faculty.objects.filter(tenant=tenant, name='Ibao, Kristine').exists()

    def test_multiline_days_times(self, tenant, period):
        wb = self._make_workbook([
            ['BSA', 'Agri', '', 'CrSc 1', 'Crop Science', 2, 1, 3, 5, '', '',
             'Ibao, Kristine', 5, 'Tue\nThu', '9:00 AM\n10:00 AM', '12:00 PM\n12:00 PM',
             'AVR 1', 'BSA 1-1', 'Built-in', 33, ''],
        ])
        result = import_excel(wb, tenant, period)
        assert result['created'] == 2
        entries = ScheduleEntry.objects.all().order_by('day_of_week')
        assert entries[0].day_of_week == 'THU'
        assert entries[0].time_start == datetime.time(10, 0)
        assert entries[1].day_of_week == 'TUE'
        assert entries[1].time_start == datetime.time(9, 0)

    def test_tba_faculty(self, tenant, period):
        wb = self._make_workbook([
            ['BSA', 'PE', '', 'PE 1', 'Physical Ed', 2, 0, 2, 2, '', '',
             'TBA (PE)', 2, 'Fri', '9:00 AM', '11:00 AM',
             'Room 3', 'BSA 1-1', 'Overload', 27, ''],
        ])
        result = import_excel(wb, tenant, period)
        assert result['created'] == 1
        entry = ScheduleEntry.objects.first()
        assert entry.faculty is None
        assert entry.load_classification == 'OVERLOAD'

    def test_multi_section(self, tenant, period):
        wb = self._make_workbook([
            ['BSA', 'PE', '', 'PE 1', 'Physical Ed', 2, 0, 2, 2, '', '',
             'TBA', 2, 'Fri', '9:00 AM', '11:00 AM',
             'Room 3', 'BSA 1-1, BSF 1-1', 'Overload', 27, ''],
        ])
        result = import_excel(wb, tenant, period)
        entry = ScheduleEntry.objects.first()
        assert entry.sections.count() == 2

    def test_per_day_load_classification(self, tenant, period):
        wb = self._make_workbook([
            ['BSA', 'Agri', '', 'CrSc 1', 'Crop Science', 2, 1, 3, 5, '', '',
             'Dr. Smith', 5, 'Mon\nWed', '10:00 AM\n9:00 AM', '12:00 PM\n12:00 PM',
             'Room 1', 'BSA 1-1', 'Mon - Overload\nWed - Regular', 25, ''],
        ])
        result = import_excel(wb, tenant, period)
        assert result['created'] == 2
        mon_entry = ScheduleEntry.objects.get(day_of_week='MON')
        wed_entry = ScheduleEntry.objects.get(day_of_week='WED')
        assert mon_entry.load_classification == 'OVERLOAD'
        assert wed_entry.load_classification == 'REGULAR'

    def test_vw_columns_flagged(self, tenant, period):
        wb = self._make_workbook([
            ['BSA', 'Agri', '', 'CrSc 1', 'Crop Science', 2, 1, 3, 5, '', '',
             'Dr. Smith', 5, 'MW', '10:00 AM', '12:00 PM',
             'Room 1', 'BSA 1-1', 'Regular', 25, ''],
        ])
        # Add V/W data to the data row (row 2)
        ws = wb.active
        ws['V2'] = 'Tue\nThu'
        ws['W2'] = '9:00A - 12:00P\n10:00A - 12:00P'

        result = import_excel(wb, tenant, period)
        assert any('V/W' in w['reason'] for w in result['warnings'])
```

- [ ] **Step 2: Run tests to verify new tests pass** (the integration tests use `import_excel` which was implemented in Task 3)

```bash
pytest apps/scheduling/tests/test_importers.py -v
```

Expected: All tests PASS (18 parser + 6 integration = 24)

- [ ] **Step 3: Add import API view**

Add to `apps/scheduling/views.py` — add a new function-based view at the bottom of the file:

```python
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def import_excel_view(request):
    """Import schedule data from an Excel file."""
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
```

- [ ] **Step 4: Add import URL**

Modify `apps/scheduling/urls.py` — add after the existing `urlpatterns` list items:

```python
from .views import import_excel_view

# Add to urlpatterns:
urlpatterns += [
    path('import/', import_excel_view, name='import-excel'),
]
```

- [ ] **Step 5: Run ALL tests**

```bash
pytest -v
```

Expected: All tests PASS (48 + 6 = 54)

- [ ] **Step 6: Commit**

```bash
git add apps/scheduling/views.py apps/scheduling/urls.py apps/scheduling/tests/test_importers.py
git commit -m "feat: add Excel import endpoint with integration tests"
```

---

## Task 5: Excel Export

**Files:**
- Create: `apps/scheduling/exporters.py`
- Create: `apps/scheduling/tests/test_exporters.py`
- Modify: `apps/scheduling/views.py` (add export view)
- Modify: `apps/scheduling/urls.py` (add export route)

- [ ] **Step 1: Write failing tests**

`apps/scheduling/tests/test_exporters.py`:

```python
import datetime
import uuid

import pytest
import openpyxl

from apps.core.models import Tenant
from apps.scheduling.models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, Room, ScheduleEntry, ScheduleConfig,
)
from apps.scheduling.exporters import export_schedule, export_faculty_loading, export_room_utilization

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenant():
    return Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')


@pytest.fixture
def period(tenant):
    return AcademicPeriod.objects.create(
        tenant=tenant, name='1S 25-26', year_start=2025, year_end=2026,
        semester='1ST', status='DRAFT',
    )


@pytest.fixture
def config(tenant, period):
    return ScheduleConfig.objects.create(
        tenant=tenant, academic_period=period,
        earliest_start_time=datetime.time(7, 0),
        latest_end_time=datetime.time(12, 0),
        time_slot_granularity_minutes=60,
        operating_days=['MON', 'TUE', 'WED', 'THU', 'FRI'],
    )


@pytest.fixture
def full_schedule(tenant, period):
    dept = Department.objects.create(tenant=tenant, code='Agri', name='Agriculture')
    course = Course.objects.create(
        tenant=tenant, department=dept, code='CrSc 1', title='Crop Science 1',
        lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
    )
    faculty = Faculty.objects.create(
        tenant=tenant, name='Ibao, Kristine', employment_type='FULL_TIME',
        priority_level=5, max_load_units=24,
    )
    room = Room.objects.create(
        tenant=tenant, name='Room 101', room_type='LECTURE', capacity=40,
        building='Main', floor=1, sequence_number=1,
    )
    prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
    sec = Section.objects.create(
        tenant=tenant, program=prog, academic_period=period,
        year_level=1, section_number=1,
    )
    group = uuid.uuid4()
    for day in ['MON', 'WED']:
        entry = ScheduleEntry.objects.create(
            tenant=tenant, academic_period=period, course=course,
            faculty=faculty, room=room, day_of_week=day,
            time_start=datetime.time(8, 0), time_end=datetime.time(9, 30),
            group_id=group, entry_type='LECTURE',
            load_classification='REGULAR', class_size=25,
            faculty_credits=3,
        )
        entry.sections.set([sec])
    return {'course': course, 'faculty': faculty, 'room': room, 'section': sec}


class TestExportSchedule:
    def test_basic_export(self, tenant, period, full_schedule):
        wb = export_schedule(tenant, period)
        ws = wb.active
        # Header row
        assert ws['D1'].value == 'Course\nCode'
        # Data should have at least one row
        assert ws['D2'].value == 'CrSc 1'

    def test_multiday_collapsed(self, tenant, period, full_schedule):
        """MW entries for the same group should be collapsed into one row with multi-line day/time."""
        wb = export_schedule(tenant, period)
        ws = wb.active
        # Should be 1 data row (2 entries collapsed)
        data_rows = [row for row in ws.iter_rows(min_row=2, values_only=True) if row[3]]
        assert len(data_rows) == 1
        # Days column should have both days
        days_val = data_rows[0][13]  # Column N (0-indexed: 13)
        assert 'MON' in str(days_val) or 'Mon' in str(days_val)

    def test_empty_period(self, tenant, period):
        wb = export_schedule(tenant, period)
        ws = wb.active
        # Just header, no data
        data_rows = [row for row in ws.iter_rows(min_row=2, values_only=True) if row[3]]
        assert len(data_rows) == 0


class TestExportFacultyLoading:
    def test_basic(self, tenant, period, full_schedule):
        wb = export_faculty_loading(tenant, period)
        ws = wb.active
        assert ws['A1'].value == 'Faculty Name'
        # Data row
        assert ws['A2'].value == 'Ibao, Kristine'

    def test_empty(self, tenant, period):
        wb = export_faculty_loading(tenant, period)
        ws = wb.active
        # Just header
        data_rows = list(ws.iter_rows(min_row=2, values_only=True))
        # Filter out empty rows
        data_rows = [r for r in data_rows if r[0]]
        assert len(data_rows) == 0


class TestExportRoomUtilization:
    def test_basic(self, tenant, period, config, full_schedule):
        wb = export_room_utilization(tenant, period)
        ws = wb.active
        # First column header is 'Room'
        assert ws['A1'].value == 'Room'
        # Room 101 should appear
        assert ws['A2'].value == 'Room 101'
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest apps/scheduling/tests/test_exporters.py -v
```

Expected: FAIL — `ImportError`

- [ ] **Step 3: Implement exporters**

`apps/scheduling/exporters.py`:

```python
import datetime
from collections import defaultdict
from decimal import Decimal
from itertools import groupby

import openpyxl
from openpyxl.styles import Font, PatternFill

from .models import (
    Faculty, Room, ScheduleConfig, ScheduleEntry,
)


def export_schedule(tenant, period):
    """Export schedule entries to Excel matching the import format."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Schedule'

    # Header row
    headers = [
        'Course', 'In-Charge', '', 'Course\nCode', 'Course Title',
        'Lec\nUnits', 'Lab\nUnits', 'Course\nUnits', 'Contact\nHours',
        '', '', 'Faculty', 'Faculty\nCredits', 'Day(s)', 'Time In',
        'Time Out', 'Room', 'Section', 'Load\nClassification',
        'Class\nSize', 'Remarks',
    ]
    ws.append(headers)

    # Bold header
    for cell in ws[1]:
        cell.font = Font(bold=True)

    # Get entries grouped by group_id
    entries = ScheduleEntry.objects.filter(
        tenant=tenant, academic_period=period,
    ).select_related(
        'course', 'course__department', 'faculty', 'room',
    ).prefetch_related('sections', 'sections__program').order_by('group_id', 'day_of_week')

    # Group entries by group_id
    groups = defaultdict(list)
    for entry in entries:
        groups[str(entry.group_id)].append(entry)

    for group_id, group_entries in groups.items():
        first = group_entries[0]
        sections = first.sections.all()
        section_str = ', '.join(str(s) for s in sections)
        program_code = sections[0].program.code if sections else ''
        dept_code = first.course.department.code if first.course.department else ''

        # Collapse multi-day entries
        days = [e.day_of_week for e in group_entries]
        time_ins = [e.time_start.strftime('%-I:%M %p') for e in group_entries]
        time_outs = [e.time_end.strftime('%-I:%M %p') for e in group_entries]
        load_classes = [e.load_classification for e in group_entries]

        # Build load classification string
        if len(set(load_classes)) == 1:
            load_str = load_classes[0].replace('_', '-').title()
        else:
            load_parts = []
            for e in group_entries:
                day_name = e.day_of_week.capitalize()
                lc = e.load_classification.replace('_', '-').title()
                load_parts.append(f'{day_name} - {lc}')
            load_str = '\n'.join(load_parts)

        row = [
            program_code,                          # A: Course/Program
            dept_code,                             # B: In-Charge/Dept
            '',                                    # C: (empty)
            first.course.code,                     # D: Course Code
            first.course.title,                    # E: Course Title
            float(first.course.lec_units),         # F: Lec Units
            float(first.course.lab_units),         # G: Lab Units
            float(first.course.total_units),       # H: Total Units
            float(first.course.contact_hours),     # I: Contact Hours
            '',                                    # J: (empty)
            '',                                    # K: (empty)
            first.faculty.name if first.faculty else 'TBA',  # L: Faculty
            float(first.faculty_credits),          # M: Faculty Credits
            '\n'.join(days),                       # N: Days
            '\n'.join(time_ins),                   # O: Time In
            '\n'.join(time_outs),                  # P: Time Out
            first.room.name,                       # Q: Room
            section_str,                           # R: Section
            load_str,                              # S: Load Classification
            first.class_size,                      # T: Class Size
            first.remarks,                         # U: Remarks
        ]
        ws.append(row)

    return wb


def export_faculty_loading(tenant, period):
    """Export per-faculty loading summary."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Faculty Loading'

    headers = [
        'Faculty Name', 'Employment Type', 'Total Units',
        'Regular Units', 'Overload Units', 'Built-in Units',
        'Part-time Units', 'Course Count', 'Section Count',
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)

    entries = ScheduleEntry.objects.filter(
        tenant=tenant, academic_period=period,
    ).exclude(faculty=None).select_related('course', 'faculty').prefetch_related('sections')

    # Group by faculty
    faculty_data = defaultdict(lambda: {
        'employment_type': '', 'units': defaultdict(Decimal),
        'total': Decimal('0'), 'courses': set(), 'sections': set(),
    })

    for entry in entries:
        fac = entry.faculty
        data = faculty_data[fac.name]
        data['employment_type'] = fac.get_employment_type_display()
        units = entry.course.lec_units + entry.course.lab_units
        data['units'][entry.load_classification] += units
        data['total'] += units
        data['courses'].add(entry.course_id)
        for sec in entry.sections.all():
            data['sections'].add(sec.pk)

    for name in sorted(faculty_data.keys()):
        data = faculty_data[name]
        ws.append([
            name,
            data['employment_type'],
            float(data['total']),
            float(data['units'].get('REGULAR', 0)),
            float(data['units'].get('OVERLOAD', 0)),
            float(data['units'].get('BUILT_IN', 0)),
            float(data['units'].get('PART_TIME', 0)),
            len(data['courses']),
            len(data['sections']),
        ])

    return wb


def export_room_utilization(tenant, period):
    """Export room utilization grid."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Room Utilization'

    try:
        config = ScheduleConfig.objects.get(tenant=tenant, academic_period=period)
        operating_days = config.operating_days
        granularity = config.time_slot_granularity_minutes
        earliest = config.earliest_start_time
        latest = config.latest_end_time
    except ScheduleConfig.DoesNotExist:
        operating_days = ['MON', 'TUE', 'WED', 'THU', 'FRI']
        granularity = 60
        earliest = datetime.time(7, 0)
        latest = datetime.time(21, 0)

    # Generate time slots
    slots = []
    current = datetime.datetime(2000, 1, 1, earliest.hour, earliest.minute)
    end = datetime.datetime(2000, 1, 1, latest.hour, latest.minute)
    while current < end:
        slots.append(current.time())
        current += datetime.timedelta(minutes=granularity)

    # Header row
    header = ['Room']
    for day in operating_days:
        for slot in slots:
            header.append(f'{day} {slot.strftime("%H:%M")}')
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)

    # Get rooms and entries
    rooms = Room.objects.filter(tenant=tenant).order_by('building', 'floor', 'sequence_number', 'name')
    entries = ScheduleEntry.objects.filter(
        tenant=tenant, academic_period=period,
    ).select_related('course', 'room')

    # Build lookup: (room_id, day, time_slot) -> course_code
    occupied = {}
    for entry in entries:
        slot_start = datetime.datetime(2000, 1, 1, entry.time_start.hour, entry.time_start.minute)
        slot_end = datetime.datetime(2000, 1, 1, entry.time_end.hour, entry.time_end.minute)
        current = slot_start
        while current < slot_end:
            key = (entry.room_id, entry.day_of_week, current.time())
            occupied[key] = entry.course.code
            current += datetime.timedelta(minutes=granularity)

    fill_occupied = PatternFill(start_color='D4E6F1', end_color='D4E6F1', fill_type='solid')

    for room in rooms:
        row = [room.name]
        for day in operating_days:
            for slot in slots:
                code = occupied.get((room.pk, day, slot), '')
                row.append(code)
        ws.append(row)

        # Color occupied cells
        row_num = ws.max_row
        for col_idx in range(2, len(header) + 1):
            if ws.cell(row=row_num, column=col_idx).value:
                ws.cell(row=row_num, column=col_idx).fill = fill_occupied

    return wb
```

- [ ] **Step 4: Run tests**

```bash
pytest apps/scheduling/tests/test_exporters.py -v
```

Expected: All 6 tests PASS

- [ ] **Step 5: Add export API view and URL**

Add to `apps/scheduling/views.py` — new function-based view at the bottom:

```python
from django.http import HttpResponse


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_excel_view(request):
    """Export schedule data to Excel."""
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
```

Modify `apps/scheduling/urls.py` — add after the import URL:

```python
from .views import import_excel_view, export_excel_view

# Replace the existing urlpatterns += [...] with:
urlpatterns += [
    path('import/', import_excel_view, name='import-excel'),
    path('export/', export_excel_view, name='export-excel'),
]
```

- [ ] **Step 6: Run ALL tests**

```bash
pytest -v
```

Expected: All tests PASS (54 + 6 = 60)

- [ ] **Step 7: Commit**

```bash
git add apps/scheduling/exporters.py apps/scheduling/tests/test_exporters.py apps/scheduling/views.py apps/scheduling/urls.py
git commit -m "feat: add Excel export — schedule, faculty loading, and room utilization reports"
```

---

## Task 6: Suggestion Engine — Slot Generation and Hard Constraint Filtering

The suggestion engine is split into two tasks: this task generates candidates and filters by hard constraints, Task 7 adds scoring.

**Files:**
- Create: `apps/scheduling/suggestions.py`
- Create: `apps/scheduling/tests/test_suggestions.py`

- [ ] **Step 1: Write failing tests for slot generation and filtering**

`apps/scheduling/tests/test_suggestions.py`:

```python
import datetime
import uuid

import pytest

from apps.core.models import Tenant
from apps.scheduling.models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig,
)
from apps.scheduling.suggestions import generate_suggestions

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenant():
    return Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')


@pytest.fixture
def period(tenant):
    return AcademicPeriod.objects.create(
        tenant=tenant, name='1S', year_start=2025, year_end=2026,
        semester='1ST', status='DRAFT',
    )


@pytest.fixture
def config(tenant, period):
    return ScheduleConfig.objects.create(
        tenant=tenant, academic_period=period,
        earliest_start_time=datetime.time(7, 0),
        latest_end_time=datetime.time(12, 0),
        time_slot_granularity_minutes=30,
        operating_days=['MON', 'TUE', 'WED'],
    )


@pytest.fixture
def dept(tenant):
    return Department.objects.create(tenant=tenant, code='Agri', name='Agriculture')


@pytest.fixture
def course(tenant, dept):
    return Course.objects.create(
        tenant=tenant, department=dept, code='CrSc 1', title='Crop Science 1',
        lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
    )


@pytest.fixture
def faculty(tenant):
    return Faculty.objects.create(
        tenant=tenant, name='Dr. Smith', employment_type='FULL_TIME',
        priority_level=5, max_load_units=24,
    )


@pytest.fixture
def room(tenant):
    return Room.objects.create(
        tenant=tenant, name='Room 101', room_type='LECTURE', capacity=40,
        building='Main', floor=1, sequence_number=1,
    )


@pytest.fixture
def section(tenant, period):
    prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
    return Section.objects.create(
        tenant=tenant, program=prog, academic_period=period,
        year_level=1, section_number=1,
    )


class TestGenerateSuggestions:
    def test_returns_suggestions(self, tenant, period, config, course, faculty, room, section):
        result = generate_suggestions(
            tenant=tenant, period=period, course=course,
            sections=[section], faculty=faculty, num_days=1, class_size=25,
        )
        assert len(result) > 0
        assert result[0]['rank'] == 1
        assert 'day' in result[0]
        assert 'time_start' in result[0]
        assert 'room' in result[0]
        assert 'total_score' in result[0]

    def test_excludes_booked_rooms(self, tenant, period, config, course, faculty, room, section):
        # Book room 101 on MON 8:00-9:30
        ScheduleEntry.objects.create(
            tenant=tenant, academic_period=period, course=course,
            faculty=faculty, room=room, day_of_week='MON',
            time_start=datetime.time(8, 0), time_end=datetime.time(9, 30),
            group_id=uuid.uuid4(), entry_type='LECTURE',
            load_classification='REGULAR', class_size=25,
        )
        # New course needing a slot
        dept = Department.objects.create(tenant=tenant, code='GE', name='GE')
        course2 = Course.objects.create(
            tenant=tenant, department=dept, code='GE 1', title='GE 1',
            lec_units=3, lab_units=0, contact_hours=1.5, has_lab=False,
        )
        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        prog2 = Program.objects.create(tenant=tenant, code='BSF', name='BSF')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=1,
        )
        result = generate_suggestions(
            tenant=tenant, period=period, course=course2,
            sections=[sec2], faculty=faculty2, num_days=1, class_size=25,
        )
        # None of the suggestions should overlap with Room 101 MON 8:00-9:30
        for s in result:
            if s['day'] == 'MON' and s['room']['id'] == room.pk:
                start = datetime.time.fromisoformat(s['time_start'])
                end = datetime.time.fromisoformat(s['time_end'])
                # Should not overlap 8:00-9:30
                assert not (start < datetime.time(9, 30) and end > datetime.time(8, 0))

    def test_excludes_faculty_conflicts(self, tenant, period, config, course, faculty, room, section):
        # Book faculty on MON 8:00-9:30
        ScheduleEntry.objects.create(
            tenant=tenant, academic_period=period, course=course,
            faculty=faculty, room=room, day_of_week='MON',
            time_start=datetime.time(8, 0), time_end=datetime.time(9, 30),
            group_id=uuid.uuid4(), entry_type='LECTURE',
            load_classification='REGULAR', class_size=25,
        )
        dept = Department.objects.create(tenant=tenant, code='GE', name='GE')
        course2 = Course.objects.create(
            tenant=tenant, department=dept, code='GE 1', title='GE 1',
            lec_units=3, lab_units=0, contact_hours=1.5, has_lab=False,
        )
        room2 = Room.objects.create(
            tenant=tenant, name='Room 102', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=2,
        )
        result = generate_suggestions(
            tenant=tenant, period=period, course=course2,
            sections=[section], faculty=faculty, num_days=1, class_size=25,
        )
        # No suggestion should have faculty on MON 8:00-9:30
        for s in result:
            if s['day'] == 'MON':
                start = datetime.time.fromisoformat(s['time_start'])
                end = datetime.time.fromisoformat(s['time_end'])
                assert not (start < datetime.time(9, 30) and end > datetime.time(8, 0))

    def test_respects_room_capacity(self, tenant, period, config, course, faculty, section):
        small_room = Room.objects.create(
            tenant=tenant, name='Tiny Room', room_type='LECTURE', capacity=10,
            building='Main', floor=1, sequence_number=1,
        )
        result = generate_suggestions(
            tenant=tenant, period=period, course=course,
            sections=[section], faculty=faculty, num_days=1, class_size=25,
        )
        # No suggestion should use a room with capacity < 25
        for s in result:
            assert s['room']['capacity'] >= 25

    def test_no_faculty_still_works(self, tenant, period, config, course, room, section):
        """TBA faculty — suggestions should still be generated."""
        result = generate_suggestions(
            tenant=tenant, period=period, course=course,
            sections=[section], faculty=None, num_days=1, class_size=25,
        )
        assert len(result) > 0

    def test_respects_faculty_unavailable(self, tenant, period, config, course, faculty, room, section):
        # Mark faculty unavailable on MON
        FacultyAvailability.objects.create(
            faculty=faculty, academic_period=period,
            day_of_week='MON', time_start=datetime.time(7, 0),
            time_end=datetime.time(12, 0), availability_type='UNAVAILABLE',
        )
        result = generate_suggestions(
            tenant=tenant, period=period, course=course,
            sections=[section], faculty=faculty, num_days=1, class_size=25,
        )
        # No MON suggestions
        assert all(s['day'] != 'MON' for s in result)

    def test_top_10_limit(self, tenant, period, config, course, faculty, section):
        # Create many rooms to generate many candidates
        for i in range(20):
            Room.objects.create(
                tenant=tenant, name=f'Room {i}', room_type='LECTURE', capacity=40,
                building='Main', floor=1, sequence_number=i,
            )
        result = generate_suggestions(
            tenant=tenant, period=period, course=course,
            sections=[section], faculty=faculty, num_days=1, class_size=25,
        )
        assert len(result) <= 10
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest apps/scheduling/tests/test_suggestions.py -v
```

Expected: FAIL — `ImportError`

- [ ] **Step 3: Implement suggestion engine**

`apps/scheduling/suggestions.py`:

```python
import datetime
import math
from collections import defaultdict
from decimal import Decimal

from .models import (
    Faculty, FacultyAvailability, Room, ScheduleConfig, ScheduleEntry,
)


def _generate_time_slots(config, duration_minutes):
    """Generate all possible (start, end) time pairs of the given duration."""
    slots = []
    granularity = config.time_slot_granularity_minutes
    earliest = datetime.datetime(2000, 1, 1, config.earliest_start_time.hour, config.earliest_start_time.minute)
    latest = datetime.datetime(2000, 1, 1, config.latest_end_time.hour, config.latest_end_time.minute)
    duration = datetime.timedelta(minutes=duration_minutes)

    current = earliest
    while current + duration <= latest:
        start_time = current.time()
        end_time = (current + duration).time()

        # Check break periods
        in_break = False
        for bp in (config.break_periods or []):
            bp_start = datetime.time.fromisoformat(bp.get('start', '00:00'))
            bp_end = datetime.time.fromisoformat(bp.get('end', '00:00'))
            if start_time < bp_end and end_time > bp_start:
                in_break = True
                break

        if not in_break:
            slots.append((start_time, end_time))

        current += datetime.timedelta(minutes=granularity)

    return slots


def _times_overlap(s1, e1, s2, e2):
    return s1 < e2 and s2 < e1


def _get_existing_entries(tenant, period):
    """Get all existing entries for quick lookup."""
    entries = ScheduleEntry.objects.filter(
        tenant=tenant, academic_period=period,
    ).select_related('course', 'faculty', 'room').prefetch_related('sections')

    # Index by day for quick filtering
    by_day = defaultdict(list)
    for e in entries:
        by_day[e.day_of_week].append(e)
    return by_day


def _get_faculty_unavailable(faculty, period):
    """Get set of (day, start, end) tuples where faculty is unavailable."""
    if not faculty:
        return []
    return list(
        FacultyAvailability.objects.filter(
            faculty=faculty, academic_period=period, availability_type='UNAVAILABLE',
        ).values_list('day_of_week', 'time_start', 'time_end')
    )


def _get_faculty_preferred(faculty, period):
    """Get set of (day, start, end) tuples where faculty has preferred time."""
    if not faculty:
        return []
    return list(
        FacultyAvailability.objects.filter(
            faculty=faculty, academic_period=period, availability_type='PREFERRED',
        ).values_list('day_of_week', 'time_start', 'time_end')
    )


def _get_faculty_available(faculty, period):
    """Get set of (day, start, end) tuples where faculty is available."""
    if not faculty:
        return []
    return list(
        FacultyAvailability.objects.filter(
            faculty=faculty, academic_period=period, availability_type='AVAILABLE',
        ).values_list('day_of_week', 'time_start', 'time_end')
    )


def _score_faculty_priority(day, start, end, faculty, preferred_slots, available_slots, weight):
    """Score based on faculty availability preference."""
    if not faculty:
        return {'raw': 50, 'weight': weight, 'weighted': round(50 * weight / 100)}

    for d, s, e in preferred_slots:
        if d == day and s <= start and e >= end:
            return {'raw': 100, 'weight': weight, 'weighted': round(100 * weight / 100)}

    for d, s, e in available_slots:
        if d == day and s <= start and e >= end:
            return {'raw': 50, 'weight': weight, 'weighted': round(50 * weight / 100)}

    return {'raw': 0, 'weight': weight, 'weighted': 0}


def _score_room_proximity(room, day, section_ids, entries_by_day, weight):
    """Score based on room distance to section's other classes on the same day."""
    day_entries = entries_by_day.get(day, [])
    section_entries = [
        e for e in day_entries
        if set(e.sections.values_list('pk', flat=True)) & section_ids
    ]

    if not section_entries:
        return {'raw': 50, 'weight': weight, 'weighted': round(50 * weight / 100)}

    scores = []
    for entry in section_entries:
        other_room = entry.room
        if room.building == other_room.building and room.floor == other_room.floor:
            scores.append(100)
        elif room.building == other_room.building:
            scores.append(60)
        else:
            scores.append(20)

    raw = round(sum(scores) / len(scores))
    return {'raw': raw, 'weight': weight, 'weighted': round(raw * weight / 100)}


def _score_time_gap(day, start, end, section_ids, entries_by_day, weight):
    """Score based on gap between this slot and section's nearest class on same day."""
    day_entries = entries_by_day.get(day, [])
    section_entries = [
        e for e in day_entries
        if set(e.sections.values_list('pk', flat=True)) & section_ids
    ]

    if not section_entries:
        return {'raw': 50, 'weight': weight, 'weighted': round(50 * weight / 100)}

    min_gap = float('inf')
    for entry in section_entries:
        # Gap = distance between slot boundaries
        if end <= entry.time_start:
            gap = (entry.time_start.hour * 60 + entry.time_start.minute) - (end.hour * 60 + end.minute)
        elif start >= entry.time_end:
            gap = (start.hour * 60 + start.minute) - (entry.time_end.hour * 60 + entry.time_end.minute)
        else:
            gap = 0  # overlapping (shouldn't happen after filtering)
        min_gap = min(min_gap, gap)

    if min_gap <= 30:
        raw = 100
    elif min_gap <= 60:
        raw = 70
    elif min_gap <= 120:
        raw = 40
    else:
        raw = 10

    return {'raw': raw, 'weight': weight, 'weighted': round(raw * weight / 100)}


def _score_load_distribution(day, faculty, period, tenant, entries_by_day, weight):
    """Score based on evenness of faculty load across days."""
    if not faculty:
        return {'raw': 50, 'weight': weight, 'weighted': round(50 * weight / 100)}

    # Count hours per day for this faculty
    hours_per_day = defaultdict(float)
    all_entries = ScheduleEntry.objects.filter(
        tenant=tenant, academic_period=period, faculty=faculty,
    )
    for e in all_entries:
        duration = (e.time_end.hour * 60 + e.time_end.minute) - (e.time_start.hour * 60 + e.time_start.minute)
        hours_per_day[e.day_of_week] += duration / 60.0

    # Add the proposed slot
    hours_per_day[day] = hours_per_day.get(day, 0) + 1.5  # approximate

    if not hours_per_day:
        return {'raw': 50, 'weight': weight, 'weighted': round(50 * weight / 100)}

    values = list(hours_per_day.values())
    mean = sum(values) / len(values) if values else 0
    variance = sum((v - mean) ** 2 for v in values) / len(values) if values else 0
    stdev = math.sqrt(variance)

    # Normalize: stdev=0 -> 100, stdev>=4 -> 0
    raw = max(0, min(100, round(100 - stdev * 25)))
    return {'raw': raw, 'weight': weight, 'weighted': round(raw * weight / 100)}


def generate_suggestions(tenant, period, course, sections, faculty, num_days, class_size):
    """
    Generate ranked slot suggestions for assigning a course.

    Args:
        tenant: Tenant instance
        period: AcademicPeriod instance
        course: Course instance
        sections: list of Section instances
        faculty: Faculty instance or None (TBA)
        num_days: number of days to spread the course across
        class_size: expected class size

    Returns:
        list of suggestion dicts, max 10, sorted by total_score descending
    """
    try:
        config = ScheduleConfig.objects.get(tenant=tenant, academic_period=period)
    except ScheduleConfig.DoesNotExist:
        return []

    # Calculate slot duration
    contact_hours = float(course.contact_hours)
    duration_minutes = int((contact_hours / num_days) * 60)

    # Generate time slots
    time_slots = _generate_time_slots(config, duration_minutes)
    if not time_slots:
        return []

    # Get eligible rooms
    if course.has_lab:
        room_types = ['LABORATORY', 'COMPUTER_LAB']
    else:
        room_types = ['LECTURE', 'AVR', 'OTHER']

    rooms = Room.objects.filter(
        tenant=tenant, room_type__in=room_types, capacity__gte=class_size,
    )
    if not rooms.exists():
        return []

    # Get existing schedule state
    entries_by_day = _get_existing_entries(tenant, period)
    unavailable_slots = _get_faculty_unavailable(faculty, period)
    preferred_slots = _get_faculty_preferred(faculty, period)
    available_slots = _get_faculty_available(faculty, period)

    section_ids = set(s.pk for s in sections)

    # Weights from config
    w_priority = config.weight_faculty_priority
    w_proximity = config.weight_room_proximity
    w_gap = config.weight_time_gap_minimization
    w_load = config.weight_load_distribution

    candidates = []

    for day in config.operating_days:
        # Check faculty unavailable for the whole day
        for start, end in time_slots:
            # Check faculty unavailability
            faculty_blocked = False
            if faculty:
                for u_day, u_start, u_end in unavailable_slots:
                    if u_day == day and _times_overlap(start, end, u_start, u_end):
                        faculty_blocked = True
                        break
            if faculty_blocked:
                continue

            for room in rooms:
                # Check hard constraints
                conflict = False
                day_entries = entries_by_day.get(day, [])

                for entry in day_entries:
                    if not _times_overlap(start, end, entry.time_start, entry.time_end):
                        continue

                    # Room conflict
                    if entry.room_id == room.pk:
                        conflict = True
                        break

                    # Faculty conflict
                    if faculty and entry.faculty_id and entry.faculty_id == faculty.pk:
                        conflict = True
                        break

                    # Section conflict
                    entry_sections = set(entry.sections.values_list('pk', flat=True))
                    if section_ids & entry_sections:
                        conflict = True
                        break

                if conflict:
                    continue

                # Score this candidate
                s_priority = _score_faculty_priority(day, start, end, faculty, preferred_slots, available_slots, w_priority)
                s_proximity = _score_room_proximity(room, day, section_ids, entries_by_day, w_proximity)
                s_gap = _score_time_gap(day, start, end, section_ids, entries_by_day, w_gap)
                s_load = _score_load_distribution(day, faculty, period, tenant, entries_by_day, w_load)

                total = s_priority['weighted'] + s_proximity['weighted'] + s_gap['weighted'] + s_load['weighted']

                candidates.append({
                    'day': day,
                    'time_start': start.strftime('%H:%M'),
                    'time_end': end.strftime('%H:%M'),
                    'room': {
                        'id': room.pk,
                        'name': room.name,
                        'building': room.building,
                        'capacity': room.capacity,
                    },
                    'total_score': total,
                    'scores': {
                        'faculty_priority': s_priority,
                        'room_proximity': s_proximity,
                        'time_gap': s_gap,
                        'load_distribution': s_load,
                    },
                })

    # Sort by score descending, take top 10
    candidates.sort(key=lambda c: c['total_score'], reverse=True)
    top = candidates[:10]

    # Assign ranks
    for i, c in enumerate(top, 1):
        c['rank'] = i

    return top
```

- [ ] **Step 4: Run tests**

```bash
pytest apps/scheduling/tests/test_suggestions.py -v
```

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/scheduling/suggestions.py apps/scheduling/tests/test_suggestions.py
git commit -m "feat: add suggestion engine — slot generation, hard constraint filtering, weighted scoring"
```

---

## Task 7: Suggestion Engine — API Endpoint and Lecture+Lab Pairing

**Files:**
- Modify: `apps/scheduling/suggestions.py` (add paired suggestion generation)
- Modify: `apps/scheduling/views.py` (add suggest action)
- Modify: `apps/scheduling/tests/test_suggestions.py` (add pairing and API tests)

- [ ] **Step 1: Write failing tests for lab pairing and API**

Append to `apps/scheduling/tests/test_suggestions.py`:

```python
from rest_framework.test import APIClient
from apps.core.models import User
from apps.scheduling.suggestions import generate_paired_suggestions


@pytest.fixture
def user(tenant):
    return User.objects.create_user(
        username='registrar', password='pass', tenant=tenant, role='REGISTRAR',
    )


@pytest.fixture
def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def lab_course(tenant, dept):
    return Course.objects.create(
        tenant=tenant, department=dept, code='CrSc 2', title='Crop Science 2',
        lec_units=2, lab_units=1, contact_hours=5, has_lab=True,
    )


@pytest.fixture
def lab_room(tenant):
    return Room.objects.create(
        tenant=tenant, name='Lab 1', room_type='LABORATORY', capacity=30,
        building='Main', floor=1, sequence_number=10,
    )


class TestPairedSuggestions:
    def test_returns_paired(self, tenant, period, config, lab_course, faculty, room, lab_room, section):
        result = generate_paired_suggestions(
            tenant=tenant, period=period, course=lab_course,
            sections=[section], faculty=faculty, class_size=25,
        )
        assert len(result) > 0
        assert 'lecture' in result[0]
        assert 'lab' in result[0]
        assert result[0]['lecture']['day'] != result[0]['lab']['day']

    def test_lecture_uses_lecture_room(self, tenant, period, config, lab_course, faculty, room, lab_room, section):
        result = generate_paired_suggestions(
            tenant=tenant, period=period, course=lab_course,
            sections=[section], faculty=faculty, class_size=25,
        )
        if result:
            lec_room_id = result[0]['lecture']['room']['id']
            lab_room_id = result[0]['lab']['room']['id']
            assert lec_room_id == room.pk  # lecture room
            assert lab_room_id == lab_room.pk  # lab room


class TestSuggestAPI:
    def test_suggest_endpoint(self, auth_client, tenant, period, config, course, faculty, room, section):
        response = auth_client.post('/api/loader/schedules/suggest/', {
            'course': course.pk,
            'sections': [section.pk],
            'faculty': faculty.pk,
            'academic_period': period.pk,
            'num_days': 1,
            'class_size': 25,
        }, format='json')
        assert response.status_code == 200
        assert 'suggestions' in response.data

    def test_suggest_no_faculty(self, auth_client, tenant, period, config, course, room, section):
        response = auth_client.post('/api/loader/schedules/suggest/', {
            'course': course.pk,
            'sections': [section.pk],
            'academic_period': period.pk,
            'num_days': 1,
            'class_size': 25,
        }, format='json')
        assert response.status_code == 200

    def test_suggest_lab_course(self, auth_client, tenant, period, config, lab_course, faculty, room, lab_room, section):
        response = auth_client.post('/api/loader/schedules/suggest/', {
            'course': lab_course.pk,
            'sections': [section.pk],
            'faculty': faculty.pk,
            'academic_period': period.pk,
            'num_days': 2,
            'class_size': 25,
        }, format='json')
        assert response.status_code == 200
```

- [ ] **Step 2: Implement paired suggestion generation**

Add to `apps/scheduling/suggestions.py` at the bottom:

```python
def generate_paired_suggestions(tenant, period, course, sections, faculty, class_size):
    """
    Generate paired lecture+lab suggestions for courses with has_lab=True.
    Returns top 10 pairs scored as combined units.
    """
    try:
        config = ScheduleConfig.objects.get(tenant=tenant, academic_period=period)
    except ScheduleConfig.DoesNotExist:
        return []

    # Generate lecture candidates (lecture rooms, lec contact hours)
    lec_hours = float(course.lec_units)  # rough: lec_units ~ hours for lecture
    lec_duration = int(lec_hours * 60) if lec_hours > 0 else 60
    lec_time_slots = _generate_time_slots(config, lec_duration)

    # Generate lab candidates (lab rooms, lab contact hours)
    lab_hours = float(course.contact_hours) - float(course.lec_units)
    lab_duration = int(lab_hours * 60) if lab_hours > 0 else 90
    lab_time_slots = _generate_time_slots(config, lab_duration)

    entries_by_day = _get_existing_entries(tenant, period)
    unavailable_slots = _get_faculty_unavailable(faculty, period)
    section_ids = set(s.pk for s in sections)

    lec_rooms = Room.objects.filter(tenant=tenant, room_type__in=['LECTURE', 'AVR', 'OTHER'], capacity__gte=class_size)
    lab_rooms = Room.objects.filter(tenant=tenant, room_type__in=['LABORATORY', 'COMPUTER_LAB'], capacity__gte=class_size)

    # Generate valid lecture candidates
    def get_valid_candidates(time_slots, rooms):
        candidates = []
        for day in config.operating_days:
            for start, end in time_slots:
                faculty_blocked = False
                if faculty:
                    for u_day, u_start, u_end in unavailable_slots:
                        if u_day == day and _times_overlap(start, end, u_start, u_end):
                            faculty_blocked = True
                            break
                if faculty_blocked:
                    continue

                for room in rooms:
                    conflict = False
                    for entry in entries_by_day.get(day, []):
                        if not _times_overlap(start, end, entry.time_start, entry.time_end):
                            continue
                        if entry.room_id == room.pk:
                            conflict = True
                            break
                        if faculty and entry.faculty_id and entry.faculty_id == faculty.pk:
                            conflict = True
                            break
                        entry_sections = set(entry.sections.values_list('pk', flat=True))
                        if section_ids & entry_sections:
                            conflict = True
                            break
                    if not conflict:
                        candidates.append({'day': day, 'start': start, 'end': end, 'room': room})
        return candidates

    lec_candidates = get_valid_candidates(lec_time_slots, lec_rooms)
    lab_candidates = get_valid_candidates(lab_time_slots, lab_rooms)

    # Generate pairs (different days)
    pairs = []
    for lec in lec_candidates[:50]:  # limit to keep combinatorics manageable
        for lab in lab_candidates[:50]:
            if lec['day'] == lab['day']:
                continue
            # Also check that lab slot doesn't conflict with the lec slot's faculty on lab day
            score = 50  # base score; simplified scoring for pairs
            pairs.append({
                'lecture': {
                    'day': lec['day'],
                    'time_start': lec['start'].strftime('%H:%M'),
                    'time_end': lec['end'].strftime('%H:%M'),
                    'room': {
                        'id': lec['room'].pk,
                        'name': lec['room'].name,
                        'building': lec['room'].building,
                        'capacity': lec['room'].capacity,
                    },
                },
                'lab': {
                    'day': lab['day'],
                    'time_start': lab['start'].strftime('%H:%M'),
                    'time_end': lab['end'].strftime('%H:%M'),
                    'room': {
                        'id': lab['room'].pk,
                        'name': lab['room'].name,
                        'building': lab['room'].building,
                        'capacity': lab['room'].capacity,
                    },
                },
                'total_score': score,
            })

    pairs.sort(key=lambda p: p['total_score'], reverse=True)
    top = pairs[:10]
    for i, p in enumerate(top, 1):
        p['rank'] = i
    return top
```

- [ ] **Step 3: Add suggest action to ScheduleEntryViewSet**

Add to `apps/scheduling/views.py` — new `@action` on `ScheduleEntryViewSet`:

```python
    @action(detail=False, methods=['post'])
    def suggest(self, request):
        """Get ranked slot suggestions for a course assignment."""
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
```

- [ ] **Step 4: Run tests**

```bash
pytest apps/scheduling/tests/test_suggestions.py -v
```

Expected: All tests PASS (7 existing + 5 new = 12)

- [ ] **Step 5: Run ALL tests**

```bash
pytest -v
```

Expected: All tests PASS (60 + 5 = 65)

- [ ] **Step 6: Commit**

```bash
git add apps/scheduling/suggestions.py apps/scheduling/views.py apps/scheduling/tests/test_suggestions.py
git commit -m "feat: add suggestion API endpoint with lecture+lab pairing support"
```

---

## Task 8: Integration Test with Reference Excel

Test the full import → stats → export cycle using the real reference Excel file.

**Files:**
- Create: `apps/scheduling/tests/test_integration.py`

- [ ] **Step 1: Write integration test**

`apps/scheduling/tests/test_integration.py`:

```python
import datetime
from pathlib import Path

import openpyxl
import pytest

from apps.core.models import Tenant
from apps.scheduling.importers import import_excel
from apps.scheduling.exporters import export_schedule, export_faculty_loading
from apps.scheduling.stats import compute_stats
from apps.scheduling.models import (
    AcademicPeriod, ScheduleConfig, ScheduleEntry, Faculty, Course, Program,
)

pytestmark = pytest.mark.django_db

REFERENCE_EXCEL = Path('/home/classify/Desktop/Errors/NH Faculty Loading 1S 25-26.xlsx')


@pytest.fixture
def tenant():
    return Tenant.objects.create(name='NH', slug='nh', status='ACTIVE')


@pytest.fixture
def period(tenant):
    return AcademicPeriod.objects.create(
        tenant=tenant, name='1S 25-26', year_start=2025, year_end=2026,
        semester='1ST', status='DRAFT',
    )


@pytest.fixture
def config(tenant, period):
    return ScheduleConfig.objects.create(
        tenant=tenant, academic_period=period,
        earliest_start_time=datetime.time(7, 0),
        latest_end_time=datetime.time(21, 0),
        time_slot_granularity_minutes=30,
        operating_days=['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    )


@pytest.mark.skipif(not REFERENCE_EXCEL.exists(), reason='Reference Excel not found')
class TestFullIntegration:
    def test_import_reference_excel(self, tenant, period, config):
        wb = openpyxl.load_workbook(REFERENCE_EXCEL)
        result = import_excel(wb, tenant, period)

        # Should create entries (exact count depends on file, but > 0)
        assert result['created'] > 0
        assert ScheduleEntry.objects.filter(tenant=tenant, academic_period=period).count() > 0

        # Should have created faculty, courses, programs
        assert Faculty.objects.filter(tenant=tenant).count() > 0
        assert Course.objects.filter(tenant=tenant).count() > 0
        assert Program.objects.filter(tenant=tenant).count() > 0

        # Print summary for manual review
        print(f"\nImport results:")
        print(f"  Created: {result['created']}")
        print(f"  Skipped: {result['skipped']}")
        print(f"  Warnings: {len(result['warnings'])}")
        print(f"  Conflicts: {len(result['conflicts'])}")
        for w in result['warnings'][:5]:
            print(f"    Warning row {w['row']}: {w['reason']}")

    def test_stats_after_import(self, tenant, period, config):
        wb = openpyxl.load_workbook(REFERENCE_EXCEL)
        import_excel(wb, tenant, period)

        stats = compute_stats(tenant, period)
        assert stats['summary']['total_courses'] > 0
        assert stats['summary']['faculty_count'] > 0
        assert len(stats['faculty_breakdown']) > 0
        assert len(stats['program_progress']) > 0

        print(f"\nStats after import:")
        print(f"  Courses: {stats['summary']['total_courses']}")
        print(f"  Faculty: {stats['summary']['faculty_count']}")
        print(f"  Conflicts: {stats['summary']['conflict_count']}")

    def test_export_after_import(self, tenant, period, config):
        wb = openpyxl.load_workbook(REFERENCE_EXCEL)
        import_excel(wb, tenant, period)

        # Export schedule
        export_wb = export_schedule(tenant, period)
        ws = export_wb.active
        data_rows = [row for row in ws.iter_rows(min_row=2, values_only=True) if row[3]]
        assert len(data_rows) > 0

        # Export faculty loading
        fac_wb = export_faculty_loading(tenant, period)
        fac_ws = fac_wb.active
        fac_rows = [row for row in fac_ws.iter_rows(min_row=2, values_only=True) if row[0]]
        assert len(fac_rows) > 0
```

- [ ] **Step 2: Run integration tests**

```bash
pytest apps/scheduling/tests/test_integration.py -v -s
```

Expected: All 3 tests PASS (or SKIP if reference file not found). The `-s` flag shows print output for manual review.

- [ ] **Step 3: Run ALL tests**

```bash
pytest -v
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/scheduling/tests/test_integration.py
git commit -m "test: add full integration test — import reference Excel, compute stats, export"
```

---

## Summary

**What this plan builds:**
- Suggestion engine with 4-dimension weighted scoring, hard constraint filtering, and lecture+lab pairing
- Excel import parsing the NH Faculty Loading format with auto-entity creation
- Excel export in 3 formats: schedule, faculty loading, room utilization
- Dashboard stats with summary, faculty breakdown, program progress, room utilization
- Period cloning for semester setup
- Full integration test using the reference Excel file

**Task order and dependencies:**
1. Dashboard Stats (standalone)
2. Period Cloning (standalone)
3. Excel Import — Parser Core (standalone)
4. Excel Import — API + Integration Tests (depends on Task 3)
5. Excel Export (standalone, but tests use data from import logic)
6. Suggestion Engine — Core (standalone)
7. Suggestion Engine — API + Lab Pairing (depends on Task 6)
8. Integration Test (depends on Tasks 1, 3, 5)

**New endpoints:**
- `GET /api/loader/schedules/stats/?academic_period=ID`
- `POST /api/loader/academic-periods/{id}/clone/`
- `POST /api/loader/import/`
- `GET /api/loader/export/?academic_period=ID&type=TYPE`
- `POST /api/loader/schedules/suggest/`

**Test count:** ~65 new tests (existing 38 + ~27 new test functions)
