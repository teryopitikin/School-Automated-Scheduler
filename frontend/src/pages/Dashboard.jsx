import { useState, useEffect } from 'react';
import {
  Box, Grid, Typography, Card, CardContent, TextField, Alert, Chip, List,
  ListItem, ListItemIcon, ListItemText,
} from '@mui/material';
import {
  MenuBook, CheckCircle, Warning, Person, ArrowForward,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import StatCard from '../components/StatCard';
import { fetchStats, fetchConflicts } from '../api/schedules';
import { fetchAcademicPeriods } from '../api/academicPeriods';

export default function Dashboard() {
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState('');
  const [stats, setStats] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAcademicPeriods().then((res) => {
      const p = res.data.results ?? res.data;
      setPeriods(p);
      const active = p.find((x) => x.status === 'ACTIVE') || p[0];
      if (active) setActivePeriod(active.id);
    }).catch(() => setError('Failed to load periods'));
  }, []);

  useEffect(() => {
    if (!activePeriod) return;
    Promise.all([
      fetchStats({ academic_period: activePeriod }),
      fetchConflicts({ academic_period: activePeriod }),
    ]).then(([statsRes, conflictsRes]) => {
      setStats(statsRes.data);
      setConflicts((conflictsRes.data.results ?? conflictsRes.data).slice(0, 5));
    }).catch(() => setError('Failed to load dashboard data'));
  }, [activePeriod]);

  const summary = stats?.summary || {};
  const programProgress = stats?.program_progress || [];
  const facultyBreakdown = stats?.faculty_breakdown || [];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Dashboard</Typography>
        <TextField select size="small" value={activePeriod} sx={{ minWidth: 250 }}
          onChange={(e) => setActivePeriod(e.target.value)}
          SelectProps={{ native: true }}>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </TextField>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Stat cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard icon={<MenuBook />} label="Total Courses" value={summary.total_courses || 0} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard icon={<CheckCircle />} label="Scheduled" value={`${summary.scheduled_courses || 0} / ${summary.total_courses || 0}`} color="success.main" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard icon={<Warning />} label="Conflicts" value={summary.conflict_count || 0} color="error.main" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard icon={<Person />} label="Faculty" value={summary.faculty_count || 0} color="secondary.main" />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        {/* Program progress */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Scheduling Progress by Program</Typography>
              {programProgress.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={programProgress} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="program" type="category" width={55} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="scheduled" name="Scheduled" fill="#22c55e" stackId="a" />
                    <Bar dataKey="remaining" name="Remaining" fill="#e2e8f0" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Typography color="text.secondary">No data yet.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Faculty load */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Faculty Loading</Typography>
              {facultyBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={facultyBreakdown.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total_units" name="Units" fill="#0d9488" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Typography color="text.secondary">No data yet.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent conflicts */}
        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Recent Conflicts</Typography>
              {conflicts.length > 0 ? (
                <List dense>
                  {conflicts.map((c, i) => (
                    <ListItem key={i}>
                      <ListItemIcon><Warning color="error" fontSize="small" /></ListItemIcon>
                      <ListItemText
                        primary={c.message || `${c.type} conflict`}
                        secondary={c.details || ''}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">No conflicts found.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
