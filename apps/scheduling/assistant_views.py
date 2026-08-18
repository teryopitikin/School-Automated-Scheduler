"""Endpoints for the built-in Claude assistant.

POST /assistant/chat/         — one chat turn (runs the tool loop server-side)
POST /assistant/execute/      — apply one user-approved staged action
GET/POST /assistant/config/   — read status / save the API key (persists to .env)
POST /assistant/config/test/  — verify the stored key against the Claude API
"""
import os
import uuid

from django.conf import settings
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .assistant import _parse_hhmm, run_chat
from .conflicts import detect_conflicts
from .models import AcademicPeriod, ScheduleEntry
from .serializers import ScheduleEntrySerializer


def _env_path():
    return getattr(settings, 'ASSISTANT_ENV_PATH', None) or os.path.join(settings.BASE_DIR, '.env')


def _config_status():
    key = getattr(settings, 'ANTHROPIC_API_KEY', '') or ''
    return {'configured': bool(key), 'key_tail': key[-4:] if key else None}


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def assistant_config(request):
    """Read assistant status or save the Claude API key from the UI.

    The key is persisted to the gitignored .env file (NOT the database —
    db.sqlite3 is tracked in git) and applied to the running process
    immediately. The full key is never returned; only its last 4 chars."""
    if request.method == 'POST':
        key = (request.data.get('api_key') or '').strip()
        path = _env_path()
        lines = []
        if os.path.exists(path):
            with open(path) as f:
                lines = f.read().splitlines()
        lines = [l for l in lines if not l.startswith('ANTHROPIC_API_KEY=')]
        lines.append(f'ANTHROPIC_API_KEY={key}')
        with open(path, 'w') as f:
            f.write('\n'.join(lines) + '\n')
        settings.ANTHROPIC_API_KEY = key
    return Response(_config_status())


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assistant_config_test(request):
    """Ping the Claude API with the stored key and report the outcome."""
    from . import assistant

    if not getattr(settings, 'ANTHROPIC_API_KEY', ''):
        return Response({'ok': False, 'error': 'No API key configured.'})
    try:
        assistant._get_client().models.retrieve(assistant.MODEL)
        return Response({'ok': True, 'model': assistant.MODEL})
    except Exception as exc:
        return Response({'ok': False, 'error': str(exc)})


def _tenant_period(request):
    tenant = getattr(request, 'tenant', None) or request.user.tenant
    period = (AcademicPeriod.objects.filter(tenant=tenant, status='ACTIVE').first()
              or AcademicPeriod.objects.filter(tenant=tenant).first())
    return tenant, period


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assistant_chat(request):
    if not getattr(settings, 'ANTHROPIC_API_KEY', ''):
        return Response(
            {'detail': 'Claude is not configured — add your Anthropic API key in '
                       'Configuration → Claude Assistant.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE)

    message = (request.data.get('message') or '').strip()
    if not message:
        return Response({'detail': 'message is required.'},
                        status=status.HTTP_400_BAD_REQUEST)
    history = request.data.get('history') or []
    tenant, period = _tenant_period(request)
    if period is None:
        return Response({'detail': 'No academic period exists yet.'},
                        status=status.HTTP_400_BAD_REQUEST)

    try:
        reply, new_history, actions = run_chat(history, message, tenant, period)
    except Exception as exc:
        return Response({'detail': f'Claude request failed: {exc}'},
                        status=status.HTTP_502_BAD_GATEWAY)
    return Response({'reply': reply, 'history': new_history, 'actions': actions})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assistant_execute(request):
    """Apply one staged action after user approval. Same conflict rules as the
    manual flows: hard clashes block unless allow_conflicts is passed."""
    action = request.data.get('action') or {}
    payload = action.get('payload') or {}
    allow = bool(request.data.get('allow_conflicts'))
    tenant, _ = _tenant_period(request)

    if action.get('type') == 'add_class':
        group = uuid.uuid4()
        created, hard, warnings = [], [], []
        common = {k: payload.get(k) for k in
                  ('academic_period', 'course', 'faculty', 'room',
                   'time_start', 'time_end')}
        common.update({'entry_type': 'LECTURE', 'load_classification': 'REGULAR',
                       'class_size': payload.get('class_size', 0),
                       'sections': payload.get('sections', [])})
        with transaction.atomic():
            for day in payload.get('days') or []:
                ser = ScheduleEntrySerializer(data={**common, 'day_of_week': day})
                ser.is_valid(raise_exception=True)
                ser.save(tenant=tenant, group_id=group)
                created.append(ser.instance)
            for entry in created:
                result = detect_conflicts(entry)
                hard.extend(result['hard'])
                warnings.extend(result['warnings'])
            if hard and not allow:
                transaction.set_rollback(True)
        if hard and not allow:
            return Response({'blocked': True, 'hard': hard, 'warnings': warnings},
                            status=status.HTTP_409_CONFLICT)
        return Response({'created': len(created), 'warnings': warnings,
                         'entries': [ScheduleEntrySerializer(e).data for e in created]},
                        status=status.HTTP_201_CREATED)

    if action.get('type') == 'move_class':
        try:
            entry = ScheduleEntry.objects.get(tenant=tenant, pk=payload.get('entry_id'))
        except ScheduleEntry.DoesNotExist:
            return Response({'detail': 'Entry not found.'}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            entry.day_of_week = payload.get('day_of_week', entry.day_of_week)
            if payload.get('time_start'):
                entry.time_start = _parse_hhmm(payload['time_start'])
            if payload.get('time_end'):
                entry.time_end = _parse_hhmm(payload['time_end'])
            entry.save()
            conflicts = detect_conflicts(entry)
            if conflicts['hard'] and not allow:
                transaction.set_rollback(True)
        if conflicts['hard'] and not allow:
            return Response({'blocked': True, 'hard': conflicts['hard']},
                            status=status.HTTP_409_CONFLICT)
        return Response(ScheduleEntrySerializer(entry).data)

    if action.get('type') == 'delete_class':
        try:
            entry = ScheduleEntry.objects.get(tenant=tenant, pk=payload.get('entry_id'))
        except ScheduleEntry.DoesNotExist:
            return Response({'detail': 'Entry not found.'}, status=status.HTTP_404_NOT_FOUND)
        entry.delete()
        return Response({'deleted': True})

    return Response({'detail': f'Unknown action type {action.get("type")!r}.'},
                    status=status.HTTP_400_BAD_REQUEST)
