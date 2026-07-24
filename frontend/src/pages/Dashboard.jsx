import { useState, useEffect, useMemo } from 'react';
import {
  Box, Grid, Typography, Card, CardContent, TextField, Alert, List,
  ListItem, ListItemIcon, ListItemText, IconButton, Dialog, DialogTitle,
  DialogContent, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Chip, Tooltip as MuiTooltip,
} from '@mui/material';
import {
  MenuBook, CheckCircle, Warning, Person, TrendingUp, OpenInFull, Close, FileDownload,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { Button } from '@mui/material';
import StatCard from '../components/StatCard';
import { fetchStats, fetchConflicts } from '../api/schedules';
import { exportExcel } from '../api/importExport';
import { fetchAcademicPeriods } from '../api/academicPeriods';

const DAY_LABELS = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };
const TYPE_LABELS = {
  faculty: 'Faculty double-booked', room: 'Room double-booked', section: 'Section overlap',
};
const OVERLOAD_MAX = 24;

const prettyTime = (hms) => {
  const [h, m] = String(hms).split(':').map((n) => parseInt(n, 10));
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
};
const prettyMsg = (msg) => String(msg || '').replace(
  /(\d{1,2}):(\d{2}):(\d{2})/g, (_, h, m) => prettyTime(`${h}:${m}:00`));

// "GE 102 FRI 07:00:00-08:00:00" -> "GE 102 · Fri 7:00 AM–8:00 AM"
const conflictTitle = (entry) => {
  const m = String(entry || '').match(
    /^(.*?)\s+(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{2}:\d{2}:\d{2})-(\d{2}:\d{2}:\d{2})$/);
  if (!m) return entry || 'Class';
  return `${m[1]} · ${DAY_LABELS[m[2]] || m[2]} ${prettyTime(m[3])}–${prettyTime(m[4])}`;
};

// Small "expand to full view" button for a card header.
function ExpandButton({ onClick, title }) {
  return (
    <MuiTooltip title={title || 'View all'}>
      <IconButton size="small" onClick={onClick} aria-label="expand">
        <OpenInFull sx={{ fontSize: 18 }} />
      </IconButton>
    </MuiTooltip>
  );
}

function CardHeader({ title, caption, onExpand, action }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
      <Typography variant="h6">{title}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
        {action}
        {onExpand && <ExpandButton onClick={onExpand} />}
      </Box>
    </Box>
  );
}

