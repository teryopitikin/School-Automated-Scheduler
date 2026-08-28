# User Management, Department-Scoped Conflicts, Admin Import & Wipe

Date: 2026-08-28 · Status: approved (chat) · Owner: admin

## Goal

Multi-user operation: admins create users and assign which department they
belong to; each department head sees the conflicts of their own department
and can fix (edit) only their own department's classes. Admins also get an
in-app import of a full schedule workbook and a wipe-current-schedule action.

"Department" = **Program** (BEED, BSCRIM, BSBA-FM, …). A head may own
several programs. Heads see the whole timetable read-only for context;
their conflict lists and dashboard are scoped to their programs.

## Roles

| Role | Schedule | Conflicts shown | Users page | Import/Wipe |
|------|----------|-----------------|------------|-------------|
| ADMIN | edit all | all | yes | yes |
| REGISTRAR | edit all | all | no | no |
| DEPT_HEAD | edit only entries whose sections intersect their programs | only their programs' | no | no |
| VIEWER | read-only | all (read-only) | no | no |

## Data model (apps/core)

- `User.Role` += `DEPT_HEAD`.
- `User.managed_program_codes` = JSONField list of program **codes**
  (not FKs): the full-export importer and the wipe action delete and
  recreate Program rows, which would sever M2M links; codes survive both
  with no preservation logic. Resolved to Program rows at query time;
  codes with no matching program simply scope to nothing.

## Enforcement (backend, authoritative; frontend only mirrors)

`apps/core/permissions.py`:
- `can_edit_schedule(user)` — ADMIN/REGISTRAR full edit.
- `editable_section_ids(user, tenant)` — for DEPT_HEAD, sections whose
  program code ∈ managed_program_codes.
- `user_can_edit_entry(user, entry)` — full edit, or DEPT_HEAD with at
  least one of the entry's sections in their programs (co-taught
  cross-program entries are fixable by either side's head).
- DRF permission `ScheduleWritePermission` on ScheduleEntryViewSet:
  safe methods allowed; writes need full edit or (DEPT_HEAD + object
  check); creates need ≥1 of the head's own sections in payload.
- Assistant `/execute/` applies the same check per staged action.
- Import endpoints (both formats) + wipe endpoint: ADMIN only
  (`IsAdminRole`).
- User CRUD: ADMIN only.

## Conflict scoping

- `/schedules/conflicts/`: for DEPT_HEAD, only rows whose entry's
  sections intersect their programs (others unchanged).
- Dashboard stats endpoint: same scoping of conflict pairs /
  conflicts-by-program for DEPT_HEAD; utilization/other cards unscoped
  (read-only context).

## User management API

`/api/core/users/` ModelViewSet (ADMIN only): list/create/update/
deactivate (no hard delete; `is_active=false`), fields: username, email,
password (write-only, optional on update), role, managed_program_codes,
is_active. New users get the admin's tenant. `/auth/me/` now returns
`role` + `managed_program_codes`.

## Admin import (in-app)

- `apps/scheduling/full_export_importer.py` — logic moved from
  `scripts/import_full_export.py` (script becomes a thin wrapper).
  Wipe-and-replace of ALL scheduling data for the tenant, then rebuild
  from workbook (metadata sheets + All Entries; section labels split on
  `+` or `,`). Returns summary dict (wiped/created/skipped/unknown).
- `POST /api/scheduler/import-full-export/` — multipart file +
  `academic_period`; validates sheet layout before wiping; ADMIN only.
- Existing cleaned-format import endpoint also becomes ADMIN only.
- Import/Export page: second card "Full schedule export (wipe &
  replace)" with warning + type-to-confirm; shows result summary.
  Two explicit cards, no format auto-detection (destructive path must
  be deliberate).

## Wipe current schedule (admin)

- `POST /api/scheduler/wipe-schedule/` — deletes ScheduleEntry, Section,
  Course, Faculty, Room, Program, Department for the tenant (same scope
  as the importer's wipe; users, academic periods, config survive).
  ADMIN only. Returns per-model counts.
- Import/Export page: "Wipe current schedule" card, type-to-confirm
  (`WIPE`), admin-visible only.

## Frontend

- AuthContext/me: role + managed_program_codes drive gating.
- New Users page (admin-only nav item): table + full-page create/edit
  form (username, email, password, role, program multi-select shown only
  for DEPT_HEAD, active toggle).
- Schedule Builder: for DEPT_HEAD, entries outside their programs render
  read-only (no drag, no edit/delete buttons, slot clicks in views that
  would create foreign-section entries disabled); VIEWER sees no edit
  affordances anywhere. Backend still enforces regardless.
- Conflicts drawer/dashboard need no client filtering — server scopes.

## Testing (TDD)

- Permission matrix: role × create/move/edit/delete × own/foreign/
  co-taught entry; assistant execute; import + wipe endpoints.
- User CRUD API incl. non-admin 403s, password set/change, deactivation.
- Conflict scoping for DEPT_HEAD on /conflicts/ + stats.
- full_export_importer unit test on a tiny in-memory workbook (round
  trip incl. comma section labels); wipe endpoint counts.
