import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, TextField, Typography, Tabs, Tab, Badge, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Alert,
  Table, TableHead, TableRow, TableCell, TableBody,
} from '@mui/material';
import { Warning, EventBusy } from '@mui/icons-material';
import CourseList from './CourseList';
import TimetableGrid from './TimetableGrid';
import AssignmentDialog from './AssignmentDialog';
import EditDialog from './EditDialog';
import ConflictDrawer from './ConflictDrawer';
import { fetchCourses } from '../../api/courses';
import { fetchSchedules, fetchSchedule, fetchConflicts, patchSchedule } from '../../api/schedules';
import { fetchSections } from '../../api/sections';
import { fetchAcademicPeriods } from '../../api/academicPeriods';
import { fetchConfig } from '../../api/config';

const DEFAULT_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ALL_SECTIONS = '__ALL__';
const ALL_PROGRAMS = '__ALL__';
// lens tab indices
const SECTION = 0; const PROGRAM = 1; const FACULTY = 2; const ROOM = 3; const NOSCHED = 4;

export default function ScheduleBuilder() {
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState('');
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [courses, setCourses] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictDrawerOpen, setConflictDrawerOpen] = useState(false);
  const [viewTab, setViewTab] = useState(SECTION);
  const [config, setConfig] = useState(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSlot, setAssignSlot] = useState({ day: '', hour: 0 });
  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);
  const [moveBlock, setMoveBlock] = useState(null);   // blocked drag-move + its clashes
  const [moving, setMoving] = useState(false);

  // Deep links from dashboard cards: /schedule?room=<id>, /schedule?program=<code>
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam) { setViewTab(ROOM); setSelectedRoom(roomParam); }
    const programParam = searchParams.get('program');
    if (programParam) { setViewTab(PROGRAM); setSelectedProgram(programParam); }
  }, [searchParams]);

  const days = config?.operating_days?.length ? config.operating_days : DEFAULT_DAYS;
  const configStartHour = config ? parseInt(config.earliest_start_time?.split(':')[0], 10) || 7 : 7;
  const configEndHour = config ? parseInt(config.latest_end_time?.split(':')[0], 10) || 21 : 21;

  useEffect(() => {
    fetchAcademicPeriods().then((res) => {
      const p = res.data.results ?? res.data;
      setPeriods(p);
      const active = p.find((x) => x.status === 'ACTIVE') || p[0];
      if (active) setActivePeriod(active.id);
    });
  }, []);

  useEffect(() => {
    if (!activePeriod) return;
    fetchSections({ academic_period: activePeriod, page_size: 1000 }).then((res) => {
      const s = res.data.results ?? res.data;
      setSections(s);
      if (s.length > 0) setSelectedSection((prev) => prev || s[0].id);
    });
    fetchConfig({ academic_period: activePeriod }).then((res) => {
      const items = res.data.results ?? res.data;
      setConfig(Array.isArray(items) ? items[0] : items);
    }).catch(() => {});
  }, [activePeriod]);

  useEffect(() => {
    if (!activePeriod) return;
    fetchCourses({ page_size: 1000 }).then((res) => setCourses(res.data.results ?? res.data));
    reload();
  }, [activePeriod]);

  // Refresh after the Claude assistant applies an approved change
  useEffect(() => {
    const onChanged = () => reload();
    window.addEventListener('assistant-data-changed', onChanged);
    return () => window.removeEventListener('assistant-data-changed', onChanged);
  }, [activePeriod]); // eslint-disable-line

  const reload = async () => {
    if (!activePeriod) return;
    const all = [];
    let page = 1;
    for (;;) {
      const res = await fetchSchedules({ academic_period: activePeriod, page, page_size: 1000 });
      const data = res.data;
      all.push(...(data.results ?? data));
      if (data.next) page += 1; else break;
    }
    setSchedules(all);
    setConflictsLoading(true);
    fetchConflicts({ academic_period: activePeriod }).then((res) => {
      const c = res.data.results ?? res.data;
      const arr = (Array.isArray(c) ? c : []).filter((x) => (x.hard || []).length > 0);
      setConflicts(arr);
    }).catch(() => {}).finally(() => setConflictsLoading(false));
  };

  const sectionLabel = (sec) => `${sec.program_code || sec.program} ${sec.year_level}-${sec.section_number}`;

  // selector option lists
  const programList = useMemo(() => {
    const set = new Set(sections.map((s) => s.program_code).filter(Boolean));
    return [...set].sort();
  }, [sections]);

  const facultyList = useMemo(() => {
    const m = new Map();
    schedules.forEach((e) => { if (e.faculty && !m.has(e.faculty)) m.set(e.faculty, e.faculty_name || `Faculty ${e.faculty}`); });
    return [...m.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [schedules]);

  const roomsList = useMemo(() => {
    const m = new Map();
    schedules.forEach((e) => { if (e.room && !m.has(e.room)) m.set(e.room, e.room_name || `Room ${e.room}`); });
    return [...m.entries()].map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [schedules]);

  const allSectionOptions = useMemo(
    () => sections.map((s) => ({ id: s.id, label: sectionLabel(s) })), [sections]);
  const programSectionOptions = useMemo(
    () => sections.filter((s) => selectedProgram === ALL_PROGRAMS || s.program_code === selectedProgram)
      .map((s) => ({ id: s.id, label: sectionLabel(s) })),
    [sections, selectedProgram]);

  const entriesById = useMemo(() => {
    const m = {};
    schedules.forEach((e) => { m[e.id] = e; });
    return m;
  }, [schedules]);

  // Widen the grid window so entries outside the configured hours still display
  const [startHour, endHour] = useMemo(() => {
    let s = configStartHour;
    let e = configEndHour;
    schedules.forEach((en) => {
      const sh = parseInt(en.time_start, 10);
      const [eh, em] = String(en.time_end || '').split(':').map((v) => parseInt(v, 10));
      if (!Number.isNaN(sh)) s = Math.min(s, sh);
      if (!Number.isNaN(eh)) e = Math.max(e, eh + (em > 0 ? 1 : 0));
    });
    return [s, e];
  }, [schedules, configStartHour, configEndHour]);

  // Conflicts scoped to the current lens: a specific program selected in the
  // Program view narrows the badge + drawer to that program's clashes.
  const visibleConflicts = useMemo(() => {
    if (viewTab === PROGRAM && selectedProgram && selectedProgram !== ALL_PROGRAMS) {
      const programOf = (label) => String(label).substring(0, String(label).lastIndexOf(' '));
      return conflicts.filter((c) =>
        (c.entry_detail?.section_names || []).some((n) => programOf(n) === selectedProgram));
    }
    return conflicts;
  }, [conflicts, viewTab, selectedProgram]);

  // Subjects with no schedule entry in the viewed period
  const unscheduledCourses = useMemo(() => {
    const used = new Set(schedules.map((e) => e.course));
    return courses.filter((c) => !used.has(c.id));
  }, [courses, schedules]);

  useEffect(() => {
    if (viewTab === PROGRAM && !selectedProgram && programList.length) setSelectedProgram(programList[0]);
    if (viewTab === FACULTY && !selectedFaculty && facultyList.length) setSelectedFaculty(facultyList[0].id);
    if (viewTab === ROOM && !selectedRoom && roomsList.length) setSelectedRoom(roomsList[0].id);
  }, [viewTab, programList, facultyList, roomsList]); // eslint-disable-line

  const visibleEntries = useMemo(() => {
    // No-Schedule lens: only the unscheduled subjects are shown (sidebar);
    // the grid stays empty as a clean canvas to plot them into
    if (viewTab === NOSCHED) return [];
    if (viewTab === SECTION) {
      if (selectedSection === ALL_SECTIONS) return schedules;
      if (selectedSection) return schedules.filter((e) => (e.sections || []).map(String).includes(String(selectedSection)));
    }
    if (viewTab === PROGRAM && selectedProgram) {
      if (selectedProgram === ALL_PROGRAMS) return schedules;
      const ids = new Set(sections.filter((s) => s.program_code === selectedProgram).map((s) => String(s.id)));
      return schedules.filter((e) => (e.sections || []).some((id) => ids.has(String(id))));
    }
    if (viewTab === FACULTY && selectedFaculty) return schedules.filter((e) => String(e.faculty) === String(selectedFaculty));
    if (viewTab === ROOM && selectedRoom) return schedules.filter((e) => String(e.room) === String(selectedRoom));
    return [];
  }, [schedules, sections, viewTab, selectedSection, selectedProgram, selectedFaculty, selectedRoom]);

  const subtitleFor = (e) => {
    if (viewTab === FACULTY) return [(e.section_names || []).join(', '), e.room_name].filter(Boolean).join(' · ');
    if (viewTab === ROOM) return [(e.section_names || []).join(', '), e.faculty_name].filter(Boolean).join(' · ');
    if (viewTab === PROGRAM || selectedSection === ALL_SECTIONS) {
      return [(e.section_names || []).join(', '), e.room_name, e.faculty_name].filter(Boolean).join(' · ');
    }
    return [e.room_name, e.faculty_name].filter(Boolean).join(' · ');
  };

  const currentTitle = () => {
    if (viewTab === NOSCHED) {
      return `No schedule — ${unscheduledCourses.length} subject${unscheduledCourses.length === 1 ? '' : 's'} to plot`;
    }
    if (viewTab === PROGRAM) {
      if (selectedProgram === ALL_PROGRAMS) return 'Program — All programs';
      return selectedProgram ? `Program — ${selectedProgram}` : 'Select a program';
    }
    if (viewTab === FACULTY) {
      const f = facultyList.find((x) => String(x.id) === String(selectedFaculty));
      return f ? `Faculty — ${f.label}` : 'Select a faculty member';
    }
    if (viewTab === ROOM) {
      const r = roomsList.find((x) => String(x.id) === String(selectedRoom));
      return r ? (/^room/i.test(r.label) ? r.label : `Room — ${r.label}`) : 'Select a room';
    }
    if (selectedSection === ALL_SECTIONS) return 'Timetable — All sections';
    const s = sections.find((x) => String(x.id) === String(selectedSection));
    return s ? `Timetable — ${sectionLabel(s)}` : 'Select a section';
  };

  // --- add / edit wiring ---
  const canAdd = (viewTab === SECTION)
    || (viewTab === PROGRAM && programSectionOptions.length > 0)
    || (viewTab === ROOM && !!selectedRoom);
  let addSectionOptions = null;
  let addDefaultSection;
  let addPreset = null;
  if (viewTab === SECTION) {
    if (selectedSection === ALL_SECTIONS) addSectionOptions = allSectionOptions;
    else { addDefaultSection = selectedSection; addPreset = selectedCourse; }
  } else if (viewTab === PROGRAM) {
    addSectionOptions = programSectionOptions;
  } else if (viewTab === ROOM) {
    addSectionOptions = allSectionOptions;   // any section can book the room
  } else if (viewTab === NOSCHED) {
    addSectionOptions = allSectionOptions;
    addPreset = selectedCourse;              // plot the picked unscheduled subject
  }

  const handleSlotClick = (day, hour, freeWindow = null) => {
    setAssignSlot({ day, hour, freeWindow });
    setAssignOpen(true);
  };
  const handleEntryClick = (entry) => { setEditEntry(entry); setEditOpen(true); };

  // Open the edit dialog for any entry by id (used from the conflict drawer,
  // where the clashing entry may not be loaded in the current view).
  const handleEditById = async (id) => {
    const local = schedules.find((e) => e.id === id);
    if (local) { setEditEntry(local); setEditOpen(true); return; }
    try {
      const res = await fetchSchedule(id);
      setEditEntry(res.data); setEditOpen(true);
    } catch { /* entry may have been deleted meanwhile */ }
  };

  // --- drag-and-drop move ---
  const toHms = (mins) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
  const prettyClash = (msg) => String(msg || '').replace(
    /(\d{1,2}):(\d{2}):(\d{2})/g,
    (_, h, m) => { const hh = parseInt(h, 10); return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`; },
  );

  const handleEntryMove = async (entry, day, startMin, endMin, allow = false) => {
    setMoving(true);
    try {
      await patchSchedule(entry.id, {
        day_of_week: day,
        time_start: toHms(startMin),
        time_end: toHms(endMin),
        allow_conflicts: allow,
      });
      setMoveBlock(null);
      reload();
    } catch (err) {
      if (err.response?.status === 409) {
        setMoveBlock({
          entry, day, start: startMin, end: endMin,
          hard: err.response.data.hard || [],
        });
      }
    } finally {
      setMoving(false);
    }
  };
  const switchLens = (v) => { setViewTab(v); setSelectedCourse(null); };

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 2 }}>
      {/* Sidebar (hidden on the No Schedule page) */}
      {viewTab !== NOSCHED && (
      <Box sx={{
        width: 260, flexShrink: 0, bgcolor: 'background.paper',
        borderRadius: 2, border: '1px solid', borderColor: 'divider',
        display: 'flex', flexDirection: 'column',
      }}>
        <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          {viewTab === SECTION && (
            <TextField select size="small" fullWidth label="Section" value={selectedSection}
              onChange={(e) => { setSelectedSection(e.target.value); setSelectedCourse(null); }}
              SelectProps={{ native: true }}>
              <option value={ALL_SECTIONS}>All sections (everything)</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
            </TextField>
          )}
          {viewTab === PROGRAM && (
            <TextField select size="small" fullWidth label="Program" value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)} SelectProps={{ native: true }}>
              <option value={ALL_PROGRAMS}>All programs</option>
              {programList.map((p) => <option key={p} value={p}>{p}</option>)}
            </TextField>
          )}
          {viewTab === FACULTY && (
            <TextField select size="small" fullWidth label="Faculty" value={selectedFaculty}
              onChange={(e) => setSelectedFaculty(e.target.value)} SelectProps={{ native: true }}>
              {facultyList.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </TextField>
          )}
          {viewTab === ROOM && (
            <TextField select size="small" fullWidth label="Room" value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)} SelectProps={{ native: true }}>
              {roomsList.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </TextField>
          )}
        </Box>
        {viewTab === SECTION ? (
          <CourseList courses={courses} schedules={schedules}
            selectedCourse={selectedCourse} onSelectCourse={setSelectedCourse} />
        ) : (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {viewTab === PROGRAM ? 'Program schedule' : viewTab === FACULTY ? 'Faculty load' : 'Room usage'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {visibleEntries.length} class{visibleEntries.length === 1 ? '' : 'es'} this week.
              {canAdd ? ' Click an empty slot to add; click a class to edit.' : ' Click a class to edit.'}
            </Typography>
          </Box>
        )}
      </Box>
      )}

      {/* Center grid */}
      <Box sx={{
        flex: 1, bgcolor: 'background.paper', borderRadius: 2,
        border: '1px solid', borderColor: 'divider', p: 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6">{currentTitle()}</Typography>
            {conflictsLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <CircularProgress size={15} thickness={5} />
                <Typography variant="caption" color="text.secondary">Checking conflicts…</Typography>
              </Box>
            )}
            {!conflictsLoading && visibleConflicts.length > 0 && (
              <Badge badgeContent={visibleConflicts.length} color="error" max={99999}
                sx={{ cursor: 'pointer', '& .MuiBadge-badge': { fontSize: '0.65rem', height: 18, minWidth: 18 } }}
                onClick={() => setConflictDrawerOpen(true)}>
                <Warning color="error" />
              </Badge>
            )}
            {unscheduledCourses.length > 0 && (
              <Chip size="small" color="warning" icon={<EventBusy />}
                label={`${unscheduledCourses.length} unscheduled`}
                onClick={() => setUnscheduledOpen(true)} sx={{ cursor: 'pointer' }} />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Tabs value={viewTab} onChange={(_, v) => switchLens(v)} sx={{ minHeight: 36 }}>
              <Tab label="Section" sx={{ minHeight: 36, py: 0 }} />
              <Tab label="Program" sx={{ minHeight: 36, py: 0 }} />
              <Tab label="Faculty" sx={{ minHeight: 36, py: 0 }} />
              <Tab label="Room" sx={{ minHeight: 36, py: 0 }} />
              <Tab label="No Schedule" sx={{ minHeight: 36, py: 0 }} />
            </Tabs>
            <TextField select size="small" value={activePeriod} sx={{ minWidth: 200 }}
              onChange={(e) => setActivePeriod(e.target.value)} SelectProps={{ native: true }}>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </TextField>
          </Box>
        </Box>

        {viewTab === SECTION && selectedSection !== ALL_SECTIONS && selectedCourse && (
          <Box sx={{ mb: 1, p: 1, bgcolor: 'primary.light', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Selected: {selectedCourse.code} — {selectedCourse.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Click an empty slot to add it (pre-filled), or click any class to edit.
            </Typography>
          </Box>
        )}

        {viewTab === NOSCHED ? (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {unscheduledCourses.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
                Every subject has a schedule this period.
              </Typography>
            ) : (
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Subject Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Course</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Teacher</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Units</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {unscheduledCourses.map((c) => (
                    <TableRow key={c.id} hover sx={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedCourse(c);
                        setAssignSlot({ day: days[0] || 'MON', hour: startHour });
                        setAssignOpen(true);
                      }}>
                      <TableCell sx={{ fontWeight: 600 }}>{c.code}</TableCell>
                      <TableCell>{c.title}</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell align="right">{c.total_units || (c.lec_units + c.lab_units)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        ) : (
        <TimetableGrid
          entries={visibleEntries} days={days}
          startHour={startHour} endHour={endHour}
          subtitleFor={subtitleFor}
          canAdd={canAdd}
          onSlotClick={handleSlotClick}
          onEntryClick={handleEntryClick}
          onEntryMove={handleEntryMove}
        />
        )}
      </Box>

      {/* Drag-move blocked by a clash — show it and offer the override */}
      <Dialog open={!!moveBlock} onClose={() => setMoveBlock(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Can&apos;t move here — schedule clash</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 1.5 }}>
            Moving <strong>{moveBlock?.entry?.course_code}</strong> to this slot clashes with:
          </Alert>
          <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
            {(moveBlock?.hard || []).map((h, i) => (
              <li key={i} style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                {prettyClash(h.message)}
              </li>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveBlock(null)}>Cancel</Button>
          <Button color="warning" disabled={moving}
            onClick={() => handleEntryMove(
              moveBlock.entry, moveBlock.day, moveBlock.start, moveBlock.end, true,
            )}>
            Move anyway
          </Button>
        </DialogActions>
      </Dialog>

      {/* Subjects with no schedule entry in the viewed period */}
      <Dialog open={unscheduledOpen} onClose={() => setUnscheduledOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Unscheduled subjects ({unscheduledCourses.length})</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            These subjects have no schedule entry this period. Click an empty slot in the
            timetable to plot one.
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, m: 0, maxHeight: 360, overflowY: 'auto' }}>
            {unscheduledCourses.map((c) => (
              <li key={c.id} style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                <strong>{c.code}</strong> — {c.title}
                {' · '}{c.total_units || (c.lec_units + c.lab_units)} units
              </li>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnscheduledOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <AssignmentDialog
        open={assignOpen} onClose={() => setAssignOpen(false)}
        courses={courses} presetCourse={addPreset}
        sectionOptions={addSectionOptions} defaultSection={addDefaultSection}
        presetRoom={viewTab === ROOM ? selectedRoom : null}
        periodId={activePeriod}
        slotDay={assignSlot.day} slotHour={assignSlot.hour}
        slotWindow={assignSlot.freeWindow}
        onSaved={() => { reload(); setSelectedCourse(null); }}
      />

      <EditDialog
        open={editOpen} onClose={() => setEditOpen(false)}
        entry={editEntry} onSaved={reload}
      />

      <ConflictDrawer
        onEditEntry={handleEditById}
        open={conflictDrawerOpen} onClose={() => setConflictDrawerOpen(false)}
        conflicts={visibleConflicts} loading={conflictsLoading} entriesById={entriesById}
        periodId={activePeriod}
      />
    </Box>
  );
}
