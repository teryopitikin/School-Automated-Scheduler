import datetime
import re
import uuid

from django.db import transaction

from .models import (
    AcademicPeriod, Program, Department, Course, Section,
    Faculty, Room, ScheduleEntry,
)


DAY_ABBREV_MAP = {
    'mon': 'MON', 'tue': 'TUE', 'wed': 'WED', 'thu': 'THU',
    'fri': 'FRI', 'sat': 'SAT', 'sun': 'SUN',
    'monday': 'MON', 'tuesday': 'TUE', 'wednesday': 'WED',
    'thursday': 'THU', 'friday': 'FRI', 'saturday': 'SAT', 'sunday': 'SUN',
    'th': 'THU', 'tu': 'TUE',
}

COMPOUND_DAYS = {
    'MW': ['MON', 'WED'],
    'MWF': ['MON', 'WED', 'FRI'],
    'TTh': ['TUE', 'THU'],
    'TTH': ['TUE', 'THU'],
    'MF': ['MON', 'FRI'],
    'WF': ['WED', 'FRI'],
}

CLASSIFICATION_MAP = {
    'regular': 'REGULAR',
    'overload': 'OVERLOAD',
    'built-in': 'BUILT_IN',
    'built in': 'BUILT_IN',
    'builtin': 'BUILT_IN',
    'part-time': 'PART_TIME',
    'part time': 'PART_TIME',
    'parttime': 'PART_TIME',
}


def normalize_days(raw):
    if raw is None:
        return []
    raw = str(raw).strip()
    if not raw:
        return []
    if raw in COMPOUND_DAYS:
        return COMPOUND_DAYS[raw]
    if '\n' in raw:
        result = []
        for line in raw.split('\n'):
            result.extend(normalize_days(line.strip()))
        return result
    lower = raw.lower().strip()
    if lower in DAY_ABBREV_MAP:
        return [DAY_ABBREV_MAP[lower]]
    return []


def parse_time(raw):
    if raw is None:
        return None
    if isinstance(raw, datetime.time):
        return raw
    raw = str(raw).strip()
    if not raw:
        return None
    if ' - ' in raw:
        raw = raw.split(' - ')[0].strip()
    raw = raw.rstrip('.')
    patterns = [
        r'^(\d{1,2}):(\d{2})\s*(AM|PM)$',
        r'^(\d{1,2}):(\d{2})\s*(A|P)$',
    ]
    for pattern in patterns:
        m = re.match(pattern, raw, re.IGNORECASE)
        if m:
            hour = int(m.group(1))
            minute = int(m.group(2))
            ampm = m.group(3).upper()
            if ampm in ('PM', 'P') and hour != 12:
                hour += 12
            elif ampm in ('AM', 'A') and hour == 12:
                hour = 0
            return datetime.time(hour, minute)
    return None


def parse_load_classification(raw, days):
    if raw is None or str(raw).strip() == '':
        return {d: 'REGULAR' for d in days}
    raw = str(raw).strip()
    if '\n' in raw:
        result = {}
        for line in raw.split('\n'):
            line = line.strip()
            if ' - ' in line:
                day_part, class_part = line.split(' - ', 1)
                day_codes = normalize_days(day_part.strip())
                classification = CLASSIFICATION_MAP.get(class_part.strip().lower(), 'REGULAR')
                for d in day_codes:
                    result[d] = classification
        for d in days:
            if d not in result:
                result[d] = 'REGULAR'
        return result
    classification = CLASSIFICATION_MAP.get(raw.lower(), 'REGULAR')
    return {d: classification for d in days}


def parse_section_string(raw):
    if raw is None:
        return []
    results = []
    for part in str(raw).split(','):
        part = part.strip()
        m = re.match(r'^(\S+)\s+(\d+)-(\d+)$', part)
        if m:
            results.append((m.group(1), int(m.group(2)), int(m.group(3))))
    return results


