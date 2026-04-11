import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Alert, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, IconButton, Grid,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Edit, Delete } from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { fetchDepartments, createDepartment, updateDepartment, deleteDepartment } from '../api/departments';

export default function Departments() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code: '', name: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await fetchDepartments();
      setRows(data.results ?? data);
    } catch {
      setError('Failed to load departments');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ code: '', name: '' }); setDialogOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ code: row.code, name: row.name }); setDialogOpen(true); };

  const handleSave = async () => {
    try {
      if (editing) await updateDepartment(editing.id, form);
      else await createDepartment(form);
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDepartment(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch {
      setError('Failed to delete');
    }
  };

  const columns = [
    { field: 'code', headerName: 'Code', width: 120 },
    { field: 'name', headerName: 'Department Name', flex: 1 },
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
      <PageHeader title="Departments" buttonLabel="Add Department" onButtonClick={openCreate} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Card>
        <CardContent>
          <DataGrid rows={rows} columns={columns} loading={loading} autoHeight
            pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Department' : 'Add Department'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={4}>
              <TextField fullWidth label="Code" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Grid>
            <Grid size={8}>
              <TextField fullWidth label="Name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.code || !form.name}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)} title="Delete Department"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
