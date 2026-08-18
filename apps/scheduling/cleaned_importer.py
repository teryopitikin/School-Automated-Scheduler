"""
Importer for the cleaned schedule workbook (the `import_cleaned.xlsx`
format: separate Day / Time Start / Time End columns, one Day-group per row).

Maps the cleaned columns onto Program / Course / Faculty / Room / Section /
ScheduleEntry, fanning each Day label (e.g. "M-W-F") out to one entry per day.
"""
import datetime
import re
import uuid
from decimal import Decimal

from django.db import transaction

from .conflicts import detect_conflicts
from .models import (
    AcademicPeriod, Program, Department, Course, Section, Faculty, Room,
    ScheduleEntry,
)

# reverse of the cleaned file's day abbreviations
LABEL_TO_DAY = {
    'M': 'MON', 'T': 'TUE', 'W': 'WED', 'TH': 'THU', 'F': 'FRI',
    'SAT': 'SAT', 'SUN': 'SUN',
}


def day_codes_from_label(label):
    """'M-W-F' -> ['MON','WED','FRI']; 'Sat' -> ['SAT']."""
    out = []
    for tok in str(label).split('-'):
        code = LABEL_TO_DAY.get(tok.strip().upper())
        if code:
            out.append(code)
    return out


def section_number_from(section):
    """Section letter -> number (A->1, B->2 ...). Default 1 when no letter."""
    m = re.search(r'(\d)\s*-?\s*([A-Za-z])(?![A-Za-z])', str(section))
    if not m:
        return 1
    return ord(m.group(2).upper()) - ord('A') + 1


def year_level_from(raw):
    m = re.search(r'\d+', str(raw))
    return int(m.group()) if m else 1


def units_from(raw):
    m = re.search(r'\d+(?:\.\d+)?', str(raw))
    return float(m.group()) if m else 0


def parse_clock(raw):
    """'1:00 PM' -> datetime.time(13, 0)."""
    return datetime.datetime.strptime(str(raw).strip(), '%I:%M %p').time()


def _cell(cells, header):
    v = cells.get(header)
    return '' if v is None else str(v).strip()


# ---------------------------------------------------------------------------
# Merged-class handling
# ---------------------------------------------------------------------------
# Credential suffixes that must not make two different people look alike.
_CREDENTIALS = {
    'LPT', 'MBA', 'MAED', 'TSS', 'COMS', 'CBE', 'CHRD', 'CHRA', 'CPA',
    'ATTY', 'ENGR', 'MSIT', 'MIT', 'PHD', 'EDD', 'MAN', 'LLB',
}


def _name_tokens(name):
    tokens = re.sub(r'[^A-Z ]', ' ', (name or '').upper()).split()
    return {t for t in tokens if len(t) > 2 and t not in _CREDENTIALS}


def names_compatible(a, b):
    """True when two faculty names plausibly refer to the same person
    (share a real name token — credentials like LPT don't count)."""
    ta, tb = _name_tokens(a), _name_tokens(b)
    return bool(ta and tb and (ta & tb))


def _course_key(code):
    return re.sub(r'[^A-Z0-9]', '', code.upper())


def merge_duplicate_slots(tenant, period):
    """Collapse a class listed once per section (same room + day + time +
    course, teacher names that match) into ONE entry with the sections
    combined. The fullest faculty name and the uppercase course code win.
    Entries with genuinely different teachers are left alone."""
    from collections import defaultdict

    groups = defaultdict(list)
    entries = ScheduleEntry.objects.filter(
        tenant=tenant, academic_period=period,
    ).select_related('course', 'faculty').prefetch_related('sections')
    for e in entries:
        key = (e.room_id, e.day_of_week, e.time_start, e.time_end,
               _course_key(e.course.code))
        groups[key].append(e)

    merged = 0
    for group in groups.values():
        if len(group) < 2:
            continue
        named = [e for e in group if e.faculty]
        ref = max(named, key=lambda e: len(e.faculty.name), default=None)
        if named and not all(
            names_compatible(ref.faculty.name, e.faculty.name) for e in named
        ):
            continue  # different people — a real conflict, keep both

        keeper = ref or group[0]
        canonical_course = next(
            (e.course for e in group if e.course.code == e.course.code.upper()),
            keeper.course,
        )
        if keeper.course_id != canonical_course.id:
            keeper.course = canonical_course
            keeper.save(update_fields=['course'])
        all_sections = {s for e in group for s in e.sections.all()}
        keeper.sections.set(all_sections)
        for e in group:
            if e.pk != keeper.pk:
                e.delete()
        merged += 1
    return merged


