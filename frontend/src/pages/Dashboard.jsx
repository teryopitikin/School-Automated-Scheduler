import { useState, useEffect, useMemo } from 'react';
import {
  Box, Grid, Typography, Card, CardContent, TextField, Alert, List,
  ListItem, ListItemIcon, ListItemText, IconButton, Dialog, DialogTitle,
  DialogContent, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Chip, Tooltip as MuiTooltip,
} from '@mui/material';
import {
  MenuBook, CheckCircle, Warning, Person, TrendingUp, OpenInFull, Close, FileDownload,
  MeetingRoom, Groups,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
  Legend, LabelList,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { Button } from '@mui/material';
import StatCard from '../components/StatCard';
import { fetchStats, fetchConflicts, fetchSchedule } from '../api/schedules';
import EditDialog from './ScheduleBuilder/EditDialog';
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
// One-line full descriptor from a conflicts-API detail object:
// course · sections · room · faculty · day time.
const briefLine = (b) => b && [
  b.course_code,
  b.section_names?.join(', '),
  b.room_name,
  b.faculty_name !== 'TBA' ? b.faculty_name : null,
  `${DAY_LABELS[b.day_of_week] || b.day_of_week} ${prettyTime(b.time_start)}–${prettyTime(b.time_end)}`,
].filter(Boolean).join(' · ');

const conflictTitle = (entry) => {
  const m = String(entry || '').match(
    /^(.*?)\s+(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{2}:\d{2}:\d{2})-(\d{2}:\d{2}:\d{2})$/);
  if (!m) return entry || 'Class';
  return `${m[1]} · ${DAY_LABELS[m[2]] || m[2]} ${prettyTime(m[3])}–${prettyTime(m[4])}`;
};

// Y-axis tick for the Room Capacity chart — clicking a room name opens its
// timetable in the Schedule Builder's Room view.
function RoomTick({ x, y, payload, onClickRoom }) {
  const v = String(payload.value);
  const label = (v.length > 20 ? `${v.slice(0, 19)}…` : v).replace(/ /g, '\u00A0');
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="#0d9488"
      style={{ cursor: 'pointer', textDecoration: 'underline' }}
      onClick={() => onClickRoom(v)}>
      {label}
    </text>
  );
}

