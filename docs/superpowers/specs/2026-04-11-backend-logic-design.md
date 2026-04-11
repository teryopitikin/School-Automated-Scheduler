# Backend Logic — Design Specification

**Project**: Automated Loader
**Date**: 2026-04-11
**Location**: `/home/classify/AutomatedLoader`
**Depends on**: Backend Foundation (complete — 11 models, CRUD APIs, conflict detection, auth)

## Overview

This phase adds the business logic layer on top of the existing CRUD foundation: a suggestion engine for ranking available schedule slots, Excel import/export matching the registrar's existing format, dashboard statistics with breakdowns, and period cloning for semester setup.

## 1. Suggestion Engine

**File**: `apps/scheduling/suggestions.py`
**Endpoint**: `POST /api/loader/schedules/suggest/`
**Request body**: `{course: int, sections: [int], faculty: int|null, academic_period: int, num_days: int, class_size: int}`

### Process

1. **Generate candidate slots** — all `(day, time_start, time_end, room)` combinations derived from ScheduleConfig: operating_days, earliest_start_time to latest_end_time, time_slot_granularity_minutes. Time windows sized to the course's contact_hours divided by the number of days requested. The caller specifies how many days to spread across (e.g., 2 days or 3 days), and the engine calculates slot duration = contact_hours / num_days. For a 3-contact-hour course on 2 days: 1.5hr slots. On 3 days: 1hr slots. Room pool filtered by type: lab courses require LABORATORY/COMPUTER_LAB rooms, lecture courses use LECTURE/AVR rooms.

2. **Filter by hard constraints** — remove candidates that violate:
   - Room already booked at that day/time (overlapping ScheduleEntry)
   - Faculty already teaching at that day/time
   - Any selected section already has a class at that day/time
   - Room capacity < class size (uses section student count or a provided estimate)
   - Slot falls within a break_period from ScheduleConfig
   - Faculty marked UNAVAILABLE at that day/time (via FacultyAvailability)
   - Slot outside operating hours (before earliest_start_time or after latest_end_time)

3. **Score each candidate** — weighted sum of 4 soft constraint scores, each normalized to 0-100 then multiplied by their weight from ScheduleConfig:
   - **Faculty priority** (`weight_faculty_priority`): +100 if faculty has PREFERRED availability at this slot, +50 if AVAILABLE, +0 if no availability record. When faculty is null (TBA), this dimension scores 50 for all candidates.
   - **Room proximity** (`weight_room_proximity`): score based on how close the room is to the section's other classes on the same day. Same building + same floor = 100, same building + different floor = 60, different building = 20. No other classes that day = 50 (neutral). Uses building name, floor number, and sequence_number for fine-grained ordering.
   - **Time gap minimization** (`weight_time_gap_minimization`): score based on gap between this slot and the section's nearest class on the same day. Adjacent (0-30min gap) = 100, 30-60min = 70, 60-120min = 40, 120min+ = 10. No other classes that day = 50 (neutral).
   - **Load distribution** (`weight_load_distribution`): score based on how evenly the faculty's teaching hours are spread across the week. Calculates standard deviation of hours-per-day with this slot added. Lower stdev = higher score. Normalized so perfectly even = 100, all on one day = 0.

4. **Rank and return top 10** — sorted by total weighted score descending.

### Response Format

```json
{
  "suggestions": [
    {
      "rank": 1,
      "day": "MON",
      "time_start": "08:00",
      "time_end": "09:30",
      "room": {"id": 5, "name": "Room 101", "building": "Main", "capacity": 40},
      "total_score": 285,
      "scores": {
        "faculty_priority": {"raw": 100, "weight": 50, "weighted": 50},
        "room_proximity": {"raw": 80, "weight": 50, "weighted": 40},
        "time_gap": {"raw": 70, "weight": 30, "weighted": 21},
        "load_distribution": {"raw": 90, "weight": 30, "weighted": 27}
      }
    }
  ]
}
```

### Lecture + Lab Pairing

For courses with `has_lab=True`, the engine generates paired suggestions:
- Candidate pairs: `(lec_slot, lab_slot)` where lec_slot uses a lecture-type room and lab_slot uses a lab-type room
- Lec and lab must be on different days (no same-day lecture+lab)
- Each pair scored as combined unit: average of both slots' scores
- Response includes both slots per suggestion with a shared `group_id`

```json
{
  "suggestions": [
    {
      "rank": 1,
      "lecture": {"day": "MON", "time_start": "10:00", "time_end": "12:00", "room": {...}},
      "lab": {"day": "WED", "time_start": "09:00", "time_end": "12:00", "room": {...}},
      "total_score": 270,
      "scores": {...}
    }
  ]
}
```

