import datetime
import uuid

import pytest
from rest_framework.test import APIClient

from apps.core.models import Tenant, User
from apps.scheduling.models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig,
)
from apps.scheduling.suggestions import generate_suggestions, generate_paired_suggestions

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


@pytest.fixture
def config(tenant, period):
    return ScheduleConfig.objects.create(
        tenant=tenant,
        academic_period=period,
        earliest_start_time=datetime.time(7, 0),
        latest_end_time=datetime.time(12, 0),
        time_slot_granularity_minutes=30,
        operating_days=['MON', 'TUE', 'WED'],
        break_periods=[],
        weight_faculty_priority=50,
        weight_room_proximity=50,
        weight_time_gap_minimization=30,
        weight_load_distribution=30,
    )


@pytest.fixture
def dept(tenant):
    return Department.objects.create(tenant=tenant, code='CS', name='Computer Science')


@pytest.fixture
def course(tenant, dept):
    return Course.objects.create(
        tenant=tenant, department=dept, code='CS101', title='Intro CS',
        lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
    )


@pytest.fixture
def lab_course(tenant, dept):
    return Course.objects.create(
        tenant=tenant, department=dept, code='CS102', title='CS Lab',
        lec_units=2, lab_units=1, contact_hours=6, has_lab=True,
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
def lab_room(tenant):
    return Room.objects.create(
        tenant=tenant, name='Lab 201', room_type='LABORATORY', capacity=40,
        building='Main', floor=2, sequence_number=1,
    )


@pytest.fixture
def program(tenant):
    return Program.objects.create(tenant=tenant, code='BSCS', name='BS Computer Science')


@pytest.fixture
def section(tenant, period, program):
    return Section.objects.create(
        tenant=tenant, program=program, academic_period=period,
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


class TestGenerateSuggestions:
    def test_returns_suggestions(self, tenant, period, config, course, section, faculty, room):
        result = generate_suggestions(tenant, period, course, [section], faculty, num_days=1, class_size=25)
        assert len(result) > 0
        assert result[0]['rank'] == 1
        assert 'day' in result[0]
        assert 'time_start' in result[0]
        assert 'room' in result[0]
        assert 'total_score' in result[0]

    def test_excludes_booked_rooms(self, tenant, period, config, course, dept, section, faculty, room):
        # Book room on MON 8:00-11:00 (the entire 3hr slot for contact_hours=3, num_days=1)
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (11, 0), [section])

        course2 = Course.objects.create(
            tenant=tenant, department=dept, code='CS201', title='Advanced CS',
            lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
        )
        prog2 = Program.objects.create(tenant=tenant, code='BSIT', name='BSIT')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=1,
        )
        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        result = generate_suggestions(tenant, period, course2, [sec2], faculty2, num_days=1, class_size=25)
        for s in result:
            # No suggestion should overlap MON 8:00-11:00 in Room 101
            if s['day'] == 'MON' and s['room'] == 'Room 101':
                slot_start = datetime.datetime.strptime(s['time_start'], '%H:%M').time()
                slot_end = datetime.datetime.strptime(s['time_end'], '%H:%M').time()
                # Should not overlap 8:00-11:00
                assert not (slot_start < datetime.time(11, 0) and datetime.time(8, 0) < slot_end)

    def test_excludes_faculty_conflicts(self, tenant, period, config, course, dept, section, faculty, room):
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (9, 30), [section])

        course2 = Course.objects.create(
            tenant=tenant, department=dept, code='CS201', title='Advanced CS',
            lec_units=1, lab_units=0, contact_hours=1, has_lab=False,
        )
        prog2 = Program.objects.create(tenant=tenant, code='BSIT', name='BSIT')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=1,
        )
        room2 = Room.objects.create(
            tenant=tenant, name='Room 102', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=2,
        )
        result = generate_suggestions(tenant, period, course2, [sec2], faculty, num_days=1, class_size=25)
        for s in result:
            if s['day'] == 'MON':
                slot_start = datetime.datetime.strptime(s['time_start'], '%H:%M').time()
                slot_end = datetime.datetime.strptime(s['time_end'], '%H:%M').time()
                assert not (slot_start < datetime.time(9, 30) and datetime.time(8, 0) < slot_end)

    def test_respects_room_capacity(self, tenant, period, config, course, section, faculty):
        small_room = Room.objects.create(
            tenant=tenant, name='Small Room', room_type='LECTURE', capacity=10,
            building='Main', floor=1, sequence_number=1,
        )
        result = generate_suggestions(tenant, period, course, [section], faculty, num_days=1, class_size=25)
        for s in result:
            assert s['room'] != 'Small Room'

    def test_no_faculty_still_works(self, tenant, period, config, course, section, room):
        result = generate_suggestions(tenant, period, course, [section], None, num_days=1, class_size=25)
        assert len(result) > 0

    def test_respects_faculty_unavailable(self, tenant, period, config, course, section, faculty, room):
        FacultyAvailability.objects.create(
            faculty=faculty, academic_period=period,
            day_of_week='MON',
            time_start=datetime.time(7, 0),
            time_end=datetime.time(12, 0),
            availability_type='UNAVAILABLE',
        )
        result = generate_suggestions(tenant, period, course, [section], faculty, num_days=1, class_size=25)
        for s in result:
            assert s['day'] != 'MON'

    def test_top_10_limit(self, tenant, period, config, course, section, faculty):
        # Create 20 rooms so many candidates exist
        for i in range(20):
            Room.objects.create(
                tenant=tenant, name=f'Room {i}', room_type='LECTURE', capacity=40,
                building='Main', floor=1, sequence_number=i,
            )
        result = generate_suggestions(tenant, period, course, [section], faculty, num_days=1, class_size=25)
        assert len(result) <= 10


