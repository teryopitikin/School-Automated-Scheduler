import datetime
import uuid

import pytest

from apps.core.models import Tenant, User
from apps.scheduling.conflicts import detect_conflicts
from apps.scheduling.models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, Room, ScheduleEntry,
)

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
def dept(tenant):
    return Department.objects.create(tenant=tenant, code='Agri', name='Agri')


@pytest.fixture
def course(tenant, dept):
    return Course.objects.create(
        tenant=tenant, department=dept, code='CrSc 1', title='Crop Science 1',
        lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
    )


@pytest.fixture
def course2(tenant, dept):
    return Course.objects.create(
        tenant=tenant, department=dept, code='CrSc 2', title='Crop Science 2',
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


def make_entry(tenant, period, course, faculty, room, day, start, end, sections=None):
    entry = ScheduleEntry.objects.create(
        tenant=tenant, academic_period=period, course=course,
        faculty=faculty, room=room, day_of_week=day,
        time_start=datetime.time(*start), time_end=datetime.time(*end),
        group_id=uuid.uuid4(), entry_type='LECTURE',
        load_classification='REGULAR', class_size=35,
    )
    if sections:
        entry.sections.set(sections)
    return entry


class TestDetectConflicts:
    def test_no_conflicts(self, tenant, period, course, faculty, room, section):
        entry = make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        result = detect_conflicts(entry)
        assert result['hard'] == []
        assert result['warnings'] == []

    def test_room_conflict(self, tenant, period, course, course2, faculty, room, section):
        """Same room + day + EXACT same time + different subject = conflict."""
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])

        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        prog2 = Program.objects.create(tenant=tenant, code='BSF', name='BSF')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=1,
        )
        entry2 = make_entry(tenant, period, course2, faculty2, room, 'MON', (8, 0), (10, 0), [sec2])
        result = detect_conflicts(entry2)
        assert len(result['hard']) == 1
        assert result['hard'][0]['type'] == 'room'

    def test_room_conflict_partial_overlap(self, tenant, period, course, course2, faculty, room, section):
        """Same room, times PARTIALLY overlapping — flagged."""
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        entry2 = make_entry(tenant, period, course2, faculty2, room, 'MON', (9, 0), (11, 0))
        result = detect_conflicts(entry2)
        assert any(c['type'] == 'room' for c in result['hard'])

    def test_no_conflict_touching_boundaries(self, tenant, period, course, course2, faculty, room, section):
        """Back-to-back classes (8-10 then 10-12) share a boundary, not time."""
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        entry2 = make_entry(tenant, period, course2, faculty, room, 'MON', (10, 0), (12, 0), [section])
        result = detect_conflicts(entry2)
        assert result['hard'] == []

    def test_faculty_conflict_different_rooms(self, tenant, period, course, course2, faculty, section):
        """Same teacher, overlapping time, DIFFERENT rooms — faculty double-booked."""
        room1 = Room.objects.create(
            tenant=tenant, name='Room 101', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=1,
        )
        room2 = Room.objects.create(
            tenant=tenant, name='Room 102', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=2,
        )
        make_entry(tenant, period, course, faculty, room1, 'MON', (8, 0), (10, 0), [section])

        prog2 = Program.objects.create(tenant=tenant, code='BSF', name='BSF')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=1,
        )
        entry2 = make_entry(tenant, period, course2, faculty, room2, 'MON', (9, 0), (11, 0), [sec2])
        result = detect_conflicts(entry2)
        types = [c['type'] for c in result['hard']]
        assert 'faculty' in types
        assert 'room' not in types   # different rooms — only the teacher clashes

    def test_section_conflict(self, tenant, period, course, course2, faculty, section):
        """Same section in two overlapping classes — section overlap."""
        room1 = Room.objects.create(
            tenant=tenant, name='Room 101', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=1,
        )
        room2 = Room.objects.create(
            tenant=tenant, name='Room 102', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=2,
        )
        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        make_entry(tenant, period, course, faculty, room1, 'MON', (8, 0), (10, 0), [section])
        entry2 = make_entry(tenant, period, course2, faculty2, room2, 'MON', (9, 0), (11, 0), [section])
        result = detect_conflicts(entry2)
        types = [c['type'] for c in result['hard']]
        assert 'section' in types
        assert 'room' not in types and 'faculty' not in types

    def test_section_no_conflict_different_day(self, tenant, period, course, course2, faculty, room, section):
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        entry2 = make_entry(tenant, period, course2, faculty, room, 'TUE', (8, 0), (10, 0), [section])
        result = detect_conflicts(entry2)
        assert result['hard'] == []

    def test_section_conflict_different_room(self, tenant, period, course, course2, faculty, room, section):
        """Same section, overlapping time, DIFFERENT rooms — section overlap."""
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])

        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        room2 = Room.objects.create(
            tenant=tenant, name='Room 102', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=2,
        )
        entry2 = make_entry(tenant, period, course2, faculty2, room2, 'MON', (9, 0), (11, 0), [section])
        result = detect_conflicts(entry2)
        assert [c['type'] for c in result['hard']] == ['section']

    def test_same_slot_is_conflict_regardless_of_subject(self, tenant, period, course, faculty, room, section):
        """Same room + day + exact time is a conflict even for the SAME subject
        (subject is not a parameter)."""
        prog2 = Program.objects.create(tenant=tenant, code='BSF', name='BSF')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=2,
        )
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        entry2 = make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [sec2])
        result = detect_conflicts(entry2)
        assert len(result['hard']) == 1
        assert result['hard'][0]['type'] == 'room'

    def test_no_conflict_different_day(self, tenant, period, course, course2, faculty, room, section):
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        entry2 = make_entry(tenant, period, course2, faculty, room, 'TUE', (8, 0), (10, 0), [section])
        result = detect_conflicts(entry2)
        assert result['hard'] == []

    def test_no_conflict_adjacent_times(self, tenant, period, course, course2, faculty, room, section):
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        entry2 = make_entry(tenant, period, course2, faculty, room, 'MON', (10, 0), (12, 0), [section])
        result = detect_conflicts(entry2)
        assert result['hard'] == []

    def test_warning_overloaded_faculty(self, tenant, period, course, faculty, room, section):
        faculty.max_load_units = 3
        faculty.save()
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])

        course2 = Course.objects.create(
            tenant=tenant, department=course.department, code='CrSc 2', title='Crop 2',
            lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
        )
        room2 = Room.objects.create(
            tenant=tenant, name='Room 102', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=2,
        )
        prog2 = Program.objects.create(tenant=tenant, code='BSF', name='BSF')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=1,
        )
        entry2 = make_entry(tenant, period, course2, faculty, room2, 'TUE', (8, 0), (10, 0), [sec2])
        result = detect_conflicts(entry2)
        assert any(w['type'] == 'overload' for w in result['warnings'])


