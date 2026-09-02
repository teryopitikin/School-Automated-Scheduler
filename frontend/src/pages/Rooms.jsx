import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Alert, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, IconButton, Grid, Chip,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Edit, Delete } from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { canEditSchedule, isDeptHead } from '../utils/permissions';
import ConfirmDialog from '../components/ConfirmDialog';
import { fetchRooms, createRoom, updateRoom, deleteRoom } from '../api/rooms';

const ROOM_TYPES = [
  { value: 'LECTURE', label: 'Lecture' },
  { value: 'LABORATORY', label: 'Laboratory' },
  { value: 'COMPUTER_LAB', label: 'Computer Lab' },
  { value: 'AVR', label: 'AVR' },
  { value: 'OTHER', label: 'Other' },
];

export default function Rooms() {
  const { user } = useAuth();
  const canWrite = canEditSchedule(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '', room_type: 'LECTURE', capacity: 40, building: '', floor: 1, sequence_number: 1,
  });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await fetchRooms();
      setRows(data.results ?? data);
    } catch {
      setError('Failed to load rooms');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', room_type: 'LECTURE', capacity: 40, building: '', floor: 1, sequence_number: 1 });
    setDialogOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name, room_type: row.room_type, capacity: row.capacity,
      building: row.building, floor: row.floor, sequence_number: row.sequence_number,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) await updateRoom(editing.id, form);
      else await createRoom(form);
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRoom(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch {
      setError('Failed to delete');
    }
  };

  const typeLabel = (val) => ROOM_TYPES.find((t) => t.value === val)?.label || val;

  const columns = [
    { field: 'name', headerName: 'Room', width: 120 },
    {
      field: 'room_type', headerName: 'Type', width: 130,
      renderCell: ({ value }) => <Chip label={typeLabel(value)} size="small" variant="outlined" />,
    },
    { field: 'capacity', headerName: 'Capacity', width: 90, type: 'number' },
    { field: 'building', headerName: 'Building', width: 120 },
    { field: 'floor', headerName: 'Floor', width: 70, type: 'number' },
    { field: 'sequence_number', headerName: 'Seq #', width: 70, type: 'number' },
    {
      field: 'actions', headerName: 'Actions', width: 100, sortable: false,
      renderCell: ({ row }) => (
        canWrite ? <>
          <IconButton size="small" onClick={() => openEdit(row)}><Edit fontSize="small" /></IconButton>
          <IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}><Delete fontSize="small" /></IconButton>
        </> : null
      ),
    },
  ];

  return (
    <Box>
      <PageHeader title="Rooms" buttonLabel={canWrite ? "Add Room" : undefined} onButtonClick={openCreate} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Card>
        <CardContent>
          <DataGrid rows={rows} columns={columns} loading={loading} autoHeight
            pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Room' : 'Add Room'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={6}>
              <TextField fullWidth label="Room Name/Code" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth select label="Type" value={form.room_type}
                onChange={(e) => setForm({ ...form, room_type: e.target.value })}
                SelectProps={{ native: true }} InputLabelProps={{ shrink: true }}>
                {ROOM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </TextField>
            </Grid>
            <Grid size={4}>
              <TextField fullWidth label="Capacity" type="number" value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} />
            </Grid>
            <Grid size={4}>
              <TextField fullWidth label="Building" value={form.building}
                onChange={(e) => setForm({ ...form, building: e.target.value })} />
            </Grid>
            <Grid size={2}>
              <TextField fullWidth label="Floor" type="number" value={form.floor}
                onChange={(e) => setForm({ ...form, floor: parseInt(e.target.value) || 1 })} />
            </Grid>
            <Grid size={2}>
              <TextField fullWidth label="Seq #" type="number" value={form.sequence_number}
                onChange={(e) => setForm({ ...form, sequence_number: parseInt(e.target.value) || 1 })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)} title="Delete Room"
        message={`Delete room "${deleteTarget?.name}"?`}
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
