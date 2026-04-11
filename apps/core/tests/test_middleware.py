import pytest
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory
from django.http import JsonResponse

from apps.core.middleware import TenantMiddleware
from apps.core.models import Tenant, User

pytestmark = pytest.mark.django_db


def dummy_view(request):
    return JsonResponse({'ok': True})


class TestTenantMiddleware:
    def setup_method(self):
        self.factory = RequestFactory()
        self.middleware = TenantMiddleware(dummy_view)
        self.tenant = Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')
        self.user = User.objects.create_user(
            username='reg', password='pass', tenant=self.tenant, role='REGISTRAR',
        )

    def test_public_routes_skip_tenant(self):
        request = self.factory.get('/admin/')
        request.user = AnonymousUser()
        response = self.middleware(request)
        assert response.status_code == 200

    def test_authenticated_user_sets_tenant(self):
        request = self.factory.get('/api/loader/courses/')
        request.user = self.user
        response = self.middleware(request)
        assert request.tenant == self.tenant
        assert response.status_code == 200

    def test_suspended_tenant_returns_403(self):
        self.tenant.status = 'SUSPENDED'
        self.tenant.save()
        request = self.factory.get('/api/loader/courses/')
        request.user = self.user
        request.META['HTTP_HOST'] = 'uni.localhost'
        response = self.middleware(request)
        assert response.status_code == 403
