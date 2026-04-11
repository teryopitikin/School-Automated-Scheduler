import { useState, useEffect } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import CourseList from './CourseList';
import { fetchCourses } from '../../api/courses';
import { fetchSchedules } from '../../api/schedules';
import { fetchSections } from '../../api/sections';
import { fetchAcademicPeriods } from '../../api/academicPeriods';

export default function ScheduleBuilder() {
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState('');
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [courses, setCourses] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);

  // Load periods on mount
  useEffect(() => {
    fetchAcademicPeriods().then((res) => {
      const p = res.data.results ?? res.data;
      setPeriods(p);
      const active = p.find((x) => x.status === 'ACTIVE') || p[0];
      if (active) setActivePeriod(active.id);
    });
  }, []);

  // Load sections when period changes
  useEffect(() => {
    if (!activePeriod) return;
    fetchSections({ academic_period: activePeriod }).then((res) => {
      const s = res.data.results ?? res.data;
      setSections(s);
      if (s.length > 0 && !selectedSection) setSelectedSection(s[0].id);
    });
  }, [activePeriod]);

  // Load courses and schedules when section changes
  useEffect(() => {
    if (!activePeriod) return;
    fetchCourses().then((res) => setCourses(res.data.results ?? res.data));
    const params = { academic_period: activePeriod };
    if (selectedSection) params.sections = selectedSection;
    fetchSchedules(params).then((res) => setSchedules(res.data.results ?? res.data));
  }, [activePeriod, selectedSection]);

  const reload = () => {
    const params = { academic_period: activePeriod };
    if (selectedSection) params.sections = selectedSection;
    fetchSchedules(params).then((res) => setSchedules(res.data.results ?? res.data));
  };

  const sectionLabel = (sec) => {
    const prog = sec.program_code || sec.program;
    return `${prog} ${sec.year_level}-${sec.section_number}`;
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
            onChange={(e) => setSelectedSection(e.target.value)}
            SelectProps={{ native: true }}>
            {sections.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
          </TextField>
        </Box>
        <CourseList
          courses={courses} schedules={schedules}
          selectedCourse={selectedCourse} onSelectCourse={setSelectedCourse}
        />
      </Box>

      {/* Center grid area — placeholder for Task 12 */}
      <Box sx={{
        flex: 1, bgcolor: 'background.paper', borderRadius: 2,
        border: '1px solid', borderColor: 'divider', p: 2,
        display: 'flex', flexDirection: 'column',
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            {selectedSection ? `Timetable — ${sections.find((s) => s.id == selectedSection)?.program_code || ''} ${sections.find((s) => s.id == selectedSection)?.year_level || ''}-${sections.find((s) => s.id == selectedSection)?.section_number || ''}` : 'Select a section'}
          </Typography>
          <TextField select size="small" value={activePeriod} sx={{ minWidth: 220 }}
            onChange={(e) => setActivePeriod(e.target.value)}
            SelectProps={{ native: true }}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </TextField>
        </Box>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography color="text.secondary">Timetable grid will be here (next task)</Typography>
        </Box>
      </Box>
    </Box>
  );
}
