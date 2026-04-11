# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Django + DRF backend for AutomatedLoader with all data models, CRUD APIs, authentication, multi-tenancy, and conflict detection.

**Architecture:** Single Django project (`loader`) with two apps: `core` (tenant, user, auth, middleware) and `scheduling` (all scheduling models and APIs). Follows the same multi-tenancy pattern as Smart-HR — shared database with tenant FK isolation, subdomain detection middleware, and `TenantQuerySetMixin` on all viewsets.

**Tech Stack:** Python 3.12+, Django 5.x, Django REST Framework, PostgreSQL, Redis, django-environ, django-cors-headers, django-filter

---

## File Structure

```
AutomatedLoader/
├── loader/                          # Django project config
│   ├── __init__.py
│   ├── settings.py                  # Main settings (django-environ)
│   ├── urls.py                      # Root URL conf
│   ├── wsgi.py
│   ├── asgi.py
│   └── pagination.py                # FlexiblePageNumberPagination
├── apps/
│   ├── __init__.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── models.py                # Tenant, User
│   │   ├── serializers.py           # Auth serializers
│   │   ├── views.py                 # Login, logout, current-user, CSRF
│   │   ├── middleware.py            # TenantMiddleware
│   │   ├── mixins.py                # TenantQuerySetMixin
│   │   ├── urls.py                  # Auth routes
│   │   ├── admin.py
│   │   └── tests/
│   │       ├── __init__.py
│   │       ├── test_models.py
│   │       ├── test_middleware.py
│   │       └── test_auth.py
│   └── scheduling/
│       ├── __init__.py
│       ├── models.py                # All scheduling models
│       ├── serializers.py           # All CRUD serializers
│       ├── views.py                 # All viewsets
│       ├── urls.py                  # Router registration
│       ├── conflicts.py             # Conflict detection logic
│       ├── admin.py
│       └── tests/
│           ├── __init__.py
│           ├── test_models.py
│           ├── test_api.py
│           └── test_conflicts.py
├── manage.py
├── requirements.txt
├── .env.example
├── .gitignore
└── pytest.ini
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `requirements.txt`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `manage.py`
- Create: `loader/__init__.py`
- Create: `loader/settings.py`
- Create: `loader/urls.py`
- Create: `loader/wsgi.py`
- Create: `loader/asgi.py`
- Create: `loader/pagination.py`
- Create: `pytest.ini`
- Create: `apps/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
Django==5.1.4
psycopg2-binary==2.9.10
django-environ==0.11.2
djangorestframework==3.15.2
django-cors-headers==4.6.0
django-filter==24.3
redis==5.2.1
openpyxl==3.1.5
pytest==8.3.4
pytest-django==4.9.0
```

- [ ] **Step 2: Create .env.example**

```
DEBUG=True
SECRET_KEY=change-me-to-a-random-secret-key
DATABASE_URL=postgres://loader:loader@127.0.0.1:5432/automated_loader
REDIS_URL=redis://127.0.0.1:6379/0
ALLOWED_HOSTS=localhost,127.0.0.1,.localhost
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

- [ ] **Step 3: Create .gitignore**

```
__pycache__/
*.pyc
*.pyo
db.sqlite3
.env
*.egg-info/
dist/
build/
node_modules/
frontend/dist/
.venv/
venv/
*.log
.DS_Store
```

- [ ] **Step 4: Create manage.py**

```python
#!/usr/bin/env python
import os
import sys

def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'loader.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
```

- [ ] **Step 5: Create loader/settings.py**

```python
import os
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ['localhost', '127.0.0.1']),
)
environ.Env.read_env(BASE_DIR / '.env')

SECRET_KEY = env('SECRET_KEY')
DEBUG = env('DEBUG')
ALLOWED_HOSTS = env('ALLOWED_HOSTS')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'corsheaders',
    'django_filters',
    # Local
    'apps.core',
    'apps.scheduling',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'apps.core.middleware.TenantMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'loader.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'loader.wsgi.application'

DATABASES = {
    'default': env.db('DATABASE_URL', default='sqlite:///db.sqlite3'),
}

AUTH_USER_MODEL = 'core.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Manila'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=['http://localhost:5173'])
CORS_ALLOW_CREDENTIALS = True

# CSRF
CSRF_TRUSTED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=['http://localhost:5173'])

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'loader.pagination.FlexiblePageNumberPagination',
    'PAGE_SIZE': 25,
}
```

- [ ] **Step 6: Create loader/urls.py**

```python
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/loader/', include('apps.core.urls')),
    path('api/loader/', include('apps.scheduling.urls')),
]
```

- [ ] **Step 7: Create loader/wsgi.py and loader/asgi.py**

`loader/wsgi.py`:
```python
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'loader.settings')
application = get_wsgi_application()
```

`loader/asgi.py`:
```python
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'loader.settings')
application = get_asgi_application()
```

- [ ] **Step 8: Create loader/pagination.py**

```python
from rest_framework.pagination import PageNumberPagination


class FlexiblePageNumberPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 1000
```

- [ ] **Step 9: Create loader/__init__.py and apps/__init__.py**

Both are empty files.

- [ ] **Step 10: Create pytest.ini**

```ini
[pytest]
DJANGO_SETTINGS_MODULE = loader.settings
python_files = tests.py test_*.py
python_classes = Test*
python_functions = test_*
```

- [ ] **Step 11: Create .env from .env.example and install dependencies**

```bash
cd /home/classify/AutomatedLoader
cp .env.example .env
# Edit .env with a real SECRET_KEY:
# python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

- [ ] **Step 12: Verify Django starts**

```bash
cd /home/classify/AutomatedLoader
source .venv/bin/activate
python manage.py check
```

Expected: `System check identified no issues` (may warn about unapplied migrations — that's fine at this stage)

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: scaffold Django project with settings, DRF, and CORS config"
```

---

## Task 2: Core App — Tenant and User Models

**Files:**
- Create: `apps/core/__init__.py`
- Create: `apps/core/models.py`
- Create: `apps/core/admin.py`
- Create: `apps/core/apps.py`
- Create: `apps/core/tests/__init__.py`
- Create: `apps/core/tests/test_models.py`

