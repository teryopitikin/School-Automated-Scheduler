import datetime
import math
from statistics import stdev

from .models import (
    FacultyAvailability, Room, ScheduleEntry, ScheduleConfig,
)


def _times_overlap(s1, e1, s2, e2):
    """Return True if time ranges (s1,e1) and (s2,e2) overlap."""
    return s1 < e2 and s2 < e1


def _time_add_minutes(t, minutes):
    """Add minutes to a datetime.time, returning a new datetime.time."""
    dt = datetime.datetime(2000, 1, 1, t.hour, t.minute, t.second)
    dt += datetime.timedelta(minutes=minutes)
    return dt.time()


def _time_diff_minutes(t1, t2):
    """Return (t2 - t1) in minutes. Assumes t2 >= t1."""
    d1 = datetime.datetime(2000, 1, 1, t1.hour, t1.minute, t1.second)
    d2 = datetime.datetime(2000, 1, 1, t2.hour, t2.minute, t2.second)
    return (d2 - d1).total_seconds() / 60


def _generate_time_slots(config, slot_duration_minutes):
    """Generate start times from earliest to latest, skipping break periods."""
    granularity = config.time_slot_granularity_minutes
    earliest = config.earliest_start_time
    latest = config.latest_end_time
    break_periods = config.break_periods or []

    slots = []
    current = earliest
    while True:
        slot_end = _time_add_minutes(current, slot_duration_minutes)
        if slot_end > latest:
            break

        # Check if slot overlaps any break period
        overlaps_break = False
        for bp in break_periods:
            bp_start = datetime.time.fromisoformat(bp['start'])
            bp_end = datetime.time.fromisoformat(bp['end'])
            if _times_overlap(current, slot_end, bp_start, bp_end):
                overlaps_break = True
                break

        if not overlaps_break:
            slots.append((current, slot_end))

        current = _time_add_minutes(current, granularity)

    return slots


def _get_eligible_rooms(tenant, course, class_size):
    """Get rooms matching course type with sufficient capacity."""
    if course.has_lab:
        room_types = ['LABORATORY', 'COMPUTER_LAB']
    else:
        room_types = ['LECTURE', 'AVR']

    return list(
        Room.objects.filter(
            tenant=tenant,
            room_type__in=room_types,
            capacity__gte=max(class_size, 1),
        )
    )


def _get_existing_entries(tenant, period):
    """Get all existing schedule entries for the period."""
    return list(
        ScheduleEntry.objects.filter(
            tenant=tenant,
            academic_period=period,
        ).select_related('room', 'faculty', 'course').prefetch_related('sections')
    )


def _check_hard_constraints(day, time_start, time_end, room, faculty, sections, existing_entries, unavailable_slots):
    """Return True if the candidate violates no hard constraints."""
    section_ids = {s.pk for s in sections}

    for entry in existing_entries:
        if entry.day_of_week != day:
            continue
        if not _times_overlap(time_start, time_end, entry.time_start, entry.time_end):
            continue

        # Room conflict
        if entry.room_id == room.pk:
            return False

        # Faculty conflict
        if faculty and entry.faculty_id == faculty.pk:
            return False

        # Section conflict
        entry_section_ids = {s.pk for s in entry.sections.all()}
        if section_ids & entry_section_ids:
            return False

    # Faculty unavailability
    if faculty:
        for ua in unavailable_slots:
            if ua.day_of_week == day and _times_overlap(time_start, time_end, ua.time_start, ua.time_end):
                return False

    return True


def _score_faculty_priority(faculty, day, time_start, time_end, availability_slots):
    """Score based on faculty availability preference."""
    if not faculty:
        return 50

    for slot in availability_slots:
        if slot.day_of_week == day and _times_overlap(time_start, time_end, slot.time_start, slot.time_end):
            if slot.availability_type == 'PREFERRED':
                return 100
            elif slot.availability_type == 'AVAILABLE':
                return 50
            # UNAVAILABLE should have been filtered out already
            return 0
    # No availability record: treat as available
    return 50


def _score_room_proximity(day, room, sections, existing_entries):
    """Score based on how close the room is to sections' other classes on the same day."""
    section_ids = {s.pk for s in sections}

    same_day_entries = []
    for entry in existing_entries:
        if entry.day_of_week != day:
            continue
        entry_section_ids = {s.pk for s in entry.sections.all()}
        if section_ids & entry_section_ids:
            same_day_entries.append(entry)

    if not same_day_entries:
        return 50

    scores = []
    for entry in same_day_entries:
        if entry.room.building == room.building and entry.room.floor == room.floor:
            scores.append(100)
        elif entry.room.building == room.building:
            scores.append(60)
        else:
            scores.append(20)

    return sum(scores) / len(scores)


