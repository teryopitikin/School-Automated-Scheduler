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