- [ ] **Step 1: Create apps/core/apps.py**

```python
from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'
    label = 'core'
```

- [ ] **Step 2: Write failing tests for Tenant and User**

`apps/core/tests/test_models.py`:

```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/classify/AutomatedLoader
source .venv/bin/activate
pytest apps/core/tests/test_models.py -v
```

Expected: FAIL — `ImportError: cannot import name 'Tenant'`

- [ ] **Step 4: Implement Tenant and User models**

`apps/core/models.py`:

```python
from django.contrib.auth.models import AbstractUser
from django.db import models


class Tenant(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active'
        SUSPENDED = 'SUSPENDED', 'Suspended'
        TRIAL = 'TRIAL', 'Trial'

    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_tenants'

    def __str__(self):
        return self.name


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Admin'
        REGISTRAR = 'REGISTRAR', 'Registrar'
        VIEWER = 'VIEWER', 'Viewer'

    tenant = models.ForeignKey(
        Tenant, on_delete=models.PROTECT, null=True, blank=True, related_name='users',
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)

    class Meta:
        db_table = 'core_users'

    def __str__(self):
        return self.username
```

- [ ] **Step 5: Create admin.py**

`apps/core/admin.py`:

```python
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Tenant, User


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'status', 'created_at']
    search_fields = ['name', 'slug']
    list_filter = ['status']


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'tenant', 'role', 'is_active']
    list_filter = ['role', 'tenant', 'is_active']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Tenant', {'fields': ('tenant', 'role')}),
    )
```

- [ ] **Step 6: Run migrations and tests**

```bash
cd /home/classify/AutomatedLoader
source .venv/bin/activate
python manage.py makemigrations core
python manage.py migrate
pytest apps/core/tests/test_models.py -v
```

Expected: All 4 tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Tenant and User models with tests"
```

---

## Task 3: Tenant Middleware and Mixins

**Files:**
- Create: `apps/core/middleware.py`
- Create: `apps/core/mixins.py`
- Create: `apps/core/tests/test_middleware.py`

- [ ] **Step 1: Write failing tests for TenantMiddleware**

`apps/core/tests/test_middleware.py`:

```python
import pytest
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
        request.user = User(is_anonymous=True)  # Anonymous
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest apps/core/tests/test_middleware.py -v
```

Expected: FAIL — `ImportError: cannot import name 'TenantMiddleware'`

- [ ] **Step 3: Implement TenantMiddleware**

`apps/core/middleware.py`:

```python
from django.http import JsonResponse

from .models import Tenant

PUBLIC_PREFIXES = ('/admin/', '/static/', '/api/loader/auth/')


class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.tenant = None

        # Skip tenant check for public routes
        if any(request.path.startswith(p) for p in PUBLIC_PREFIXES):
            return self.get_response(request)

        # Try subdomain detection
        host = request.get_host().split(':')[0]
        parts = host.split('.')
        if len(parts) > 2:
            slug = parts[0]
            try:
                request.tenant = Tenant.objects.get(slug=slug)
            except Tenant.DoesNotExist:
                pass

        # Fall back to authenticated user's tenant
        if request.tenant is None and hasattr(request, 'user') and request.user.is_authenticated:
            request.tenant = getattr(request.user, 'tenant', None)

        # Check tenant status
        if request.tenant and request.tenant.status == 'SUSPENDED':
            return JsonResponse(
                {'detail': 'This account has been suspended.'},
                status=403,
            )

        return self.get_response(request)
```

- [ ] **Step 4: Implement TenantQuerySetMixin**

`apps/core/mixins.py`:

```python
class TenantQuerySetMixin:
    """Filters queryset by the authenticated user's tenant and auto-sets tenant on create."""

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self.request, 'tenant', None)
        if tenant:
            return qs.filter(tenant=tenant)
        if hasattr(self.request.user, 'tenant') and self.request.user.tenant:
            return qs.filter(tenant=self.request.user.tenant)
        return qs.none()

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None) or self.request.user.tenant
        serializer.save(tenant=tenant)
```

- [ ] **Step 5: Run tests**

```bash
pytest apps/core/tests/test_middleware.py -v
```

Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add TenantMiddleware and TenantQuerySetMixin"
```

---

## Task 4: Auth Endpoints (Login, Logout, CSRF, Current User)

**Files:**
- Create: `apps/core/serializers.py`
- Create: `apps/core/views.py`
- Create: `apps/core/urls.py`
- Create: `apps/core/tests/test_auth.py`

- [ ] **Step 1: Write failing tests for auth endpoints**

`apps/core/tests/test_auth.py`:

```python
import pytest
from django.test import TestCase
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest apps/core/tests/test_auth.py -v
```

Expected: FAIL — `ImportError` or 404 errors

- [ ] **Step 3: Implement auth serializers**

`apps/core/serializers.py`:

```python
from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import User


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            username=attrs['username'],
            password=attrs['password'],
        )
        if not user:
            raise serializers.ValidationError('Invalid credentials.')
        if not user.is_active:
            raise serializers.ValidationError('Account is disabled.')
        attrs['user'] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    tenant_id = serializers.IntegerField(source='tenant.pk', read_only=True, default=None)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True, default='')

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'tenant_id', 'tenant_name', 'is_active']
        read_only_fields = fields
```

- [ ] **Step 4: Implement auth views**

`apps/core/views.py`:

```python
from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .serializers import LoginSerializer, UserSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    login(request, user)
    return Response(UserSerializer(user).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response({'detail': 'Logged out.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_view(request):
    return Response(UserSerializer(request.user).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def csrf_view(request):
    return Response({'csrfToken': get_token(request)})
```

- [ ] **Step 5: Create auth URLs**

`apps/core/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path('auth/login/', views.login_view, name='login'),
    path('auth/logout/', views.logout_view, name='logout'),
    path('auth/me/', views.current_user_view, name='current-user'),
    path('auth/csrf/', views.csrf_view, name='csrf'),
]
```

- [ ] **Step 6: Run tests**

```bash
pytest apps/core/tests/test_auth.py -v
```

