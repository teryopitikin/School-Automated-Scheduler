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
            f'/api/scheduler/academic-periods/{source_period.pk}/clone/',
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
            f'/api/scheduler/academic-periods/{source_period.pk}/clone/',
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
            f'/api/scheduler/academic-periods/{source_period.pk}/clone/',
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
        assert new_period.sections.count() == 2
        assert source_period.sections.count() == 2

    def test_clone_does_not_copy_schedule_entries(self, auth_client, source_period, setup_source, tenant):
        response = auth_client.post(
            f'/api/scheduler/academic-periods/{source_period.pk}/clone/',
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
