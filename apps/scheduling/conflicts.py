from django.db.models import Sum

from .models import ScheduleEntry


def _find_same_slot_entries(entry):
    """Return entries in the exact same room, day, and time (a 100% slot match),
    excluding self."""
    if entry.room_id is None:
        return ScheduleEntry.objects.none()
    return ScheduleEntry.objects.filter(
        tenant=entry.tenant,
        academic_period=entry.academic_period,
        day_of_week=entry.day_of_week,
        time_start=entry.time_start,
        time_end=entry.time_end,
        room_id=entry.room_id,
    ).exclude(pk=entry.pk).select_related('course', 'faculty', 'room')


def detect_conflicts(entry):
    """
    Detect hard conflicts and warnings for a ScheduleEntry.

    A conflict is a room double-booking: another class occupies the SAME room,
    SAME day, and the EXACT SAME time (a 100% match on room + day + time).
    Subject is not considered — any two classes sharing the exact same
    room/day/time are flagged. Different rooms, different days, or times that
    only partially overlap are NOT flagged.

    Returns:
        {
            'hard': [{'type': 'room', 'message': str, 'conflicting_entry_id': int}, ...],
            'warnings': [{'type': str, 'message': str}, ...],
        }
    """
    hard = []
    warnings = []

    for other in _find_same_slot_entries(entry):
        # Same room + same day + exact same time = conflict, whatever the subject.
        hard.append({
            'type': 'room',
            'message': f'Room {entry.room} is already booked by {other.course.code} at {other.time_start}-{other.time_end}',
            'conflicting_entry_id': other.pk,
        })

    # Warnings
    if entry.faculty_id:
        # Faculty overload warning — use separate sums for SQLite compatibility
        totals = ScheduleEntry.objects.filter(
            tenant=entry.tenant,
            academic_period=entry.academic_period,
            faculty=entry.faculty,
        ).exclude(pk=entry.pk).aggregate(
            lec_total=Sum('course__lec_units'),
            lab_total=Sum('course__lab_units'),
        )
        current_units = entry.course.lec_units + entry.course.lab_units
        existing_units = (totals['lec_total'] or 0) + (totals['lab_total'] or 0)
        if existing_units + current_units > entry.faculty.max_load_units:
            warnings.append({
                'type': 'overload',
                'message': f'{entry.faculty} would have {existing_units + current_units} units (max: {entry.faculty.max_load_units})',
            })

    # Room capacity warning
    if entry.class_size > entry.room.capacity and entry.room.capacity > 0:
        warnings.append({
            'type': 'capacity',
            'message': f'Class size ({entry.class_size}) exceeds room capacity ({entry.room.capacity})',
        })

    return {'hard': hard, 'warnings': warnings}
