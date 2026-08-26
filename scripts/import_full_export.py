"""
Import a full-export workbook (the `<Period>_full_export.xlsx` format:
metadata sheets Programs / Departments / Courses / Faculty / Rooms /
Sections plus an `All Entries` sheet with one row per scheduled meeting).

Wipe-and-replace: deletes ALL scheduling data for the tenant (entries,
sections, courses, faculty, rooms, programs, departments — tenant, users
and the academic period survive), then rebuilds everything from the
workbook. Entries that share course+faculty+room+time across days are
re-linked under one group_id.

Usage:
    .venv/bin/python scripts/import_full_export.py <workbook.xlsx> [period-name]
"""
import datetime
import os
import re
import sys
import uuid
from collections import defaultdict
from decimal import Decimal

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'scheduler.settings')
django.setup()

import openpyxl
from django.db import transaction

from apps.core.models import Tenant
from apps.scheduling.models import (
    AcademicPeriod, Program, Department, Course, Section, Faculty, Room,
    ScheduleEntry,
)


def parse_time(raw):
    """'07:00:00' or datetime.time -> datetime.time."""
    if isinstance(raw, datetime.time):
        return raw
    return datetime.datetime.strptime(str(raw).strip(), '%H:%M:%S').time()


def dec(raw):
    m = re.search(r'\d+(?:\.\d+)?', str(raw or ''))
    return Decimal(m.group()) if m else Decimal('0')


def rows(ws):
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] is not None and str(r[0]).strip() != '':
            yield r


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    period_name = sys.argv[2] if len(sys.argv) > 2 else None

    wb = openpyxl.load_workbook(path, read_only=True)
    tenant = Tenant.objects.get()
    period = (
        AcademicPeriod.objects.get(tenant=tenant, name=period_name)
        if period_name else
        AcademicPeriod.objects.get(tenant=tenant, status=AcademicPeriod.Status.ACTIVE)
    )

    with transaction.atomic():
        # ---- wipe ------------------------------------------------------
        wiped = {}
        for model in (ScheduleEntry, Section, Course, Faculty, Room,
                      Program, Department):
            qs = model.objects.filter(tenant=tenant)
            wiped[model.__name__] = qs.count()
            qs.delete()

        # ---- metadata sheets ------------------------------------------
        departments = {}
        for code, name in rows(wb['Departments']):
            departments[code] = Department.objects.create(
                tenant=tenant, code=code, name=name or code)
        default_dept = departments.get('GEN') or next(iter(departments.values()))

        programs = {}
        for code, name in rows(wb['Programs']):
            programs[code] = Program.objects.create(
                tenant=tenant, code=code, name=name or code)

        courses = {}
        for code, title, dept, lec, lab, has_lab in rows(wb['Courses']):
            courses[str(code).strip()] = Course.objects.create(
                tenant=tenant, code=str(code).strip(), title=title or '',
                department=departments.get(dept, default_dept),
                lec_units=dec(lec), lab_units=dec(lab),
                has_lab=str(has_lab).strip().lower() == 'yes',
            )

        faculty = {}
        for name, emp, priority, max_load in rows(wb['Faculty']):
            name = str(name).strip()
            faculty[name] = Faculty.objects.create(
                tenant=tenant, name=name,
                employment_type=emp or 'FULL_TIME',
                priority_level=int(priority or 0),
                max_load_units=dec(max_load) or Decimal('999'),
            )

        rooms = {}
        for name, rtype, capacity, building, floor in rows(wb['Rooms']):
            name = str(name).strip()
            rooms[name] = Room.objects.create(
                tenant=tenant, name=name, room_type=rtype or 'LECTURE',
                capacity=int(capacity or 0), building=building or '',
                floor=int(floor or 1),
            )

        sections = {}  # label -> Section
        for prog, year, number, label in rows(wb['Sections']):
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
        for r in rows(wb['All Entries']):
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
                t_start, t_end = parse_time(start), parse_time(end)
            except ValueError:
                skipped.append({'id': _id, 'reason': f'bad time {start}-{end}'})
                continue

            labels = [s.strip() for s in str(secs or '').split('+') if s.strip()]
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

    print(f'Wiped: {wiped}')
    print(f'Created: {created} entries, {len(programs)} programs, '
          f'{len(courses)} courses, {len(faculty)} faculty, '
          f'{len(rooms)} rooms, {len(sections)} sections')
    if skipped:
        print(f'Skipped: {skipped}')
    if unknown_sections:
        print(f'Unknown section labels (entries kept, section link dropped): '
              f'{sorted(unknown_sections)}')

    from apps.scheduling.conflicts import analyze_period
    analysis = analyze_period(tenant, period)
    pairs = set()
    for entry_id, res in analysis.items():
        for c in res['hard']:
            other = (c.get('other') or {}).get('id')
            if other:
                pairs.add((c['type'], min(entry_id, other), max(entry_id, other)))
    by_type = defaultdict(int)
    for ctype, _a, _b in pairs:
        by_type[ctype] += 1
    print(f'Clash pairs: {len(pairs)} total, by type: {dict(by_type)}')


if __name__ == '__main__':
    main()
