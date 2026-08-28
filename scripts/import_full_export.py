"""CLI wrapper around apps.scheduling.full_export_importer — import a
full-export workbook (wipe-and-replace), then print a conflict summary.

Usage:
    .venv/bin/python scripts/import_full_export.py <workbook.xlsx> [period-name]
"""
import os
import sys
from collections import defaultdict

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'scheduler.settings')
django.setup()

import openpyxl

from apps.core.models import Tenant
from apps.scheduling.models import AcademicPeriod
from apps.scheduling.full_export_importer import import_full_export


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

    result = import_full_export(wb, tenant, period)
    print(f"Wiped: {result['wiped']}")
    c = result['created']
    print(f"Created: {c['entries']} entries, {c['programs']} programs, "
          f"{c['courses']} courses, {c['faculty']} faculty, "
          f"{c['rooms']} rooms, {c['sections']} sections")
    if result['skipped']:
        print(f"Skipped: {result['skipped']}")
    if result['unknown_sections']:
        print(f"Unknown section labels (entries kept, section link dropped): "
              f"{result['unknown_sections']}")

    from apps.scheduling.conflicts import analyze_period
    analysis = analyze_period(tenant, period)
    pairs = set()
    for entry_id, res in analysis.items():
        for conflict in res['hard']:
            other = conflict.get('conflicting_entry_id')
            if other:
                pairs.add((conflict['type'], min(entry_id, other), max(entry_id, other)))
    by_type = defaultdict(int)
    for ctype, _a, _b in pairs:
        by_type[ctype] += 1
    print(f'Clash pairs: {len(pairs)} total, by type: {dict(by_type)}')


if __name__ == '__main__':
    main()
