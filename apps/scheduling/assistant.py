"""Claude assistant for the scheduler.

Runs a tool-use loop against the Claude API. Read tools answer questions from
live schedule data; write tools only STAGE actions — the frontend shows each
staged action as a confirmation card and executes it through the normal
create/update/delete flows (conflict checks included) once the user approves.
"""
import datetime

from django.conf import settings

from .conflicts import analyze_period
from .models import Course, Faculty, Room, ScheduleEntry, Section

MODEL = 'claude-opus-5'
MAX_TOOL_ROUNDS = 8
DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

SYSTEM_PROMPT = (
    'You are the scheduling assistant built into the School Automated Scheduler, '
    'a class-timetabling app (weekly template: entries have a day of week and '
    'start/end times, no calendar dates). You help the user inspect schedules, '
    'find conflicts and vacancies, and plot classes.\n\n'
    'Rules:\n'
    '- Use search_entities first when the user names a section, teacher, room, '
    'course, or program and you need its exact identity.\n'
    '- Hard conflicts are overlapping times for the same teacher or '
    'section; touching boundaries (one ends when the other starts) do not '
    'clash; rooms may be shared (room double-booking is not a conflict); and '
    'classes in Asynchronous or placeholder rooms (N/A, "-") — field study / '
    'internally-arranged — are never conflicts.\n'
    '- You cannot change data directly. To add, move, or delete a class, call the '
    'propose_* tools — each stages an action the user must approve in the app. '
    'After staging, tell the user what you staged and that it awaits their '
    'approval.\n'
    '- Times are 24-hour HH:MM. Days are MON..SUN. Be concise and concrete.'
)

TOOLS = [
    {
        'name': 'search_entities',
        'description': 'Resolve a name/code to scheduler entities. kind is one of '
                       'section, faculty, room, course, program. Returns matches with ids.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'kind': {'type': 'string', 'enum': ['section', 'faculty', 'room', 'course', 'program']},
                'query': {'type': 'string'},
            },
            'required': ['kind', 'query'],
        },
    },
    {
        'name': 'get_schedule',
        'description': 'List schedule entries for a section, faculty member, room, course, '
                       'or program (kind + query), optionally one day. Omit kind for all entries of a day.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'kind': {'type': 'string', 'enum': ['section', 'faculty', 'room', 'course', 'program']},
                'query': {'type': 'string'},
                'day': {'type': 'string', 'enum': DAY_ORDER},
            },
        },
    },
    {
        'name': 'get_conflicts',
        'description': 'Summarize hard conflicts in the active period: counts by type and '
                       'the clashing pairs (entry ids, courses, day/times).',
        'input_schema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'get_faculty_load',
        'description': 'Total scheduled units per faculty member; optional query filters by name.',
        'input_schema': {
            'type': 'object',
            'properties': {'query': {'type': 'string'}},
        },
    },
    {
        'name': 'find_free_slots',
        'description': 'Free time gaps for a section, faculty member, or room, per day '
                       '(07:00-22:00 window). Optional day narrows to one day.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'kind': {'type': 'string', 'enum': ['section', 'faculty', 'room']},
                'query': {'type': 'string'},
                'day': {'type': 'string', 'enum': DAY_ORDER},
            },
            'required': ['kind', 'query'],
        },
    },
    {
        'name': 'get_unscheduled_courses',
        'description': 'Courses with no schedule entry in the active period.',
        'input_schema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'propose_add_class',
        'description': 'Stage adding a class for user approval. course/room/faculty/sections '
                       'are names or codes (resolved server-side). days is a list like ["MON","WED"].',
        'input_schema': {
            'type': 'object',
            'properties': {
                'course': {'type': 'string'},
                'sections': {'type': 'array', 'items': {'type': 'string'}},
                'days': {'type': 'array', 'items': {'type': 'string', 'enum': DAY_ORDER}},
                'time_start': {'type': 'string', 'description': 'HH:MM'},
                'time_end': {'type': 'string', 'description': 'HH:MM'},
                'room': {'type': 'string'},
                'faculty': {'type': 'string'},
            },
            'required': ['course', 'sections', 'days', 'time_start', 'time_end', 'room'],
        },
    },
    {
        'name': 'propose_move_class',
        'description': 'Stage moving one schedule entry (by id, from get_schedule) to a new '
                       'day and/or time for user approval.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'entry_id': {'type': 'integer'},
                'day': {'type': 'string', 'enum': DAY_ORDER},
                'time_start': {'type': 'string'},
                'time_end': {'type': 'string'},
            },
            'required': ['entry_id'],
        },
    },
    {
        'name': 'propose_delete_class',
        'description': 'Stage deleting one schedule entry (by id) for user approval.',
        'input_schema': {
            'type': 'object',
            'properties': {'entry_id': {'type': 'integer'}},
            'required': ['entry_id'],
        },
    },
]


