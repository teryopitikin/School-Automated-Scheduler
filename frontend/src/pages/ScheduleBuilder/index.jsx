import { useState, useEffect } from 'react';
import { Box, TextField, Typography, Tabs, Tab, Badge } from '@mui/material';
import { Warning } from '@mui/icons-material';
import CourseList from './CourseList';
import TimetableGrid from './TimetableGrid';
import AssignmentDialog from './AssignmentDialog';
import { fetchCourses } from '../../api/courses';
import { fetchSchedules, suggestSlots, fetchConflicts } from '../../api/schedules';
import { fetchSections } from '../../api/sections';
import { fetchAcademicPeriods } from '../../api/academicPeriods';
import { fetchConfig } from '../../api/config';

const DEFAULT_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DEFAULT_HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

export default function ScheduleBuilder() {
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState('');
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [courses, setCourses] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [conflictCount, setConflictCount] = useState(0);
  const [viewTab, setViewTab] = useState(0); // 0=Section, 1=Faculty, 2=Room
  const [config, setConfig] = useState(null);

  // Assignment dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSlot, setAssignSlot] = useState({ day: '', hour: 0, suggestion: null });

  const days = config?.operating_days || DEFAULT_DAYS;
  const startHour = config ? parseInt(config.earliest_start_time?.split(':')[0], 10) : 7;
  const endHour = config ? parseInt(config.latest_end_time?.split(':')[0], 10) : 21;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);

  // Load periods
  useEffect(() => {
    fetchAcademicPeriods().then((res) => {
      const p = res.data.results ?? res.data;
      setPeriods(p);
      const active = p.find((x) => x.status === 'ACTIVE') || p[0];
      if (active) setActivePeriod(active.id);
    });
  }, []);

  // Load config + sections when period changes
  useEffect(() => {
    if (!activePeriod) return;
    fetchSections({ academic_period: activePeriod }).then((res) => {
      const s = res.data.results ?? res.data;
      setSections(s);
      if (s.length > 0) setSelectedSection(s[0].id);
    });
    fetchConfig({ academic_period: activePeriod }).then((res) => {
      const items = res.data.results ?? res.data;
      setConfig(Array.isArray(items) ? items[0] : items);
    }).catch(() => {});
    fetchConflicts({ academic_period: activePeriod }).then((res) => {
      const c = res.data.results ?? res.data;
      setConflictCount(Array.isArray(c) ? c.length : 0);
    }).catch(() => {});
  }, [activePeriod]);

  // Load courses + schedules
  useEffect(() => {
    if (!activePeriod) return;
    fetchCourses().then((res) => setCourses(res.data.results ?? res.data));
    reload();
  }, [activePeriod, selectedSection]);

  const reload = () => {
    const params = { academic_period: activePeriod };
    if (selectedSection) params.sections = selectedSection;
    fetchSchedules(params).then((res) => setSchedules(res.data.results ?? res.data));
    // Refresh conflict count
    fetchConflicts({ academic_period: activePeriod }).then((res) => {
      const c = res.data.results ?? res.data;
      setConflictCount(Array.isArray(c) ? c.length : 0);
    }).catch(() => {});
  };

  // Get suggestions when course is selected
  useEffect(() => {
    if (!selectedCourse || !activePeriod) {
      setSuggestions(null);
      return;
    }
    suggestSlots({
      course: selectedCourse.id,
      section: selectedSection,
      academic_period: activePeriod,
    }).then((res) => {
      setSuggestions(res.data.results ?? res.data ?? res.data);
    }).catch(() => setSuggestions(null));
  }, [selectedCourse, activePeriod, selectedSection]);

  const handleSlotClick = (day, hour, suggestion) => {
    setAssignSlot({ day, hour, suggestion });
    setAssignOpen(true);
  };

  const sectionLabel = (sec) => {
    return `${sec.program_code || sec.program} ${sec.year_level}-${sec.section_number}`;
  };

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 2 }}>
      {/* Left sidebar */}
      <Box sx={{
        width: 260, flexShrink: 0, bgcolor: 'background.paper',
        borderRadius: 2, border: '1px solid', borderColor: 'divider',
        display: 'flex', flexDirection: 'column',
      }}>
        <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField select size="small" fullWidth label="Section" value={selectedSection}
            onChange={(e) => { setSelectedSection(e.target.value); setSelectedCourse(null); }}
            SelectProps={{ native: true }}>
            {sections.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
          </TextField>
        </Box>
        <CourseList
          courses={courses} schedules={schedules}
          selectedCourse={selectedCourse} onSelectCourse={setSelectedCourse}
        />
      </Box>

      {/* Center grid */}
      <Box sx={{
        flex: 1, bgcolor: 'background.paper', borderRadius: 2,
        border: '1px solid', borderColor: 'divider', p: 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6">
              {selectedSection
                ? `Timetable — ${sections.find((s) => String(s.id) === String(selectedSection))
                    ? sectionLabel(sections.find((s) => String(s.id) === String(selectedSection)))
                    : ''}`
                : 'Select a section'}
            </Typography>
            {conflictCount > 0 && (
              <Badge badgeContent={conflictCount} color="error">
                <Warning color="error" />
              </Badge>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Tabs value={viewTab} onChange={(_, v) => setViewTab(v)} sx={{ minHeight: 36 }}>
              <Tab label="Section" sx={{ minHeight: 36, py: 0 }} />
              <Tab label="Faculty" sx={{ minHeight: 36, py: 0 }} />
              <Tab label="Room" sx={{ minHeight: 36, py: 0 }} />
            </Tabs>
            <TextField select size="small" value={activePeriod} sx={{ minWidth: 200 }}
              onChange={(e) => setActivePeriod(e.target.value)}
              SelectProps={{ native: true }}>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </TextField>
          </Box>
        </Box>

        {selectedCourse && (
          <Box sx={{ mb: 1, p: 1, bgcolor: 'primary.light', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Assigning: {selectedCourse.code} — {selectedCourse.title}
              {selectedCourse.has_lab && ' (Lec + Lab)'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Click a green slot on the grid to assign. Stars show top suggestions.
            </Typography>
          </Box>
        )}

        <TimetableGrid
          schedules={schedules} days={days} hours={hours}
          selectedCourse={selectedCourse} suggestions={suggestions}
          onSlotClick={handleSlotClick}
        />
      </Box>

      <AssignmentDialog
        open={assignOpen} onClose={() => setAssignOpen(false)}
        course={selectedCourse} section={selectedSection} periodId={activePeriod}
        slotDay={assignSlot.day} slotHour={assignSlot.hour} suggestion={assignSlot.suggestion}
        onSaved={() => { reload(); setSelectedCourse(null); }}
      />
    </Box>
  );
}
