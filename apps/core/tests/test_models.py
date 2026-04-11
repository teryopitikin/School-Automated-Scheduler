import pytest
from apps.core.models import Tenant, User

pytestmark = pytest.mark.django_db


class TestTenant:
    def test_create_tenant(self):
        tenant = Tenant.objects.create(
            name='Test University',
            slug='test-uni',
            status='ACTIVE',
        )
        assert tenant.pk is not None
        assert str(tenant) == 'Test University'

    def test_slug_is_unique(self):
        Tenant.objects.create(name='A', slug='same-slug', status='ACTIVE')
        with pytest.raises(Exception):
            Tenant.objects.create(name='B', slug='same-slug', status='ACTIVE')


class TestUser:
    def test_create_user_with_tenant(self):
        tenant = Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')
        user = User.objects.create_user(
            username='registrar1',
            password='testpass123',
            tenant=tenant,
            role='REGISTRAR',
        )
        assert user.pk is not None
        assert user.tenant == tenant
        assert user.role == 'REGISTRAR'

    def test_create_user_without_tenant(self):
        user = User.objects.create_user(
            username='superadmin',
            password='testpass123',
            role='ADMIN',
        )
        assert user.tenant is None