# --- entity helpers ---------------------------------------------------------

def _section_label(s):
    return f'{s.program.code} {s.year_level}-{s.section_number}'


def _find_sections(tenant, period, query):
    q = query.strip().lower()
    return [s for s in
            Section.objects.filter(tenant=tenant, academic_period=period).select_related('program')
            if q in _section_label(s).lower()]


def _find(kind, tenant, period, query):
    q = (query or '').strip()
    if kind == 'section':
        return [{'id': s.id, 'name': _section_label(s)} for s in _find_sections(tenant, period, q)]
    if kind == 'faculty':
        return [{'id': f.id, 'name': f.name}
                for f in Faculty.objects.filter(tenant=tenant, name__icontains=q)]
    if kind == 'room':
        return [{'id': r.id, 'name': r.name}
                for r in Room.objects.filter(tenant=tenant, name__icontains=q)]
    if kind == 'course':
        from django.db.models import Q
        return [{'id': c.id, 'name': c.code, 'title': c.title}
                for c in Course.objects.filter(Q(code__icontains=q) | Q(title__icontains=q), tenant=tenant)]
    if kind == 'program':
        from .models import Program
        from django.db.models import Q
        return [{'id': p.id, 'name': p.code, 'title': p.name}
                for p in Program.objects.filter(Q(code__icontains=q) | Q(name__icontains=q), tenant=tenant)]
    return []


def _entry_dict(e):
    return {
        'id': e.id,
        'course': e.course.code,
        'title': e.course.title,
        'sections': [_section_label(s) for s in e.sections.all()],
        'faculty': e.faculty.name if e.faculty else None,
        'room': e.room.name if e.room else None,
        'day': e.day_of_week,
        'time_start': e.time_start.strftime('%H:%M'),
        'time_end': e.time_end.strftime('%H:%M'),
    }


def _entries_qs(tenant, period):
    return (ScheduleEntry.objects.filter(tenant=tenant, academic_period=period)
            .select_related('course', 'faculty', 'room')
            .prefetch_related('sections__program'))


def _parse_hhmm(v):
    return datetime.datetime.strptime(str(v)[:5], '%H:%M').time()


# --- tool implementations ---------------------------------------------------

def _tool_get_schedule(inp, tenant, period):
    qs = _entries_qs(tenant, period)
    kind = inp.get('kind')
    query = inp.get('query', '')
    if kind == 'section':
        ids = [s.id for s in _find_sections(tenant, period, query)]
        qs = qs.filter(sections__in=ids).distinct()
    elif kind == 'faculty':
        qs = qs.filter(faculty__name__icontains=query)
    elif kind == 'room':
        qs = qs.filter(room__name__icontains=query)
    elif kind == 'course':
        qs = qs.filter(course__code__icontains=query)
    elif kind == 'program':
        qs = qs.filter(sections__program__code__icontains=query).distinct()
    if inp.get('day'):
        qs = qs.filter(day_of_week=inp['day'])
    entries = sorted((_entry_dict(e) for e in qs[:200]),
                     key=lambda d: (DAY_ORDER.index(d['day']), d['time_start']))
    return {'count': len(entries), 'entries': entries}


def _tool_get_conflicts(inp, tenant, period):
    result = analyze_period(tenant, period)
    entries = {e.id: e for e in _entries_qs(tenant, period)}
    pairs, seen = [], set()
    counts = {'room': 0, 'faculty': 0, 'section': 0}
    for pk, r in result.items():
        for h in r['hard']:
            key = tuple(sorted((pk, h['conflicting_entry_id'])))
            if key in seen:
                continue
            seen.add(key)
            counts[h['type']] += 1
            a, b = entries.get(key[0]), entries.get(key[1])
            if a and b:
                pairs.append({
                    'type': h['type'],
                    'a': _entry_dict(a), 'b': _entry_dict(b),
                })
    return {'counts': counts, 'total_pairs': len(seen), 'pairs': pairs[:60]}


