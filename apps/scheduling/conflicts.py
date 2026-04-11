from django.db.models import Sum

from .models import ScheduleEntry


def _find_overlapping_entries(entry):
    """Return entries in the same period/day that overlap in time, excluding self."""
    return ScheduleEntry.objects.filter(
        tenant=entry.tenant,
        academic_period=entry.academic_period,
        day_of_week=entry.day_of_week,
        time_start__lt=entry.time_end,
        time_end__gt=entry.time_start,
    ).exclude(pk=entry.pk).select_related('course', 'faculty', 'room').prefetch_related('sections')


def detect_conflicts(entry):
    """
    Detect hard conflicts and warnings for a ScheduleEntry.

    Returns:
        {
            'hard': [{'type': 'room'|'faculty'|'section', 'message': str, 'conflicting_entry_id': int}, ...],
            'warnings': [{'type': str, 'message': str}, ...],
        }
    """
    hard = []
    warnings = []

    overlapping = _find_overlapping_entries(entry)
    entry_section_ids = set(entry.sections.values_list('pk', flat=True))

    for other in overlapping:
        # Room conflict
        if other.room_id == entry.room_id:
            hard.append({
                'type': 'room',
                'message': f'Room {entry.room} is already booked by {other.course.code} at {other.time_start}-{other.time_end}',
                'conflicting_entry_id': other.pk,
            })

        # Faculty conflict
        if entry.faculty_id and other.faculty_id == entry.faculty_id:
            hard.append({
                'type': 'faculty',
                'message': f'{entry.faculty} is already teaching {other.course.code} at {other.time_start}-{other.time_end}',
                'conflicting_entry_id': other.pk,
            })

        # Section conflict
        other_section_ids = set(other.sections.values_list('pk', flat=True))
        shared_sections = entry_section_ids & other_section_ids
        if shared_sections:
            hard.append({
                'type': 'section',
                'message': f'Section(s) already have {other.course.code} at {other.time_start}-{other.time_end}',
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
