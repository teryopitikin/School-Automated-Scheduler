import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Grid,
  TextField, Typography, Alert, AlertTitle, Box,
} from '@mui/material';
import { fetchFaculty } from '../../api/faculty';
import { fetchRooms } from '../../api/rooms';
import { createSchedule } from '../../api/schedules';

const DAY_PATTERNS = [
  { label: 'MWF', days: ['MON', 'WED', 'FRI'] },
  { label: 'TTh', days: ['TUE', 'THU'] },
  { label: 'MW', days: ['MON', 'WED'] },
  { label: 'Single', days: null },
];
const LOAD_TYPES = ['REGULAR', 'OVERLOAD', 'BUILT_IN', 'PART_TIME'];

const prettyConflict = (msg) => String(msg || '').replace(
  /(\d{1,2}):(\d{2}):(\d{2})/g,
  (_, h, m) => { const hh = parseInt(h, 10); return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`; },
);

export default function AssignmentDialog({
  open, onClose, courses = [], presetCourse, sectionOptions, defaultSection,
  periodId, slotDay, slotHour, onSaved,
}) {
  const [faculty, setFaculty] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [hardConflicts, setHardConflicts] = useState([]);
  const [saving, setSaving] = useState(false);

  const [courseId, setCourseId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [form, setForm] = useState({
    faculty: '', room: '', dayPattern: 'Single', customDays: [slotDay],
    time_start: '', time_end: '', load_classification: 'REGULAR',
    class_size: 40, remarks: '',
    lab_room: '', lab_days: ['TUE'], lab_time_start: '', lab_time_end: '',
  });

  useEffect(() => {
    if (!open) return;
    Promise.all([fetchFaculty({ page_size: 1000 }), fetchRooms({ page_size: 1000 })]).then(([fRes, rRes]) => {
      setFaculty(fRes.data.results ?? fRes.data);
      setRooms(rRes.data.results ?? rRes.data);
    });
    setCourseId(presetCourse?.id ? String(presetCourse.id) : '');
    setSectionId(defaultSection ? String(defaultSection) : (sectionOptions?.[0]?.id ? String(sectionOptions[0].id) : ''));
    setForm((prev) => ({
      ...prev,
      dayPattern: 'Single',
      customDays: [slotDay],
      time_start: slotHour != null ? `${String(slotHour).padStart(2, '0')}:00` : '',
      time_end: slotHour != null ? `${String(slotHour + 1).padStart(2, '0')}:00` : '',
      faculty: '', room: '',
    }));
    setError('');
    setHardConflicts([]);
  }, [open, slotDay, slotHour, presetCourse, defaultSection]); // eslint-disable-line

  const courseObj = courses.find((c) => String(c.id) === String(courseId));
  const hasLab = !!courseObj?.has_lab;

  const selectedDays = () => {
    if (form.dayPattern === 'Single') return form.customDays;
    return DAY_PATTERNS.find((p) => p.label === form.dayPattern)?.days || [slotDay];
  };

  const handleSave = async (override = false) => {
    setSaving(true); setError(''); setHardConflicts([]);
    try {
      const payload = {
        academic_period: periodId,
        course: courseId,
        sections: [sectionId],
        faculty: form.faculty || null,
        room: form.room,
        days: selectedDays(),
        time_start: form.time_start,
        time_end: form.time_end,
        entry_type: 'LECTURE',
        load_classification: form.load_classification,
        class_size: form.class_size,
        remarks: form.remarks,
        allow_conflicts: override,
      };
      await createSchedule(payload);
      if (hasLab && form.lab_room && form.lab_time_start && form.lab_time_end) {
        await createSchedule({
          ...payload, room: form.lab_room, days: form.lab_days,
          time_start: form.lab_time_start, time_end: form.lab_time_end, entry_type: 'LAB',
        });
      }
      onSaved(); onClose();
    } catch (err) {
      const resp = err.response;
      if (resp?.status === 409 && Array.isArray(resp.data?.hard)) {
        setHardConflicts(resp.data.hard);
        setError(resp.data.detail || 'This class clashes with an existing schedule.');
      } else {
        const detail = resp?.data;
        setError((detail && typeof detail === 'object')
          ? (Object.values(detail).flat().join('. ') || 'Failed to save')
          : (detail || 'Failed to save'));
      }
    } finally {
      setSaving(false);
    }
  };

  const lecRooms = rooms.filter((r) => ['LECTURE', 'AVR', 'OTHER'].includes(r.room_type));
  const labRooms = rooms.filter((r) => ['LABORATORY', 'COMPUTER_LAB'].includes(r.room_type));
  const canSave = courseId && sectionId && form.room && form.time_start && form.time_end;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add class</DialogTitle>
      <DialogContent>
        {error && hardConflicts.length === 0 && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {hardConflicts.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Schedule clash — not added</AlertTitle>
            <Box component="ul" sx={{ pl: 2, m: 0 }}>
              {hardConflicts.map((c, i) => (
                <li key={i} style={{ fontSize: '0.8rem' }}>{prettyConflict(c.message)}</li>
              ))}
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
              Overload alone won&apos;t block a save. Fix the time/room, or use <strong>Add anyway</strong>.
            </Typography>
          </Alert>
        )}

        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={sectionOptions ? 6 : 12}>
            <TextField fullWidth select label="Course" value={courseId}
              onChange={(e) => setCourseId(e.target.value)} SelectProps={{ native: true }}>
              <option value="">Select course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
            </TextField>
          </Grid>
          {sectionOptions && (
            <Grid size={6}>
              <TextField fullWidth select label="Section" value={sectionId}
                onChange={(e) => setSectionId(e.target.value)} SelectProps={{ native: true }}>
                {sectionOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </TextField>
            </Grid>
          )}

          <Grid size={6}>
            <TextField fullWidth select label="Faculty" value={form.faculty}
              onChange={(e) => setForm({ ...form, faculty: e.target.value })}
              SelectProps={{ native: true }}>
              <option value="">TBA</option>
              {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </TextField>
          </Grid>
          <Grid size={6}>
            <TextField fullWidth select label="Room" value={form.room}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
              SelectProps={{ native: true }}>
              <option value="">Select room</option>
              {(hasLab ? rooms : lecRooms).map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.room_type})</option>
              ))}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField fullWidth select label="Day Pattern" value={form.dayPattern}
              onChange={(e) => setForm({ ...form, dayPattern: e.target.value })}
              SelectProps={{ native: true }}>
              {DAY_PATTERNS.map((p) => <option key={p.label} value={p.label}>{p.label === 'Single' ? `Single (${slotDay})` : p.label}</option>)}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField fullWidth label="Start Time" type="time" value={form.time_start}
              onChange={(e) => setForm({ ...form, time_start: e.target.value })}
              InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={4}>
            <TextField fullWidth label="End Time" type="time" value={form.time_end}
              onChange={(e) => setForm({ ...form, time_end: e.target.value })}
              InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={4}>
            <TextField fullWidth select label="Load Type" value={form.load_classification}
              onChange={(e) => setForm({ ...form, load_classification: e.target.value })}
              SelectProps={{ native: true }}>
              {LOAD_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField fullWidth label="Class Size" type="number" value={form.class_size}
              onChange={(e) => setForm({ ...form, class_size: parseInt(e.target.value) || 0 })} />
          </Grid>
          <Grid size={4}>
            <TextField fullWidth label="Remarks" value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Grid>

          {hasLab && (
            <>
              <Grid size={12}>
                <Typography variant="subtitle2" color="secondary" sx={{ mt: 1 }}>Lab Component</Typography>
              </Grid>
              <Grid size={4}>
                <TextField fullWidth select label="Lab Room" value={form.lab_room}
                  onChange={(e) => setForm({ ...form, lab_room: e.target.value })}
                  SelectProps={{ native: true }}>
                  <option value="">Select lab</option>
                  {labRooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </TextField>
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Lab Start" type="time" value={form.lab_time_start}
                  onChange={(e) => setForm({ ...form, lab_time_start: e.target.value })}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Lab End" type="time" value={form.lab_time_end}
                  onChange={(e) => setForm({ ...form, lab_time_end: e.target.value })}
                  InputLabelProps={{ shrink: true }} />
              </Grid>
            </>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {hardConflicts.length > 0 && (
          <Button color="warning" onClick={() => handleSave(true)} disabled={saving}>Add anyway</Button>
        )}
        <Button variant="contained" onClick={() => handleSave(false)} disabled={saving || !canSave}>
          {saving ? 'Saving...' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