def _tool_get_faculty_load(inp, tenant, period):
    loads = {}
    for e in _entries_qs(tenant, period):
        if not e.faculty:
            continue
        rec = loads.setdefault(e.faculty.name, {'units': 0.0, 'classes': 0})
        rec['units'] += float(e.course.lec_units) + float(e.course.lab_units)
        rec['classes'] += 1
    q = (inp.get('query') or '').lower()
    rows = [{'faculty': k, **v} for k, v in loads.items() if q in k.lower()]
    rows.sort(key=lambda r: -r['units'])
    return {'faculty': rows[:100]}


def _tool_find_free_slots(inp, tenant, period):
    kind, query = inp['kind'], inp['query']
    qs = _entries_qs(tenant, period)
    if kind == 'section':
        ids = [s.id for s in _find_sections(tenant, period, query)]
        qs = qs.filter(sections__in=ids).distinct()
    elif kind == 'faculty':
        qs = qs.filter(faculty__name__icontains=query)
    else:
        qs = qs.filter(room__name__icontains=query)
    days = [inp['day']] if inp.get('day') else DAY_ORDER[:6]
    day_start, day_end = 7 * 60, 22 * 60
    out = []
    for day in days:
        busy = sorted(
            ((e.time_start.hour * 60 + e.time_start.minute,
              e.time_end.hour * 60 + e.time_end.minute)
             for e in qs if e.day_of_week == day))
        gaps, cursor = [], day_start
        for s, en in busy:
            if s > cursor:
                gaps.append((cursor, min(s, day_end)))
            cursor = max(cursor, en)
        if cursor < day_end:
            gaps.append((cursor, day_end))
        fmt = lambda m: f'{m // 60:02d}:{m % 60:02d}'
        out.append({'day': day,
                    'gaps': [{'start': fmt(a), 'end': fmt(b)} for a, b in gaps if b > a]})
    return {'free': out}


def _tool_get_unscheduled_courses(inp, tenant, period):
    used = set(ScheduleEntry.objects.filter(tenant=tenant, academic_period=period)
               .values_list('course_id', flat=True))
    rows = [{'code': c.code, 'title': c.title,
             'units': float(c.lec_units) + float(c.lab_units)}
            for c in Course.objects.filter(tenant=tenant).exclude(id__in=used)]
    return {'count': len(rows), 'courses': rows}


def _resolve_one(kind, tenant, period, query):
    matches = _find(kind, tenant, period, query)
    if len(matches) == 1:
        return matches[0], None
    if not matches:
        return None, f'No {kind} matches "{query}".'
    exact = [m for m in matches if m['name'].lower() == query.strip().lower()]
    if len(exact) == 1:
        return exact[0], None
    names = ', '.join(m['name'] for m in matches[:8])
    return None, f'Ambiguous {kind} "{query}" — matches: {names}. Ask the user or refine.'


def _tool_propose_add_class(inp, tenant, period, staged):
    course, err = _resolve_one('course', tenant, period, inp['course'])
    if err:
        return {'error': err}
    room, err = _resolve_one('room', tenant, period, inp['room'])
    if err:
        return {'error': err}
    faculty = None
    if inp.get('faculty'):
        faculty, err = _resolve_one('faculty', tenant, period, inp['faculty'])
        if err:
            return {'error': err}
    section_ids, labels = [], []
    for s in inp['sections']:
        sec, err = _resolve_one('section', tenant, period, s)
        if err:
            return {'error': err}
        section_ids.append(sec['id'])
        labels.append(sec['name'])
    action = {
        'type': 'add_class',
        'summary': f'Add {course["name"]} for {", ".join(labels)} on '
                   f'{"/".join(inp["days"])} {inp["time_start"]}-{inp["time_end"]} '
                   f'in {room["name"]}' + (f' with {faculty["name"]}' if faculty else ''),
        'payload': {
            'academic_period': period.id, 'course': course['id'],
            'sections': section_ids, 'days': inp['days'],
            'time_start': inp['time_start'], 'time_end': inp['time_end'],
            'room': room['id'], 'faculty': faculty['id'] if faculty else None,
        },
    }
    staged.append(action)
    return {'staged': True, 'summary': action['summary'],
            'note': 'Awaiting user approval in the app.'}


