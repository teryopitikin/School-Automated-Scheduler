# Automated Loader — Design Specification

**Project**: Automated Loader
**Date**: 2026-04-11
**Location**: `/home/classify/AutomatedLoader`
**Stack**: Django + DRF backend, React + Vite frontend, PostgreSQL, Redis

## Overview

A multi-tenant school schedule loading system that automates the assignment of courses to faculty, rooms, and time slots. Replaces the current manual Excel-based workflow with a web application that provides real-time conflict detection, smart slot suggestions, and configurable scheduling priorities.

**Target users**: School registrars / scheduling office staff.

**Key capabilities**:
- Build semester schedules by assigning courses to faculty, rooms, time slots, and sections
- Real-time conflict detection (room, faculty, and section double-booking)
- Smart suggestion engine that ranks available slots based on configurable weights
- Import existing Excel schedules to bootstrap data
- Export schedules back to Excel for printing and distribution
- Multi-tenant — each school gets isolated data, shared codebase

## Data Model

### Tenant & Auth

- **Tenant** — a school. Has slug (for subdomain), name, status (ACTIVE, SUSPENDED, TRIAL).
- **User** — Django AbstractUser with tenant FK. Roles: ADMIN, REGISTRAR, VIEWER.

### Academic Structure

- **AcademicPeriod** — scopes all scheduling data. Fields: name (e.g., "1st Semester 2025-2026"), year_start, year_end, semester (1ST, 2ND, SUMMER), status (DRAFT, ACTIVE, ARCHIVED).
- **Program** — degree programs. Fields: code (e.g., "BSA"), name (e.g., "Bachelor of Science in Agriculture"), tenant FK.
- **Department** — organizational units that own courses. Fields: code (e.g., "Agri"), name, tenant FK.
- **Section** — a group of students in a program/year. Fields: program FK, year_level (1-5), section_number (1, 2, etc.), academic_period FK, tenant FK. Display format: "{program} {year}-{section}" (e.g., "BSA 1-1").

### Courses

- **Course** — the course catalog. Fields: code (e.g., "CrSc 1"), title, department FK, lec_units, lab_units, total_units (computed), contact_hours, has_lab (bool), tenant FK.

### Faculty

- **Faculty** — teacher profiles. Fields: name, employment_type (FULL_TIME, PART_TIME), priority_level (integer, higher = more priority for preferred slots), max_load_units, tenant FK.
- **FacultyAvailability** — per-period availability. Fields: faculty FK, academic_period FK, day_of_week, time_start, time_end, availability_type (AVAILABLE, PREFERRED, UNAVAILABLE).

### Rooms

- **Room** — physical spaces. Fields: name/code, room_type (LECTURE, LABORATORY, COMPUTER_LAB, AVR, OTHER), capacity, building, floor, sequence_number (for proximity calculation), tenant FK.

Proximity scoring: rooms on the same floor of the same building are closest. `sequence_number` provides fine-grained ordering within a floor.

### Scheduling

- **ScheduleEntry** — the core entity tying everything together:
  - academic_period FK
  - course FK
  - faculty FK (nullable for TBA assignments)
  - room FK
  - section M2M (supports shared sections like "BSA 1-1, BSF 1-1, BECED 1-1")
  - day_of_week (MON, TUE, WED, THU, FRI, SAT, SUN) — one row per day; a MWF course produces 3 ScheduleEntry rows grouped by a shared `group_id` UUID
  - time_start, time_end
  - group_id (UUID) — groups entries that belong to the same course assignment (e.g., all 3 days of a MWF lecture share one group_id; the linked lab days share another)
  - entry_type (LECTURE, LAB) — for courses with both components
  - load_classification (REGULAR, OVERLOAD, BUILT_IN, PART_TIME) — manually assigned per day (from Excel: "Mon - Overload, Wed - Regular")
  - class_size (integer)
  - faculty_credits (decimal)
  - remarks (text, optional)
  - linked_entry FK (self-referential, nullable) — links lecture entry to its lab entry
  - tenant FK

### Configuration

- **ScheduleConfig** — per-period tuning parameters:
  - academic_period FK (one-to-one)
  - earliest_start_time, latest_end_time
  - time_slot_granularity_minutes (default 30)
  - operating_days (JSON list, e.g., ["MON","TUE","WED","THU","FRI"])
  - break_periods (JSON list of {day, start, end, label})
  - weight_faculty_priority (0-100, default 50)
  - weight_room_proximity (0-100, default 50)
  - weight_time_gap_minimization (0-100, default 30)
  - weight_load_distribution (0-100, default 30)
  - tenant FK

## Suggestion Engine

When the registrar assigns a course, the system suggests ranked slot options.

### Input
- Selected course, section(s), and faculty (optional)
- Current state of all existing schedule entries for the period

### Process
1. **Generate candidate slots** — all valid (day, time_start, time_end, room) combinations that don't violate hard constraints
2. **Filter by hard constraints**:
   - No room double-booking at the same day/time
   - No faculty double-booking at the same day/time
   - No section double-booking at the same day/time
   - Room type matches course requirement (lab courses need lab rooms)
   - Room capacity >= class size
   - Slot falls within operating hours and avoids break periods
   - Faculty is not marked UNAVAILABLE at that time
