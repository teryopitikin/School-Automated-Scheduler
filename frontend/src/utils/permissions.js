// Frontend mirror of apps/core/permissions.py — the backend is
// authoritative; this only drives what the UI offers.

export const isAdmin = (user) => user?.role === 'ADMIN';

export const canEditSchedule = (user) =>
  user?.role === 'ADMIN' || user?.role === 'REGISTRAR';

export const isDeptHead = (user) => user?.role === 'DEPT_HEAD';

// A DEPT_HEAD can modify an entry when ANY assignment matches: a section
// in a managed program, a managed course, or a course in a managed
// department. Section names look like "BEED 1-1" — program code first.
export function canEditEntry(user, entry) {
  if (canEditSchedule(user)) return true;
  if (!isDeptHead(user)) return false;
  const programs = user.managed_program_codes || [];
  const departments = user.managed_department_codes || [];
  const courses = user.managed_course_codes || [];
  if (entry.course_code && courses.includes(entry.course_code)) return true;
  if (entry.course_department_code && departments.includes(entry.course_department_code)) return true;
  return (entry.section_names || []).some(
    (name) => programs.includes(String(name).split(' ')[0]),
  );
}

// Whether the user can plot anything at all (heads can, scoped; viewers can't).
export const canPlot = (user) => canEditSchedule(user) || isDeptHead(user);
