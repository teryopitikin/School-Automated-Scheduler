import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Grid,
  TextField, Typography, Alert,
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

export default function AssignmentDialog({
  open, onClose, course, section, periodId, slotDay, slotHour, suggestion, onSaved,
}) {
  const [faculty, setFaculty] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    faculty: '',
    room: '',
    dayPattern: 'MWF',
    customDays: [slotDay],
    time_start: '',
    time_end: '',
    load_classification: 'REGULAR',
    class_size: 40,
    remarks: '',
    // Lab fields
    lab_room: '',
    lab_days: ['TUE'],
    lab_time_start: '',
    lab_time_end: '',
  });

  useEffect(() => {
    if (!open) return;
    Promise.all([fetchFaculty(), fetchRooms()]).then(([fRes, rRes]) => {
      setFaculty(fRes.data.results ?? fRes.data);
      setRooms(rRes.data.results ?? rRes.data);
    });
    setForm((prev) => ({
      ...prev,
      customDays: [slotDay],
      time_start: slotHour != null ? `${String(slotHour).padStart(2, '0')}:00` : '',
      time_end: slotHour != null ? `${String(slotHour + 1).padStart(2, '0')}:00` : '',
      room: suggestion?.room || '',
      faculty: suggestion?.faculty || '',
    }));
    setError('');
  }, [open, slotDay, slotHour, suggestion]);

  const selectedDays = () => {
    if (form.dayPattern === 'Single') return form.customDays;
    const pattern = DAY_PATTERNS.find((p) => p.label === form.dayPattern);
    return pattern?.days || [slotDay];
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const days = selectedDays();
      const payload = {
        academic_period: periodId,
        course: course.id,
        sections: [section],
        faculty: form.faculty || null,
        room: form.room,
        days: days,
        time_start: form.time_start,
        time_end: form.time_end,
        entry_type: 'LECTURE',
        load_classification: form.load_classification,
        class_size: form.class_size,
        remarks: form.remarks,
      };

      await createSchedule(payload);

      // If course has lab, create lab entry
      if (course.has_lab && form.lab_room && form.lab_time_start && form.lab_time_end) {
        const labPayload = {
          ...payload,
          room: form.lab_room,
          days: form.lab_days,
          time_start: form.lab_time_start,
          time_end: form.lab_time_end,
          entry_type: 'LAB',
        };
        await createSchedule(labPayload);
      }

      onSaved();
      onClose();
    } catch (err) {
      const detail = err.response?.data;
      if (typeof detail === 'object') {
        const messages = Object.values(detail).flat().join('. ');
        setError(messages || 'Failed to save');
      } else {
        setError(detail || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  const lecRooms = rooms.filter((r) => r.room_type === 'LECTURE' || r.room_type === 'AVR' || r.room_type === 'OTHER');
  const labRooms = rooms.filter((r) => r.room_type === 'LABORATORY' || r.room_type === 'COMPUTER_LAB');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Assign: {course?.code} — {course?.title}
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Grid container spacing={2} sx={{ mt: 0.5 }}>
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
              {(course?.has_lab ? rooms : lecRooms).map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.room_type})</option>
              ))}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField fullWidth select label="Day Pattern" value={form.dayPattern}
              onChange={(e) => setForm({ ...form, dayPattern: e.target.value })}
              SelectProps={{ native: true }}>
              {DAY_PATTERNS.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
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

          {/* Lab section */}
          {course?.has_lab && (
            <>
              <Grid size={12}>
                <Typography variant="subtitle2" color="secondary" sx={{ mt: 1 }}>
                  Lab Component
                </Typography>
              </Grid>
              <Grid size={4}>
                <TextField fullWidth select label="Lab Room" value={form.lab_room}
                  onChange={(e) => setForm({ ...form, lab_room: e.target.value })}
                  SelectProps={{ native: true }}>
                  <option value="">Select lab</option>
                  {labRooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
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
        <Button variant="contained" onClick={handleSave} disabled={saving || !form.room}>
          {saving ? 'Saving...' : 'Assign'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