function FullScreenDialog({ open, onClose, title, subtitle, action, children }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
      PaperProps={{ sx: { height: '85vh' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6">{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {action}
          <IconButton onClick={onClose}><Close /></IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>{children}</DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState('');
  const [stats, setStats] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null); // 'programs' | 'faculty' | 'conflicts'
  const [exporting, setExporting] = useState(false);

  const handleExportConflicts = async () => {
    if (!activePeriod) return;
    setExporting(true);
    try {
      const res = await exportExcel({ academic_period: activePeriod, type: 'conflicts' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'conflicts_report.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // ignore — export failures are rare and non-critical
    } finally {
      setExporting(false);
    }
  };

  const exportButton = (
    <Button size="small" variant="outlined" startIcon={<FileDownload />}
      onClick={handleExportConflicts} disabled={exporting}>
      {exporting ? 'Exporting…' : 'Export to Excel'}
    </Button>
  );

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
      setConflicts(conflictsRes.data.results ?? conflictsRes.data);
    }).catch(() => setError('Failed to load dashboard data'));
  }, [activePeriod]);

  const summary = stats?.summary || {};
  const facultyBreakdown = stats?.faculty_breakdown || [];

  const hardConflicts = useMemo(
    () => (conflicts || []).filter((c) => (c.hard || []).length > 0),
    [conflicts]);

  const programProgress = useMemo(
    () => (stats?.program_progress || []).map((p) => ({
      ...p,
      remaining: Math.max((p.total_courses || 0) - (p.scheduled || 0), 0),
    })), [stats]);

  const facultySorted = useMemo(
    () => [...facultyBreakdown].sort((a, b) => b.total_units - a.total_units),
    [facultyBreakdown]);

  const scheduled = summary.scheduled ?? 0;
  const totalCourses = summary.total_courses ?? 0;

  const statCards = [
    { icon: <MenuBook />, label: 'Total Courses', value: totalCourses },
    { icon: <CheckCircle />, label: 'Scheduled', value: `${scheduled} / ${totalCourses}`, color: 'success.main' },
    { icon: <Warning />, label: 'Conflicts', value: hardConflicts.length, color: 'error.main' },
    { icon: <TrendingUp />, label: 'Overloaded Faculty', value: summary.overloaded_faculty_count ?? 0, color: 'warning.main' },
    { icon: <Person />, label: 'Faculty', value: summary.faculty_count ?? 0, color: 'secondary.main' },
  ];

  const isOver = (f) => f.total_units > (f.max_units || OVERLOAD_MAX);

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
      <Box sx={{ display: 'flex', gap: 2.5, mb: 3, flexWrap: 'wrap' }}>
        {statCards.map((s) => (
          <Box key={s.label} sx={{ flex: '1 1 160px' }}>
            <StatCard icon={s.icon} label={s.label} value={s.value} color={s.color} />
          </Box>
        ))}
      </Box>

      <Grid container spacing={2.5}>
        {/* Program progress */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <CardHeader title="Scheduling Progress by Program"
                onExpand={() => setExpanded('programs')} />
              {programProgress.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={programProgress} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis dataKey="program_code" type="category" width={70} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="scheduled" name="Scheduled courses" fill="#22c55e" stackId="a" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="remaining" name="Remaining" fill="#e2e8f0" stackId="a" radius={[0, 3, 3, 0]} />
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
              <CardHeader title="Faculty Loading"
                caption={facultyBreakdown.length > 10 ? `top 10 of ${facultyBreakdown.length}` : 'red = overloaded'}
                onExpand={() => setExpanded('faculty')} />
              {facultySorted.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={facultySorted.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={78} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <ReferenceLine x={OVERLOAD_MAX} stroke="#ef4444" strokeDasharray="4 3" />
                    <Bar dataKey="total_units" name="Units">
                      {facultySorted.slice(0, 10).map((f, i) => (
                        <Cell key={i} fill={isOver(f) ? '#ef4444' : '#0d9488'} />
                      ))}
                    </Bar>
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
              <CardHeader title="Recent Conflicts"
                caption={hardConflicts.length > 5 ? `showing 5 of ${hardConflicts.length}` : null}
                action={hardConflicts.length > 0 ? exportButton : null}
                onExpand={hardConflicts.length > 0 ? () => setExpanded('conflicts') : null} />
              {hardConflicts.length > 0 ? (
                <List dense>
                  {hardConflicts.slice(0, 5).map((c, i) => {
                    const first = (c.hard || [])[0] || {};
                    return (
                      <ListItem key={c.entry_id ?? i} sx={{ alignItems: 'flex-start' }}>
                        <ListItemIcon sx={{ minWidth: 34, mt: 0.5 }}>
                          <Warning color="error" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                          primary={`${conflictTitle(c.entry)} — ${TYPE_LABELS[first.type] || 'Conflict'}`}
                          secondary={prettyMsg(first.message)}
                          primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }}
                          secondaryTypographyProps={{ fontSize: '0.78rem' }}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">No conflicts found.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ---- Expanded full-data dialogs ---- */}
      <FullScreenDialog open={expanded === 'programs'} onClose={() => setExpanded(null)}
        title="Scheduling Progress by Program"
        subtitle={`${programProgress.length} programs`}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Program</TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="right">Scheduled</TableCell>
                <TableCell align="right">Total courses</TableCell>
                <TableCell align="right">Progress</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {programProgress.map((p) => (
                <TableRow key={p.program_code} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{p.program_code}</TableCell>
                  <TableCell>{p.program_name}</TableCell>
                  <TableCell align="right">{p.scheduled}</TableCell>
                  <TableCell align="right">{p.total_courses}</TableCell>
                  <TableCell align="right">{Math.round(p.percentage ?? 0)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </FullScreenDialog>

      <FullScreenDialog open={expanded === 'faculty'} onClose={() => setExpanded(null)}
        title="Faculty Loading"
        subtitle={`${facultyBreakdown.length} faculty · ${summary.overloaded_faculty_count ?? 0} overloaded (max ${OVERLOAD_MAX}u)`}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Faculty</TableCell>
                <TableCell align="right">Total units</TableCell>
                <TableCell align="right">Max</TableCell>
                <TableCell align="right">Regular</TableCell>
                <TableCell align="right">Overload</TableCell>
                <TableCell align="right">Built-in</TableCell>
                <TableCell align="right">Part-time</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {facultySorted.map((f) => (
                <TableRow key={f.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{f.name}</TableCell>
                  <TableCell align="right" sx={{ color: isOver(f) ? 'error.main' : 'inherit', fontWeight: isOver(f) ? 700 : 400 }}>
                    {f.total_units}
                  </TableCell>
                  <TableCell align="right">{f.max_units}</TableCell>
                  <TableCell align="right">{f.regular}</TableCell>
                  <TableCell align="right">{f.overload}</TableCell>
                  <TableCell align="right">{f.built_in}</TableCell>
                  <TableCell align="right">{f.part_time}</TableCell>
                  <TableCell>
                    {isOver(f)
                      ? <Chip label="Overloaded" size="small" color="error" sx={{ height: 20 }} />
                      : <Chip label="OK" size="small" color="success" variant="outlined" sx={{ height: 20 }} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </FullScreenDialog>

      <FullScreenDialog open={expanded === 'conflicts'} onClose={() => setExpanded(null)}
        title="All Conflicts" subtitle={`${hardConflicts.length} classes with a hard clash`}
        action={exportButton}>
        <List dense sx={{ px: 2 }}>
          {hardConflicts.map((c, i) => (
            <ListItem key={c.entry_id ?? i} sx={{ alignItems: 'flex-start', borderBottom: '1px solid', borderColor: 'divider' }}>
              <ListItemIcon sx={{ minWidth: 34, mt: 0.5 }}>
                <Warning color="error" fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={conflictTitle(c.entry)}
                primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }}
                secondary={
                  <Box component="span" sx={{ display: 'block' }}>
                    {(c.hard || []).map((h, j) => (
                      <Box component="span" key={j} sx={{ display: 'block', fontSize: '0.78rem' }}>
                        <strong>{TYPE_LABELS[h.type] || 'Conflict'}:</strong> {prettyMsg(h.message)}
                      </Box>
                    ))}
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      </FullScreenDialog>
    </Box>
  );
}
