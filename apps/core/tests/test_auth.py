import pytest
from rest_framework.test import APIClient

from apps.core.models import Tenant, User

pytestmark = pytest.mark.django_db


class TestAuthEndpoints:
    def setup_method(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')
        self.user = User.objects.create_user(
            username='registrar', password='testpass123',
            tenant=self.tenant, role='REGISTRAR',
        )

    def test_login_success(self):
        response = self.client.post('/api/loader/auth/login/', {
            'username': 'registrar',
            'password': 'testpass123',
        })
        assert response.status_code == 200
        assert response.data['username'] == 'registrar'
        assert response.data['role'] == 'REGISTRAR'

    def test_login_bad_credentials(self):
        response = self.client.post('/api/loader/auth/login/', {
            'username': 'registrar',
            'password': 'wrong',
        })
        assert response.status_code == 400

    def test_current_user(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/loader/auth/me/')
        assert response.status_code == 200
        assert response.data['username'] == 'registrar'
        assert response.data['tenant_id'] == self.tenant.pk

    def test_logout(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/loader/auth/logout/')
        assert response.status_code == 200

    def test_csrf_endpoint(self):
        response = self.client.get('/api/loader/auth/csrf/')
        assert response.status_code == 200
