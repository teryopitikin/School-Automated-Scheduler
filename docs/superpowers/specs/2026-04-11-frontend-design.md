# Automated Loader — Frontend Design Specification

**Project**: Automated Loader
**Date**: 2026-04-11
**Location**: `/home/classify/AutomatedLoader/frontend`
**Stack**: React 19 + Vite + MUI 7 + Axios + React Router 7

## Overview

Frontend for the Automated Loader scheduling system. Provides 12 pages for registrars to build semester schedules, manage academic data, and import/export Excel files. The centerpiece is the Schedule Builder — a sidebar + timetable grid workspace with inline slot suggestions and real-time conflict detection.

## Architecture

### Project Structure

```
frontend/
├── src/
│   ├── api/           # Axios instance + one module per resource
│   ├── components/    # Shared: DataTable, ConfirmDialog, FormDialog, etc.
│   ├── context/       # AuthContext, SnackbarContext
│   ├── hooks/         # useApi, useAuth, useDebounce
│   ├── layouts/       # AppLayout (sidebar nav + topbar + content)
│   ├── pages/         # One folder per page/feature
│   ├── theme.js       # Teal/blue-green MUI theme
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── vite.config.js
└── package.json
```

### State Management

- **AuthContext**: current user, tenant info, login/logout methods. Populated from `/api/loader/auth/me/`.
- **SnackbarContext**: global notification toasts via notistack.
- **Local state**: all page-level state lives in components. No Redux — the app is CRUD-heavy with one complex page (Schedule Builder) that manages its own state.

### API Layer