## 2. Excel Import

**File**: `apps/scheduling/importers.py`
**Endpoint**: `POST /api/loader/import/`
**Request**: Multipart file upload + `academic_period` ID
**Auth**: Authenticated user, tenant derived from user

### Column Mapping

| Column | Field | Notes |
|--------|-------|-------|
| A | Program code | e.g., "BSA" |
| B | Department code | e.g., "Agri" |
| D | Course code | e.g., "CrSc 1" |
| E | Course title | Full title |
| F | Lec units | Decimal |
| G | Lab units | Decimal |
| H | Total units | Computed (ignored on import, recalculated) |
| I | Contact hours | Decimal |
| L | Faculty name | "Last, First" format. "TBA" or "TBA (dept)" means null faculty |
| N | Days | Multi-line: "Tue\nThu" or abbreviation: "MW", "TTh" |
| O | Time in | Multi-line or datetime.time |
| P | Time out | Multi-line or datetime.time |
| Q | Room | Room name/number |
| R | Section(s) | Comma-separated: "BSA 1-1, BSF 1-1" |
| S | Load classification | Per-day: "Mon - Overload\nWed - Regular" or single: "Built-in" |
| T | Class size | Integer |
| U | Remarks | Free text |
| V-W | Lab days/times | Skipped in v1 — rows with data flagged for manual review |

### Parsing Rules

**Day abbreviation normalization:**
- `"MW"` -> `["MON", "WED"]`
- `"TTh"` -> `["TUE", "THU"]`
- `"MWF"` -> `["MON", "WED", "FRI"]`
- `"Mon"`, `"Tue"`, etc. -> normalized to 3-letter code
- Multi-line: `"Tue\nThu"` -> `["TUE", "THU"]`

**Time parsing:**
- `datetime.time` objects used directly
- `"9:00 AM"` or `"9:00A"` -> `time(9, 0)`
- `"1:00 PM"` or `"1:00P"` -> `time(13, 0)`
- `"9:00A - 12:00P"` -> extract start time only (end from column P)

**Multi-line day/time alignment:**
- Split days, time_in, time_out on `\n`
- Zip together: day[0] + time_in[0] + time_out[0] = entry 1, etc.
- If counts don't match, flag row as warning

**Section parsing:**
- `"BSA 1-1"` -> program="BSA", year_level=1, section_number=1
- `"BSA 1-1, BSF 1-1"` -> multiple sections on one entry (M2M)

**Load classification parsing:**
- Single value: `"Built-in"` -> applied to all entries for this row
- Per-day: `"Mon - Overload\nWed - Regular"` -> parsed and matched to each day's entry
- Normalized to: REGULAR, OVERLOAD, BUILT_IN, PART_TIME

**Auto-creation of missing entities:**
- Programs, Departments, Courses, Faculty, Rooms, Sections are created if they don't exist for this tenant
- Courses created with `has_lab=True` if lab_units > 0
- Faculty created with employment_type inferred from load classification (PART_TIME if any entry is part-time, else FULL_TIME)
- Rooms created with room_type=LECTURE by default (no way to infer from Excel)

**Grouping:**
- All entries parsed from the same row share a `group_id` UUID
- Entries for the same course + section combination across rows are NOT merged (each row is independent)

### Response

```json
{
  "created": 45,
  "skipped": 3,
  "warnings": [
    {"row": 5, "reason": "Day/time count mismatch — 3 days but 2 times"},
    {"row": 12, "reason": "Columns V/W contain lab schedule data — review manually"}
  ],
  "conflicts": [
    {"row": 8, "type": "room", "message": "Room 101 double-booked MON 08:00-10:00"}
  ]
}
```

## 3. Excel Export

**File**: `apps/scheduling/exporters.py`
**Endpoint**: `GET /api/loader/export/?academic_period=ID&type=schedule|faculty_loading|room_utilization`
**Auth**: Authenticated user, tenant scoped

### Export Types

**schedule** — Main export matching the import column layout (A-U). Entries grouped by program then year level. Multi-day entries collapsed into multi-line cells (days, times on separate lines within the cell). Linked lecture+lab entries populate columns V/W with the lab component's days/times. Header row matches the reference Excel exactly.

**faculty_loading** — Per-faculty summary table:
- Columns: Faculty Name, Employment Type, Total Units, Regular Units, Overload Units, Built-in Units, Part-time Units, Course Count, Section Count
- Sorted by faculty name
- Summary row at bottom with totals

