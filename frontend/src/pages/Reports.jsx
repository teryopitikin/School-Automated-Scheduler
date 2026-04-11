import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Tabs, Tab, TextField, Button, Alert,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Download } from '@mui/icons-material';
import { fetchStats } from '../api/schedules';
import { exportExcel } from '../api/importExport';
import { fetchAcademicPeriods } from '../api/academicPeriods';

export default function Reports() {
  const [tab, setTab] = useState(0);
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState('');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAcademicPeriods().then((res) => {
      const p = res.data.results ?? res.data;
      setPeriods(p);
      const active = p.find((x) => x.status === 'ACTIVE') || p[0];
      if (active) setActivePeriod(active.id);
    });
  }, []);

  useEffect(() => {
    if (!activePeriod) return;
    fetchStats({ academic_period: activePeriod })
      .then((res) => setStats(res.data))
      .catch(() => setError('Failed to load report data'));
  }, [activePeriod]);

  const handleExport = async (type) => {
    try {
      const res = await exportExcel({ academic_period: activePeriod, type });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_report.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Export failed');
    }
  };

  const facultyColumns = [
    { field: 'name', headerName: 'Faculty', flex: 1 },
    { field: 'employment_type', headerName: 'Type', width: 100 },
    { field: 'total_units', headerName: 'Total Units', width: 100, type: 'number' },
    { field: 'regular_units', headerName: 'Regular', width: 90, type: 'number' },
    { field: 'overload_units', headerName: 'Overload', width: 90, type: 'number' },
    { field: 'builtin_units', headerName: 'Built-in', width: 90, type: 'number' },
    { field: 'parttime_units', headerName: 'Part-time', width: 90, type: 'number' },
    { field: 'contact_hours', headerName: 'Hours', width: 80, type: 'number' },
  ];

  const roomColumns = [
    { field: 'name', headerName: 'Room', width: 120 },
    { field: 'room_type', headerName: 'Type', width: 120 },
    { field: 'building', headerName: 'Building', width: 120 },
    { field: 'total_hours', headerName: 'Hours Used', width: 100, type: 'number' },
    { field: 'utilization_pct', headerName: 'Utilization %', width: 120, type: 'number' },
  ];

  const facultyData = (stats?.faculty_breakdown || []).map((f, i) => ({ id: i, ...f }));
  const roomData = (stats?.room_utilization || []).map((r, i) => ({ id: i, ...r }));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Reports</Typography>
        <TextField select size="small" value={activePeriod} sx={{ minWidth: 250 }}
          onChange={(e) => setActivePeriod(e.target.value)}
          SelectProps={{ native: true }}>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </TextField>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Faculty Loading" />
        <Tab label="Room Utilization" />
      </Tabs>

      {tab === 0 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">Faculty Loading</Typography>
              <Button startIcon={<Download />} onClick={() => handleExport('faculty_loading')}>
                Export Excel
              </Button>
            </Box>
            <DataGrid rows={facultyData} columns={facultyColumns} autoHeight
              pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            />
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">Room Utilization</Typography>
              <Button startIcon={<Download />} onClick={() => handleExport('room_utilization')}>
                Export Excel
              </Button>
            </Box>
            <DataGrid rows={roomData} columns={roomColumns} autoHeight
              pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