class TestAnalyzePeriodBulk:
    def test_matches_per_entry_detection(self, tenant, period, course, course2, faculty, room, section):
        """The bulk analyzer must produce the same hard conflicts and warnings
        as running detect_conflicts on every entry."""
        from apps.scheduling.conflicts import analyze_period

        room2 = Room.objects.create(
            tenant=tenant, name='Room 102', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=2,
        )
        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=3,   # tiny max -> overload warning
        )
        prog2 = Program.objects.create(tenant=tenant, code='BSF', name='BSF')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=1,
        )
        # room clash (partial overlap), faculty clash, section clash, boundary no-clash
        e1 = make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        e2 = make_entry(tenant, period, course2, faculty2, room, 'MON', (9, 0), (11, 0), [sec2])   # room clash w/ e1
        e3 = make_entry(tenant, period, course2, faculty, room2, 'MON', (9, 30), (10, 30), [sec2])  # faculty clash w/ e1
        e4 = make_entry(tenant, period, course2, faculty2, room2, 'MON', (11, 0), (12, 0), [sec2])  # section clash w/ e2? no (11-12 vs 9-11 boundary) -> none
        e5 = make_entry(tenant, period, course, faculty2, room2, 'TUE', (8, 0), (9, 0), [section])
        e6 = make_entry(tenant, period, course2, faculty, room, 'TUE', (8, 30), (9, 30), [section])  # section clash w/ e5

        bulk = analyze_period(tenant, period)
        for e in (e1, e2, e3, e4, e5, e6):
            single = detect_conflicts(e)
            got = bulk[e.pk]
            def norm(items):
                return sorted((i['type'], i['conflicting_entry_id']) for i in items)
            assert norm(got['hard']) == norm(single['hard']), f'entry {e.pk} hard mismatch'
            assert sorted(w['type'] for w in got['warnings']) == \
                   sorted(w['type'] for w in single['warnings']), f'entry {e.pk} warnings mismatch'