**room_utilization** — Weekly grid:
- Rows: rooms (sorted by building, floor, sequence)
- Columns: day + time slot combinations (e.g., "MON 07:00", "MON 07:30", ...)
- Cells: course code if occupied, empty if free
- Color coding: occupied cells highlighted

All exports use openpyxl and return `.xlsx` with content-disposition header for download.

## 4. Dashboard Stats

**File**: `apps/scheduling/stats.py`
**Endpoint**: `GET /api/loader/schedules/stats/?academic_period=ID`
**Auth**: Authenticated user, tenant scoped

### Response

```json
{
  "summary": {
    "total_courses": 45,
    "scheduled": 38,
    "unscheduled": 7,
    "conflict_count": 3,
    "faculty_count": 15,
    "overloaded_faculty_count": 2
  },
  "faculty_breakdown": [
    {
      "id": 1,
      "name": "Dr. Smith",
      "total_units": 24,
      "max_units": 24,
      "regular": 15,
      "overload": 6,
      "built_in": 3,
      "part_time": 0
    }
  ],
  "program_progress": [
    {
      "program_code": "BSA",
      "program_name": "Bachelor of Science in Agriculture",
      "total_courses": 12,
      "scheduled": 10,
      "percentage": 83.3
    }
  ],
  "daily_room_utilization": [
    {
      "day": "MON",
      "total_slots": 120,
      "used_slots": 45,
      "utilization_pct": 37.5
    }
  ]
}
```

### Calculation Notes

- **total_courses**: distinct courses assigned to sections in this period (from Section -> Course through curriculum, or from existing ScheduleEntries). Since we don't have a curriculum model, this counts distinct courses that have at least one ScheduleEntry in the period.
- **scheduled**: courses with at least one ScheduleEntry
- **unscheduled**: for v1, this is 0 (no curriculum model to derive expected courses). The frontend can still show the scheduled count as progress. This field is a placeholder for when curriculum tracking is added.
- **conflict_count**: total hard conflicts from `detect_conflicts` across all entries
- **overloaded_faculty_count**: faculty where total assigned units > max_load_units
- **faculty_breakdown**: units summed from ScheduleEntry.course.lec_units + lab_units, grouped by load_classification
- **daily_room_utilization**: total_slots = number of rooms * number of time slots per day (from ScheduleConfig); used_slots = distinct (room, time_slot) pairs occupied

## 5. Period Cloning

**Endpoint**: `POST /api/loader/academic-periods/{id}/clone/`
**Request body**: `{name: str, year_start: int, year_end: int, semester: str, clone_availability: bool}`
**Auth**: Authenticated user, tenant scoped

### What Gets Cloned

From the source period to the new period (all scoped to the same tenant):
- **Sections** — all sections (program, year_level, section_number) are recreated for the new period
- **ScheduleConfig** — config copied with new period FK

Optionally (when `clone_availability=true`):
- **FacultyAvailability** — all availability slots recreated for the new period

### What Does NOT Get Cloned
- **ScheduleEntries** — new period starts with an empty schedule
- **Programs, Departments, Courses, Faculty, Rooms** — these are period-independent (shared across periods within the tenant), so they don't need cloning

### Response

```json
{
  "academic_period": {<serialized new period>},
  "cloned": {
    "sections": 24,
    "config": true,
    "faculty_availability": 48
  }
}
```

## File Structure

```
apps/scheduling/
├── suggestions.py          # Suggestion engine
├── importers.py            # Excel import parser
├── exporters.py            # Excel export generators
├── stats.py                # Dashboard statistics
├── conflicts.py            # (existing) Conflict detection
├── views.py                # (modify) Add new endpoints
├── urls.py                 # (modify) Add new routes
├── tests/
│   ├── test_suggestions.py # Suggestion engine tests
│   ├── test_importers.py   # Import parser tests
│   ├── test_exporters.py   # Export generation tests
│   ├── test_stats.py       # Stats calculation tests
│   ├── test_clone.py       # Period cloning tests
│   ├── test_conflicts.py   # (existing)
│   ├── test_api.py         # (existing)
│   └── test_models.py      # (existing)
```

## New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/loader/schedules/suggest/` | Get ranked slot suggestions |
| GET | `/api/loader/schedules/stats/?academic_period=ID` | Dashboard statistics |
| POST | `/api/loader/import/` | Excel import |
| GET | `/api/loader/export/?academic_period=ID&type=TYPE` | Excel export |
| POST | `/api/loader/academic-periods/{id}/clone/` | Clone period |
