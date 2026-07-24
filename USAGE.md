# School Automated Scheduler — Browser Usage Guide

A step-by-step walkthrough of using School Automated Scheduler to build a school class schedule.

---

## 0. Prerequisites (already done)

- Django backend running on **http://localhost:8000**
- Vite frontend running on **http://localhost:5173**
- Superuser: **`admin` / `admin`**, tenant: **Demo School**

---

## 1. Log in

1. Open **http://localhost:5173/** in your browser.
2. Enter username `admin` and password `admin`.
3. You land on the **Dashboard** — shows stat cards, charts, and a conflict summary (all empty at first).

Left sidebar is your navigation. Follow the steps below **in order** — each one depends on data from the previous step.

---

## 2. Create an Academic Period *(required first — everything scopes to it)*

1. Sidebar → **Academic Periods**.
2. Click **New** / **Add**.
3. Fill in:
   - **Name**: e.g., `1st Semester 2026-2027`
   - **Year start / Year end**: `2026` / `2027`
   - **Semester**: `1ST` (or `2ND`, `SUMMER`)
   - **Status**: `ACTIVE` (others: `DRAFT`, `ARCHIVED`)
4. Save. Make sure the period is **ACTIVE** — that's the one the scheduler uses.

---

## 3. Create Departments

1. Sidebar → **Departments**.
2. Add one row per department.
   - **Code**: e.g., `Agri`, `CS`, `GE`
   - **Name**: e.g., `Agriculture`, `Computer Science`, `General Education`
3. Save each.

---

## 4. Create Programs

1. Sidebar → **Programs**.
2. Add one row per degree program.
   - **Code**: e.g., `BSA`, `BSCS`, `BECED`
   - **Name**: e.g., `Bachelor of Science in Agriculture`
3. Save.

---

## 5. Create Courses

1. Sidebar → **Courses**.
2. Add each course in the catalog.
   - **Code**: e.g., `CrSc 1`
   - **Title**: `Introduction to Crop Science`
   - **Department**: pick from step 3
   - **Lec units**, **Lab units**: e.g., `2` and `1`
   - **Contact hours**: e.g., `5`
   - **Has lab**: tick if the course has a lab component
3. Save.

---

## 6. Create Faculty

1. Sidebar → **Faculty**.
2. For each teacher:
   - **Name**
   - **Employment type**: `FULL_TIME` or `PART_TIME`
   - **Priority level**: integer — higher = gets preferred slots first
   - **Max load units**: e.g., `24`
3. Save.
4. *(Optional but recommended)* Set **availability** for each faculty — days & times they can teach, with flags `AVAILABLE`, `PREFERRED`, or `UNAVAILABLE`. The suggestion engine uses this.

---

## 7. Create Rooms

1. Sidebar → **Rooms**.
2. For each room:
   - **Name/Code**: e.g., `Rm 101`
   - **Type**: `LECTURE`, `LABORATORY`, `COMPUTER_LAB`, `AVR`, or `OTHER`
   - **Capacity**: e.g., `40`
   - **Building**, **Floor**, **Sequence number** (used for proximity scoring)
3. Save.

---

## 8. Configure Scheduling Rules

1. Sidebar → **Configuration**.
2. For the active academic period, set:
   - **Earliest start time** / **Latest end time** (e.g., `07:00` – `19:00`)
   - **Slot granularity**: `30` (minutes)
   - **Operating days**: `MON, TUE, WED, THU, FRI` (toggle as needed)
   - **Break periods**: add e.g., lunch `11:30–12:30` for each day
   - **Weights** (0–100): tune how the suggestion engine ranks slots
     - `weight_faculty_priority` — respect senior faculty preferences
     - `weight_room_proximity` — keep a faculty's rooms close
     - `weight_time_gap_minimization` — pack a faculty's day tight
3. Save.

---

## 9. Build the Schedule

1. Sidebar → **Schedule**.
2. Left panel: list of **courses** for the active period.
3. Pick a course → an **assignment dialog** opens:
   - Choose **section(s)** (you can select multiple — shared sections become one entry)
   - Choose **faculty** (or leave TBA)
   - Choose **room**
   - Choose **day(s)** (e.g., MWF) and **time range**
   - Pick **entry type**: `LECTURE` or `LAB` (lab courses get a linked lab entry)
   - Pick **load classification** per day: `REGULAR`, `OVERLOAD`, `BUILT_IN`, `PART_TIME`
4. The system checks **real-time conflicts**:
   - Room double-booked? → flagged
   - Faculty double-booked? → flagged
   - Section overlap? → flagged
5. Conflicts pop in a **Conflict Drawer** on the right. Resolve by moving the slot or picking a different room/faculty.
6. Click **Save** when clean.
7. Repeat for every course. The timetable grid updates live.

---

## 10. Review Reports

Sidebar → **Reports**. Shows:
- Faculty load summary (total units per teacher)
- Room utilization
- Section schedules
- Unscheduled / TBA courses

Use this to spot gaps before publishing.

---

## 11. Import / Export

Sidebar → **Import/Export**.

- **Import**: upload an existing Excel schedule (`.xlsx`) to bootstrap data. Useful the first time — you don't have to rekey everything.
- **Export**: download the current schedule as Excel for printing / distribution.

---

## 12. Django Admin (advanced / data fixes)

For raw data edits, multi-tenant management, or user creation:

- **http://localhost:8000/admin/** → log in with `admin` / `admin`.

Use this when the normal UI doesn't expose what you need (e.g., creating a second tenant or user).

---

## Typical first-time workflow (summary)

```
Academic Period  →  Departments  →  Programs  →  Courses
                                                    ↓
Configuration  ←  Rooms  ←  Faculty (+ availability)
       ↓
Schedule Builder  →  Reports  →  Export to Excel
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Login fails | Case-sensitive. Use `admin` / `admin` exactly. |
| "No tenant" or empty lists everywhere | Admin user isn't assigned a tenant. Run the shell snippet to assign `Demo School`. |
| Frontend can't reach API | Django isn't running, or CORS origin mismatch. Check `http://localhost:8000/admin/` loads. |
| Port already in use | Another server on `:8000` or `:5173`. Kill it or change ports in `manage.py runserver <port>` / `vite --port <n>`. |