3. **Score each candidate** using weighted soft constraints:
   - **Faculty priority**: if faculty has PREFERRED availability at this slot, boost score proportional to `weight_faculty_priority`
   - **Room proximity**: score based on distance to the section's other classes on the same day, proportional to `weight_room_proximity`. Distance = difference in (building, floor, sequence_number).
   - **Time gap minimization**: penalize large gaps between the section's classes on the same day, proportional to `weight_time_gap_minimization`
   - **Load distribution**: penalize uneven faculty load across days, proportional to `weight_load_distribution`
4. **Rank and return** top 10 suggestions with score breakdown

### Lecture + Lab Pairing
For courses with `has_lab=True`, the engine suggests paired slots:
- Generates candidate pairs: (lec_slot, lab_slot) where lec uses a lecture room and lab uses a lab room
- Scores the pair as a combined unit
- Returns paired suggestions: "Lec: MW 10:00-12:00 in Room 3 | Lab: Thu 9:00-12:00 in WL 1"

## Conflict Detection

Real-time validation on every schedule entry create/update:

**Hard conflicts (block save):**
- Room conflict: another entry uses the same room at overlapping day/time
- Faculty conflict: same faculty assigned to overlapping day/time
- Section conflict: same section has a class at overlapping day/time

**Warnings (allow save but flag):**
- Faculty exceeding max_load_units for the period
- Room at or over capacity
- Faculty teaching outside their preferred times
- Large time gaps for a section in a single day

## Key Workflows

### 1. Semester Setup
1. Create academic period
2. Optionally clone courses, sections, rooms, and faculty availability from a previous period
3. Configure schedule parameters (time boundaries, break periods, weights)
4. Begin scheduling

### 2. Schedule Building
1. Registrar selects a course and section
2. Assigns a faculty member and load classification
3. System suggests ranked available slots (day + time + room)
4. Registrar picks a suggestion or manually selects any valid slot
5. For lecture+lab courses, both components are assigned as a linked pair
6. Dashboard shows progress and any conflicts

### 3. Excel Import
- Upload existing Excel file (format matching "NH Faculty Loading" structure)
- System parses and maps columns to entities: program, department, course code, course title, lec/lab units, contact hours, days, times, faculty, room, section, load classification, class size, remarks
- Handles multi-line cell values (e.g., "Tue\nThu" for days, "9:00 AM\n10:00 AM" for times)
- Creates missing programs, departments, courses, faculty, rooms, and sections as needed
- Creates schedule entries from the parsed rows
- Returns validation report: successful imports, skipped rows, conflicts found

### 4. Excel Export
- Generate Excel matching the familiar format (same columns as the import)
- Faculty loading report: per-faculty summary of total units, breakdown by load classification
- Room utilization report: per-room weekly schedule grid

### 5. Clone Between Periods
- Copy all structure (courses, sections, rooms, faculty) from one period to a new one
- Schedule entries are NOT cloned (new period starts with empty schedule)
- Faculty availability can optionally be carried over

## API Structure

```
/api/loader/academic-periods/          CRUD + clone action
/api/loader/programs/                  CRUD
/api/loader/departments/               CRUD
/api/loader/courses/                   CRUD
/api/loader/faculty/                   CRUD
/api/loader/faculty/:id/availability/  CRUD availability slots
/api/loader/rooms/                     CRUD
/api/loader/sections/                  CRUD
/api/loader/schedules/                 CRUD
/api/loader/schedules/suggest/         POST — get ranked slot suggestions
/api/loader/schedules/conflicts/       GET — list all current conflicts
/api/loader/schedules/stats/           GET — dashboard statistics
/api/loader/import/                    POST — Excel import
/api/loader/export/                    GET — Excel export
/api/loader/config/                    GET/PUT — schedule config
/api/loader/auth/login/                GET/POST — login
/api/loader/auth/logout/               POST — logout
```

## Frontend Pages

1. **Login** — username/password authentication
2. **Dashboard** — academic period overview, scheduling progress (courses scheduled vs. remaining), conflict count, faculty loading summary chart
3. **Academic Periods** — list, create, clone from previous
4. **Programs & Sections** — manage degree programs, create sections per period
5. **Departments** — department list management
6. **Courses** — course catalog with lec/lab units, contact hours, department
7. **Faculty** — teacher profiles, employment type, priority, max load, availability calendar
8. **Rooms** — room list with capacity, type, building/floor/sequence for proximity
9. **Schedule Builder** — main workspace:
   - Timetable grid view (days x time slots)
   - Filter by section, faculty, or room view
   - Click-to-assign flow with suggestion panel
   - Real-time conflict indicators
   - Linked lecture+lab display
10. **Configuration** — tuning parameters, time boundaries, break periods, priority weights
11. **Reports** — faculty loading, room utilization
12. **Import/Export** — upload Excel, download current schedule

## Multi-Tenancy

Same pattern as Smart-HR:
- Tenant model with slug for subdomain detection
- TenantMiddleware detects tenant from subdomain or authenticated user
- All models have tenant FK with tenant-scoped querysets
- Shared database, tenant isolation via foreign keys

## Future Integration Points

- REST API endpoints for RMS/LMS to pull finalized schedules by period
- Webhook notifications when a schedule is published (status change)
- API authentication via tokens for system-to-system integration

## Tech Stack Details

- **Backend**: Python 3.12+, Django 5.x, Django REST Framework, PostgreSQL, Redis
- **Frontend**: React 18+, Vite, Axios, Material UI (same as Smart-HR for consistency)
- **Excel handling**: openpyxl for import/export
- **Auth**: Session-based (web), Token-based (future API integrations)