class TestPairedSuggestions:
    def test_returns_paired(self, tenant, period, config, lab_course, section, faculty, room, lab_room):
        result = generate_paired_suggestions(
            tenant, period, lab_course, [section], faculty, class_size=25,
        )
        assert len(result) > 0
        first = result[0]
        assert 'lecture' in first
        assert 'lab' in first
        assert first['lecture']['day'] != first['lab']['day']

    def test_lecture_uses_lecture_room(self, tenant, period, config, lab_course, section, faculty, room, lab_room):
        result = generate_paired_suggestions(
            tenant, period, lab_course, [section], faculty, class_size=25,
        )
        assert len(result) > 0
        first = result[0]
        lec_room = Room.objects.get(name=first['lecture']['room'])
        lab_r = Room.objects.get(name=first['lab']['room'])
        assert lec_room.room_type in ('LECTURE', 'AVR')
        assert lab_r.room_type in ('LABORATORY', 'COMPUTER_LAB')


class TestSuggestAPI:
    def test_suggest_endpoint(self, auth_client, tenant, period, config, course, section, faculty, room):
        response = auth_client.post('/api/scheduler/schedules/suggest/', {
            'course': course.pk,
            'sections': [section.pk],
            'faculty': faculty.pk,
            'academic_period': period.pk,
            'num_days': 1,
            'class_size': 25,
        }, format='json')
        assert response.status_code == 200
        assert 'suggestions' in response.data

    def test_suggest_no_faculty(self, auth_client, tenant, period, config, course, section, room):
        response = auth_client.post('/api/scheduler/schedules/suggest/', {
            'course': course.pk,
            'sections': [section.pk],
            'academic_period': period.pk,
            'num_days': 1,
            'class_size': 25,
        }, format='json')
        assert response.status_code == 200
        assert 'suggestions' in response.data

    def test_suggest_lab_course(self, auth_client, tenant, period, config, lab_course, section, faculty, room, lab_room):
        response = auth_client.post('/api/scheduler/schedules/suggest/', {
            'course': lab_course.pk,
            'sections': [section.pk],
            'faculty': faculty.pk,
            'academic_period': period.pk,
            'class_size': 25,
        }, format='json')
        assert response.status_code == 200
        assert 'suggestions' in response.data
