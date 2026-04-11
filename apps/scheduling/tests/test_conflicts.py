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
        entry2 = make_entry(tenant, period, course2, faculty2, room, 'MON', (9, 0), (11, 0), [sec2])
        result = detect_conflicts(entry2)
        assert len(result['hard']) == 1
        assert result['hard'][0]['type'] == 'room'

    def test_faculty_conflict(self, tenant, period, course, course2, faculty, section):
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
        assert any(c['type'] == 'faculty' for c in result['hard'])

    def test_section_conflict(self, tenant, period, course, course2, faculty, room, section):
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
        assert any(c['type'] == 'section' for c in result['hard'])

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
