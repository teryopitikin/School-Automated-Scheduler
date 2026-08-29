"""Admin-only user management: CRUD at /api/scheduler/users/, and /auth/me/
exposing role + managed_program_codes for frontend gating."""
import pytest
from rest_framework.test import APIClient

from apps.core.models import Tenant, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenant():
    return Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')


@pytest.fixture
def admin(tenant):
    return User.objects.create_user(
        username='adm', password='pass', tenant=tenant, role='ADMIN')


@pytest.fixture
def admin_client(admin):
    c = APIClient()
    c.force_authenticate(user=admin)
    return c


@pytest.fixture
def head(tenant):
    return User.objects.create_user(
        username='head', password='pass', tenant=tenant, role='DEPT_HEAD',
        managed_program_codes=['BEED'])


@pytest.fixture
def head_client(head):
    c = APIClient()
    c.force_authenticate(user=head)
    return c


class TestUserCrud:
    def test_admin_lists_users(self, admin_client, head):
        resp = admin_client.get('/api/scheduler/users/')
        assert resp.status_code == 200
        names = {u['username'] for u in resp.data['results']} \
            if isinstance(resp.data, dict) else {u['username'] for u in resp.data}
        assert {'adm', 'head'} <= names

    def test_non_admin_gets_403(self, head_client):
        assert head_client.get('/api/scheduler/users/').status_code == 403
        assert head_client.post('/api/scheduler/users/', {}).status_code == 403

    def test_admin_creates_dept_head(self, admin_client, tenant):
        resp = admin_client.post('/api/scheduler/users/', {
            'username': 'crimhead', 'password': 'Secret123',
            'role': 'DEPT_HEAD', 'managed_program_codes': ['BSCRIM', 'BSBA-FM'],
        }, format='json')
        assert resp.status_code == 201, resp.data
        u = User.objects.get(username='crimhead')
        assert u.role == 'DEPT_HEAD'
        assert u.managed_program_codes == ['BSCRIM', 'BSBA-FM']
        assert u.tenant == tenant          # inherits the admin's tenant
        assert u.check_password('Secret123')
        assert 'password' not in resp.data

    def test_admin_updates_role_and_programs(self, admin_client, head):
        resp = admin_client.patch(f'/api/scheduler/users/{head.pk}/', {
            'managed_program_codes': ['BEED', 'BSED-ENG'],
        }, format='json')
        assert resp.status_code == 200
        head.refresh_from_db()
        assert head.managed_program_codes == ['BEED', 'BSED-ENG']

    def test_update_without_password_keeps_password(self, admin_client, head):
        admin_client.patch(f'/api/scheduler/users/{head.pk}/',
                           {'email': 'h@x.com'}, format='json')
        head.refresh_from_db()
        assert head.check_password('pass')

    def test_update_with_password_changes_it(self, admin_client, head):
        admin_client.patch(f'/api/scheduler/users/{head.pk}/',
                           {'password': 'NewPass99'}, format='json')
        head.refresh_from_db()
        assert head.check_password('NewPass99')

    def test_deactivate_not_delete(self, admin_client, head):
        resp = admin_client.patch(f'/api/scheduler/users/{head.pk}/',
                                  {'is_active': False}, format='json')
        assert resp.status_code == 200
        head.refresh_from_db()
        assert head.is_active is False
        assert admin_client.delete(f'/api/scheduler/users/{head.pk}/').status_code == 405


class TestMe:
    def test_me_returns_role_and_programs(self, head_client):
        resp = head_client.get('/api/scheduler/auth/me/')
        assert resp.status_code == 200
        assert resp.data['role'] == 'DEPT_HEAD'
        assert resp.data['managed_program_codes'] == ['BEED']


class TestFullName:
    def test_create_with_names(self, admin_client):
        resp = admin_client.post('/api/scheduler/users/', {
            'username': 'mcruz', 'password': 'Secret123', 'role': 'REGISTRAR',
            'first_name': 'Maria', 'last_name': 'Cruz',
        }, format='json')
        assert resp.status_code == 201, resp.data
        assert resp.data['first_name'] == 'Maria'
        assert resp.data['last_name'] == 'Cruz'
        u = User.objects.get(username='mcruz')
        assert u.get_full_name() == 'Maria Cruz'

    def test_update_names(self, admin_client, head):
        resp = admin_client.patch(f'/api/scheduler/users/{head.pk}/', {
            'first_name': 'Juan', 'last_name': 'Dela Cruz',
        }, format='json')
        assert resp.status_code == 200
        head.refresh_from_db()
        assert head.first_name == 'Juan'
        assert head.last_name == 'Dela Cruz'

    def test_me_includes_names(self, head):
        head.first_name = 'Juan'
        head.last_name = 'Dela Cruz'
        head.save()
        from rest_framework.test import APIClient
        c = APIClient()
        c.force_authenticate(user=head)
        resp = c.get('/api/scheduler/auth/me/')
        assert resp.data['first_name'] == 'Juan'
        assert resp.data['full_name'] == 'Juan Dela Cruz'


class TestChangePassword:
    """Every role can change their OWN password at /auth/change-password/,
    proving the current one first; the session survives the change."""

    def _client_and_user(self, tenant, role='VIEWER'):
        u = User.objects.create_user(
            username=f'u_{role.lower()}', password='oldpass', tenant=tenant, role=role)
        c = APIClient()
        c.force_authenticate(user=u)
        return c, u

    @pytest.mark.parametrize('role', ['ADMIN', 'REGISTRAR', 'DEPT_HEAD', 'VIEWER'])
    def test_all_roles_can_change_own_password(self, tenant, role):
        c, u = self._client_and_user(tenant, role)
        resp = c.post('/api/scheduler/auth/change-password/', {
            'current_password': 'oldpass', 'new_password': 'NewPass99',
        }, format='json')
        assert resp.status_code == 200, resp.data
        u.refresh_from_db()
        assert u.check_password('NewPass99')

    def test_wrong_current_password_rejected(self, tenant):
        c, u = self._client_and_user(tenant)
        resp = c.post('/api/scheduler/auth/change-password/', {
            'current_password': 'WRONG', 'new_password': 'NewPass99',
        }, format='json')
        assert resp.status_code == 400
        u.refresh_from_db()
        assert u.check_password('oldpass')

    def test_short_new_password_rejected(self, tenant):
        c, u = self._client_and_user(tenant)
        resp = c.post('/api/scheduler/auth/change-password/', {
            'current_password': 'oldpass', 'new_password': 'abc',
        }, format='json')
        assert resp.status_code == 400
        u.refresh_from_db()
        assert u.check_password('oldpass')

    def test_requires_auth(self):
        resp = APIClient().post('/api/scheduler/auth/change-password/', {
            'current_password': 'x', 'new_password': 'NewPass99',
        }, format='json')
        assert resp.status_code in (401, 403)
