import { useState, useEffect } from 'react';
import {
  Box, Alert, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, IconButton, Chip, MenuItem, Autocomplete, FormControlLabel, Switch,
  Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Edit } from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import { fetchUsers, createUser, updateUser } from '../api/users';
import { fetchPrograms } from '../api/programs';
import { fetchDepartments } from '../api/departments';
import { fetchCourses } from '../api/courses';

const ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'REGISTRAR', label: 'Registrar' },
  { value: 'DEPT_HEAD', label: 'Department Head' },
  { value: 'VIEWER', label: 'Viewer' },
];

const EMPTY_FORM = {
  username: '', email: '', password: '', role: 'VIEWER',
  first_name: '', last_name: '',
  managed_program_codes: [], managed_department_codes: [],
  managed_course_codes: [], is_active: true,
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const big = { page_size: 1000 };
      const [userRes, progRes, deptRes, courseRes] = await Promise.all([
        fetchUsers(), fetchPrograms(big), fetchDepartments(big), fetchCourses(big),
      ]);
      setUsers(userRes.data.results ?? userRes.data);
      setPrograms(progRes.data.results ?? progRes.data);
      setDepartments(deptRes.data.results ?? deptRes.data);
      setCourses(courseRes.data.results ?? courseRes.data);
    } catch {
      setError('Failed to load users');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      username: row.username, email: row.email || '', password: '',
      first_name: row.first_name || '', last_name: row.last_name || '',
      role: row.role,
      managed_program_codes: row.managed_program_codes || [],
      managed_department_codes: row.managed_department_codes || [],
      managed_course_codes: row.managed_course_codes || [],
      is_active: row.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      if (editing && !payload.password) delete payload.password;
      if (payload.role !== 'DEPT_HEAD') {
        payload.managed_program_codes = [];
        payload.managed_department_codes = [];
        payload.managed_course_codes = [];
      }
      if (editing) await updateUser(editing.id, payload);
      else await createUser(payload);
      setDialogOpen(false);
      load();
    } catch (err) {
      const data = err.response?.data;
      setError(
        typeof data === 'object' && data
          ? Object.entries(data).map(([k, v]) => `${k}: ${v}`).join(' · ')
          : 'Failed to save user',
      );
    } finally {
      setSaving(false);
    }
  };

  const assignmentSummary = (row) => {
    const parts = [];
    (row.managed_program_codes || []).forEach((c) => parts.push({ c, color: 'primary' }));
    (row.managed_department_codes || []).forEach((c) => parts.push({ c: `${c} (dept)`, color: 'secondary' }));
    (row.managed_course_codes || []).forEach((c) => parts.push({ c, color: 'default' }));
    return parts;
  };

  const columns = [
    { field: 'username', headerName: 'Username', flex: 1, minWidth: 130 },
    {
      field: 'full_name', headerName: 'Name', flex: 1.2, minWidth: 150,
      valueGetter: (_, row) => [row.first_name, row.last_name].filter(Boolean).join(' '),
    },
    { field: 'email', headerName: 'Email', flex: 1.2, minWidth: 160 },
    {
      field: 'role', headerName: 'Role', width: 160,
      renderCell: (p) => (
        <Chip size="small" label={ROLES.find((r) => r.value === p.value)?.label || p.value}
          color={p.value === 'ADMIN' ? 'primary' : p.value === 'DEPT_HEAD' ? 'secondary' : 'default'}
          variant={p.value === 'VIEWER' ? 'outlined' : 'filled'} />
      ),
    },
    {
      field: 'assignments', headerName: 'Departments / Programs / Courses', flex: 2, minWidth: 240,
      sortable: false,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', height: '100%' }}>
          {assignmentSummary(p.row).map(({ c, color }) => (
            <Chip key={c} size="small" label={c} color={color} variant="outlined" />
          ))}
          {p.row.role === 'DEPT_HEAD' && assignmentSummary(p.row).length === 0 && (
            <Typography variant="caption" color="warning.main">nothing assigned</Typography>
          )}
        </Box>
      ),
    },
    {
      field: 'is_active', headerName: 'Active', width: 90,
      renderCell: (p) => (
        <Chip size="small" label={p.value ? 'Active' : 'Disabled'}
          color={p.value ? 'success' : 'default'} variant="outlined" />
      ),
    },
    {
      field: 'actions', headerName: '', width: 60, sortable: false,
      renderCell: (p) => (
        <IconButton size="small" onClick={() => openEdit(p.row)}><Edit fontSize="small" /></IconButton>
      ),
    },
  ];

  const codeOptions = (list) => list.map((x) => x.code);

  return (
    <Box>
      <PageHeader title="Users" buttonLabel="Add User" onButtonClick={openCreate} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <DataGrid
        rows={users}
        columns={columns}
        loading={loading}
        autoHeight
        disableRowSelectionOnClick
        pageSizeOptions={[25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? `Edit ${editing.username}` : 'Add User'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <TextField label="Username" value={form.username} size="small"
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            disabled={!!editing} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="First name" value={form.first_name} size="small" fullWidth
              onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <TextField label="Last name" value={form.last_name} size="small" fullWidth
              onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </Box>
          <TextField label="Email" value={form.email} size="small"
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextField
            label={editing ? 'New password (leave blank to keep)' : 'Password'}
            type="password" value={form.password} size="small"
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <TextField select label="Role" value={form.role} size="small"
            onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
          </TextField>

          {form.role === 'DEPT_HEAD' && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ mb: -1 }}>
                A department head can modify schedules matching ANY assignment below.
              </Typography>
              <Autocomplete multiple size="small" options={codeOptions(programs)}
                value={form.managed_program_codes}
                onChange={(_, v) => setForm({ ...form, managed_program_codes: v })}
                renderInput={(params) => (
                  <TextField {...params} label="Programs" placeholder="e.g. BEED" />
                )} />
              <Autocomplete multiple size="small" options={codeOptions(departments)}
                value={form.managed_department_codes}
                onChange={(_, v) => setForm({ ...form, managed_department_codes: v })}
                renderInput={(params) => (
                  <TextField {...params} label="Departments" placeholder="e.g. CRIM" />
                )} />
              <Autocomplete multiple size="small" options={codeOptions(courses)}
                value={form.managed_course_codes}
                onChange={(_, v) => setForm({ ...form, managed_course_codes: v })}
                renderInput={(params) => (
                  <TextField {...params} label="Courses" placeholder="e.g. CLJ 1" />
                )} />
            </>
          )}

          <FormControlLabel
            control={<Switch checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
            label="Active" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}
            disabled={saving || !form.username || (!editing && !form.password)}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