def import_cleaned(workbook, tenant, period):
    ws = workbook['Schedule'] if 'Schedule' in workbook.sheetnames else workbook.active
    header_row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
    headers = [h for h in header_row]

    created = 0
    warnings = []
    conflicts_found = []

    default_dept, _ = Department.objects.get_or_create(
        tenant=tenant, code='GEN', defaults={'name': 'General'},
    )

    with transaction.atomic():
        for row_idx, values in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            cells = dict(zip(headers, values))
            subject = _cell(cells, 'Subject Code')
            if not subject:
                continue

            days = day_codes_from_label(_cell(cells, 'Day'))
            if not days:
                warnings.append({'row': row_idx, 'reason': 'No day'})
                continue
            try:
                t_start = parse_clock(_cell(cells, 'Time Start'))
                t_end = parse_clock(_cell(cells, 'Time End'))
            except ValueError:
                warnings.append({'row': row_idx, 'reason': 'Bad time'})
                continue

            program_code = _cell(cells, 'Course') or 'GEN'
            program, _ = Program.objects.get_or_create(
                tenant=tenant, code=program_code, defaults={'name': program_code},
            )
            course, _ = Course.objects.get_or_create(
                tenant=tenant, code=subject,
                defaults={
                    'department': default_dept,
                    'title': _cell(cells, 'Descriptive Title'),
                    'lec_units': Decimal(str(units_from(_cell(cells, 'Units')))),
                    'lab_units': Decimal('0'),
                    'contact_hours': Decimal('0'),
                },
            )

            faculty = None
            fac_name = _cell(cells, 'Faculty Name')
            if fac_name and fac_name.upper() != 'TBA':
                faculty, _ = Faculty.objects.get_or_create(
                    tenant=tenant, name=fac_name,
                    # 999 = effectively no load cap: real per-teacher caps were
                    # never configured, so a low default only creates noise
                    # ("overloaded faculty" flags on every full schedule).
                    defaults={'employment_type': 'FULL_TIME', 'max_load_units': 999},
                )

            room_name = _cell(cells, 'Room Number') or 'TBA'
            room, _ = Room.objects.get_or_create(
                tenant=tenant, name=room_name,
                defaults={'room_type': 'LECTURE', 'capacity': 0},
            )

            section_obj = None
            section_raw = _cell(cells, 'Section')
            if section_raw:
                section_obj, _ = Section.objects.get_or_create(
                    tenant=tenant, program=program, academic_period=period,
                    year_level=year_level_from(_cell(cells, 'Year Level')),
                    section_number=section_number_from(section_raw),
                )

            group = uuid.uuid4()
            remarks = _cell(cells, 'Notes')
            for day in days:
                entry = ScheduleEntry.objects.create(
                    tenant=tenant, academic_period=period, course=course,
                    faculty=faculty, room=room, day_of_week=day,
                    time_start=t_start, time_end=t_end, group_id=group,
                    entry_type='LECTURE', load_classification='REGULAR',
                    remarks=remarks,
                )
                if section_obj:
                    entry.sections.set([section_obj])
                created += 1
                for c in detect_conflicts(entry)['hard']:
                    conflicts_found.append({
                        'row': row_idx, 'type': c['type'], 'message': c['message'],
                    })

        merged = merge_duplicate_slots(tenant, period)

    return {
        'created': created,
        'merged': merged,
        'skipped': warnings,
        'warnings': warnings,
        'conflicts': conflicts_found,
    }
