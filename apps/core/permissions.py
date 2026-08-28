"""Role-based access rules.

Roles: ADMIN (everything incl. user management, import, wipe), REGISTRAR
(full schedule editing), DEPT_HEAD (edits only entries whose sections
belong to their managed programs; sees only those programs' conflicts),
VIEWER (read-only).

Department heads are scoped by PROGRAM CODES (User.managed_program_codes),
resolved at request time — imports and wipes recreate Program rows, so
codes are the only stable reference.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

FULL_EDIT_ROLES = {'ADMIN', 'REGISTRAR'}


def is_admin(user):
    return getattr(user, 'role', None) == 'ADMIN'


def can_edit_all(user):
    return getattr(user, 'role', None) in FULL_EDIT_ROLES


def head_scope(user):
    """A DEPT_HEAD's assignment scope as {'programs', 'departments',
    'courses'} code sets; None for every other role."""
    if getattr(user, 'role', None) != 'DEPT_HEAD':
        return None
    clean = lambda codes: {c for c in (codes or []) if c}
    return {
        'programs': clean(user.managed_program_codes),
        'departments': clean(user.managed_department_codes),
        'courses': clean(user.managed_course_codes),
    }


def entry_in_scope(entry, scope):
    """True when the entry matches ANY assignment dimension: a section in
    a managed program, a managed course, or a course in a managed
    department. (Co-taught cross-program classes match either head.)"""
    if entry.course and entry.course.code in scope['courses']:
        return True
    if entry.course and entry.course.department and \
            entry.course.department.code in scope['departments']:
        return True
    return any(s.program.code in scope['programs']
               for s in entry.sections.all())


def user_can_edit_entry(user, entry):
    if can_edit_all(user):
        return True
    scope = head_scope(user)
    if scope is None:
        return False
    return entry_in_scope(entry, scope)


def create_allowed(user, section_ids, course_id):
    """A DEPT_HEAD may create an entry when the payload includes at least
    one of their own sections, OR the course is one of their managed
    courses / belongs to a managed department."""
    from apps.scheduling.models import Course, Section

    if can_edit_all(user):
        return True
    scope = head_scope(user)
    if scope is None:
        return False
    if course_id:
        course = Course.objects.filter(pk=course_id) \
            .select_related('department').first()
        if course and (course.code in scope['courses'] or
                       (course.department and
                        course.department.code in scope['departments'])):
            return True
    if not section_ids:
        return False
    programs = set(
        Section.objects.filter(pk__in=section_ids)
        .values_list('program__code', flat=True)
    )
    return bool(programs & scope['programs'])


class IsAdminRole(BasePermission):
    message = 'Only administrators can do this.'

    def has_permission(self, request, view):
        return is_admin(request.user)


class ScheduleEntryPermission(BasePermission):
    """Reads for everyone; writes per user_can_edit_entry /
    sections_allowed_for_create. Detail actions (update, destroy,
    edit-group, delete-group) are checked object-level via get_object."""
    message = 'You can only modify classes of your own department.'

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        if can_edit_all(user):
            return True
        if getattr(user, 'role', None) != 'DEPT_HEAD':
            return False
        if view.action == 'create':
            return create_allowed(
                user, request.data.get('sections') or [],
                request.data.get('course'))
        return True   # object-level check decides

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return user_can_edit_entry(request.user, obj)
