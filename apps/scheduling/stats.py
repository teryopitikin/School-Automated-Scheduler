from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, Sum, Q

from .models import (
    Faculty, Room, ScheduleConfig, ScheduleEntry,
)


def compute_stats(tenant, period):
    """Compute dashboard statistics for a given academic period."""
    from .conflicts import analyze_period

    entries = list(ScheduleEntry.objects.filter(
        tenant=tenant, academic_period=period,
    ).select_related('course', 'faculty', 'room').prefetch_related('sections__program'))

    # --- Summary ---
    distinct_courses = len({e.course_id for e in entries})

    # Conflict count — bulk analysis; each clash is reported by both sides.
    analysis = analyze_period(tenant, period, entries=entries)
    conflict_count = sum(len(r['hard']) for r in analysis.values()) // 2

    # Faculty stats — one in-memory pass instead of a query per teacher.
    per_faculty = defaultdict(lambda: defaultdict(Decimal))
    fac_by_id = {}
    for e in entries:
        if e.faculty_id:
            units = e.course.lec_units + e.course.lab_units
            per_faculty[e.faculty_id][e.load_classification] += units
            per_faculty[e.faculty_id]['__total__'] += units
            fac_by_id[e.faculty_id] = e.faculty

    overloaded_count = 0
    faculty_breakdown = []
    for fac_id, buckets in per_faculty.items():
        fac = fac_by_id[fac_id]
        total_units = buckets['__total__']
        if total_units > fac.max_load_units:
            overloaded_count += 1
        faculty_breakdown.append({
            'id': fac.pk,
            'name': fac.name,
            'total_units': float(total_units),
            'max_units': float(fac.max_load_units),
            'regular': float(buckets.get('REGULAR', 0)),
            'overload': float(buckets.get('OVERLOAD', 0)),
            'built_in': float(buckets.get('BUILT_IN', 0)),
            'part_time': float(buckets.get('PART_TIME', 0)),
        })

    faculty_ids = set(per_faculty.keys())
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
        day_entries = [e for e in entries if e.day_of_week == day]
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

    # --- Per-room utilization (booked hours vs the school's operating hours) ---
    if operating_days:
        try:
            cfg = ScheduleConfig.objects.get(tenant=tenant, academic_period=period)
            daily_minutes = (
                (cfg.latest_end_time.hour * 60 + cfg.latest_end_time.minute)
                - (cfg.earliest_start_time.hour * 60 + cfg.earliest_start_time.minute)
            )
        except ScheduleConfig.DoesNotExist:
            daily_minutes = 14 * 60          # 7:00–21:00 default
        available_hours = daily_minutes / 60 * len(operating_days)
    else:
        available_hours = 0

    booked_by_room = defaultdict(float)
    for entry in entries:
        duration_min = (entry.time_end.hour * 60 + entry.time_end.minute) - \
                       (entry.time_start.hour * 60 + entry.time_start.minute)
        booked_by_room[entry.room_id] += duration_min / 60

    room_utilization = [
        {
            'id': room.pk,
            'name': room.name,
            'available_hours': round(available_hours, 1),
            'booked_hours': round(booked_by_room.get(room.pk, 0.0), 1),
            'pct': round(booked_by_room.get(room.pk, 0.0) / available_hours * 100, 1)
                   if available_hours else 0.0,
        }
        for room in Room.objects.filter(tenant=tenant)
    ]
    room_utilization.sort(key=lambda r: (-r['pct'], r['name']))

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
        'room_utilization': room_utilization,
    }
