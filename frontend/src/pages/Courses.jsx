import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Alert, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, IconButton, Grid, Chip,
  FormControlLabel, Checkbox,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Edit, Delete } from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { fetchCourses, createCourse, updateCourse, deleteCourse } from '../api/courses';
import { fetchDepartments } from '../api/departments';

export default function Courses() {
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    code: '', title: '', department: '', lec_units: 0, lab_units: 0,
    contact_hours: 0, has_lab: false,
  });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [courseRes, deptRes] = await Promise.all([fetchCourses(), fetchDepartments()]);
      setRows(courseRes.data.results ?? courseRes.data);
      setDepartments(deptRes.data.results ?? deptRes.data);
    } catch {
      setError('Failed to load data');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d.code]));

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', title: '', department: departments[0]?.id || '', lec_units: 0, lab_units: 0, contact_hours: 0, has_lab: false });
    setDialogOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      code: row.code, title: row.title, department: row.department,
      lec_units: row.lec_units, lab_units: row.lab_units,
      contact_hours: row.contact_hours, has_lab: row.has_lab,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) await updateCourse(editing.id, form);
      else await createCourse(form);
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteCourse(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch {
      setError('Failed to delete');
    }
  };

  const columns = [
    { field: 'code', headerName: 'Code', width: 120 },
    { field: 'title', headerName: 'Course Title', flex: 1 },
    {
      field: 'department', headerName: 'Department', width: 120,
      valueGetter: (value) => deptMap[value] || '',
    },
    { field: 'lec_units', headerName: 'Lec', width: 60, type: 'number' },
    { field: 'lab_units', headerName: 'Lab', width: 60, type: 'number' },
    { field: 'total_units', headerName: 'Total', width: 70, type: 'number' },
    { field: 'contact_hours', headerName: 'Hours', width: 70, type: 'number' },
    {
      field: 'has_lab', headerName: 'Type', width: 90,
      renderCell: ({ value }) => (
        <Chip label={value ? 'Lec+Lab' : 'Lec'} size="small"
          color={value ? 'secondary' : 'default'} variant="outlined" />
      ),
    },
    {
      field: 'actions', headerName: 'Actions', width: 100, sortable: false,
      renderCell: ({ row }) => (
        <>
          <IconButton size="small" onClick={() => openEdit(row)}><Edit fontSize="small" /></IconButton>
          <IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}><Delete fontSize="small" /></IconButton>
        </>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader title="Courses" buttonLabel="Add Course" onButtonClick={openCreate} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Card>
        <CardContent>
          <DataGrid rows={rows} columns={columns} loading={loading} autoHeight
            pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Course' : 'Add Course'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={4}>
              <TextField fullWidth label="Code" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Grid>
            <Grid size={8}>
              <TextField fullWidth label="Title" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth select label="Department" value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                SelectProps={{ native: true }}>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Contact Hours" type="number" value={form.contact_hours}
                onChange={(e) => setForm({ ...form, contact_hours: parseInt(e.target.value) || 0 })} />
            </Grid>
            <Grid size={4}>
              <TextField fullWidth label="Lec Units" type="number" value={form.lec_units}
                onChange={(e) => setForm({ ...form, lec_units: parseInt(e.target.value) || 0 })} />
            </Grid>
            <Grid size={4}>
              <TextField fullWidth label="Lab Units" type="number" value={form.lab_units}
                onChange={(e) => setForm({ ...form, lab_units: parseInt(e.target.value) || 0 })} />
            </Grid>
            <Grid size={4} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={<Checkbox checked={form.has_lab}
                  onChange={(e) => setForm({ ...form, has_lab: e.target.checked })} />}
                label="Has Lab"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.code || !form.title}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)} title="Delete Course"
        message={`Delete "${deleteTarget?.code} — ${deleteTarget?.title}"?`}
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
