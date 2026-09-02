from collections import defaultdict

from django.db.models import Sum

from .models import ScheduleEntry


PLACEHOLDER_ROOM_NAMES = {'n/a', '-', ''}


def _is_exempt(entry):
    """Entries with no fixed meeting slot are exempt from hard-conflict
    tagging entirely: 'Asynchronous' rooms, and placeholder rooms ('N/A',
    '-', blank) used for field study / internally-arranged classes."""
    name = (getattr(entry.room, 'name', '') or '').strip().lower()
    return 'async' in name or name in PLACEHOLDER_ROOM_NAMES


def entry_signature(e):
    """Stable identity of a plotted class: course, day, times, teacher,
    sections. Survives re-imports (no db ids); changes when the class
    moves — so a dismissal stops matching and the conflict resurfaces."""
    secs = '+'.join(sorted(str(s) for s in e.sections.all()))
    fac = e.faculty.name if e.faculty else 'TBA'
    return f'{e.course.code}@{e.day_of_week} {e.time_start}-{e.time_end}/{fac}/{secs}'


def pair_signature(conflict_type, a, b):
    """Order-independent signature for a conflicting pair."""
    sa, sb = sorted([entry_signature(a), entry_signature(b)])
    return f'{conflict_type}|{sa}|{sb}'


def dismissed_signatures(tenant, period):
    from .models import ConflictDismissal
    return set(ConflictDismissal.objects.filter(
        tenant=tenant, academic_period=period).values_list('signature', flat=True))


HARD_CONFLICT_TYPES = ('faculty', 'section')


def enabled_conflict_types(tenant):
    """Hard-conflict types the admin has left ON (default: both)."""
    disabled = set(getattr(tenant, 'disabled_conflict_types', None) or [])
    return {t for t in HARD_CONFLICT_TYPES if t not in disabled}


def _overlapping(entry):
    """Entries on the same day whose time range overlaps entry's (touching
    boundaries — one ends exactly when the other starts — do NOT overlap)."""
    return ScheduleEntry.objects.filter(
        tenant=entry.tenant,
        academic_period=entry.academic_period,
        day_of_week=entry.day_of_week,
        time_start__lt=entry.time_end,
        time_end__gt=entry.time_start,
    ).exclude(pk=entry.pk)


def detect_conflicts(entry):
    """
    Detect hard conflicts and warnings for a ScheduleEntry.

    Hard conflicts (same day, OVERLAPPING times — partial overlap counts,
    back-to-back does not):
      - faculty: the same teacher is in another class (any room)
      - section: one of this entry's sections sits in another class

    Room double-booking is deliberately NOT a conflict — rooms may be
    shared, so two classes in the same room at the same time are fine
    unless they also share a teacher or a section.

    Returns:
        {
            'hard': [{'type': str, 'message': str, 'conflicting_entry_id': int}, ...],
            'warnings': [{'type': str, 'message': str}, ...],
        }
    """
    hard = []
    warnings = []
    entry_is_exempt = _is_exempt(entry)

    if entry.faculty_id is not None and not entry_is_exempt:
        faculty_qs = _overlapping(entry).filter(faculty_id=entry.faculty_id)
        for other in faculty_qs.select_related('course', 'room'):
            if _is_exempt(other):
                continue
            hard.append({
                'type': 'faculty',
                'message': f'{entry.faculty} is also teaching {other.course.code} at {other.time_start}-{other.time_end}',
                'conflicting_entry_id': other.pk,
                '_other': other,
            })

    section_ids = list(entry.sections.values_list('pk', flat=True))
    if section_ids and not entry_is_exempt:
        seen = {h['conflicting_entry_id'] for h in hard}
        for other in _overlapping(entry).filter(sections__in=section_ids) \
                .select_related('course', 'room').distinct():
            if other.pk in seen:
                continue   # already reported as a room/faculty clash
            if _is_exempt(other):
                continue
            hard.append({
                'type': 'section',
                'message': f'Section is also in {other.course.code} at {other.time_start}-{other.time_end}',
                'conflicting_entry_id': other.pk,
                '_other': other,
            })

    # Drop types the admin turned off, and pairs the user chose to ignore forever.
    if hard:
        enabled = enabled_conflict_types(entry.tenant)
        hard = [h for h in hard if h['type'] in enabled]
    if hard:
        dismissed = dismissed_signatures(entry.tenant, entry.academic_period)
        if dismissed:
            hard = [h for h in hard
                    if pair_signature(h['type'], entry, h['_other']) not in dismissed]
    for h in hard:
        h.pop('_other', None)

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


