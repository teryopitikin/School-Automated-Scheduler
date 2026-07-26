import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Grid, Box,
  TextField, Typography, Alert, AlertTitle, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { fetchFaculty } from '../../api/faculty';
import { fetchRooms } from '../../api/rooms';
import {
  updateSchedule, deleteSchedule, editScheduleGroup, deleteScheduleGroup,
  fetchFreeRooms,
} from '../../api/schedules';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const LOAD_TYPES = ['REGULAR', 'OVERLOAD', 'BUILT_IN', 'PART_TIME'];
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

const prettyConflict = (msg) => String(msg || '').replace(
  /(\d{1,2}):(\d{2}):(\d{2})/g,
  (_, h, m) => { const hh = parseInt(h, 10); return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`; },
);

export default function EditDialog({ open, onClose, entry, onSaved }) {
  const [faculty, setFaculty] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [scope, setScope] = useState('day'); // 'day' | 'group'
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [hardConflicts, setHardConflicts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [freeRoomIds, setFreeRoomIds] = useState(null);   // Set of room ids free at this slot

  useEffect(() => {
    if (!open || !entry) return;
    Promise.all([fetchFaculty({ page_size: 1000 }), fetchRooms({ page_size: 1000 })]).then(([f, r]) => {
      setFaculty(f.data.results ?? f.data);
      setRooms(r.data.results ?? r.data);
    });
    setFreeRoomIds(null);
    fetchFreeRooms(entry.id)
      .then((res) => setFreeRoomIds(new Set((res.data.rooms || []).map((r) => r.id))))
      .catch(() => {});
    setScope('day');
    setError('');
    setHardConflicts([]);
    setForm({
      faculty: entry.faculty || '',
      room: entry.room || '',
      day_of_week: entry.day_of_week,
      time_start: hhmm(entry.time_start),
      time_end: hhmm(entry.time_end),
      load_classification: entry.load_classification || 'REGULAR',
    });
  }, [open, entry]);

  if (!form || !entry) return null;

  const handleConflictError = (err) => {
    const resp = err.response;
    if (resp?.status === 409 && Array.isArray(resp.data?.hard)) {
      setHardConflicts(resp.data.hard);
      setError(resp.data.detail || 'This change clashes with an existing schedule.');
      return true;
    }
    setError(resp?.data?.detail || 'Failed to save.');
    return true;
  };

  const save = async (override = false) => {
    setBusy(true); setError(''); setHardConflicts([]);
    try {
      if (scope === 'group') {
        await editScheduleGroup(entry.id, {
          faculty: form.faculty || null,
          room: form.room || null,
          time_start: form.time_start,
          time_end: form.time_end,
          load_classification: form.load_classification,
          allow_conflicts: override,
        });
      } else {
        await updateSchedule(entry.id, {
          academic_period: entry.academic_period,
          course: entry.course,
          sections: entry.sections || [],
          faculty: form.faculty || null,
          room: form.room || null,
          day_of_week: form.day_of_week,
          time_start: form.time_start,
          time_end: form.time_end,
          entry_type: entry.entry_type || 'LECTURE',
          load_classification: form.load_classification,
          class_size: entry.class_size ?? 0,
          remarks: entry.remarks || '',
          allow_conflicts: override,
        });
      }
      onSaved(); onClose();
    } catch (err) {
      handleConflictError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true); setError('');
    try {
      if (scope === 'group') await deleteScheduleGroup(entry.id);
      else await deleteSchedule(entry.id);
      onSaved(); onClose();
    } catch {
      setError('Failed to delete.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Edit: {entry.course_code} — {entry.course_title}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {(entry.section_names || []).join(', ')}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {error && hardConflicts.length === 0 && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {hardConflicts.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Schedule clash — not saved</AlertTitle>
            <Box component="ul" sx={{ pl: 2, m: 0 }}>
              {hardConflicts.map((c, i) => (
                <li key={i} style={{ fontSize: '0.8rem' }}>{prettyConflict(c.message)}</li>
              ))}
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
              Use <strong>Save anyway</strong> to override.
            </Typography>
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Apply changes to
          </Typography>
          <ToggleButtonGroup exclusive size="small" value={scope}
            onChange={(_, v) => v && setScope(v)}>
            <ToggleButton value="day">This day ({entry.day_of_week})</ToggleButton>
            <ToggleButton value="group">All days of this class</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Grid container spacing={2}>
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
              SelectProps={{ native: true }}
              helperText={freeRoomIds
                ? `${freeRoomIds.size} room${freeRoomIds.size === 1 ? '' : 's'} free at this time`
                : 'Checking room availability…'}>
              <option value="">Select room</option>
              {freeRoomIds ? (
                <>
                  <optgroup label="✓ Free at this class's time">
                    {rooms.filter((r) => freeRoomIds.has(r.id)).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="In use at this time">
                    {rooms.filter((r) => !freeRoomIds.has(r.id)).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{String(r.id) === String(entry.room) ? ' (current)' : ''}
                      </option>
                    ))}
                  </optgroup>
                </>
              ) : (
                rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)
              )}
            </TextField>
          </Grid>
          {scope === 'day' && (
            <Grid size={4}>
              <TextField fullWidth select label="Day" value={form.day_of_week}
                onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}
                SelectProps={{ native: true }}>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </TextField>
            </Grid>
          )}
          <Grid size={scope === 'day' ? 4 : 6}>
            <TextField fullWidth label="Start" type="time" value={form.time_start}
              onChange={(e) => setForm({ ...form, time_start: e.target.value })}
              InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={scope === 'day' ? 4 : 6}>
            <TextField fullWidth label="End" type="time" value={form.time_end}
              onChange={(e) => setForm({ ...form, time_end: e.target.value })}
              InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={12}>
            <TextField fullWidth select label="Load Type" value={form.load_classification}
              onChange={(e) => setForm({ ...form, load_classification: e.target.value })}
              SelectProps={{ native: true }}>
              {LOAD_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </TextField>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <Button color="error" onClick={remove} disabled={busy}>
          {scope === 'group' ? 'Delete all days' : 'Delete this day'}
        </Button>
        <Box>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          {hardConflicts.length > 0 && (
            <Button color="warning" onClick={() => save(true)} disabled={busy}>Save anyway</Button>
          )}
          <Button variant="contained" onClick={() => save(false)} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
