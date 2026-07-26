import datetime

import openpyxl
import pytest

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def tenant():
    from apps.core.models import Tenant
    return Tenant.objects.create(name='Uni', slug='uni', status='ACTIVE')


@pytest.fixture
def period(tenant):
    from apps.scheduling.models import AcademicPeriod
    return AcademicPeriod.objects.create(
        tenant=tenant, name='1S 26-27', year_start=2026, year_end=2027,
        semester='1ST', status='ACTIVE',
    )


CLEANED_HEADERS = [
    'Subject Code', 'Descriptive Title', 'Units', 'Semester',
    'Day', 'Time', 'Time Start', 'Time End', 'Meeting',
    'Room Number', 'Faculty Name', 'Course', 'Year Level', 'Section',
    'Original Time Schedule', 'Parse Status', 'Notes',
]


def make_wb(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Schedule'
    ws.append(CLEANED_HEADERS)
    for r in rows:
        ws.append(r)
    return wb


def row(**kw):
    """Build a cleaned-format row from keyword defaults."""
    d = {
        'Subject Code': 'CS 101', 'Descriptive Title': 'Intro', 'Units': '3',
        'Semester': 'First Semester 2026-2027', 'Day': 'M-W-F',
        'Time': '1:00 PM - 2:00 PM', 'Time Start': '1:00 PM', 'Time End': '2:00 PM',
        'Meeting': '', 'Room Number': 'Room 14', 'Faculty Name': 'DELA CRUZ, J',
        'Course': 'BSIT', 'Year Level': '1st Year', 'Section': 'BSIT 1A',
        'Original Time Schedule': 'MWF 1:00-2:00PM', 'Parse Status': 'OK', 'Notes': '',
    }
    d.update(kw)
    return [d[h] for h in CLEANED_HEADERS]


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------
class TestDayLabel:
    def test_mwf(self):
        from apps.scheduling.cleaned_importer import day_codes_from_label
        assert day_codes_from_label('M-W-F') == ['MON', 'WED', 'FRI']

    def test_tth(self):
        from apps.scheduling.cleaned_importer import day_codes_from_label
        assert day_codes_from_label('T-TH') == ['TUE', 'THU']

    def test_sat(self):
        from apps.scheduling.cleaned_importer import day_codes_from_label
        assert day_codes_from_label('Sat') == ['SAT']

    def test_thf(self):
        from apps.scheduling.cleaned_importer import day_codes_from_label
        assert day_codes_from_label('TH-F') == ['THU', 'FRI']


class TestSectionNumber:
    def test_dashed_prog(self):
        from apps.scheduling.cleaned_importer import section_number_from
        assert section_number_from('BSED-SST-1A') == 1

    def test_spaced_prog(self):
        from apps.scheduling.cleaned_importer import section_number_from
        assert section_number_from('BSIT 3A') == 1

    def test_nickname(self):
        from apps.scheduling.cleaned_importer import section_number_from
        assert section_number_from('1C - DURKHEIM') == 3  # C = 3rd section

    def test_bstm_dash(self):
        from apps.scheduling.cleaned_importer import section_number_from
        assert section_number_from('BSTM 1-A') == 1

    def test_placeholder_no_letter(self):
        from apps.scheduling.cleaned_importer import section_number_from
        assert section_number_from('4 REQUESTED') == 1  # no real letter -> default 1


class TestYearLevel:
    @pytest.mark.parametrize('raw,expected', [
        ('1st Year', 1), ('2nd Year', 2), ('3rd Year', 3), ('4th Year', 4),
    ])
    def test_year(self, raw, expected):
        from apps.scheduling.cleaned_importer import year_level_from
        assert year_level_from(raw) == expected


class TestUnits:
    def test_plain(self):
        from apps.scheduling.cleaned_importer import units_from
        assert units_from('3') == 3

    def test_parenthesized(self):
        from apps.scheduling.cleaned_importer import units_from
        assert units_from('(3)') == 3


class TestClock:
    def test_pm(self):
        from apps.scheduling.cleaned_importer import parse_clock
        assert parse_clock('1:00 PM') == datetime.time(13, 0)

    def test_noon(self):
        from apps.scheduling.cleaned_importer import parse_clock
        assert parse_clock('12:00 PM') == datetime.time(12, 0)

    def test_morning(self):
        from apps.scheduling.cleaned_importer import parse_clock
        assert parse_clock('8:00 AM') == datetime.time(8, 0)


# ---------------------------------------------------------------------------
# Integration
# ---------------------------------------------------------------------------
class TestImportCleaned:
    def test_mwf_creates_three_entries(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry, Program, Course, Faculty, Room
        result = import_cleaned(make_wb([row()]), tenant, period)
        assert result['created'] == 3           # M, W, F
        assert ScheduleEntry.objects.count() == 3
        assert set(ScheduleEntry.objects.values_list('day_of_week', flat=True)) == {'MON', 'WED', 'FRI'}
        assert Program.objects.filter(tenant=tenant, code='BSIT').exists()
        assert Course.objects.filter(tenant=tenant, code='CS 101').exists()
        assert Faculty.objects.filter(tenant=tenant, name='DELA CRUZ, J').exists()
        assert Room.objects.filter(tenant=tenant, name='Room 14').exists()

    def test_times_parsed(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry
        import_cleaned(make_wb([row()]), tenant, period)
        e = ScheduleEntry.objects.first()
        assert e.time_start == datetime.time(13, 0)
        assert e.time_end == datetime.time(14, 0)

    def test_section_linked(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry, Section
        import_cleaned(make_wb([row(Section='BSIT 1A', **{'Year Level': '1st Year'})]), tenant, period)
        sec = Section.objects.get(tenant=tenant)
        assert sec.year_level == 1 and sec.section_number == 1
        assert ScheduleEntry.objects.first().sections.filter(pk=sec.pk).exists()

    def test_tba_faculty_is_null(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry, Faculty
        import_cleaned(make_wb([row(**{'Faculty Name': 'TBA'})]), tenant, period)
        assert ScheduleEntry.objects.first().faculty is None
        assert not Faculty.objects.filter(name='TBA').exists()

    def test_notes_go_to_remarks(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry
        import_cleaned(make_wb([row(Day='W', Notes='F2F · every 1st and 3rd week')]), tenant, period)
        assert ScheduleEntry.objects.first().remarks == 'F2F · every 1st and 3rd week'

    def test_blank_section_creates_no_section(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry, Section
        import_cleaned(make_wb([row(Day='F', Section='')]), tenant, period)
        assert Section.objects.count() == 0
        assert ScheduleEntry.objects.first().sections.count() == 0

    def test_same_day_group_shared(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry
        import_cleaned(make_wb([row()]), tenant, period)
        groups = set(ScheduleEntry.objects.values_list('group_id', flat=True))
        assert len(groups) == 1   # the 3 daily rows share one group_id


# ---------------------------------------------------------------------------
# Merged-class handling (same slot, same course, same teacher variants)
# ---------------------------------------------------------------------------
class TestNamesCompatible:
    def test_surname_subset(self):
        from apps.scheduling.cleaned_importer import names_compatible
        assert names_compatible('ROSE ANN VALENZUELA', 'VALENZUELA')

    def test_credentials_ignored(self):
        from apps.scheduling.cleaned_importer import names_compatible
        assert not names_compatible('Mary Rose A. Murillo, LPT', 'Jurien-na Sanchez, LPT')

    def test_different_people(self):
        from apps.scheduling.cleaned_importer import names_compatible
        assert not names_compatible('PEREZ, JASPER', 'TIEMPO, NAL SEMPER')

    def test_punct_variants(self):
        from apps.scheduling.cleaned_importer import names_compatible
        assert names_compatible('Atty.May Codilla', 'Atty. May Codilla')


class TestMergeDuplicateSlots:
    def test_merges_name_variant_duplicates(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry
        wb = make_wb([
            row(Day='F', Section='BSED-ENG 1A', Course='BSED-ENG',
                **{'Faculty Name': 'ROSE ANN VALENZUELA', 'Subject Code': 'GE 107'}),
            row(Day='F', Section='BEED 1A', Course='BEED',
                **{'Faculty Name': 'VALENZUELA', 'Subject Code': 'GE 107'}),
        ])
        result = import_cleaned(wb, tenant, period)
        entries = ScheduleEntry.objects.all()
        assert entries.count() == 1
        e = entries.first()
        assert e.faculty.name == 'ROSE ANN VALENZUELA'   # fuller name kept
        assert e.sections.count() == 2                   # both sections attached
        assert result['merged'] == 1

    def test_does_not_merge_different_teachers(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry
        wb = make_wb([
            row(Day='F', Section='BSIT 2B', Course='BSIT',
                **{'Faculty Name': 'TIEMPO, NAL SEMPER', 'Subject Code': 'IT ELECT 2'}),
            row(Day='F', Section='BSIT 2C', Course='BSIT',
                **{'Faculty Name': 'PEREZ, JASPER', 'Subject Code': 'IT ELECT 2'}),
        ])
        result = import_cleaned(wb, tenant, period)
        assert ScheduleEntry.objects.count() == 2
        assert result['merged'] == 0

    def test_merges_case_variant_course_codes(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry
        wb = make_wb([
            row(Day='M', Section='BSED-ENG 1A', Course='BSED-ENG',
                **{'Faculty Name': 'DANIEL C. TORALBA', 'Subject Code': 'Prof Ed 100'}),
            row(Day='M', Section='BEED 1A', Course='BEED',
                **{'Faculty Name': 'TORALBA', 'Subject Code': 'PROF ED 100'}),
        ])
        import_cleaned(wb, tenant, period)
        entries = ScheduleEntry.objects.all()
        assert entries.count() == 1
        assert entries.first().course.code == 'PROF ED 100'  # uppercase kept

    def test_no_merge_across_different_times(self, tenant, period):
        from apps.scheduling.cleaned_importer import import_cleaned
        from apps.scheduling.models import ScheduleEntry
        wb = make_wb([
            row(Day='F', Section='BSIT 2A', Course='BSIT'),
            row(Day='F', Section='BSIT 2B', Course='BSIT',
                **{'Time Start': '3:00 PM', 'Time End': '4:00 PM'}),
        ])
        import_cleaned(wb, tenant, period)
        assert ScheduleEntry.objects.count() == 2
