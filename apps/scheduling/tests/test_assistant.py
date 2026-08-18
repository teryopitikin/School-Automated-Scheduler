import datetime
import uuid

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.models import Tenant, User
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
        semester='1ST', status='ACTIVE',
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
    )


@pytest.fixture
def section(tenant, period):
    prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
    return Section.objects.create(
        tenant=tenant, program=prog, academic_period=period,
        year_level=1, section_number=1,
    )


@pytest.fixture
def user(tenant):
    return User.objects.create_user(
        username='admin', password='admin', tenant=tenant,
    )


@pytest.fixture
def api(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


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


class TestAssistantTools:
    def test_search_entities_finds_faculty_by_partial_name(self, tenant, period, faculty):
        from apps.scheduling.assistant import execute_tool
        out = execute_tool('search_entities', {'kind': 'faculty', 'query': 'smith'},
                           tenant, period, [])
        assert any(m['name'] == 'Dr. Smith' for m in out['matches'])

    def test_search_entities_finds_section_by_label(self, tenant, period, section):
        from apps.scheduling.assistant import execute_tool
        out = execute_tool('search_entities', {'kind': 'section', 'query': 'BSA 1-1'},
                           tenant, period, [])
        assert any(m['name'] == 'BSA 1-1' for m in out['matches'])

    def test_get_schedule_for_section(self, tenant, period, course, faculty, room, section):
        from apps.scheduling.assistant import execute_tool
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        out = execute_tool('get_schedule', {'kind': 'section', 'query': 'BSA 1-1'},
                           tenant, period, [])
        assert len(out['entries']) == 1
        e = out['entries'][0]
        assert e['course'] == 'CrSc 1'
        assert e['day'] == 'MON'
        assert e['room'] == 'Room 101'

    def test_find_free_slots_excludes_busy_times(self, tenant, period, course, faculty, room, section):
        from apps.scheduling.assistant import execute_tool
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        out = execute_tool('find_free_slots', {'kind': 'room', 'query': 'Room 101', 'day': 'MON'},
                           tenant, period, [])
        gaps = out['free'][0]['gaps']
        assert not any(g['start'] < '10:00' and g['end'] > '08:00' for g in gaps)
        assert any(g['start'] == '10:00' for g in gaps)

    def test_get_unscheduled_courses(self, tenant, period, course, course2, faculty, room, section):
        from apps.scheduling.assistant import execute_tool
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        out = execute_tool('get_unscheduled_courses', {}, tenant, period, [])
        codes = [c['code'] for c in out['courses']]
        assert 'CrSc 2' in codes and 'CrSc 1' not in codes

    def test_propose_add_class_stages_action(self, tenant, period, course, faculty, room, section):
        from apps.scheduling.assistant import execute_tool
        staged = []
        out = execute_tool('propose_add_class', {
            'course': 'CrSc 1', 'sections': ['BSA 1-1'], 'days': ['MON'],
            'time_start': '08:00', 'time_end': '10:00',
            'room': 'Room 101', 'faculty': 'Smith',
        }, tenant, period, staged)
        assert out['staged'] is True
        assert len(staged) == 1
        assert staged[0]['type'] == 'add_class'
        assert staged[0]['payload']['course'] == course.id
        assert staged[0]['payload']['room'] == room.id
        assert ScheduleEntry.objects.count() == 0   # staging must not create anything

    def test_propose_add_unknown_course_reports_error(self, tenant, period, room, section):
        from apps.scheduling.assistant import execute_tool
        staged = []
        out = execute_tool('propose_add_class', {
            'course': 'NOPE 999', 'sections': ['BSA 1-1'], 'days': ['MON'],
            'time_start': '08:00', 'time_end': '10:00', 'room': 'Room 101',
        }, tenant, period, staged)
        assert 'error' in out
        assert staged == []


class TestAssistantExecute:
    def test_execute_add_creates_entries(self, api, tenant, period, course, faculty, room, section):
        resp = api.post('/api/scheduler/assistant/execute/', {
            'action': {
                'type': 'add_class',
                'payload': {
                    'academic_period': period.id, 'course': course.id,
                    'sections': [section.id], 'days': ['MON', 'WED'],
                    'time_start': '08:00', 'time_end': '10:00',
                    'room': room.id, 'faculty': faculty.id,
                },
            },
        }, format='json')
        assert resp.status_code == 201, resp.content
        assert ScheduleEntry.objects.count() == 2

    def test_execute_add_blocked_on_conflict(self, api, tenant, period, course, course2, faculty, room, section):
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        resp = api.post('/api/scheduler/assistant/execute/', {
            'action': {
                'type': 'add_class',
                'payload': {
                    'academic_period': period.id, 'course': course2.id,
                    'sections': [section.id], 'days': ['MON'],
                    'time_start': '09:00', 'time_end': '11:00',
                    'room': room.id,
                },
            },
        }, format='json')
        assert resp.status_code == 409
        assert resp.json()['blocked'] is True
        assert ScheduleEntry.objects.count() == 1

    def test_execute_delete_removes_group(self, api, tenant, period, course, faculty, room, section):
        e = make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        resp = api.post('/api/scheduler/assistant/execute/', {
            'action': {'type': 'delete_class', 'payload': {'entry_id': e.id}},
        }, format='json')
        assert resp.status_code == 200
        assert ScheduleEntry.objects.count() == 0


class TestAssistantChat:
    def test_chat_requires_auth(self, tenant):
        resp = APIClient().post('/api/scheduler/assistant/chat/', {'message': 'hi'}, format='json')
        assert resp.status_code in (401, 403)

    def test_chat_without_api_key_returns_503(self, api, settings):
        settings.ANTHROPIC_API_KEY = ''
        resp = api.post('/api/scheduler/assistant/chat/', {'message': 'hi'}, format='json')
        assert resp.status_code == 503

    def test_chat_mocked_round_trip(self, api, settings, monkeypatch, tenant, period,
                                    course, faculty, room, section):
        settings.ANTHROPIC_API_KEY = 'test-key'
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])

        class FakeBlock:
            def __init__(self, **kw):
                self.__dict__.update(kw)
            def model_dump(self):
                return dict(self.__dict__)

        class FakeResponse:
            def __init__(self, blocks, stop):
                self.content = blocks
                self.stop_reason = stop

        calls = []

        class FakeMessages:
            def create(self, **kwargs):
                calls.append(kwargs)
                if len(calls) == 1:
                    return FakeResponse([FakeBlock(
                        type='tool_use', id='tu_1', name='get_schedule',
                        input={'kind': 'section', 'query': 'BSA 1-1'},
                    )], 'tool_use')
                return FakeResponse([FakeBlock(type='text', text='BSA 1-1 has CrSc 1 on Monday 8-10.')],
                                    'end_turn')

        class FakeClient:
            def __init__(self):
                self.beta = type('B', (), {'messages': FakeMessages()})()

        from apps.scheduling import assistant
        monkeypatch.setattr(assistant, '_get_client', lambda: FakeClient())

        resp = api.post('/api/scheduler/assistant/chat/',
                        {'message': 'what does BSA 1-1 have on Monday?'}, format='json')
        assert resp.status_code == 200, resp.content
        data = resp.json()
        assert 'CrSc 1' in data['reply']
        assert data['actions'] == []
        assert len(calls) == 2   # tool round-trip happened
        # the tool result went back to the model (history carries it)
        assert any(
            m['role'] == 'user' and isinstance(m['content'], list)
            and m['content'][0].get('type') == 'tool_result'
            for m in data['history']
        )