def import_excel(workbook, tenant, period):
    ws = workbook.active
    rows = list(ws.iter_rows(min_row=2, values_only=False))

    created = 0
    skipped = 0
    warnings = []
    conflicts_found = []

    from .conflicts import detect_conflicts

    with transaction.atomic():
        for row_idx, row in enumerate(rows, start=2):
            cells = {c.column_letter: c.value for c in row}

            if not cells.get('D'):
                continue

            program_code = str(cells.get('A', '') or '').strip()
            dept_code = str(cells.get('B', '') or '').strip()
            course_code = str(cells.get('D', '') or '').strip()
            course_title = str(cells.get('E', '') or '').strip()
            lec_units = cells.get('F') or 0
            lab_units = cells.get('G') or 0
            contact_hours = cells.get('I') or 0
            faculty_name = str(cells.get('L', '') or '').strip()
            days_raw = cells.get('N')
            time_in_raw = cells.get('O')
            time_out_raw = cells.get('P')
            room_name = str(cells.get('Q', '') or '').strip()
            section_raw = cells.get('R')
            load_class_raw = cells.get('S')
            class_size = cells.get('T') or 0
            remarks = str(cells.get('U', '') or '').strip()
            has_vw_data = cells.get('V') is not None or cells.get('W') is not None

            days = normalize_days(days_raw)
            if not days:
                warnings.append({'row': row_idx, 'reason': 'Could not parse days'})
                skipped += 1
                continue

            # Parse multi-line times
            time_in_parts = (
                str(time_in_raw).split('\n')
                if time_in_raw and '\n' in str(time_in_raw)
                else [time_in_raw]
            )
            time_out_parts = (
                str(time_out_raw).split('\n')
                if time_out_raw and '\n' in str(time_out_raw)
                else [time_out_raw]
            )
            if isinstance(time_in_raw, datetime.time):
                time_in_parts = [time_in_raw]
            if isinstance(time_out_raw, datetime.time):
                time_out_parts = [time_out_raw]

            time_ins = [parse_time(t) for t in time_in_parts]
            time_outs = [parse_time(t) for t in time_out_parts]

            if len(days) != len(time_ins) or len(days) != len(time_outs):
                if len(time_ins) == 1 and len(days) > 1:
                    time_ins = time_ins * len(days)
                    time_outs = time_outs * len(days)
                else:
                    warnings.append({
                        'row': row_idx,
                        'reason': (
                            f'Day/time count mismatch — '
                            f'{len(days)} days but {len(time_ins)} times'
                        ),
                    })
                    skipped += 1
                    continue

            if any(t is None for t in time_ins) or any(t is None for t in time_outs):
                warnings.append({'row': row_idx, 'reason': 'Could not parse time values'})
                skipped += 1
                continue

            load_map = parse_load_classification(load_class_raw, days)

            dept = None
            if dept_code:
                dept, _ = Department.objects.get_or_create(
                    tenant=tenant, code=dept_code, defaults={'name': dept_code},
                )

            has_lab = float(lab_units) > 0
            course, _ = Course.objects.get_or_create(
                tenant=tenant, code=course_code,
                defaults={
                    'department': dept or Department.objects.get_or_create(
                        tenant=tenant, code='GEN', defaults={'name': 'General'},
                    )[0],
                    'title': course_title,
                    'lec_units': lec_units,
                    'lab_units': lab_units,
                    'contact_hours': contact_hours,
                    'has_lab': has_lab,
                },
            )

            faculty = None
            if faculty_name and not faculty_name.upper().startswith('TBA'):
                is_part_time = any(v == 'PART_TIME' for v in load_map.values())
                faculty, _ = Faculty.objects.get_or_create(
                    tenant=tenant, name=faculty_name,
                    defaults={
                        'employment_type': 'PART_TIME' if is_part_time else 'FULL_TIME',
                        'max_load_units': 24,
                    },
                )

            room = None
            if room_name:
                room, _ = Room.objects.get_or_create(
                    tenant=tenant, name=room_name,
                    defaults={'room_type': 'LECTURE', 'capacity': 0},
                )

            if not room:
                warnings.append({'row': row_idx, 'reason': 'No room specified'})
                skipped += 1
                continue

            section_tuples = parse_section_string(section_raw)
            section_objects = []
            for prog_code, year_level, sec_num in section_tuples:
                prog, _ = Program.objects.get_or_create(
                    tenant=tenant, code=prog_code, defaults={'name': prog_code},
                )
                sec, _ = Section.objects.get_or_create(
                    tenant=tenant, program=prog, academic_period=period,
                    year_level=year_level, section_number=sec_num,
                )
                section_objects.append(sec)

            group = uuid.uuid4()
            faculty_credits = float(cells.get('M') or 0)

            for i, day in enumerate(days):
                entry = ScheduleEntry.objects.create(
                    tenant=tenant, academic_period=period,
                    course=course, faculty=faculty, room=room,
                    day_of_week=day,
                    time_start=time_ins[i], time_end=time_outs[i],
                    group_id=group, entry_type='LECTURE',
                    load_classification=load_map.get(day, 'REGULAR'),
                    class_size=int(class_size) if class_size else 0,
                    faculty_credits=faculty_credits,
                    remarks=remarks,
                )
                entry.sections.set(section_objects)
                created += 1

                conflict_result = detect_conflicts(entry)
                for c in conflict_result['hard']:
                    conflicts_found.append({
                        'row': row_idx,
                        'type': c['type'],
                        'message': c['message'],
                    })

            if has_vw_data:
                warnings.append({
                    'row': row_idx,
                    'reason': 'Columns V/W contain lab schedule data — review manually',
                })

    return {
        'created': created,
        'skipped': skipped,
        'warnings': warnings,
        'conflicts': conflicts_found,
    }