def analyze_period(tenant, period, entries=None):
    """Bulk equivalent of running detect_conflicts on every entry of a period,
    computed in one pass with a handful of queries instead of thousands.

    Returns {entry_id: {'hard': [...], 'warnings': [...]}} with items shaped
    exactly like detect_conflicts' output.
    """
    if entries is None:
        entries = list(
            ScheduleEntry.objects.filter(tenant=tenant, academic_period=period)
            .select_related('course', 'room', 'faculty')
            .prefetch_related('sections')
        )

    sections_of = {e.pk: {s.pk for s in e.sections.all()} for e in entries}
    result = {e.pk: {'hard': [], 'warnings': []} for e in entries}
    dismissed = dismissed_signatures(tenant, period)
    enabled = enabled_conflict_types(tenant)

    # --- hard conflicts: sweep overlapping pairs per day -------------------
    def add_hard(a, b):
        """Record the clash a<->b on both sides, mirroring detect_conflicts."""
        if _is_exempt(a) or _is_exempt(b):
            return   # async/field-study/internally-arranged classes never clash
        pair_faculty = (a.faculty_id is not None
                        and a.faculty_id == b.faculty_id)
        pair_section = (not pair_faculty
                        and bool(sections_of[a.pk] & sections_of[b.pk]))
        if pair_faculty or pair_section:
            ctype = 'faculty' if pair_faculty else 'section'
            if ctype not in enabled:
                return
            if dismissed and pair_signature(ctype, a, b) in dismissed:
                return
        for me, other in ((a, b), (b, a)):
            if pair_faculty:
                item = {
                    'type': 'faculty',
                    'message': f'{me.faculty} is also teaching {other.course.code} at {other.time_start}-{other.time_end}',
                }
            elif pair_section:
                item = {
                    'type': 'section',
                    'message': f'Section is also in {other.course.code} at {other.time_start}-{other.time_end}',
                }
            else:
                return
            item['conflicting_entry_id'] = other.pk
            result[me.pk]['hard'].append(item)

    by_day = defaultdict(list)
    for e in entries:
        by_day[e.day_of_week].append(e)
    for day_entries in by_day.values():
        day_entries.sort(key=lambda e: (e.time_start, e.time_end))
        for i, a in enumerate(day_entries):
            for b in day_entries[i + 1:]:
                if b.time_start >= a.time_end:
                    break          # sorted by start: nothing later overlaps a
                add_hard(a, b)

    # keep the same type ordering detect_conflicts produces (faculty, section)
    priority = {'faculty': 0, 'section': 1}
    for r in result.values():
        r['hard'].sort(key=lambda h: priority[h['type']])

    # --- warnings: overload + capacity, computed from one in-memory pass ---
    fac_units = defaultdict(lambda: 0)
    fac_obj = {}
    for e in entries:
        if e.faculty_id:
            fac_units[e.faculty_id] += e.course.lec_units + e.course.lab_units
            fac_obj[e.faculty_id] = e.faculty
    for e in entries:
        if e.faculty_id and fac_units[e.faculty_id] > e.faculty.max_load_units:
            total = fac_units[e.faculty_id]
            result[e.pk]['warnings'].append({
                'type': 'overload',
                'message': f'{e.faculty} would have {total} units (max: {e.faculty.max_load_units})',
            })
        if e.room and e.class_size > e.room.capacity and e.room.capacity > 0:
            result[e.pk]['warnings'].append({
                'type': 'capacity',
                'message': f'Class size ({e.class_size}) exceeds room capacity ({e.room.capacity})',
            })

    return result