def _tool_propose_move_class(inp, tenant, period, staged):
    try:
        e = _entries_qs(tenant, period).get(pk=inp['entry_id'])
    except ScheduleEntry.DoesNotExist:
        return {'error': f'No schedule entry with id {inp["entry_id"]}.'}
    day = inp.get('day') or e.day_of_week
    ts = inp.get('time_start') or e.time_start.strftime('%H:%M')
    te = inp.get('time_end') or e.time_end.strftime('%H:%M')
    action = {
        'type': 'move_class',
        'summary': f'Move {e.course.code} ({e.day_of_week} '
                   f'{e.time_start:%H:%M}-{e.time_end:%H:%M}) to {day} {ts}-{te}',
        'payload': {'entry_id': e.id, 'day_of_week': day,
                    'time_start': ts, 'time_end': te},
    }
    staged.append(action)
    return {'staged': True, 'summary': action['summary'],
            'note': 'Awaiting user approval in the app.'}


def _tool_propose_delete_class(inp, tenant, period, staged):
    try:
        e = _entries_qs(tenant, period).get(pk=inp['entry_id'])
    except ScheduleEntry.DoesNotExist:
        return {'error': f'No schedule entry with id {inp["entry_id"]}.'}
    action = {
        'type': 'delete_class',
        'summary': f'Delete {e.course.code} on {e.day_of_week} '
                   f'{e.time_start:%H:%M}-{e.time_end:%H:%M}'
                   f' ({", ".join(_section_label(s) for s in e.sections.all())})',
        'payload': {'entry_id': e.id},
    }
    staged.append(action)
    return {'staged': True, 'summary': action['summary'],
            'note': 'Awaiting user approval in the app.'}


_TOOL_FNS = {
    'search_entities': lambda i, t, p, s: {'matches': _find(i['kind'], t, p, i['query'])[:20]},
    'get_schedule': lambda i, t, p, s: _tool_get_schedule(i, t, p),
    'get_conflicts': lambda i, t, p, s: _tool_get_conflicts(i, t, p),
    'get_faculty_load': lambda i, t, p, s: _tool_get_faculty_load(i, t, p),
    'find_free_slots': lambda i, t, p, s: _tool_find_free_slots(i, t, p),
    'get_unscheduled_courses': lambda i, t, p, s: _tool_get_unscheduled_courses(i, t, p),
    'propose_add_class': _tool_propose_add_class,
    'propose_move_class': _tool_propose_move_class,
    'propose_delete_class': _tool_propose_delete_class,
}


def execute_tool(name, inp, tenant, period, staged):
    """Run one tool call. Never raises — errors are returned to the model."""
    fn = _TOOL_FNS.get(name)
    if fn is None:
        return {'error': f'Unknown tool {name}.'}
    try:
        return fn(inp or {}, tenant, period, staged)
    except Exception as exc:   # tool errors go back to Claude, not to the user as a 500
        return {'error': f'{type(exc).__name__}: {exc}'}


# --- the Claude loop --------------------------------------------------------

def _get_client():
    import anthropic
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


def run_chat(history, user_message, tenant, period, attachments=None):
    """One user turn: run the tool loop until Claude produces a final answer.

    Returns (reply_text, new_history, staged_actions). history is the opaque
    message list from the previous response — content blocks are preserved
    verbatim (thinking blocks must be echoed back unchanged on this model).
    attachments: optional list of content blocks (from assistant_files) sent
    ahead of the user's text in the same message.
    """
    import json

    client = _get_client()
    messages = list(history or [])
    if attachments:
        messages.append({'role': 'user',
                         'content': [*attachments,
                                     {'type': 'text', 'text': user_message}]})
    else:
        messages.append({'role': 'user', 'content': user_message})
    staged = []

    for _ in range(MAX_TOOL_ROUNDS):
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=8000,
            betas=['server-side-fallback-2026-07-01'],
            fallbacks='default',
            thinking={'type': 'adaptive'},
            system=[{'type': 'text', 'text': SYSTEM_PROMPT,
                     'cache_control': {'type': 'ephemeral'}}],
            tools=TOOLS,
            messages=messages,
        )
        messages.append({'role': 'assistant',
                         'content': [b.model_dump() for b in response.content]})

        if response.stop_reason == 'refusal':
            return ('Sorry — I can’t help with that request.', messages, staged)

        tool_uses = [b for b in response.content if b.type == 'tool_use']
        if not tool_uses:
            break

        results = []
        for tu in tool_uses:
            out = execute_tool(tu.name, tu.input, tenant, period, staged)
            results.append({'type': 'tool_result', 'tool_use_id': tu.id,
                            'content': json.dumps(out)})
        messages.append({'role': 'user', 'content': results})

    reply = ' '.join(b.text for b in response.content if b.type == 'text').strip()
    return (reply, messages, staged)