Expected: All 5 tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add auth endpoints — login, logout, current user, CSRF"
```

---

## Task 5: Scheduling Models — Academic Structure

**Files:**
- Create: `apps/scheduling/__init__.py`
- Create: `apps/scheduling/apps.py`
- Create: `apps/scheduling/models.py` (partial — academic structure)
- Create: `apps/scheduling/admin.py`
- Create: `apps/scheduling/tests/__init__.py`
- Create: `apps/scheduling/tests/test_models.py`

- [ ] **Step 1: Create apps/scheduling/apps.py**

```python
from django.apps import AppConfig


class SchedulingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.scheduling'
    label = 'scheduling'
```

- [ ] **Step 2: Write failing tests for academic structure models**

`apps/scheduling/tests/test_models.py`:

```python
import pytest
from apps.core.models import Tenant
from apps.scheduling.models import AcademicPeriod, Program, Department, Course, Section

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
        # Same tenant, same year/semester should fail
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pytest apps/scheduling/tests/test_models.py -v
```

Expected: FAIL — `ImportError`

- [ ] **Step 4: Implement academic structure models**

`apps/scheduling/models.py`:

```python
from django.db import models


class AcademicPeriod(models.Model):
    class Semester(models.TextChoices):
        FIRST = '1ST', '1st Semester'
        SECOND = '2ND', '2nd Semester'
        SUMMER = 'SUMMER', 'Summer'

    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        ACTIVE = 'ACTIVE', 'Active'
        ARCHIVED = 'ARCHIVED', 'Archived'

    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='academic_periods')
    name = models.CharField(max_length=255)
    year_start = models.PositiveSmallIntegerField()
    year_end = models.PositiveSmallIntegerField()
    semester = models.CharField(max_length=10, choices=Semester.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'scheduling_academic_periods'
        unique_together = [('tenant', 'year_start', 'year_end', 'semester')]
        ordering = ['-year_start', '-year_end', 'semester']

    def __str__(self):
        return self.name


class Program(models.Model):
    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='programs')
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_programs'
        unique_together = [('tenant', 'code')]
        ordering = ['code']

    def __str__(self):
        return self.code


class Department(models.Model):
    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='departments')
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_departments'
        unique_together = [('tenant', 'code')]
        ordering = ['code']

    def __str__(self):
        return self.code


class Course(models.Model):
    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='courses')
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='courses')
    code = models.CharField(max_length=30)
    title = models.CharField(max_length=255)
    lec_units = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    lab_units = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    contact_hours = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    has_lab = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_courses'
        unique_together = [('tenant', 'code')]
        ordering = ['code']

    @property
    def total_units(self):
        return self.lec_units + self.lab_units

    def __str__(self):
        return self.code


class Section(models.Model):
    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='sections')
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='sections')
    academic_period = models.ForeignKey(AcademicPeriod, on_delete=models.CASCADE, related_name='sections')
    year_level = models.PositiveSmallIntegerField()
    section_number = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_sections'
        unique_together = [('tenant', 'program', 'academic_period', 'year_level', 'section_number')]
        ordering = ['program__code', 'year_level', 'section_number']

    def __str__(self):
        return f'{self.program.code} {self.year_level}-{self.section_number}'
```

- [ ] **Step 5: Create admin.py**

`apps/scheduling/admin.py`:

```python
from django.contrib import admin

from .models import AcademicPeriod, Program, Department, Course, Section


@admin.register(AcademicPeriod)
class AcademicPeriodAdmin(admin.ModelAdmin):
    list_display = ['name', 'semester', 'year_start', 'year_end', 'status', 'tenant']
    list_filter = ['status', 'semester', 'tenant']


@admin.register(Program)
class ProgramAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'tenant']
    search_fields = ['code', 'name']


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'tenant']
    search_fields = ['code', 'name']


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ['code', 'title', 'department', 'lec_units', 'lab_units', 'has_lab', 'tenant']
    list_filter = ['has_lab', 'department']
    search_fields = ['code', 'title']


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'program', 'year_level', 'section_number', 'academic_period', 'tenant']
    list_filter = ['program', 'year_level', 'academic_period']
```

- [ ] **Step 6: Run migrations and tests**

```bash
python manage.py makemigrations scheduling
python manage.py migrate
pytest apps/scheduling/tests/test_models.py -v
```

Expected: All 6 tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add academic structure models — AcademicPeriod, Program, Department, Course, Section"
```

---

## Task 6: Scheduling Models — Faculty, Room, ScheduleEntry, ScheduleConfig

**Files:**
- Modify: `apps/scheduling/models.py` (add Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig)
- Modify: `apps/scheduling/admin.py` (register new models)
- Modify: `apps/scheduling/tests/test_models.py` (add new tests)

- [ ] **Step 1: Write failing tests for Faculty, Room, ScheduleEntry**

Append to `apps/scheduling/tests/test_models.py`:

```python
from apps.scheduling.models import Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig
import datetime
import uuid


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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest apps/scheduling/tests/test_models.py -v -k "Faculty or Room or ScheduleEntry or ScheduleConfig"
```

Expected: FAIL — `ImportError`

- [ ] **Step 3: Implement Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig**

Append to `apps/scheduling/models.py`:

