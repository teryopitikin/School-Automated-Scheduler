import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Alert, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, IconButton, Grid, Chip, Tabs, Tab,
  ToggleButtonGroup, ToggleButton, Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Edit, Delete, EventAvailable } from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  fetchFaculty, createFaculty, updateFaculty, deleteFaculty,
  fetchAvailability, createAvailability, deleteAvailability,
} from '../api/faculty';
import { fetchAcademicPeriods } from '../api/academicPeriods';

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7AM to 8PM

export default function Faculty() {
  const [rows, setRows] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '', employment_type: 'FULL_TIME', priority_level: 1, max_load_units: 24,
  });
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Availability state
  const [availFaculty, setAvailFaculty] = useState(null);
  const [availPeriod, setAvailPeriod] = useState('');
  const [availability, setAvailability] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [facRes, periodRes] = await Promise.all([fetchFaculty(), fetchAcademicPeriods()]);
      setRows(facRes.data.results ?? facRes.data);
      const p = periodRes.data.results ?? periodRes.data;
      setPeriods(p);
      if (!availPeriod && p.length > 0) setAvailPeriod(p[0].id);
    } catch {
      setError('Failed to load data');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadAvailability = async (facultyId, periodId) => {
    try {
      const { data } = await fetchAvailability(facultyId, { academic_period: periodId });
      setAvailability(data.results ?? data);
    } catch {
      setAvailability([]);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', employment_type: 'FULL_TIME', priority_level: 1, max_load_units: 24 });
    setDialogOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name, employment_type: row.employment_type,
      priority_level: row.priority_level, max_load_units: row.max_load_units,
    });
    setDialogOpen(true);
  };
  const openAvailability = (row) => {
    setAvailFaculty(row);
    if (availPeriod) loadAvailability(row.id, availPeriod);
  };

  const handleSave = async () => {
    try {
      if (editing) await updateFaculty(editing.id, form);
      else await createFaculty(form);
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteFaculty(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch {
      setError('Failed to delete');
    }
  };

  const toggleSlot = async (day, hour) => {
    const existing = availability.find(
      (a) => a.day_of_week === day && a.time_start === `${String(hour).padStart(2, '0')}:00:00`
    );
    if (existing) {
      await deleteAvailability(availFaculty.id, existing.id);
    } else {
      await createAvailability(availFaculty.id, {
        academic_period: availPeriod,
        day_of_week: day,
        time_start: `${String(hour).padStart(2, '0')}:00`,
        time_end: `${String(hour + 1).padStart(2, '0')}:00`,
        availability_type: 'AVAILABLE',
      });
    }
    loadAvailability(availFaculty.id, availPeriod);
  };

  const getSlotType = (day, hour) => {
    const slot = availability.find(
      (a) => a.day_of_week === day && a.time_start === `${String(hour).padStart(2, '0')}:00:00`
    );
    return slot?.availability_type || null;
  };

  const columns = [
    { field: 'name', headerName: 'Name', flex: 1 },
    {
      field: 'employment_type', headerName: 'Type', width: 110,
      renderCell: ({ value }) => (
        <Chip label={value === 'FULL_TIME' ? 'Full-time' : 'Part-time'} size="small"
          color={value === 'FULL_TIME' ? 'primary' : 'default'} variant="outlined" />
      ),
    },
    { field: 'priority_level', headerName: 'Priority', width: 80, type: 'number' },
    { field: 'max_load_units', headerName: 'Max Load', width: 90, type: 'number' },
    {
      field: 'actions', headerName: 'Actions', width: 130, sortable: false,
      renderCell: ({ row }) => (
        <>
          <IconButton size="small" onClick={() => openAvailability(row)} title="Availability"><EventAvailable fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => openEdit(row)}><Edit fontSize="small" /></IconButton>
          <IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}><Delete fontSize="small" /></IconButton>
        </>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader title="Faculty" buttonLabel="Add Faculty" onButtonClick={openCreate} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Card>
        <CardContent>
          <DataGrid rows={rows} columns={columns} loading={loading} autoHeight
            pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        </CardContent>
      </Card>

      {/* Faculty create/edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Faculty' : 'Add Faculty'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField fullWidth label="Name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth select label="Employment Type" value={form.employment_type}
                onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                SelectProps={{ native: true }}>
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
              </TextField>
            </Grid>
            <Grid size={3}>
              <TextField fullWidth label="Priority" type="number" value={form.priority_level}
                onChange={(e) => setForm({ ...form, priority_level: parseInt(e.target.value) || 1 })} />
            </Grid>
            <Grid size={3}>
              <TextField fullWidth label="Max Load" type="number" value={form.max_load_units}
                onChange={(e) => setForm({ ...form, max_load_units: parseInt(e.target.value) || 0 })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Availability dialog */}
      <Dialog open={Boolean(availFaculty)} onClose={() => setAvailFaculty(null)} maxWidth="md" fullWidth>
        <DialogTitle>Availability — {availFaculty?.name}</DialogTitle>
        <DialogContent>
          <TextField select size="small" label="Academic Period" value={availPeriod} sx={{ mb: 2, minWidth: 250 }}
            onChange={(e) => { setAvailPeriod(e.target.value); if (availFaculty) loadAvailability(availFaculty.id, e.target.value); }}
            SelectProps={{ native: true }}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </TextField>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Click cells to toggle availability. Green = Available.
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: 6, textAlign: 'left', color: '#64748b' }}>Time</th>
                  {DAYS.map((d) => (
                    <th key={d} style={{ padding: 6, textAlign: 'center', color: '#64748b' }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map((h) => (
                  <tr key={h}>
                    <td style={{ padding: 6, color: '#64748b', whiteSpace: 'nowrap' }}>
                      {`${h}:00`}
                    </td>
                    {DAYS.map((d) => {
                      const type = getSlotType(d, h);
                      return (
                        <td key={d} style={{
                          padding: 4, textAlign: 'center', cursor: 'pointer',
                          backgroundColor: type === 'AVAILABLE' ? '#dcfce7' : type === 'PREFERRED' ? '#dbeafe' : '#fff',
                          border: '1px solid #e2e8f0',
                        }}
                          onClick={() => toggleSlot(d, h)}
                        >
                          {type === 'AVAILABLE' ? '✓' : type === 'PREFERRED' ? '★' : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAvailFaculty(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)} title="Delete Faculty"
        message={`Delete "${deleteTarget?.name}"?`}
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
