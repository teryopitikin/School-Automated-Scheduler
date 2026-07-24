import pytest
from rest_framework.test import APIClient

from apps.core.models import Tenant, User
from apps.scheduling.models import AcademicPeriod, Program, Department, Course, Section

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
def period(tenant):
    return AcademicPeriod.objects.create(
        tenant=tenant, name='1S 25-26', year_start=2025, year_end=2026,
        semester='1ST', status='DRAFT',
    )


class TestAcademicPeriodAPI:
    def test_list(self, auth_client, period):
        response = auth_client.get('/api/scheduler/academic-periods/')
        assert response.status_code == 200
        assert response.data['count'] == 1

    def test_create(self, auth_client):
        response = auth_client.post('/api/scheduler/academic-periods/', {
            'name': '2S 25-26',
            'year_start': 2025,
            'year_end': 2026,
            'semester': '2ND',
        })
        assert response.status_code == 201
        assert response.data['name'] == '2S 25-26'
        assert AcademicPeriod.objects.count() == 1

    def test_tenant_isolation(self, auth_client, period):
        other_tenant = Tenant.objects.create(name='Other', slug='other', status='ACTIVE')
        AcademicPeriod.objects.create(
            tenant=other_tenant, name='Other Period', year_start=2025,
            year_end=2026, semester='2ND', status='DRAFT',
        )
        response = auth_client.get('/api/scheduler/academic-periods/')
        assert response.data['count'] == 1


class TestProgramAPI:
    def test_crud(self, auth_client):
        response = auth_client.post('/api/scheduler/programs/', {'code': 'BSA', 'name': 'BS Agriculture'})
        assert response.status_code == 201
        pk = response.data['id']

        response = auth_client.get(f'/api/scheduler/programs/{pk}/')
        assert response.data['code'] == 'BSA'

        response = auth_client.patch(f'/api/scheduler/programs/{pk}/', {'name': 'BS Agri'})
        assert response.status_code == 200
        assert response.data['name'] == 'BS Agri'

        response = auth_client.delete(f'/api/scheduler/programs/{pk}/')
        assert response.status_code == 204


class TestDepartmentAPI:
    def test_list_and_create(self, auth_client):
        response = auth_client.post('/api/scheduler/departments/', {'code': 'Agri', 'name': 'Agriculture'})
        assert response.status_code == 201

        response = auth_client.get('/api/scheduler/departments/')
        assert response.data['count'] == 1


class TestCourseAPI:
    def test_create_with_department(self, auth_client, tenant):
        dept = Department.objects.create(tenant=tenant, code='Agri', name='Agriculture')
        response = auth_client.post('/api/scheduler/courses/', {
            'department': dept.pk,
            'code': 'CrSc 1',
            'title': 'Crop Science 1',
            'lec_units': 2,
            'lab_units': 1,
            'contact_hours': 6,
            'has_lab': True,
        })
        assert response.status_code == 201
        assert response.data['total_units'] == '3.0'


class TestSectionAPI:
    def test_create(self, auth_client, tenant, period):
        prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
        response = auth_client.post('/api/scheduler/sections/', {
            'program': prog.pk,
            'academic_period': period.pk,
            'year_level': 1,
            'section_number': 1,
        })
        assert response.status_code == 201
        assert response.data['display_name'] == 'BSA 1-1'
