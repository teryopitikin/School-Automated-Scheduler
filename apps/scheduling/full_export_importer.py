"""Import a full-export workbook (the `<Period>_full_export.xlsx` format:
metadata sheets Programs / Departments / Courses / Faculty / Rooms /
Sections plus an `All Entries` sheet with one row per scheduled meeting).

Wipe-and-replace: deletes ALL scheduling data for the tenant (entries,
sections, courses, faculty, rooms, programs, departments — tenant, users
and academic periods survive), then rebuilds everything from the workbook.
Entries that share course+faculty+room+time across days are re-linked
under one group_id. Section labels may be joined with '+' or ','.
"""
import datetime
import re
import uuid
from collections import defaultdict
from decimal import Decimal

from django.db import transaction

from .models import (
    Course, Department, Faculty, Program, Room, ScheduleEntry, Section,
)

REQUIRED_SHEETS = ['Programs', 'Departments', 'Courses', 'Faculty', 'Rooms',
                   'Sections', 'All Entries']

WIPE_MODELS = (ScheduleEntry, Section, Course, Faculty, Room, Program,
               Department)


def missing_sheets(workbook):
    return [s for s in REQUIRED_SHEETS if s not in workbook.sheetnames]


def wipe_schedule(tenant):
    """Delete all scheduling data for the tenant (users, academic periods
    and config survive). Returns {model_name: deleted_count}."""
    wiped = {}
    with transaction.atomic():
        for model in WIPE_MODELS:
            qs = model.objects.filter(tenant=tenant)
            wiped[model.__name__] = qs.count()
            qs.delete()
    return wiped


def _parse_time(raw):
    if isinstance(raw, datetime.time):
        return raw
    return datetime.datetime.strptime(str(raw).strip(), '%H:%M:%S').time()


def _dec(raw):
    m = re.search(r'\d+(?:\.\d+)?', str(raw or ''))
    return Decimal(m.group()) if m else Decimal('0')


def _rows(ws):
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] is not None and str(r[0]).strip() != '':
            yield r


def import_full_export(workbook, tenant, period):
    """Wipe-and-replace import. Returns a summary dict."""
    with transaction.atomic():
        wiped = wipe_schedule(tenant)

        # ---- metadata sheets ------------------------------------------
        departments = {}
        for code, name in _rows(workbook['Departments']):
            departments[code] = Department.objects.create(
                tenant=tenant, code=code, name=name or code)
        if not departments:
            departments['GEN'] = Department.objects.create(
                tenant=tenant, code='GEN', name='General')
        default_dept = departments.get('GEN') or next(iter(departments.values()))

        programs = {}
        for code, name in _rows(workbook['Programs']):
            programs[code] = Program.objects.create(
                tenant=tenant, code=code, name=name or code)

        courses = {}
        for code, title, dept, lec, lab, has_lab in _rows(workbook['Courses']):
            courses[str(code).strip()] = Course.objects.create(
                tenant=tenant, code=str(code).strip(), title=title or '',
                department=departments.get(dept, default_dept),
                lec_units=_dec(lec), lab_units=_dec(lab),
                has_lab=str(has_lab).strip().lower() == 'yes',
            )

        faculty = {}
        for name, emp, priority, max_load in _rows(workbook['Faculty']):
            name = str(name).strip()
            faculty[name] = Faculty.objects.create(
                tenant=tenant, name=name,
                employment_type=emp or 'FULL_TIME',
                priority_level=int(priority or 0),
                max_load_units=_dec(max_load) or Decimal('999'),
            )

        rooms = {}
        for name, rtype, capacity, building, floor in _rows(workbook['Rooms']):
            name = str(name).strip()
            rooms[name] = Room.objects.create(
                tenant=tenant, name=name, room_type=rtype or 'LECTURE',
                capacity=int(capacity or 0), building=building or '',
                floor=int(floor or 1),
            )

        sections = {}  # label -> Section
        for prog, year, number, label in _rows(workbook['Sections']):
            program = programs.get(str(prog).strip())
            if program is None:
                program = programs.setdefault(
                    str(prog).strip(),
                    Program.objects.create(tenant=tenant, code=str(prog).strip(),
                                           name=str(prog).strip()))
            sections[str(label).strip()] = Section.objects.create(
                tenant=tenant, program=program, academic_period=period,
                year_level=int(year), section_number=int(number),
            )

        # ---- entries ---------------------------------------------------
        created = 0
        skipped = []
        unknown_sections = set()
        groups = defaultdict(uuid.uuid4)  # same class fanned across days
        for r in _rows(workbook['All Entries']):
            (_id, code, _title, secs, fac, room, day, start, end,
             etype, load, class_size, remarks) = r[:13]
            code = str(code).strip()
            course = courses.get(code)
            if course is None:
                course = courses[code] = Course.objects.create(
                    tenant=tenant, code=code, title='',
                    department=default_dept)
            fac = str(fac or '').strip()
            fac_obj = None if (not fac or fac.upper() == 'TBA') else faculty.get(fac)
            if fac and fac.upper() != 'TBA' and fac_obj is None:
                fac_obj = faculty[fac] = Faculty.objects.create(
                    tenant=tenant, name=fac, employment_type='FULL_TIME',
                    max_load_units=Decimal('999'))
            room = str(room or 'TBA').strip() or 'TBA'
            room_obj = rooms.get(room)
            if room_obj is None:
                room_obj = rooms[room] = Room.objects.create(
                    tenant=tenant, name=room, room_type='LECTURE')

            try:
                t_start, t_end = _parse_time(start), _parse_time(end)
            except ValueError:
                skipped.append({'id': _id, 'reason': f'bad time {start}-{end}'})
                continue

            labels = [s.strip() for s in re.split(r'[+,]', str(secs or ''))
                      if s.strip()]
            entry_sections = []
            for label in labels:
                sec = sections.get(label)
                if sec is None:
                    unknown_sections.add(label)
                else:
                    entry_sections.append(sec)

            group_key = (course.pk, fac_obj.pk if fac_obj else None,
                         room_obj.pk, t_start, t_end, tuple(sorted(labels)))
            entry = ScheduleEntry.objects.create(
                tenant=tenant, academic_period=period, course=course,
                faculty=fac_obj, room=room_obj, day_of_week=str(day).strip(),
                time_start=t_start, time_end=t_end, group_id=groups[group_key],
                entry_type=etype or 'LECTURE',
                load_classification=load or 'REGULAR',
                class_size=int(class_size or 0), remarks=remarks or '',
            )
            entry.sections.set(entry_sections)
            created += 1

    return {
        'wiped': wiped,
        'created': {
            'entries': created,
            'programs': len(programs),
            'courses': len(courses),
            'faculty': len(faculty),
            'rooms': len(rooms),
            'sections': len(sections),
        },
        'skipped': skipped,
        'unknown_sections': sorted(unknown_sections),
    }