- Axios instance at `api/client.js` with:
  - Base URL: `/api/loader/`
  - CSRF token from cookie (Django's `csrftoken`)
  - Session cookie auth (withCredentials)
  - Response interceptor: 401 → redirect to login
- One module per resource: `api/schedules.js`, `api/faculty.js`, `api/courses.js`, etc.
- Each module exports CRUD functions + any custom actions (e.g., `suggestSlots()`, `clonePeriod()`).

### Vite Config

- Proxy `/api/` to Django at `http://localhost:8000` in dev
- React plugin, standard build config

## Pages & Routing

| Route | Page | Description |
|---|---|---|
| `/login` | Login | Username/password form, redirects to `/` on success |
| `/` | Dashboard | Active period overview, progress, conflicts, faculty chart |
| `/academic-periods` | Academic Periods | List, create, clone from previous period |
| `/programs` | Programs & Sections | Programs list + sections nested per period |
| `/departments` | Departments | Simple CRUD list |
| `/courses` | Courses | Course catalog with department filter |
| `/faculty` | Faculty | Profiles + availability grid per period |
| `/rooms` | Rooms | Room list with capacity, type, building/floor |
| `/schedule` | Schedule Builder | Main workspace — sidebar + timetable grid |
| `/config` | Configuration | Time boundaries, breaks, suggestion weights |
| `/reports` | Reports | Faculty loading + room utilization tables |
| `/import-export` | Import/Export | Upload Excel, download schedule exports |

### Navigation Sidebar

Dark sidebar (`#0f172a`), grouped sections:

- **Scheduling**: Dashboard, Schedule Builder
- **Data**: Academic Periods, Programs, Departments, Courses, Faculty, Rooms
- **Tools**: Configuration, Reports, Import/Export

Collapsible to icon-only mode. Active item highlighted in teal.

### Auth Flow

- All routes except `/login` are protected.
- On app load, AuthContext calls `/api/loader/auth/me/`. If 401 → redirect to `/login`.
- Login form POSTs to `/api/loader/auth/login/`. On success, re-fetches `/auth/me/` and redirects to `/`.
- Logout POSTs to `/api/loader/auth/logout/` and clears context.

## Schedule Builder

The core page. Three-part layout: left sidebar, center timetable grid, hover popovers for detail.

### Left Sidebar — Course List

- Scoped to active academic period and selected section.
- Section selector dropdown at top (e.g., "BSA 1-1").
- Search bar to filter courses.
- Courses grouped by status:
  - **Pending** (top): courses not yet assigned for this section. Amber left border.
  - **Assigned** (bottom, collapsed by default): courses already scheduled. Green left border.
  - **Conflict** courses get a red left border regardless of group.
- Each course card shows: code, title, units, lec/lab badge.
- Click a course → enters **assignment mode**.

### Center — Timetable Grid

- Rows: time slots at 30-min granularity (configured by ScheduleConfig `earliest_start_time` to `latest_end_time`).
- Columns: operating days from config (typically Mon–Sat).
- Assigned entries render as colored blocks spanning their time range. Each block shows: course code, room, faculty (abbreviated). Break periods shown as gray striped rows.
- **Course colors**: each course gets a consistent color from a predefined 10-color palette. Same course = same color across all views.

### Assignment Mode

When a course is selected from the sidebar:

1. Grid cells update to show availability:
   - **Available slots**: green dashed border.
   - **Best suggestions**: green dashed border + star badge with rank number (top 5 from suggestion engine).
   - **Conflicting slots**: red background + lock icon.
   - **Occupied slots**: unchanged (existing entries shown normally).
2. Hover over an available slot → tooltip shows score breakdown (faculty priority, room proximity, gap minimization, load distribution scores).
3. Click an available slot → **Assignment Dialog** opens.

### Assignment Dialog (Modal)

- **Pre-filled**: course, section(s) from sidebar selection.
- **Faculty**: dropdown with all faculty for this period + "TBA" option.
- **Room**: auto-suggested based on clicked slot's suggestion data, but changeable via dropdown.
- **Day pattern**: selector for common patterns (MWF, TTh, MW, single day, custom). Creates grouped ScheduleEntry rows with shared `group_id`.
- **Time**: pre-filled from clicked slot, adjustable.
- **Load classification**: dropdown — Regular, Overload, Built-in, Part-time.
- **Class size**: number input.
- **Remarks**: optional text field.
- **Lab pairing** (for `has_lab` courses): second section appears for lab slot — room (lab rooms only), day, time. Linked via `linked_entry`.
- **Save**: calls conflict check → if conflicts, show inline errors. If clean, create entries and refresh grid.

### View Switcher

Tabs above the grid: **Section** (default) | **Faculty** | **Room**.

- Section view: shows one section's weekly timetable.
- Faculty view: dropdown to pick faculty, shows their weekly schedule across all sections.
- Room view: dropdown to pick room, shows all entries in that room.

### Conflict Indicators

- Red badge counter in the topbar showing total active conflicts for the period.
- Click → conflicts drawer slides out listing each conflict with type (room/faculty/section), involved entries, and "Go to entry" action that scrolls the grid to that time slot.

## CRUD Pages Pattern

All data management pages follow the same pattern:

### List View
- MUI DataGrid with server-side pagination.
- Search bar + relevant column filters.
- "Add" button in top-right → opens create dialog.
- Row actions column: Edit (pencil icon), Delete (trash icon with confirm dialog).

### Create/Edit
- Modal dialogs (MUI Dialog), not separate pages.
- MUI form fields with client-side validation.
- Save → API call → success toast → refresh list → close dialog.
- Error → inline field errors from API response.

### Page-Specific Variations

**Faculty page**: Extra "Availability" tab per faculty member. Shows a weekly grid (same time slots as Schedule Builder) where you click cells to toggle between Available / Preferred / Unavailable for the selected academic period.

**Academic Periods page**: "Clone from..." action on each period row. Opens a dialog to select source period and checkboxes for what to clone (courses, sections, rooms, faculty availability).

**Programs page**: Sections displayed as a nested expandable row or sub-table within each program, scoped to the active academic period. Create section dialog includes year level and section number.

## Dashboard

- **Period selector**: dropdown at top to switch active academic period.
- **Stats row**: 4 MUI Cards — Total Courses, Scheduled count (with progress %), Active Conflicts, Faculty Count.
- **Left chart**: scheduling progress bar chart by program (e.g., "BSA: 12/15 courses scheduled") using Recharts.
- **Right chart**: faculty load distribution — horizontal bar chart showing units per faculty, colored segments by load classification (Regular, Overload, Built-in, Part-time).
- **Bottom**: quick conflict list showing up to 5 most recent conflicts with "View All" link to Schedule Builder.

## Reports

Two tabs: **Faculty Loading** | **Room Utilization**.

### Faculty Loading
- Table columns: Faculty Name, Employment Type, Total Units, Regular Units, Overload Units, Built-in Units, Part-time Units, Total Contact Hours.
- Filterable by department.
- "Export" button → calls `/api/loader/export/?type=faculty_loading`.

### Room Utilization
- Table columns: Room Name, Type, Building/Floor, Total Hours Used, Utilization %, weekly mini-grid (small colored blocks showing occupied slots).
- "Export" button → calls `/api/loader/export/?type=room_utilization`.

## Import/Export

### Import
- File upload dropzone (drag & drop or click to browse).
- After upload: validation report showing:
  - Success count (entries created).
  - Skipped rows with reasons (missing data, parse errors).
  - Conflicts found (entries created but flagged).
- Preview step: show parsed data in a table before confirming the import.
- Confirm → POST to `/api/loader/import/` → show results.

### Export
- Three download buttons:
  - **Schedule Export** → full schedule Excel matching the registrar's familiar format.
  - **Faculty Loading Report** → per-faculty summary workbook.
  - **Room Utilization Report** → per-room weekly grid workbook.
- Each calls `/api/loader/export/` with the appropriate query parameters.

## Configuration

- **Time boundaries**: earliest start time, latest end time (time pickers).
- **Time slot granularity**: dropdown (15, 30, 60 minutes).
- **Operating days**: multi-select checkboxes (Mon–Sun).
- **Break periods**: editable list — each entry has day (or "All"), start time, end time, label. Add/remove rows.
- **Suggestion weights**: four sliders (0–100) with labels:
  - Faculty Priority
  - Room Proximity
  - Time Gap Minimization
  - Load Distribution
- Save → PUT to `/api/loader/config/`.

## Theme

### Color Palette
- **Primary**: `#0d9488` (teal-600) — buttons, active nav, links
- **Primary dark**: `#0f766e` — hover states
- **Primary light**: `#ccfbf1` — selected rows, light backgrounds
- **Secondary**: `#6366f1` (indigo) — accent for badges, schedule entry highlights
- **Error**: `#ef4444` (red) — conflicts, destructive actions
- **Warning**: `#f59e0b` (amber) — pending items, capacity warnings
- **Success**: `#22c55e` (green) — assigned items, confirmations
- **Background**: `#f8fafc` (slate-50)
- **Paper/Cards**: `#ffffff`
- **Sidebar**: `#0f172a` (slate-900) background, white text, teal active highlight

### Typography
- MUI default Roboto font family.
- Standard MUI type scale.

### Schedule Entry Colors
Predefined 10-color palette for course entries on the timetable grid. Each course is assigned a consistent color (by hash of course ID) so it's visually identifiable across all views:

```
#3b82f6 (blue), #8b5cf6 (violet), #ec4899 (pink), #f97316 (orange),
#14b8a6 (teal), #eab308 (yellow), #6366f1 (indigo), #84cc16 (lime),
#06b6d4 (cyan), #f43f5e (rose)
```

## Shared Components

- **DataTable**: wraps MUI DataGrid with search, pagination, and row actions.
- **FormDialog**: reusable modal dialog with form fields, validation, save/cancel.
- **ConfirmDialog**: destructive action confirmation with customizable message.
- **PageHeader**: title + breadcrumb + action button(s).
- **StatCard**: dashboard stat card with icon, label, value, optional trend.
- **LoadingOverlay**: full-page or component-level loading spinner.
