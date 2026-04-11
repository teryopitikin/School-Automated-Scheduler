from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, Sum, Q

from .conflicts import detect_conflicts
from .models import (
    Faculty, Room, ScheduleConfig, ScheduleEntry,
)


def compute_stats(tenant, period):
    """Compute dashboard statistics for a given academic period."""
    entries = ScheduleEntry.objects.filter(
        tenant=tenant, academic_period=period,
    ).select_related('course', 'faculty', 'room').prefetch_related('sections')

    # --- Summary ---
    distinct_courses = entries.values('course').distinct().count()

    # Conflict count
    conflict_count = 0
    for entry in entries:
        result = detect_conflicts(entry)
        conflict_count += len(result['hard'])
    # Each conflict is reported by both sides, so divide by 2
    conflict_count = conflict_count // 2

    # Faculty stats
    faculty_ids = set(entries.exclude(faculty=None).values_list('faculty_id', flat=True))
    faculty_members = Faculty.objects.filter(pk__in=faculty_ids).select_related()

    overloaded_count = 0
    faculty_breakdown = []
    for fac in faculty_members:
        fac_entries = entries.filter(faculty=fac)
        units_by_classification = defaultdict(Decimal)
        total_units = Decimal('0')
        for e in fac_entries:
            units = e.course.lec_units + e.course.lab_units
            units_by_classification[e.load_classification] += units
            total_units += units

        if total_units > fac.max_load_units:
            overloaded_count += 1

        faculty_breakdown.append({
            'id': fac.pk,
            'name': fac.name,
            'total_units': float(total_units),
            'max_units': float(fac.max_load_units),
            'regular': float(units_by_classification.get('REGULAR', 0)),
            'overload': float(units_by_classification.get('OVERLOAD', 0)),
            'built_in': float(units_by_classification.get('BUILT_IN', 0)),
            'part_time': float(units_by_classification.get('PART_TIME', 0)),
        })

    faculty_breakdown.sort(key=lambda x: x['name'])

    # --- Program progress ---
    program_data = defaultdict(lambda: {'name': '', 'courses': set()})
    for entry in entries:
        for section in entry.sections.all():
            key = section.program.code
            program_data[key]['name'] = section.program.name
            program_data[key]['courses'].add(entry.course_id)

    program_progress = []
    for code, data in sorted(program_data.items()):
        scheduled = len(data['courses'])
        program_progress.append({
            'program_code': code,
            'program_name': data['name'],
            'total_courses': scheduled,
            'scheduled': scheduled,
            'percentage': 100.0 if scheduled > 0 else 0.0,
        })

    # --- Daily room utilization ---
    try:
        config = ScheduleConfig.objects.get(tenant=tenant, academic_period=period)
        operating_days = config.operating_days
        granularity = config.time_slot_granularity_minutes
        earliest = config.earliest_start_time
        latest = config.latest_end_time

        total_minutes = (latest.hour * 60 + latest.minute) - (earliest.hour * 60 + earliest.minute)
        slots_per_day = total_minutes // granularity
        room_count = Room.objects.filter(tenant=tenant).count()
        total_slots_per_day = slots_per_day * room_count
    except ScheduleConfig.DoesNotExist:
        operating_days = ['MON', 'TUE', 'WED', 'THU', 'FRI']
        total_slots_per_day = 0
        granularity = 30

    daily_room_utilization = []
    for day in operating_days:
        day_entries = entries.filter(day_of_week=day)
        used_slots = 0
        for entry in day_entries:
            duration_min = (entry.time_end.hour * 60 + entry.time_end.minute) - \
                           (entry.time_start.hour * 60 + entry.time_start.minute)
            used_slots += duration_min // granularity

        utilization = round(used_slots / total_slots_per_day * 100, 1) if total_slots_per_day > 0 else 0
        daily_room_utilization.append({
            'day': day,
            'total_slots': total_slots_per_day,
            'used_slots': used_slots,
            'utilization_pct': utilization,
        })

    return {
        'summary': {
            'total_courses': distinct_courses,
            'scheduled': distinct_courses,
            'unscheduled': 0,
            'conflict_count': conflict_count,
            'faculty_count': len(faculty_ids),
            'overloaded_faculty_count': overloaded_count,
        },
        'faculty_breakdown': faculty_breakdown,
        'program_progress': program_progress,
        'daily_room_utilization': daily_room_utilization,
    }
