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


class TestConflictsEndpointDetails:
    def test_conflicts_include_full_details_for_both_sides(self, auth_client, tenant, period):
        import datetime, uuid
        from apps.scheduling.models import Faculty, Room, ScheduleEntry

        dept = Department.objects.create(tenant=tenant, code='GEN', name='General')
        c1 = Course.objects.create(tenant=tenant, department=dept, code='GE 101', title='A')
        c2 = Course.objects.create(tenant=tenant, department=dept, code='GE 102', title='B')
        prog = Program.objects.create(tenant=tenant, code='BSIT', name='BSIT')
        sec1 = Section.objects.create(tenant=tenant, program=prog, academic_period=period,
                                      year_level=1, section_number=1)
        sec2 = Section.objects.create(tenant=tenant, program=prog, academic_period=period,
                                      year_level=2, section_number=1)
        f1 = Faculty.objects.create(tenant=tenant, name='CRUZ, A', employment_type='FULL_TIME')
        f2 = Faculty.objects.create(tenant=tenant, name='REYES, B', employment_type='FULL_TIME')
        room = Room.objects.create(tenant=tenant, name='Room 15', room_type='LECTURE', capacity=40)

        e1 = ScheduleEntry.objects.create(
            tenant=tenant, academic_period=period, course=c1, faculty=f1, room=room,
            day_of_week='MON', time_start=datetime.time(8), time_end=datetime.time(9),
            group_id=uuid.uuid4())
        e1.sections.set([sec1])
        e2 = ScheduleEntry.objects.create(
            tenant=tenant, academic_period=period, course=c2, faculty=f2, room=room,
            day_of_week='MON', time_start=datetime.time(8, 30), time_end=datetime.time(9, 30),
            group_id=uuid.uuid4())
        e2.sections.set([sec2])

        resp = auth_client.get(f'/api/scheduler/schedules/conflicts/?academic_period={period.id}')
        assert resp.status_code == 200
        assert len(resp.data) == 2   # both entries flagged

        item = next(i for i in resp.data if i['entry_id'] == e1.pk)
        # the flagged entry itself carries full details
        d = item['entry_detail']
        assert d['course_code'] == 'GE 101'
        assert d['section_names'] == ['BSIT 1-1']
        assert d['faculty_name'] == 'CRUZ, A'
        assert d['room_name'] == 'Room 15'
        assert d['day_of_week'] == 'MON'
        assert d['time_start'] == '08:00:00'
        # ...and each hard conflict carries the other side's full details
        other = item['hard'][0]['other']
        assert other['id'] == e2.pk
        assert other['course_code'] == 'GE 102'
        assert other['section_names'] == ['BSIT 2-1']
        assert other['faculty_name'] == 'REYES, B'
        assert other['room_name'] == 'Room 15'
        assert other['day_of_week'] == 'MON'
        assert other['time_start'] == '08:30:00'


class TestFreeRoomsEndpoint:
    def test_lists_only_rooms_free_at_that_slot(self, auth_client, tenant, period):
        import datetime, uuid
        from apps.scheduling.models import Faculty, Room, ScheduleEntry

        dept = Department.objects.create(tenant=tenant, code='GEN', name='General')
        c1 = Course.objects.create(tenant=tenant, department=dept, code='GE 1', title='A')
        c2 = Course.objects.create(tenant=tenant, department=dept, code='GE 2', title='B')
        f = Faculty.objects.create(tenant=tenant, name='CRUZ, A', employment_type='FULL_TIME')
        r1 = Room.objects.create(tenant=tenant, name='Room 1', room_type='LECTURE', capacity=40)
        r2 = Room.objects.create(tenant=tenant, name='Room 2', room_type='LECTURE', capacity=40)
        r3 = Room.objects.create(tenant=tenant, name='Room 3', room_type='LECTURE', capacity=40)
        r4 = Room.objects.create(tenant=tenant, name='Lab 1', room_type='COMPUTER_LAB', capacity=30)

        e1 = ScheduleEntry.objects.create(   # the conflicted class we want to re-room
            tenant=tenant, academic_period=period, course=c1, faculty=f, room=r1,
            day_of_week='MON', time_start=datetime.time(8), time_end=datetime.time(10),
            group_id=uuid.uuid4())
        ScheduleEntry.objects.create(        # r2 busy: overlaps 9-11
            tenant=tenant, academic_period=period, course=c2, faculty=f, room=r2,
            day_of_week='MON', time_start=datetime.time(9), time_end=datetime.time(11),
            group_id=uuid.uuid4())
        ScheduleEntry.objects.create(        # r3 back-to-back 10-12 -> still FREE
            tenant=tenant, academic_period=period, course=c2, faculty=f, room=r3,
            day_of_week='MON', time_start=datetime.time(10), time_end=datetime.time(12),
            group_id=uuid.uuid4())

        resp = auth_client.get(f'/api/scheduler/schedules/{e1.pk}/free-rooms/')
        assert resp.status_code == 200
        names = [r['name'] for r in resp.data['rooms']]
        assert 'Room 3' in names          # back-to-back is free
        assert 'Lab 1' in names           # different type but free
        assert 'Room 2' not in names      # overlapping -> busy
        assert 'Room 1' not in names      # its own current room
        # same room-type as the current room ranks first
        assert names[0] == 'Room 3'