class TestAssistantKeyConfig:
    @pytest.fixture
    def env_file(self, settings, tmp_path):
        p = tmp_path / '.env'
        p.write_text('SECRET_KEY=x\n')
        settings.ASSISTANT_ENV_PATH = str(p)
        settings.ANTHROPIC_API_KEY = ''
        return p

    def test_get_config_unconfigured(self, api, env_file):
        resp = api.get('/api/scheduler/assistant/config/')
        assert resp.status_code == 200
        assert resp.json() == {'configured': False, 'key_tail': None}

    def test_save_key_persists_and_masks(self, api, env_file, settings):
        resp = api.post('/api/scheduler/assistant/config/',
                        {'api_key': 'sk-ant-test-abcd1234'}, format='json')
        assert resp.status_code == 200
        assert resp.json() == {'configured': True, 'key_tail': '1234'}
        # runtime settings updated (no restart needed)
        assert settings.ANTHROPIC_API_KEY == 'sk-ant-test-abcd1234'
        # persisted to the env file, existing lines kept
        text = env_file.read_text()
        assert 'ANTHROPIC_API_KEY=sk-ant-test-abcd1234' in text
        assert 'SECRET_KEY=x' in text
        # GET never returns the full key
        got = api.get('/api/scheduler/assistant/config/').json()
        assert got == {'configured': True, 'key_tail': '1234'}

    def test_save_replaces_existing_line(self, api, env_file):
        env_file.write_text('SECRET_KEY=x\nANTHROPIC_API_KEY=old\n')
        api.post('/api/scheduler/assistant/config/',
                 {'api_key': 'sk-new-key-9999'}, format='json')
        text = env_file.read_text()
        assert text.count('ANTHROPIC_API_KEY=') == 1
        assert 'ANTHROPIC_API_KEY=sk-new-key-9999' in text

    def test_clear_key(self, api, env_file, settings):
        api.post('/api/scheduler/assistant/config/',
                 {'api_key': 'sk-ant-test-abcd1234'}, format='json')
        resp = api.post('/api/scheduler/assistant/config/', {'api_key': ''}, format='json')
        assert resp.json() == {'configured': False, 'key_tail': None}
        assert settings.ANTHROPIC_API_KEY == ''
        assert 'ANTHROPIC_API_KEY=\n' in env_file.read_text()

    def test_config_requires_auth(self, env_file):
        assert APIClient().get('/api/scheduler/assistant/config/').status_code in (401, 403)

    def test_test_connection(self, api, env_file, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = 'sk-ant-test'

        class FakeModels:
            def retrieve(self, model_id):
                return type('M', (), {'id': model_id})()

        class FakeClient:
            def __init__(self):
                self.models = FakeModels()

        from apps.scheduling import assistant
        monkeypatch.setattr(assistant, '_get_client', lambda: FakeClient())
        resp = api.post('/api/scheduler/assistant/config/test/', {}, format='json')
        assert resp.status_code == 200
        assert resp.json()['ok'] is True

    def test_test_connection_bad_key(self, api, env_file, settings, monkeypatch):
        settings.ANTHROPIC_API_KEY = 'sk-bad'

        class FakeModels:
            def retrieve(self, model_id):
                raise Exception('authentication_error: invalid x-api-key')

        class FakeClient:
            def __init__(self):
                self.models = FakeModels()

        from apps.scheduling import assistant
        monkeypatch.setattr(assistant, '_get_client', lambda: FakeClient())
        resp = api.post('/api/scheduler/assistant/config/test/', {}, format='json')
        assert resp.status_code == 200
        body = resp.json()
        assert body['ok'] is False and 'invalid' in body['error']