def _score_time_gap(day, time_start, time_end, sections, existing_entries):
    """Score based on gap to nearest class for the sections on the same day."""
    section_ids = {s.pk for s in sections}

    same_day_entries = []
    for entry in existing_entries:
        if entry.day_of_week != day:
            continue
        entry_section_ids = {s.pk for s in entry.sections.all()}
        if section_ids & entry_section_ids:
            same_day_entries.append(entry)

    if not same_day_entries:
        return 50

    min_gap = float('inf')
    for entry in same_day_entries:
        if time_end <= entry.time_start:
            gap = _time_diff_minutes(time_end, entry.time_start)
        elif entry.time_end <= time_start:
            gap = _time_diff_minutes(entry.time_end, time_start)
        else:
            gap = 0  # overlapping — shouldn't happen after constraint check
        min_gap = min(min_gap, gap)

    if min_gap <= 30:
        return 100
    elif min_gap <= 60:
        return 70
    elif min_gap <= 120:
        return 40
    else:
        return 10


def _score_load_distribution(faculty, day, slot_duration_minutes, existing_entries):
    """Score based on evenness of faculty hours across days."""
    if not faculty:
        return 50

    # Collect hours per day for this faculty
    hours_per_day = {}
    for entry in existing_entries:
        if entry.faculty_id == faculty.pk:
            d = entry.day_of_week
            duration = _time_diff_minutes(entry.time_start, entry.time_end) / 60
            hours_per_day[d] = hours_per_day.get(d, 0) + duration

    # Add proposed slot
    hours_per_day[day] = hours_per_day.get(day, 0) + slot_duration_minutes / 60

    if len(hours_per_day) <= 1:
        return 100

    values = list(hours_per_day.values())
    sd = stdev(values) if len(values) > 1 else 0

    # Normalize: stdev=0 -> 100, stdev>=4 -> 0
    if sd >= 4:
        return 0
    return max(0, 100 - (sd / 4) * 100)


def generate_suggestions(tenant, period, course, sections, faculty, num_days, class_size):
    """
    Generate top 10 ranked slot suggestions.

    Returns list of dicts with rank, day, time_start, time_end, room, total_score, scores.
    """
    try:
        config = ScheduleConfig.objects.get(tenant=tenant, academic_period=period)
    except ScheduleConfig.DoesNotExist:
        return []

    # Calculate slot duration
    contact_hours = float(course.contact_hours)
    slot_duration_minutes = int(contact_hours / num_days * 60)

    # Generate time slots
    time_slots = _generate_time_slots(config, slot_duration_minutes)
    if not time_slots:
        return []

    # Get eligible rooms
    rooms = _get_eligible_rooms(tenant, course, class_size)
    if not rooms:
        return []

    # Get existing entries
    existing_entries = _get_existing_entries(tenant, period)

    # Get faculty unavailable slots
    unavailable_slots = []
    availability_slots = []
    if faculty:
        all_availability = list(
            FacultyAvailability.objects.filter(
                faculty=faculty,
                academic_period=period,
            )
        )
        unavailable_slots = [a for a in all_availability if a.availability_type == 'UNAVAILABLE']
        availability_slots = all_availability

    operating_days = config.operating_days or ['MON', 'TUE', 'WED', 'THU', 'FRI']

    candidates = []
    for day in operating_days:
        for time_start, time_end in time_slots:
            for room in rooms:
                if not _check_hard_constraints(
                    day, time_start, time_end, room, faculty, sections,
                    existing_entries, unavailable_slots,
                ):
                    continue

                # Score
                fp = _score_faculty_priority(faculty, day, time_start, time_end, availability_slots)
                rp = _score_room_proximity(day, room, sections, existing_entries)
                tg = _score_time_gap(day, time_start, time_end, sections, existing_entries)
                ld = _score_load_distribution(faculty, day, slot_duration_minutes, existing_entries)

                weighted_fp = fp * config.weight_faculty_priority / 100
                weighted_rp = rp * config.weight_room_proximity / 100
                weighted_tg = tg * config.weight_time_gap_minimization / 100
                weighted_ld = ld * config.weight_load_distribution / 100

                total = weighted_fp + weighted_rp + weighted_tg + weighted_ld

                candidates.append({
                    'day': day,
                    'time_start': time_start.strftime('%H:%M'),
                    'time_end': time_end.strftime('%H:%M'),
                    'room': room.name,
                    'room_id': room.pk,
                    'total_score': round(total, 2),
                    'scores': {
                        'faculty_priority': round(weighted_fp, 2),
                        'room_proximity': round(weighted_rp, 2),
                        'time_gap': round(weighted_tg, 2),
                        'load_distribution': round(weighted_ld, 2),
                    },
                })

    # Sort by total_score desc
    candidates.sort(key=lambda c: c['total_score'], reverse=True)

    # Top 10 with rank
    top = candidates[:10]
    for i, c in enumerate(top, 1):
        c['rank'] = i

    return top


