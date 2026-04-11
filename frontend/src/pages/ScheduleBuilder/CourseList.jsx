import { useState, useMemo } from 'react';
import {
  Box, Typography, TextField, List, ListItemButton, ListItemText, Chip,
  Accordion, AccordionSummary, AccordionDetails, InputAdornment,
} from '@mui/material';
import { Search, ExpandMore } from '@mui/icons-material';

const STATUS_COLORS = {
  assigned: '#22c55e',
  pending: '#f59e0b',
  conflict: '#ef4444',
};

export default function CourseList({ courses, schedules, selectedCourse, onSelectCourse }) {
  const [search, setSearch] = useState('');

  const courseStatus = useMemo(() => {
    const status = {};
    courses.forEach((c) => {
      const entries = schedules.filter((s) => s.course === c.id);
      if (entries.length === 0) {
        status[c.id] = 'pending';
      } else {
        status[c.id] = 'assigned';
      }
    });
    return status;
  }, [courses, schedules]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return courses.filter(
      (c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
    );
  }, [courses, search]);

  const pending = filtered.filter((c) => courseStatus[c.id] === 'pending');
  const assigned = filtered.filter((c) => courseStatus[c.id] === 'assigned');

  const CourseItem = ({ course }) => {
    const status = courseStatus[course.id] || 'pending';
    const isSelected = selectedCourse?.id === course.id;
    return (
      <ListItemButton
        onClick={() => onSelectCourse(isSelected ? null : course)}
        sx={{
          borderLeft: `3px solid ${STATUS_COLORS[status]}`,
          borderRadius: 1, mb: 0.5, py: 0.75,
          bgcolor: isSelected ? 'primary.light' : 'transparent',
        }}
      >
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{course.code}</Typography>
              {course.has_lab && <Chip label="Lab" size="small" sx={{ height: 18, fontSize: '0.65rem' }} color="secondary" />}
            </Box>
          }
          secondary={
            <Typography variant="caption" color="text.secondary" noWrap>
              {course.title} · {course.total_units || (course.lec_units + course.lab_units)} units
            </Typography>
          }
        />
      </ListItemButton>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="subtitle2" sx={{ px: 1, py: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
        Courses to Assign
      </Typography>
      <TextField
        size="small" placeholder="Search courses..." value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mx: 1, mb: 1 }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
        }}
      />
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1 }}>
        {pending.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
              Pending ({pending.length})
            </Typography>
            <List disablePadding>
              {pending.map((c) => <CourseItem key={c.id} course={c} />)}
            </List>
          </Box>
        )}
        {assigned.length > 0 && (
          <Accordion defaultExpanded={false} disableGutters elevation={0} sx={{ '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 32, px: 0 }}>
              <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                Assigned ({assigned.length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <List disablePadding>
                {assigned.map((c) => <CourseItem key={c.id} course={c} />)}
              </List>
            </AccordionDetails>
          </Accordion>
        )}
        {filtered.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 3 }}>
            No courses found.
          </Typography>
        )}
      </Box>
      <Box sx={{ px: 1, py: 0.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1.5 }}>
        <Typography variant="caption"><Box component="span" sx={{ color: STATUS_COLORS.assigned }}>●</Box> Assigned</Typography>
        <Typography variant="caption"><Box component="span" sx={{ color: STATUS_COLORS.pending }}>●</Box> Pending</Typography>
      </Box>
    </Box>
  );
}
