import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Alert, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, IconButton, Grid, Chip,
  FormControlLabel, Checkbox,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Edit, Delete, ContentCopy } from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  fetchAcademicPeriods, createAcademicPeriod, updateAcademicPeriod,
  deleteAcademicPeriod, cloneAcademicPeriod,
} from '../api/academicPeriods';

const SEMESTERS = ['1ST', '2ND', 'SUMMER'];
const STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

export default function AcademicPeriods() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '', year_start: new Date().getFullYear(), year_end: new Date().getFullYear() + 1,
    semester: '1ST', status: 'DRAFT',
  });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [cloneSource, setCloneSource] = useState(null);
  const [cloneOptions, setCloneOptions] = useState({ include_availability: true });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await fetchAcademicPeriods();
      setRows(data.results ?? data);
    } catch {
      setError('Failed to load academic periods');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '', year_start: new Date().getFullYear(), year_end: new Date().getFullYear() + 1,
      semester: '1ST', status: 'DRAFT',
    });
    setDialogOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name, year_start: row.year_start, year_end: row.year_end,
      semester: row.semester, status: row.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) await updateAcademicPeriod(editing.id, form);
      else await createAcademicPeriod(form);
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAcademicPeriod(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch {
      setError('Failed to delete');
    }
  };

  const handleClone = async () => {
    try {
      await cloneAcademicPeriod(cloneSource.id, cloneOptions);
      setCloneSource(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to clone');
    }
  };

  const statusColor = (s) => ({ DRAFT: 'default', ACTIVE: 'success', ARCHIVED: 'warning' })[s] || 'default';

  const columns = [
    { field: 'name', headerName: 'Period Name', flex: 1 },
    { field: 'semester', headerName: 'Semester', width: 100 },
    { field: 'year_start', headerName: 'Start Year', width: 100 },
    { field: 'year_end', headerName: 'End Year', width: 100 },
    {
      field: 'status', headerName: 'Status', width: 110,
      renderCell: ({ value }) => <Chip label={value} size="small" color={statusColor(value)} />,
    },
    {
      field: 'actions', headerName: 'Actions', width: 140, sortable: false,
      renderCell: ({ row }) => (
        <>
          <IconButton size="small" onClick={() => setCloneSource(row)} title="Clone"><ContentCopy fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => openEdit(row)}><Edit fontSize="small" /></IconButton>
          <IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}><Delete fontSize="small" /></IconButton>
        </>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader title="Academic Periods" buttonLabel="Add Period" onButtonClick={openCreate} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Card>
        <CardContent>
          <DataGrid rows={rows} columns={columns} loading={loading} autoHeight
            pageSizeOptions={[10, 25]} initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          />
        </CardContent>
      </Card>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Period' : 'Add Academic Period'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField fullWidth label="Period Name" value={form.name}
                placeholder="e.g. 1st Semester 2025-2026"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
            <Grid size={4}>
              <TextField fullWidth select label="Semester" value={form.semester}
                onChange={(e) => setForm({ ...form, semester: e.target.value })}
                SelectProps={{ native: true }}>
                {SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
              </TextField>
            </Grid>
            <Grid size={3}>
              <TextField fullWidth label="Start Year" type="number" value={form.year_start}
                onChange={(e) => setForm({ ...form, year_start: parseInt(e.target.value) || 2025 })} />
            </Grid>
            <Grid size={3}>
              <TextField fullWidth label="End Year" type="number" value={form.year_end}
                onChange={(e) => setForm({ ...form, year_end: parseInt(e.target.value) || 2026 })} />
            </Grid>
            <Grid size={2}>
              <TextField fullWidth select label="Status" value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                SelectProps={{ native: true }}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Clone dialog */}
      <Dialog open={Boolean(cloneSource)} onClose={() => setCloneSource(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Clone from "{cloneSource?.name}"</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            This will create a new period with all courses, sections, rooms, and faculty copied over.
            Schedule entries are NOT copied — you start with an empty schedule.
          </Alert>
          <FormControlLabel
            control={<Checkbox checked={cloneOptions.include_availability}
              onChange={(e) => setCloneOptions({ ...cloneOptions, include_availability: e.target.checked })} />}
            label="Include faculty availability"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloneSource(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleClone}>Clone</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)} title="Delete Period"
        message={`Delete "${deleteTarget?.name}"? All data in this period (schedules, sections, config) will be removed.`}
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