```python
import uuid


class Faculty(models.Model):
    class EmploymentType(models.TextChoices):
        FULL_TIME = 'FULL_TIME', 'Full-Time'
        PART_TIME = 'PART_TIME', 'Part-Time'

    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='faculty_members')
    name = models.CharField(max_length=255)
    employment_type = models.CharField(max_length=20, choices=EmploymentType.choices)
    priority_level = models.PositiveSmallIntegerField(default=0)
    max_load_units = models.DecimalField(max_digits=5, decimal_places=1, default=24)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_faculty'
        unique_together = [('tenant', 'name')]
        ordering = ['name']
        verbose_name_plural = 'faculty'

    def __str__(self):
        return self.name


class FacultyAvailability(models.Model):
    class DayOfWeek(models.TextChoices):
        MON = 'MON', 'Monday'
        TUE = 'TUE', 'Tuesday'
        WED = 'WED', 'Wednesday'
        THU = 'THU', 'Thursday'
        FRI = 'FRI', 'Friday'
        SAT = 'SAT', 'Saturday'
        SUN = 'SUN', 'Sunday'

    class AvailabilityType(models.TextChoices):
        AVAILABLE = 'AVAILABLE', 'Available'
        PREFERRED = 'PREFERRED', 'Preferred'
        UNAVAILABLE = 'UNAVAILABLE', 'Unavailable'

    faculty = models.ForeignKey(Faculty, on_delete=models.CASCADE, related_name='availability_slots')
    academic_period = models.ForeignKey(AcademicPeriod, on_delete=models.CASCADE, related_name='faculty_availability')
    day_of_week = models.CharField(max_length=3, choices=DayOfWeek.choices)
    time_start = models.TimeField()
    time_end = models.TimeField()
    availability_type = models.CharField(max_length=15, choices=AvailabilityType.choices, default=AvailabilityType.AVAILABLE)

    class Meta:
        db_table = 'scheduling_faculty_availability'
        verbose_name_plural = 'faculty availability'

    def __str__(self):
        return f'{self.faculty.name} — {self.day_of_week} {self.time_start}-{self.time_end}'


class Room(models.Model):
    class RoomType(models.TextChoices):
        LECTURE = 'LECTURE', 'Lecture'
        LABORATORY = 'LABORATORY', 'Laboratory'
        COMPUTER_LAB = 'COMPUTER_LAB', 'Computer Lab'
        AVR = 'AVR', 'AVR'
        OTHER = 'OTHER', 'Other'

    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='rooms')
    name = models.CharField(max_length=100)
    room_type = models.CharField(max_length=20, choices=RoomType.choices)
    capacity = models.PositiveSmallIntegerField(default=0)
    building = models.CharField(max_length=100, blank=True, default='')
    floor = models.PositiveSmallIntegerField(default=1)
    sequence_number = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scheduling_rooms'
        unique_together = [('tenant', 'name')]
        ordering = ['building', 'floor', 'sequence_number', 'name']

    def __str__(self):
        return self.name


class ScheduleEntry(models.Model):
    class DayOfWeek(models.TextChoices):
        MON = 'MON', 'Monday'
        TUE = 'TUE', 'Tuesday'
        WED = 'WED', 'Wednesday'
        THU = 'THU', 'Thursday'
        FRI = 'FRI', 'Friday'
        SAT = 'SAT', 'Saturday'
        SUN = 'SUN', 'Sunday'

    class EntryType(models.TextChoices):
        LECTURE = 'LECTURE', 'Lecture'
        LAB = 'LAB', 'Lab'

    class LoadClassification(models.TextChoices):
        REGULAR = 'REGULAR', 'Regular'
        OVERLOAD = 'OVERLOAD', 'Overload'
        BUILT_IN = 'BUILT_IN', 'Built-In'
        PART_TIME = 'PART_TIME', 'Part-Time'

    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='schedule_entries')
    academic_period = models.ForeignKey(AcademicPeriod, on_delete=models.CASCADE, related_name='schedule_entries')
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='schedule_entries')
    faculty = models.ForeignKey(Faculty, on_delete=models.SET_NULL, null=True, blank=True, related_name='schedule_entries')
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='schedule_entries')
    sections = models.ManyToManyField(Section, related_name='schedule_entries', blank=True)
    day_of_week = models.CharField(max_length=3, choices=DayOfWeek.choices)
    time_start = models.TimeField()
    time_end = models.TimeField()
    group_id = models.UUIDField(default=uuid.uuid4)
    entry_type = models.CharField(max_length=10, choices=EntryType.choices, default=EntryType.LECTURE)
    load_classification = models.CharField(max_length=20, choices=LoadClassification.choices, default=LoadClassification.REGULAR)
    class_size = models.PositiveSmallIntegerField(default=0)
    faculty_credits = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    remarks = models.TextField(blank=True, default='')
    linked_entry = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='linked_from')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'scheduling_entries'
        ordering = ['day_of_week', 'time_start']
        indexes = [
            models.Index(fields=['tenant', 'academic_period', 'day_of_week', 'time_start', 'time_end']),
            models.Index(fields=['tenant', 'academic_period', 'faculty']),
            models.Index(fields=['tenant', 'academic_period', 'room']),
            models.Index(fields=['group_id']),
        ]

    def __str__(self):
        return f'{self.course.code} {self.day_of_week} {self.time_start}-{self.time_end}'


class ScheduleConfig(models.Model):
    tenant = models.ForeignKey('core.Tenant', on_delete=models.CASCADE, related_name='schedule_configs')
    academic_period = models.OneToOneField(AcademicPeriod, on_delete=models.CASCADE, related_name='config')
    earliest_start_time = models.TimeField(default='07:00')
    latest_end_time = models.TimeField(default='21:00')
    time_slot_granularity_minutes = models.PositiveSmallIntegerField(default=30)
    operating_days = models.JSONField(default=list)
    break_periods = models.JSONField(default=list, blank=True)
    weight_faculty_priority = models.PositiveSmallIntegerField(default=50)
    weight_room_proximity = models.PositiveSmallIntegerField(default=50)
    weight_time_gap_minimization = models.PositiveSmallIntegerField(default=30)
    weight_load_distribution = models.PositiveSmallIntegerField(default=30)

    class Meta:
        db_table = 'scheduling_config'

    def __str__(self):
        return f'Config for {self.academic_period}'
```

- [ ] **Step 4: Register new models in admin.py**

Append to `apps/scheduling/admin.py`:

```python
from .models import Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig


@admin.register(Faculty)
class FacultyAdmin(admin.ModelAdmin):
    list_display = ['name', 'employment_type', 'priority_level', 'max_load_units', 'tenant']
    list_filter = ['employment_type', 'tenant']
    search_fields = ['name']


@admin.register(FacultyAvailability)
class FacultyAvailabilityAdmin(admin.ModelAdmin):
    list_display = ['faculty', 'day_of_week', 'time_start', 'time_end', 'availability_type']
    list_filter = ['day_of_week', 'availability_type']


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ['name', 'room_type', 'capacity', 'building', 'floor', 'tenant']
    list_filter = ['room_type', 'building', 'tenant']
    search_fields = ['name']


@admin.register(ScheduleEntry)
class ScheduleEntryAdmin(admin.ModelAdmin):
    list_display = ['course', 'faculty', 'room', 'day_of_week', 'time_start', 'time_end', 'entry_type']
    list_filter = ['day_of_week', 'entry_type', 'load_classification']


@admin.register(ScheduleConfig)
class ScheduleConfigAdmin(admin.ModelAdmin):
    list_display = ['academic_period', 'earliest_start_time', 'latest_end_time', 'tenant']
```

- [ ] **Step 5: Run migrations and tests**

```bash
python manage.py makemigrations scheduling
python manage.py migrate
pytest apps/scheduling/tests/test_models.py -v
```

Expected: All 12 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Faculty, Room, ScheduleEntry, ScheduleConfig models with tests"
```

---

## Task 7: CRUD API — Academic Structure Serializers and ViewSets

**Files:**
- Create: `apps/scheduling/serializers.py`
- Create: `apps/scheduling/views.py`
- Create: `apps/scheduling/urls.py`
- Create: `apps/scheduling/tests/test_api.py`

- [ ] **Step 1: Write failing tests for academic structure CRUD**

`apps/scheduling/tests/test_api.py`:

```python
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
        response = auth_client.get('/api/loader/academic-periods/')
        assert response.status_code == 200
        assert response.data['count'] == 1

    def test_create(self, auth_client):
        response = auth_client.post('/api/loader/academic-periods/', {
            'name': '2S 25-26',
            'year_start': 2025,
            'year_end': 2026,
            'semester': '2ND',
        })
        assert response.status_code == 201
        assert response.data['name'] == '2S 25-26'
        # tenant should be auto-set
        assert AcademicPeriod.objects.count() == 1

    def test_tenant_isolation(self, auth_client, period):
        other_tenant = Tenant.objects.create(name='Other', slug='other', status='ACTIVE')
        AcademicPeriod.objects.create(
            tenant=other_tenant, name='Other Period', year_start=2025,
            year_end=2026, semester='2ND', status='DRAFT',
        )
        response = auth_client.get('/api/loader/academic-periods/')
        assert response.data['count'] == 1  # only sees own tenant


class TestProgramAPI:
    def test_crud(self, auth_client):
        # Create
        response = auth_client.post('/api/loader/programs/', {'code': 'BSA', 'name': 'BS Agriculture'})
        assert response.status_code == 201
        pk = response.data['id']

        # Read
        response = auth_client.get(f'/api/loader/programs/{pk}/')
        assert response.data['code'] == 'BSA'

        # Update
        response = auth_client.patch(f'/api/loader/programs/{pk}/', {'name': 'BS Agri'})
        assert response.status_code == 200
        assert response.data['name'] == 'BS Agri'

        # Delete
        response = auth_client.delete(f'/api/loader/programs/{pk}/')
        assert response.status_code == 204


class TestDepartmentAPI:
    def test_list_and_create(self, auth_client):
        response = auth_client.post('/api/loader/departments/', {'code': 'Agri', 'name': 'Agriculture'})
        assert response.status_code == 201

        response = auth_client.get('/api/loader/departments/')
        assert response.data['count'] == 1