class TestAsynchronousExemption:
    """Entries in an 'Asynchronous' room have no fixed meeting slot and must
    never be tagged as (or cause) a hard conflict."""

    @pytest.fixture
    def async_room(self, tenant):
        return Room.objects.create(
            tenant=tenant, name='Asynchronous', room_type='LECTURE', capacity=0,
        )

    def test_two_async_classes_same_slot_no_room_conflict(
            self, tenant, period, course, course2, faculty, async_room, section):
        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        e1 = make_entry(tenant, period, course, faculty, async_room, 'MON', (8, 0), (10, 0))
        e2 = make_entry(tenant, period, course2, faculty2, async_room, 'MON', (8, 0), (10, 0))
        assert detect_conflicts(e1)['hard'] == []
        assert detect_conflicts(e2)['hard'] == []

    def test_faculty_in_async_and_physical_class_no_conflict(
            self, tenant, period, course, course2, faculty, room, async_room):
        physical = make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0))
        async_e = make_entry(tenant, period, course2, faculty, async_room, 'MON', (8, 0), (10, 0))
        assert detect_conflicts(physical)['hard'] == []
        assert detect_conflicts(async_e)['hard'] == []

    def test_section_in_async_and_physical_class_no_conflict(
            self, tenant, period, course, course2, faculty, room, async_room, section):
        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        physical = make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        async_e = make_entry(tenant, period, course2, faculty2, async_room, 'MON', (8, 0), (10, 0), [section])
        assert detect_conflicts(physical)['hard'] == []
        assert detect_conflicts(async_e)['hard'] == []

    def test_physical_conflicts_still_detected(
            self, tenant, period, course, course2, faculty, room, async_room, section):
        """The exemption must not swallow real physical clashes."""
        e1 = make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        e2 = make_entry(tenant, period, course2, faculty, room, 'MON', (9, 0), (11, 0))
        assert any(h['type'] == 'room' for h in detect_conflicts(e1)['hard'])

    def test_analyze_period_matches_per_entry(
            self, tenant, period, course, course2, faculty, room, async_room, section):
        from apps.scheduling.conflicts import analyze_period

        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        e1 = make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        e2 = make_entry(tenant, period, course2, faculty, async_room, 'MON', (8, 0), (10, 0), [section])
        e3 = make_entry(tenant, period, course2, faculty2, room, 'MON', (9, 0), (11, 0))  # real room clash w/ e1
        bulk = analyze_period(tenant, period)
        assert bulk[e2.pk]['hard'] == []
        for e in (e1, e2, e3):
            single = detect_conflicts(e)
            def norm(items):
                return sorted((i['type'], i['conflicting_entry_id']) for i in items)
            assert norm(bulk[e.pk]['hard']) == norm(single['hard'])