def generate_paired_suggestions(tenant, period, course, sections, faculty, class_size):
    """
    Generate top 10 paired (lecture, lab) slot suggestions for lab courses.

    Lecture slots use LECTURE/AVR rooms, lab slots use LABORATORY/COMPUTER_LAB rooms.
    Pairs must be on different days.
    """
    try:
        config = ScheduleConfig.objects.get(tenant=tenant, academic_period=period)
    except ScheduleConfig.DoesNotExist:
        return []

    contact_hours = float(course.contact_hours)
    # Split: lecture gets lec_units hours, lab gets lab_units hours
    lec_hours = float(course.lec_units) if course.lec_units else contact_hours / 2
    lab_hours = float(course.lab_units) if course.lab_units else contact_hours / 2

    lec_duration = int(lec_hours * 60)
    lab_duration = int(lab_hours * 60)

    lec_slots = _generate_time_slots(config, lec_duration)
    lab_slots = _generate_time_slots(config, lab_duration)

    if not lec_slots or not lab_slots:
        return []

    # Get rooms by type
    lec_rooms = list(Room.objects.filter(
        tenant=tenant, room_type__in=['LECTURE', 'AVR'],
        capacity__gte=max(class_size, 1),
    ))
    lab_rooms = list(Room.objects.filter(
        tenant=tenant, room_type__in=['LABORATORY', 'COMPUTER_LAB'],
        capacity__gte=max(class_size, 1),
    ))

    if not lec_rooms or not lab_rooms:
        return []

    existing_entries = _get_existing_entries(tenant, period)

    unavailable_slots = []
    availability_slots = []
    if faculty:
        all_availability = list(
            FacultyAvailability.objects.filter(faculty=faculty, academic_period=period)
        )
        unavailable_slots = [a for a in all_availability if a.availability_type == 'UNAVAILABLE']
        availability_slots = all_availability

    operating_days = config.operating_days or ['MON', 'TUE', 'WED', 'THU', 'FRI']

    # Build lecture candidates
    lec_candidates = []
    for day in operating_days:
        for time_start, time_end in lec_slots:
            for room in lec_rooms:
                if _check_hard_constraints(
                    day, time_start, time_end, room, faculty, sections,
                    existing_entries, unavailable_slots,
                ):
                    fp = _score_faculty_priority(faculty, day, time_start, time_end, availability_slots)
                    lec_candidates.append({
                        'day': day,
                        'time_start': time_start,
                        'time_end': time_end,
                        'room': room,
                        'score': fp,
                    })
    lec_candidates.sort(key=lambda c: c['score'], reverse=True)
    lec_candidates = lec_candidates[:50]

    # Build lab candidates
    lab_candidates = []
    for day in operating_days:
        for time_start, time_end in lab_slots:
            for room in lab_rooms:
                if _check_hard_constraints(
                    day, time_start, time_end, room, faculty, sections,
                    existing_entries, unavailable_slots,
                ):
                    fp = _score_faculty_priority(faculty, day, time_start, time_end, availability_slots)
                    lab_candidates.append({
                        'day': day,
                        'time_start': time_start,
                        'time_end': time_end,
                        'room': room,
                        'score': fp,
                    })
    lab_candidates.sort(key=lambda c: c['score'], reverse=True)
    lab_candidates = lab_candidates[:50]

    # Pair: different days
    pairs = []
    for lec in lec_candidates:
        for lab in lab_candidates:
            if lec['day'] == lab['day']:
                continue
            total = lec['score'] + lab['score']
            pairs.append({
                'lecture': {
                    'day': lec['day'],
                    'time_start': lec['time_start'].strftime('%H:%M'),
                    'time_end': lec['time_end'].strftime('%H:%M'),
                    'room': lec['room'].name,
                    'room_id': lec['room'].pk,
                },
                'lab': {
                    'day': lab['day'],
                    'time_start': lab['time_start'].strftime('%H:%M'),
                    'time_end': lab['time_end'].strftime('%H:%M'),
                    'room': lab['room'].name,
                    'room_id': lab['room'].pk,
                },
                'total_score': round(total, 2),
            })

    pairs.sort(key=lambda p: p['total_score'], reverse=True)
    top = pairs[:10]
    for i, p in enumerate(top, 1):
        p['rank'] = i

    return top