class TestCourseAPI:
    def test_create_with_department(self, auth_client, tenant):
        dept = Department.objects.create(tenant=tenant, code='Agri', name='Agriculture')
        response = auth_client.post('/api/loader/courses/', {
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
        response = auth_client.post('/api/loader/sections/', {
            'program': prog.pk,
            'academic_period': period.pk,
            'year_level': 1,
            'section_number': 1,
        })
        assert response.status_code == 201
        assert response.data['display_name'] == 'BSA 1-1'
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest apps/scheduling/tests/test_api.py -v
```

Expected: FAIL — 404 or `ImportError`

- [ ] **Step 3: Implement serializers**

`apps/scheduling/serializers.py`:

```python
from rest_framework import serializers

from .models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig,
)


class AcademicPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicPeriod
        fields = ['id', 'name', 'year_start', 'year_end', 'semester', 'status', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class ProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ['id', 'code', 'name', 'created_at']
        read_only_fields = ['created_at']


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'code', 'name', 'created_at']
        read_only_fields = ['created_at']


class CourseSerializer(serializers.ModelSerializer):
    total_units = serializers.DecimalField(max_digits=5, decimal_places=1, read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Course
        fields = [
            'id', 'department', 'department_name', 'code', 'title',
            'lec_units', 'lab_units', 'total_units', 'contact_hours',
            'has_lab', 'created_at',
        ]
        read_only_fields = ['created_at']


class SectionSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source='__str__', read_only=True)
    program_code = serializers.CharField(source='program.code', read_only=True)

    class Meta:
        model = Section
        fields = [
            'id', 'program', 'program_code', 'academic_period',
            'year_level', 'section_number', 'display_name', 'created_at',
        ]
        read_only_fields = ['created_at']


class FacultyAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = FacultyAvailability
        fields = ['id', 'academic_period', 'day_of_week', 'time_start', 'time_end', 'availability_type']


class FacultySerializer(serializers.ModelSerializer):
    class Meta:
        model = Faculty
        fields = [
            'id', 'name', 'employment_type', 'priority_level',
            'max_load_units', 'created_at',
        ]
        read_only_fields = ['created_at']


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = [
            'id', 'name', 'room_type', 'capacity', 'building',
            'floor', 'sequence_number', 'created_at',
        ]
        read_only_fields = ['created_at']


class ScheduleEntrySerializer(serializers.ModelSerializer):
    course_code = serializers.CharField(source='course.code', read_only=True)
    course_title = serializers.CharField(source='course.title', read_only=True)
    faculty_name = serializers.CharField(source='faculty.name', read_only=True, default='TBA')
    room_name = serializers.CharField(source='room.name', read_only=True)
    section_names = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleEntry
        fields = [
            'id', 'academic_period', 'course', 'course_code', 'course_title',
            'faculty', 'faculty_name', 'room', 'room_name',
            'sections', 'section_names',
            'day_of_week', 'time_start', 'time_end',
            'group_id', 'entry_type', 'load_classification',
            'class_size', 'faculty_credits', 'remarks',
            'linked_entry', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_section_names(self, obj):
        return [str(s) for s in obj.sections.all()]


class ScheduleConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduleConfig
        fields = [
            'id', 'academic_period',
            'earliest_start_time', 'latest_end_time',
            'time_slot_granularity_minutes', 'operating_days', 'break_periods',
            'weight_faculty_priority', 'weight_room_proximity',
            'weight_time_gap_minimization', 'weight_load_distribution',
        ]
```

- [ ] **Step 4: Implement viewsets**

`apps/scheduling/views.py`:

```python
from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.mixins import TenantQuerySetMixin
from .models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig,
)
from .serializers import (
    AcademicPeriodSerializer, ProgramSerializer, DepartmentSerializer,
    CourseSerializer, SectionSerializer,
    FacultySerializer, FacultyAvailabilitySerializer,
    RoomSerializer, ScheduleEntrySerializer, ScheduleConfigSerializer,
)


class AcademicPeriodViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = AcademicPeriod.objects.all()
    serializer_class = AcademicPeriodSerializer
    search_fields = ['name']
    ordering_fields = ['year_start', 'year_end', 'semester', 'created_at']
    filterset_fields = ['status', 'semester']


class ProgramViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Program.objects.all()
    serializer_class = ProgramSerializer
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name']


class DepartmentViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    search_fields = ['code', 'name']
    ordering_fields = ['code', 'name']


class CourseViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Course.objects.select_related('department').all()
    serializer_class = CourseSerializer
    search_fields = ['code', 'title']
    ordering_fields = ['code', 'title']
    filterset_fields = ['department', 'has_lab']


class SectionViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Section.objects.select_related('program', 'academic_period').all()
    serializer_class = SectionSerializer
    ordering_fields = ['year_level', 'section_number']
    filterset_fields = ['program', 'academic_period', 'year_level']


class FacultyViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Faculty.objects.all()
    serializer_class = FacultySerializer
    search_fields = ['name']
    ordering_fields = ['name', 'priority_level']
    filterset_fields = ['employment_type']


class FacultyAvailabilityViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = FacultyAvailability.objects.select_related('faculty', 'academic_period').all()
    serializer_class = FacultyAvailabilitySerializer
    filterset_fields = ['faculty', 'academic_period', 'day_of_week', 'availability_type']

    def get_queryset(self):
        qs = super().get_queryset()
        # Support nested URL: /faculty/:id/availability/
        faculty_pk = self.kwargs.get('faculty_pk')
        if faculty_pk:
            qs = qs.filter(faculty_id=faculty_pk)
        return qs

    def perform_create(self, serializer):
        faculty_pk = self.kwargs.get('faculty_pk')
        if faculty_pk:
            serializer.save(faculty_id=faculty_pk)
        else:
            super().perform_create(serializer)


class RoomViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    search_fields = ['name', 'building']
    ordering_fields = ['name', 'building', 'floor', 'capacity']
    filterset_fields = ['room_type', 'building']


class ScheduleEntryViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = ScheduleEntry.objects.select_related(
        'course', 'faculty', 'room', 'academic_period',
    ).prefetch_related('sections').all()
    serializer_class = ScheduleEntrySerializer
    filterset_fields = ['academic_period', 'faculty', 'room', 'day_of_week', 'entry_type', 'group_id']
    ordering_fields = ['day_of_week', 'time_start']


class ScheduleConfigViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = ScheduleConfig.objects.select_related('academic_period').all()
    serializer_class = ScheduleConfigSerializer
    filterset_fields = ['academic_period']
```

- [ ] **Step 5: Create URL router**

`apps/scheduling/urls.py`:

```python
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r'academic-periods', views.AcademicPeriodViewSet, basename='academic-period')
router.register(r'programs', views.ProgramViewSet, basename='program')
router.register(r'departments', views.DepartmentViewSet, basename='department')
router.register(r'courses', views.CourseViewSet, basename='course')
router.register(r'sections', views.SectionViewSet, basename='section')
router.register(r'faculty', views.FacultyViewSet, basename='faculty')
router.register(r'rooms', views.RoomViewSet, basename='room')
router.register(r'schedules', views.ScheduleEntryViewSet, basename='schedule')
router.register(r'config', views.ScheduleConfigViewSet, basename='config')

# Nested: /faculty/:id/availability/
faculty_availability_list = views.FacultyAvailabilityViewSet.as_view({
    'get': 'list', 'post': 'create',
})
faculty_availability_detail = views.FacultyAvailabilityViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})

urlpatterns = [
    path('', include(router.urls)),
    path('faculty/<int:faculty_pk>/availability/', faculty_availability_list, name='faculty-availability-list'),
    path('faculty/<int:faculty_pk>/availability/<int:pk>/', faculty_availability_detail, name='faculty-availability-detail'),
]
```

- [ ] **Step 6: Run tests**

```bash
pytest apps/scheduling/tests/test_api.py -v
```

Expected: All 8 tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add CRUD API for all scheduling models with tenant isolation"
```

---

## Task 8: Conflict Detection

**Files:**
- Create: `apps/scheduling/conflicts.py`
- Create: `apps/scheduling/tests/test_conflicts.py`
- Modify: `apps/scheduling/views.py` (add validation on create/update, add conflicts endpoint)
- Modify: `apps/scheduling/urls.py` (add conflicts route)

- [ ] **Step 1: Write failing tests for conflict detection**

`apps/scheduling/tests/test_conflicts.py`:

```python
import datetime
import uuid

import pytest

from apps.core.models import Tenant, User
from apps.scheduling.conflicts import detect_conflicts
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
        semester='1ST', status='DRAFT',
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
        building='Main', floor=1, sequence_number=1,
    )


@pytest.fixture
def section(tenant, period):
    prog = Program.objects.create(tenant=tenant, code='BSA', name='BSA')
    return Section.objects.create(
        tenant=tenant, program=prog, academic_period=period,
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


class TestDetectConflicts:
    def test_no_conflicts(self, tenant, period, course, faculty, room, section):
        entry = make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        result = detect_conflicts(entry)
        assert result['hard'] == []
        assert result['warnings'] == []

    def test_room_conflict(self, tenant, period, course, course2, faculty, room, section):
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])

        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        prog2 = Program.objects.create(tenant=tenant, code='BSF', name='BSF')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=1,
        )
        # Same room, overlapping time
        entry2 = make_entry(tenant, period, course2, faculty2, room, 'MON', (9, 0), (11, 0), [sec2])
        result = detect_conflicts(entry2)
        assert len(result['hard']) == 1
        assert result['hard'][0]['type'] == 'room'

    def test_faculty_conflict(self, tenant, period, course, course2, faculty, section):
        room1 = Room.objects.create(
            tenant=tenant, name='Room 101', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=1,
        )
        room2 = Room.objects.create(
            tenant=tenant, name='Room 102', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=2,
        )
        make_entry(tenant, period, course, faculty, room1, 'MON', (8, 0), (10, 0), [section])

        prog2 = Program.objects.create(tenant=tenant, code='BSF', name='BSF')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=1,
        )
        # Same faculty, different room, overlapping time
        entry2 = make_entry(tenant, period, course2, faculty, room2, 'MON', (9, 0), (11, 0), [sec2])
        result = detect_conflicts(entry2)
        assert any(c['type'] == 'faculty' for c in result['hard'])

    def test_section_conflict(self, tenant, period, course, course2, faculty, room, section):
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])

        faculty2 = Faculty.objects.create(
            tenant=tenant, name='Dr. Jones', employment_type='FULL_TIME',
            priority_level=3, max_load_units=24,
        )
        room2 = Room.objects.create(
            tenant=tenant, name='Room 102', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=2,
        )
        # Same section, overlapping time
        entry2 = make_entry(tenant, period, course2, faculty2, room2, 'MON', (9, 0), (11, 0), [section])
        result = detect_conflicts(entry2)
        assert any(c['type'] == 'section' for c in result['hard'])

    def test_no_conflict_different_day(self, tenant, period, course, course2, faculty, room, section):
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        # Same room/faculty/section but different day — no conflict
        entry2 = make_entry(tenant, period, course2, faculty, room, 'TUE', (8, 0), (10, 0), [section])
        result = detect_conflicts(entry2)
        assert result['hard'] == []

    def test_no_conflict_adjacent_times(self, tenant, period, course, course2, faculty, room, section):
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])
        # Starts exactly when the other ends — no overlap
        entry2 = make_entry(tenant, period, course2, faculty, room, 'MON', (10, 0), (12, 0), [section])
        result = detect_conflicts(entry2)
        assert result['hard'] == []

    def test_warning_overloaded_faculty(self, tenant, period, course, faculty, room, section):
        faculty.max_load_units = 3
        faculty.save()
        make_entry(tenant, period, course, faculty, room, 'MON', (8, 0), (10, 0), [section])

        course2 = Course.objects.create(
            tenant=tenant, department=course.department, code='CrSc 2', title='Crop 2',
            lec_units=3, lab_units=0, contact_hours=3, has_lab=False,
        )
        room2 = Room.objects.create(
            tenant=tenant, name='Room 102', room_type='LECTURE', capacity=40,
            building='Main', floor=1, sequence_number=2,
        )
        prog2 = Program.objects.create(tenant=tenant, code='BSF', name='BSF')
        sec2 = Section.objects.create(
            tenant=tenant, program=prog2, academic_period=period,
            year_level=1, section_number=1,
        )
        entry2 = make_entry(tenant, period, course2, faculty, room2, 'TUE', (8, 0), (10, 0), [sec2])
        result = detect_conflicts(entry2)
        assert any(w['type'] == 'overload' for w in result['warnings'])
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest apps/scheduling/tests/test_conflicts.py -v
```

Expected: FAIL — `ImportError: cannot import name 'detect_conflicts'`

- [ ] **Step 3: Implement conflict detection**

`apps/scheduling/conflicts.py`:

```python
from django.db.models import Q, Sum

from .models import ScheduleEntry


def _times_overlap(start1, end1, start2, end2):
    """Return True if two time ranges overlap (exclusive of touching endpoints)."""
    return start1 < end2 and start2 < end1


def _find_overlapping_entries(entry):
    """Return entries in the same period/day that overlap in time, excluding self."""
    return ScheduleEntry.objects.filter(
        tenant=entry.tenant,
        academic_period=entry.academic_period,
        day_of_week=entry.day_of_week,
        time_start__lt=entry.time_end,
        time_end__gt=entry.time_start,
    ).exclude(pk=entry.pk).select_related('course', 'faculty', 'room').prefetch_related('sections')


def detect_conflicts(entry):
    """
    Detect hard conflicts and warnings for a ScheduleEntry.

    Returns:
        {
            'hard': [{'type': 'room'|'faculty'|'section', 'message': str, 'conflicting_entry_id': int}, ...],
            'warnings': [{'type': str, 'message': str}, ...],
        }
    """
    hard = []
    warnings = []

    overlapping = _find_overlapping_entries(entry)
    entry_section_ids = set(entry.sections.values_list('pk', flat=True))

    for other in overlapping:
        # Room conflict
        if other.room_id == entry.room_id:
            hard.append({
                'type': 'room',
                'message': f'Room {entry.room} is already booked by {other.course.code} at {other.time_start}-{other.time_end}',
                'conflicting_entry_id': other.pk,
            })

        # Faculty conflict
        if entry.faculty_id and other.faculty_id == entry.faculty_id:
            hard.append({
                'type': 'faculty',
                'message': f'{entry.faculty} is already teaching {other.course.code} at {other.time_start}-{other.time_end}',
                'conflicting_entry_id': other.pk,
            })

        # Section conflict
        other_section_ids = set(other.sections.values_list('pk', flat=True))
        shared_sections = entry_section_ids & other_section_ids
        if shared_sections:
            hard.append({
                'type': 'section',
                'message': f'Section(s) already have {other.course.code} at {other.time_start}-{other.time_end}',
                'conflicting_entry_id': other.pk,
            })

    # Warnings
    if entry.faculty_id:
        # Faculty overload warning
        total_units = ScheduleEntry.objects.filter(
            tenant=entry.tenant,
            academic_period=entry.academic_period,
            faculty=entry.faculty,
        ).exclude(pk=entry.pk).aggregate(
            total=Sum('course__lec_units') + Sum('course__lab_units'),
        )
        # Sum current entry's units
        current_units = entry.course.lec_units + entry.course.lab_units
        existing_units = total_units.get('total') or 0
        if existing_units + current_units > entry.faculty.max_load_units:
            warnings.append({
                'type': 'overload',
                'message': f'{entry.faculty} would have {existing_units + current_units} units (max: {entry.faculty.max_load_units})',
            })

    # Room capacity warning
    if entry.class_size > entry.room.capacity and entry.room.capacity > 0:
        warnings.append({
            'type': 'capacity',
            'message': f'Class size ({entry.class_size}) exceeds room capacity ({entry.room.capacity})',
        })

    return {'hard': hard, 'warnings': warnings}
```