class TestPlaceholderRoomExemption:
    """Entries in a placeholder room ('N/A', '-') are not in a specific room,
    so they must never be tagged as (or cause) a ROOM conflict. Faculty and
    section clashes involving them are still real and still flagged."""

    @pytest.fixture
    def na_room(self, tenant):
        return Room.objects.create(
            tenant=tenant, name='N/A', room_type='LECTURE', capacity=0,
        )

    @pytest.fixture
    def dash_room(self, tenant):
        return Room.objects.create(
            tenant=tenant, name='-', room_type='LECTURE', capacity=0,
        )

    @pytest.fixture
    def faculty2(self, tenant):
        return Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )

    def test_two_classes_in_na_room_same_slot_no_room_conflict(
            self, tenant, period, course, course2, faculty, faculty2, na_room):
        e1 = make_entry(tenant, period, course, faculty, na_room, 'MON', (8, 0), (10, 0))
        e2 = make_entry(tenant, period, course2, faculty2, na_room, 'MON', (8, 0), (10, 0))
        assert detect_conflicts(e1)['hard'] == []
        assert detect_conflicts(e2)['hard'] == []

    def test_dash_room_also_exempt(
            self, tenant, period, course, course2, faculty, faculty2, dash_room):
        e1 = make_entry(tenant, period, course, faculty, dash_room, 'MON', (8, 0), (10, 0))
        e2 = make_entry(tenant, period, course2, faculty2, dash_room, 'MON', (9, 0), (11, 0))
        assert detect_conflicts(e1)['hard'] == []
        assert detect_conflicts(e2)['hard'] == []

    def test_faculty_conflict_still_detected_in_placeholder_room(
            self, tenant, period, course, course2, faculty, na_room):
        """Same teacher in two overlapping placeholder-room classes is still a
        real clash — only the ROOM dimension is exempt."""
        e1 = make_entry(tenant, period, course, faculty, na_room, 'MON', (8, 0), (10, 0))
        e2 = make_entry(tenant, period, course2, faculty, na_room, 'MON', (9, 0), (11, 0))
        assert [h['type'] for h in detect_conflicts(e1)['hard']] == ['faculty']
        assert [h['type'] for h in detect_conflicts(e2)['hard']] == ['faculty']

    def test_section_conflict_still_detected_in_placeholder_room(
            self, tenant, period, course, course2, faculty, faculty2, na_room, section):
        e1 = make_entry(tenant, period, course, faculty, na_room, 'MON', (8, 0), (10, 0), [section])
        e2 = make_entry(tenant, period, course2, faculty2, na_room, 'MON', (9, 0), (11, 0), [section])
        assert [h['type'] for h in detect_conflicts(e1)['hard']] == ['section']
        assert [h['type'] for h in detect_conflicts(e2)['hard']] == ['section']

    def test_physical_room_conflicts_unaffected(
            self, tenant, period, course, course2, faculty, faculty2, room):
        e1 = make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0))
        e2 = make_entry(tenant, period, course2, faculty2, room, 'MON', (9, 0), (11, 0))
        assert [h['type'] for h in detect_conflicts(e1)['hard']] == ['room']

    def test_analyze_period_matches_per_entry(
            self, tenant, period, course, course2, faculty, faculty2, room, na_room, section):
        from apps.scheduling.conflicts import analyze_period

        e1 = make_entry(tenant, period, course, faculty, na_room, 'MON', (8, 0), (10, 0), [section])
        e2 = make_entry(tenant, period, course2, faculty, na_room, 'MON', (9, 0), (11, 0))
        e3 = make_entry(tenant, period, course2, faculty2, room, 'MON', (8, 0), (10, 0))
        bulk = analyze_period(tenant, period)
        assert all(h['type'] != 'room' for h in bulk[e1.pk]['hard'])
        assert all(h['type'] != 'room' for h in bulk[e2.pk]['hard'])
        for e in (e1, e2, e3):
            single = detect_conflicts(e)
            def norm(items):
                return sorted((i['type'], i['conflicting_entry_id']) for i in items)
            assert norm(bulk[e.pk]['hard']) == norm(single['hard'])
