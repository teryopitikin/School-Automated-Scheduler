import datetime
import uuid

import pytest
from apps.core.models import Tenant
from apps.scheduling.models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenant():
    return Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')


@pytest.fixture
def period(tenant):
    return AcademicPeriod.objects.create(
        tenant=tenant, name='1st Semester 2025-2026',
        year_start=2025, year_end=2026, semester='1ST', status='DRAFT',
    )


class TestAcademicPeriod:
    def test_create(self, period):
        assert period.pk is not None
        assert str(period) == '1st Semester 2025-2026'

    def test_unique_per_tenant(self, tenant):
        AcademicPeriod.objects.create(
            tenant=tenant, name='1S', year_start=2025, year_end=2026,
            semester='1ST', status='DRAFT',
        )
        with pytest.raises(Exception):
            AcademicPeriod.objects.create(
                tenant=tenant, name='1S dup', year_start=2025, year_end=2026,
                semester='1ST', status='DRAFT',
            )


class TestProgram:
    def test_create(self, tenant):
        prog = Program.objects.create(tenant=tenant, code='BSA', name='Bachelor of Science in Agriculture')
        assert str(prog) == 'BSA'


class TestDepartment:
    def test_create(self, tenant):
        dept = Department.objects.create(tenant=tenant, code='Agri', name='Agriculture')
        assert str(dept) == 'Agri'


class TestCourse:
    def test_create(self, tenant):
        dept = Department.objects.create(tenant=tenant, code='Agri', name='Agriculture')
        course = Course.objects.create(
            tenant=tenant, department=dept, code='CrSc 1',
            title='Crop Science 1', lec_units=2, lab_units=1,
            contact_hours=6, has_lab=True,
        )
        assert course.total_units == 3
        assert str(course) == 'CrSc 1'


class TestSection:
    def test_create(self, tenant, period):
        prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
        sec = Section.objects.create(
            tenant=tenant, program=prog, academic_period=period,
            year_level=1, section_number=1,
        )
        assert str(sec) == 'BSA 1-1'


@pytest.fixture
def department(tenant):
    return Department.objects.create(tenant=tenant, code='Agri', name='Agriculture')


@pytest.fixture
def course(tenant, department):
    return Course.objects.create(
        tenant=tenant, department=department, code='CrSc 1',
        title='Crop Science 1', lec_units=2, lab_units=1, contact_hours=6, has_lab=True,
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
        tenant=tenant, name='Room 101', room_type='LECTURE',
        capacity=40, building='Main', floor=1, sequence_number=1,
    )


class TestFaculty:
    def test_create(self, faculty):
        assert faculty.pk is not None
        assert str(faculty) == 'Dr. Smith'
        assert faculty.employment_type == 'FULL_TIME'


class TestFacultyAvailability:
    def test_create(self, faculty, period):
        avail = FacultyAvailability.objects.create(
            faculty=faculty, academic_period=period,
            day_of_week='MON',
            time_start=datetime.time(8, 0),
            time_end=datetime.time(12, 0),
            availability_type='PREFERRED',
        )
        assert avail.pk is not None


class TestRoom:
    def test_create(self, room):
        assert room.pk is not None
        assert str(room) == 'Room 101'


class TestScheduleEntry:
    def test_create(self, tenant, period, course, faculty, room):
        prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
        sec = Section.objects.create(
            tenant=tenant, program=prog, academic_period=period,
            year_level=1, section_number=1,
        )
        group = uuid.uuid4()
        entry = ScheduleEntry.objects.create(
            tenant=tenant, academic_period=period, course=course,
            faculty=faculty, room=room,
            day_of_week='MON',
            time_start=datetime.time(8, 0),
            time_end=datetime.time(10, 0),
            group_id=group, entry_type='LECTURE',
            load_classification='REGULAR', class_size=35,
        )
        entry.sections.add(sec)
        assert entry.pk is not None
        assert entry.sections.count() == 1

    def test_faculty_nullable(self, tenant, period, course, room):
        entry = ScheduleEntry.objects.create(
            tenant=tenant, academic_period=period, course=course,
            faculty=None, room=room,
            day_of_week='TUE',
            time_start=datetime.time(10, 0),
            time_end=datetime.time(12, 0),
            group_id=uuid.uuid4(), entry_type='LECTURE',
            load_classification='REGULAR', class_size=30,
        )
        assert entry.faculty is None


class TestScheduleConfig:
    def test_create(self, tenant, period):
        config = ScheduleConfig.objects.create(
            tenant=tenant, academic_period=period,
            earliest_start_time=datetime.time(7, 0),
            latest_end_time=datetime.time(21, 0),
            time_slot_granularity_minutes=30,
            operating_days=['MON', 'TUE', 'WED', 'THU', 'FRI'],
        )
        assert config.pk is not None
        assert config.weight_faculty_priority == 50  # default
