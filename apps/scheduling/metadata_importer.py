"""Upsert import of Departments / Programs / Courses from a workbook.

Accepts any subset of the sheets 'Departments' (code, name), 'Programs'
(code, name) and 'Courses' (code, title, department, lec, lab, has_lab).
Rows are matched by code: existing records are updated, new ones created.
The schedule (entries/sections/faculty/rooms) is never touched.
"""
import re
from decimal import Decimal

from django.db import transaction

from .models import Course, Department, Program

METADATA_SHEETS = ['Departments', 'Programs', 'Courses']


def _rows(ws):
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] is not None and str(r[0]).strip() != '':
            yield r


def _dec(raw):
    m = re.search(r'\d+(?:\.\d+)?', str(raw or ''))
    return Decimal(m.group()) if m else Decimal('0')


def import_metadata(workbook, tenant):
    """Returns {'departments'|'programs'|'courses': {'created': n, 'updated': n}}
    for each sheet present in the workbook."""
    summary = {}
    with transaction.atomic():
        if 'Departments' in workbook.sheetnames:
            created = updated = 0
            for code, name in _rows(workbook['Departments']):
                code = str(code).strip()
                _, was_created = Department.objects.update_or_create(
                    tenant=tenant, code=code,
                    defaults={'name': str(name or code).strip()})
                created += was_created
                updated += not was_created
            summary['departments'] = {'created': created, 'updated': updated}

        if 'Programs' in workbook.sheetnames:
            created = updated = 0
            for code, name in _rows(workbook['Programs']):
                code = str(code).strip()
                _, was_created = Program.objects.update_or_create(
                    tenant=tenant, code=code,
                    defaults={'name': str(name or code).strip()})
                created += was_created
                updated += not was_created
            summary['programs'] = {'created': created, 'updated': updated}

        if 'Courses' in workbook.sheetnames:
            created = updated = 0
            for code, title, dept, lec, lab, has_lab in _rows(workbook['Courses']):
                code = str(code).strip()
                dept_code = str(dept or '').strip()
                department = Department.objects.filter(
                    tenant=tenant, code=dept_code).first()
                if department is None:
                    department, _ = Department.objects.get_or_create(
                        tenant=tenant, code=dept_code or 'GEN',
                        defaults={'name': dept_code or 'General'})
                _, was_created = Course.objects.update_or_create(
                    tenant=tenant, code=code,
                    defaults={
                        'title': str(title or '').strip(),
                        'department': department,
                        'lec_units': _dec(lec),
                        'lab_units': _dec(lab),
                        'has_lab': str(has_lab or '').strip().lower() == 'yes',
                    })
                created += was_created
                updated += not was_created
            summary['courses'] = {'created': created, 'updated': updated}
    return summary