// A schedule line inside a conflict display; click to open the editor.
function EditableLine({ text, onClick, size = '0.78rem', color = 'inherit' }) {
  return (
    <Box component="span" onClick={onClick} sx={{
      display: 'block', fontSize: size, color,
      ...(onClick && {
        cursor: 'pointer',
        '&:hover': { color: 'primary.main', textDecoration: 'underline' },
      }),
    }}>
      {text}
    </Box>
  );
}

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
  const [expanded, setExpanded] = useState(null); // 'programs' | 'faculty' | 'conflicts' | 'type:*'
  const [exporting, setExporting] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [conflictProgram, setConflictProgram] = useState('');   // '' = all programs
  const navigate = useNavigate();

  const loadData = (periodId) => {
    if (!periodId) return;
    Promise.all([
      fetchStats({ academic_period: periodId }),
      fetchConflicts({ academic_period: periodId }),
    ]).then(([statsRes, conflictsRes]) => {
      setStats(statsRes.data);
      setConflicts(conflictsRes.data.results ?? conflictsRes.data);
    }).catch(() => setError('Failed to load dashboard data'));
  };

  // Open the schedule editor for a conflicting entry so it can be fixed here.
  const handleEditById = async (id) => {
    if (!id) return;
    try {
      const res = await fetchSchedule(id);
      setEditEntry(res.data);
      setEditOpen(true);
    } catch { /* entry may have been deleted */ }
  };

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

  useEffect(() => { loadData(activePeriod); }, [activePeriod]); // eslint-disable-line

  const summary = stats?.summary || {};
  const facultyBreakdown = stats?.faculty_breakdown || [];

  const hardConflicts = useMemo(
    () => (conflicts || []).filter((c) => (c.hard || []).length > 0),
    [conflicts]);

  // Unique clashing pairs per conflict type (each pair listed once, not A-vs-B
  // and B-vs-A). pair = { a, b } detail objects for the stacked display.
  const conflictPairs = useMemo(() => {
    const byType = { room: [], faculty: [], section: [] };
    const seen = new Set();
    (conflicts || []).forEach((c) => {
      (c.hard || []).forEach((h) => {
        if (!byType[h.type]) byType[h.type] = [];
        const ids = [c.entry_id, h.conflicting_entry_id].sort((x, y) => x - y);
        const key = `${h.type}:${ids[0]}-${ids[1]}`;
        if (seen.has(key)) return;
        seen.add(key);
        byType[h.type].push({
          a: c.entry_detail, b: h.other,
          aId: c.entry_id, bId: h.conflicting_entry_id,
          fallback: `${conflictTitle(c.entry)} — ${prettyMsg(h.message)}`,
        });
      });
    });
    return byType;
  }, [conflicts]);

  // Flat list of unique pairs across all types, tagged with their type.
  const allPairs = useMemo(
    () => Object.entries(conflictPairs).flatMap(([type, arr]) =>
      arr.map((p) => ({ ...p, type }))),
    [conflictPairs]);

  const programProgress = useMemo(
    () => (stats?.program_progress || []).map((p) => ({
      ...p,
      remaining: Math.max((p.total_courses || 0) - (p.scheduled || 0), 0),
    })), [stats]);

  // Conflict pair counts per program. A pair counts for a program when either
  // side involves one of its sections (cross-program clashes count for both).
  const conflictsByProgram = useMemo(() => {
    const programOf = (label) => String(label).substring(0, String(label).lastIndexOf(' '));
    const counts = {};
    allPairs.forEach((p) => {
      const progs = new Set(
        [...(p.a?.section_names || []), ...(p.b?.section_names || [])]
          .map(programOf).filter(Boolean));
      progs.forEach((code) => {
        const rec = counts[code] || (counts[code] = {
          program: code, total: 0, room: 0, faculty: 0, section: 0,
        });
        rec.total += 1;
        rec[p.type] += 1;
      });
    });
    return Object.values(counts).sort((a, b) => b.total - a.total);
  }, [allPairs]);

  const facultySorted = useMemo(
    () => [...facultyBreakdown].sort((a, b) => b.total_units - a.total_units),
    [facultyBreakdown]);

  const scheduled = summary.scheduled ?? 0;
  const totalCourses = summary.total_courses ?? 0;

  // Row 1 — general stats. Row 2 — every problem card, all clickable.
  const statCards = [
    { icon: <MenuBook />, label: 'Total Courses', value: totalCourses },
    { icon: <CheckCircle />, label: 'Scheduled', value: `${scheduled} / ${totalCourses}`, color: 'success.main' },
    { icon: <Person />, label: 'Faculty', value: summary.faculty_count ?? 0, color: 'secondary.main' },
  ];

  const issueCards = [
    {
      icon: <Warning />,
      label: 'Conflicts',
      value: Object.values(conflictPairs).reduce((n, arr) => n + arr.length, 0),
      color: 'error.main',
      onClick: () => setExpanded('conflicts'),
    },
    {
      icon: <MeetingRoom />, label: TYPE_LABELS.room, color: 'error.main',
      value: conflictPairs.room?.length ?? 0, onClick: () => setExpanded('type:room'),
    },
    {
      icon: <Person />, label: TYPE_LABELS.faculty, color: 'error.main',
      value: conflictPairs.faculty?.length ?? 0, onClick: () => setExpanded('type:faculty'),
    },
    {
      icon: <Groups />, label: TYPE_LABELS.section, color: 'error.main',
      value: conflictPairs.section?.length ?? 0, onClick: () => setExpanded('type:section'),
    },
    {
      icon: <TrendingUp />, label: 'Overloaded Faculty', color: 'warning.main',
      value: summary.overloaded_faculty_count ?? 0, onClick: () => setExpanded('faculty'),
    },
  ];

  const isOver = (f) => f.total_units > (f.max_units || OVERLOAD_MAX);

  const roomUtil = stats?.room_utilization || [];
  const goRoom = (name) => {
    const r = roomUtil.find((x) => x.name === name);
    if (r) navigate(`/schedule?room=${r.id}`);
  };

  const roomChart = (data) => (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 34 + 60, 140)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 44 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" unit="h" />
        <YAxis dataKey="name" type="category" width={150} interval={0}
          tick={<RoomTick onClickRoom={goRoom} />} />
        <Tooltip formatter={(v, n) => [`${v} h`, n]} />
        <Legend />
        <Bar dataKey="available_hours" name="Available (operating hours)"
          fill="#cbd5e1" barSize={9} />
        <Bar dataKey="booked_hours" name="Booked" fill="#0d9488" barSize={9}
          style={{ cursor: 'pointer' }}
          onClick={(d) => { const n = d?.payload?.name ?? d?.name; if (n) goRoom(n); }}>
          <LabelList dataKey="pct" position="right"
            formatter={(v) => `${v}%`} style={{ fontSize: 10, fill: '#334155' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

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

      {/* Stat cards — general numbers */}
      <Box sx={{ display: 'flex', gap: 2.5, mb: 2.5, flexWrap: 'wrap' }}>
        {statCards.map((s) => (
          <Box key={s.label} sx={{ flex: '1 1 160px' }}>
            <StatCard icon={s.icon} label={s.label} value={s.value} color={s.color} />
          </Box>
        ))}
      </Box>

      {/* Problem cards — everything that needs attention, all clickable */}
      <Box sx={{ display: 'flex', gap: 2.5, mb: 3, flexWrap: 'wrap' }}>
        {issueCards.map((s) => (
          <Box key={s.label} sx={{ flex: '1 1 160px' }}>
            <StatCard icon={s.icon} label={s.label} value={s.value} color={s.color}
              onClick={s.onClick} />
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
                  <BarChart data={facultySorted.slice(0, 10)} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={150} interval={0}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => {
                        const t = v.length > 20 ? `${v.slice(0, 19)}…` : v;
                        return t.replace(/ /g, ' ');   // stop recharts wrapping at spaces
                      }} />
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

        {/* Room capacity */}
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <CardHeader title="Room Capacity"
                caption={roomUtil.length > 12
                  ? `busiest 12 of ${roomUtil.length} rooms · click a room to open its timetable`
                  : 'click a room to open its timetable'}
                onExpand={roomUtil.length > 0 ? () => setExpanded('rooms') : null} />
              {roomUtil.length > 0
                ? roomChart(roomUtil.slice(0, 12))
                : <Typography color="text.secondary">No data yet.</Typography>}
            </CardContent>
          </Card>
        </Grid>

        {/* Conflicts by program */}
        <Grid size={12}>
          <Card>
            <CardContent>
              <CardHeader title="Conflicts by Program"
                caption="click a bar to open that program's timetable"
                action={(
                  <TextField select size="small" value={conflictProgram}
                    onChange={(e) => setConflictProgram(e.target.value)}
                    SelectProps={{ native: true }} sx={{ minWidth: 170 }}>
                    <option value="">All programs</option>
                    {conflictsByProgram.map((p) => (
                      <option key={p.program} value={p.program}>{p.program}</option>
                    ))}
                  </TextField>
                )} />
              {conflictsByProgram.length === 0 ? (
                <Typography color="text.secondary">No conflicts — nothing to chart. 🎉</Typography>
              ) : (() => {
                const rows = conflictProgram
                  ? conflictsByProgram.filter((p) => p.program === conflictProgram)
                  : conflictsByProgram;
                // Breakdown numbers: the selected program's counts, or the
                // period-wide unique-pair totals for All programs (summing the
                // per-program rows would double-count cross-program pairs).
                const totals = conflictProgram
                  ? rows[0]
                  : {
                    total: allPairs.length,
                    room: conflictPairs.room?.length ?? 0,
                    faculty: conflictPairs.faculty?.length ?? 0,
                    section: conflictPairs.section?.length ?? 0,
                  };
                return (
                  <>
                    {totals && (
                      <Box sx={{ display: 'flex', gap: 3, mb: 1.5, flexWrap: 'wrap' }}>
                        {[['Total', totals.total], ['Room', totals.room],
                          ['Faculty', totals.faculty], ['Section', totals.section]]
                          .map(([label, v]) => (
                            <Box key={label}>
                              <Typography variant="caption" color="text.secondary">{label}</Typography>
                              <Typography variant="h6" color={v > 0 ? 'error.main' : 'text.primary'}>
                                {v}
                              </Typography>
                            </Box>
                          ))}
                      </Box>
                    )}
                    <ResponsiveContainer width="100%"
                      height={Math.max(rows.length * 34 + 60, 140)}>
                      <BarChart data={rows} layout="vertical" margin={{ left: 20, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis dataKey="program" type="category" width={80} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        {[['room', TYPE_LABELS.room, '#ef4444'],
                          ['faculty', TYPE_LABELS.faculty, '#f97316'],
                          ['section', TYPE_LABELS.section, '#eab308']].map(([key, name, fill]) => (
                            <Bar key={key} dataKey={key} name={name} fill={fill} stackId="c"
                              barSize={14} style={{ cursor: 'pointer' }}
                              onClick={(d) => {
                                const code = d?.payload?.program ?? d?.program;
                                if (code) navigate(`/schedule?program=${encodeURIComponent(code)}`);
                              }} />
                          ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent conflicts */}
        <Grid size={12}>
          <Card>
            <CardContent>
              <CardHeader title="Recent Conflicts"
                caption={allPairs.length > 5 ? `showing 5 of ${allPairs.length}` : null}
                action={allPairs.length > 0 ? exportButton : null}
                onExpand={allPairs.length > 0 ? () => setExpanded('conflicts') : null} />
              {allPairs.length > 0 ? (
                <List dense>
                  {allPairs.slice(0, 5).map((p, i) => (
                    <ListItem key={i} sx={{ alignItems: 'flex-start' }}>
                      <ListItemIcon sx={{ minWidth: 34, mt: 0.5 }}>
                        <Warning color="error" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={TYPE_LABELS[p.type] || 'Conflict'}
                        secondary={p.a && p.b ? (
                          <Box component="span" sx={{ display: 'block' }}>
                            <EditableLine text={briefLine(p.a)} onClick={() => handleEditById(p.aId)} />
                            <EditableLine text={briefLine(p.b)} onClick={() => handleEditById(p.bId)} />
                          </Box>
                        ) : p.fallback}
                        primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }}
                        secondaryTypographyProps={{ fontSize: '0.78rem' }}
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

      {/* Per-type conflict dialogs — the clashing schedules stacked in pairs */}
      {['room', 'faculty', 'section'].map((type) => (
        <FullScreenDialog key={type} open={expanded === `type:${type}`}
          onClose={() => setExpanded(null)}
          title={TYPE_LABELS[type]}
          subtitle={`${conflictPairs[type]?.length ?? 0} conflicting pairs`}
          action={exportButton}>
          <List dense sx={{ px: 2 }}>
            {(conflictPairs[type] || []).map((p, i) => (
              <ListItem key={i} sx={{
                alignItems: 'flex-start', borderBottom: '1px solid', borderColor: 'divider',
              }}>
                <ListItemIcon sx={{ minWidth: 34, mt: 0.5 }}>
                  <Warning color="error" fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  disableTypography
                  secondary={p.a && p.b ? (
                    <Box component="span" sx={{ display: 'block' }}>
                      <EditableLine text={briefLine(p.a)} size="0.82rem" onClick={() => handleEditById(p.aId)} />
                      <EditableLine text={briefLine(p.b)} size="0.82rem" onClick={() => handleEditById(p.bId)} />
                    </Box>
                  ) : (
                    <Box component="span" sx={{ display: 'block', fontSize: '0.82rem' }}>
                      {p.fallback}
                    </Box>
                  )}
                />
              </ListItem>
            ))}
          </List>
        </FullScreenDialog>
      ))}

      <FullScreenDialog open={expanded === 'rooms'} onClose={() => setExpanded(null)}
        title="Room Capacity"
        subtitle={`${roomUtil.length} rooms · booked hours vs the school's weekly operating hours`}>
        <Box sx={{ p: 2 }}>
          {roomChart(roomUtil)}
        </Box>
      </FullScreenDialog>

      <EditDialog
        open={editOpen} onClose={() => setEditOpen(false)}
        entry={editEntry} onSaved={() => loadData(activePeriod)}
      />

      <FullScreenDialog open={expanded === 'conflicts'} onClose={() => setExpanded(null)}
        title="All Conflicts"
        subtitle={`${allPairs.length} conflicts · ${hardConflicts.length} classes affected`}
        action={exportButton}>
        <List dense sx={{ px: 2 }}>
          {hardConflicts.map((c, i) => (
            <ListItem key={c.entry_id ?? i} sx={{ alignItems: 'flex-start', borderBottom: '1px solid', borderColor: 'divider' }}>
              <ListItemIcon sx={{ minWidth: 34, mt: 0.5 }}>
                <Warning color="error" fontSize="small" />
              </ListItemIcon>
              <ListItemText
                disableTypography
                primary={null}
                secondary={
                  <Box component="span" sx={{ display: 'block' }}>
                    {(c.hard || []).map((h, j) => (
                      <Box component="span" key={j} sx={{ display: 'block', mb: 0.75 }}>
                        <Box component="span" sx={{
                          display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'error.main',
                        }}>
                          {TYPE_LABELS[h.type] || 'Conflict'}
                        </Box>
                        {c.entry_detail && h.other ? (
                          <>
                            <EditableLine text={briefLine(c.entry_detail)} color="text.secondary"
                              onClick={() => handleEditById(c.entry_id)} />
                            <EditableLine text={briefLine(h.other)} color="text.secondary"
                              onClick={() => handleEditById(h.conflicting_entry_id)} />
                          </>
                        ) : (
                          <Box component="span" sx={{ display: 'block', fontSize: '0.78rem', color: 'text.secondary' }}>
                            {conflictTitle(c.entry)} — {prettyMsg(h.message)}
                          </Box>
                        )}
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
