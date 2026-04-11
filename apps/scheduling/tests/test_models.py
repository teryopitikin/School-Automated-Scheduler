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