- [ ] **Step 4: Run tests**

```bash
pytest apps/scheduling/tests/test_conflicts.py -v
```

Expected: All 7 tests PASS

- [ ] **Step 5: Wire conflict detection into ScheduleEntryViewSet**

Add to `apps/scheduling/views.py` — modify `ScheduleEntryViewSet`:

```python
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from .conflicts import detect_conflicts


class ScheduleEntryViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = ScheduleEntry.objects.select_related(
        'course', 'faculty', 'room', 'academic_period',
    ).prefetch_related('sections').all()
    serializer_class = ScheduleEntrySerializer
    filterset_fields = ['academic_period', 'faculty', 'room', 'day_of_week', 'entry_type', 'group_id']
    ordering_fields = ['day_of_week', 'time_start']

    def perform_create(self, serializer):
        tenant = getattr(self.request, 'tenant', None) or self.request.user.tenant
        serializer.save(tenant=tenant)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        entry = serializer.instance
        conflicts = detect_conflicts(entry)
        data = serializer.data
        data['conflicts'] = conflicts
        if conflicts['hard']:
            data['conflict_warning'] = 'This entry has hard conflicts — consider resolving them.'
        return Response(data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        entry = serializer.instance
        conflicts = detect_conflicts(entry)
        data = serializer.data
        data['conflicts'] = conflicts
        return Response(data)

    @action(detail=False, methods=['get'])
    def conflicts(self, request):
        """List all conflicts across the current academic period."""
        period_id = request.query_params.get('academic_period')
        if not period_id:
            return Response(
                {'detail': 'academic_period query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entries = self.get_queryset().filter(academic_period_id=period_id)
        all_conflicts = []
        for entry in entries:
            result = detect_conflicts(entry)
            if result['hard'] or result['warnings']:
                all_conflicts.append({
                    'entry_id': entry.pk,
                    'entry': str(entry),
                    **result,
                })
        return Response(all_conflicts)
```

- [ ] **Step 6: Run all tests**

```bash
pytest -v
```

Expected: All tests PASS (model tests + API tests + conflict tests)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add conflict detection with room/faculty/section checks and overload warnings"
```

---

## Task 9: Create Superuser and Verify End-to-End

- [ ] **Step 1: Create the PostgreSQL database**

```bash
sudo -u postgres createdb automated_loader
sudo -u postgres createuser loader --createdb
sudo -u postgres psql -c "ALTER USER loader WITH PASSWORD 'loader';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE automated_loader TO loader;"
```

- [ ] **Step 2: Run all migrations**

```bash
cd /home/classify/AutomatedLoader
source .venv/bin/activate
python manage.py migrate
```

Expected: All migrations applied successfully

- [ ] **Step 3: Create superuser**

```bash
DJANGO_SUPERUSER_USERNAME=admin DJANGO_SUPERUSER_PASSWORD=admin123 DJANGO_SUPERUSER_EMAIL=admin@test.com \
  python manage.py createsuperuser --noinput
```

- [ ] **Step 4: Start dev server and verify admin**

```bash
python manage.py runserver 0.0.0.0:8000
```

Open `http://127.0.0.1:8000/admin/` — log in with admin/admin123. Verify all models appear.

- [ ] **Step 5: Test API with curl**

```bash
# Get CSRF token
curl -c cookies.txt http://127.0.0.1:8000/api/loader/auth/csrf/

# Login
curl -b cookies.txt -c cookies.txt -X POST http://127.0.0.1:8000/api/loader/auth/login/ \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $(grep csrftoken cookies.txt | awk '{print $NF}')" \
  -d '{"username":"admin","password":"admin123"}'

# Create a program
curl -b cookies.txt -X POST http://127.0.0.1:8000/api/loader/programs/ \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $(grep csrftoken cookies.txt | awk '{print $NF}')" \
  -d '{"code":"BSA","name":"Bachelor of Science in Agriculture"}'
```

Expected: 201 responses with created objects

- [ ] **Step 6: Run full test suite one final time**

```bash
pytest -v --tb=short
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: finalize backend foundation — all models, APIs, and conflict detection"
```

---

## Summary

**What this plan builds:**
- Django project scaffold with settings, DRF, CORS, multi-tenancy
- 11 models: Tenant, User, AcademicPeriod, Program, Department, Course, Section, Faculty, FacultyAvailability, Room, ScheduleEntry, ScheduleConfig
- Full CRUD APIs at `/api/loader/` with tenant-scoped querysets
- Session-based authentication (login, logout, current user, CSRF)
- Conflict detection: room, faculty, and section hard conflicts; faculty overload and room capacity warnings
- 25+ tests covering models, auth, API CRUD, tenant isolation, and conflicts

**What comes next (separate plans):**
1. **Backend Logic** — suggestion engine, Excel import/export, dashboard stats, period cloning
2. **Frontend** — React + Vite scaffold, all 12 pages including Schedule Builder
