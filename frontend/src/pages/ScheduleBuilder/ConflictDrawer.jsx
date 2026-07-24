import { useState } from 'react';
import {
  Drawer, Box, Typography, IconButton, Chip, Divider, CircularProgress, Button,
} from '@mui/material';
import {
  Close, Person, MeetingRoom, Groups, TrendingUp, ErrorOutline, FileDownload,
} from '@mui/icons-material';
import { exportExcel } from '../../api/importExport';

const DAY_LABELS = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
};

const TYPE_META = {
  faculty: { label: 'Faculty double-booked', Icon: Person },
  room: { label: 'Room double-booked', Icon: MeetingRoom },
  section: { label: 'Section overlap', Icon: Groups },
  overload: { label: 'Faculty overload', Icon: TrendingUp },
};

// "07:00:00" -> "7:00 AM"
function prettyTime(hms) {
  const [h, m] = hms.split(':').map((n) => parseInt(n, 10));
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

// Replace any HH:MM:SS inside a backend message with a friendly 12-hour time.
function prettyMessage(msg) {
  return String(msg || '').replace(/(\d{1,2}):(\d{2}):(\d{2})/g, (_, h, m) =>
    prettyTime(`${h}:${m}:00`));
}

// "GE 102 FRI 07:00:00-08:00:00" -> { title: "GE 102", when: "Fri · 7:00 AM – 8:00 AM" }
function parseEntry(entry) {
  const m = String(entry || '').match(
    /^(.*?)\s+(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{2}:\d{2}:\d{2})-(\d{2}:\d{2}:\d{2})$/,
  );
  if (!m) return { title: entry || 'Class', when: '' };
  return {
    title: m[1],
    when: `${DAY_LABELS[m[2]] || m[2]} · ${prettyTime(m[3])} – ${prettyTime(m[4])}`,
  };
}

// Human-readable descriptor for a schedule entry (section · room · faculty [· day/time]).
function describe(entry, { withCourse = false, withTime = false } = {}) {
  if (!entry) return '';
  const parts = [];
  if (withCourse && entry.course_code) parts.push(entry.course_code);
  if (entry.section_names?.length) parts.push(entry.section_names.join(', '));
  if (entry.room_name) parts.push(`Room ${entry.room_name}`);
  if (entry.faculty_name && entry.faculty_name !== 'TBA') parts.push(entry.faculty_name);
  if (withTime && entry.time_start) {
    parts.push(`${DAY_LABELS[entry.day_of_week] || entry.day_of_week} `
      + `${prettyTime(entry.time_start)}–${prettyTime(entry.time_end)}`);
  }
  return parts.join(' · ');
}

function IssueRow({ issue, other }) {
  const meta = TYPE_META[issue.type] || { label: issue.type || 'Conflict', Icon: ErrorOutline };
  const { Icon } = meta;
  const otherDesc = describe(other, { withCourse: true, withTime: true });
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1 }}>
      <Icon sx={{ fontSize: 18, color: 'error.main', mt: '1px', flexShrink: 0 }} />
      <Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'error.main' }}>
          {meta.label}
        </Typography>
        {otherDesc ? (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.35 }}>
            <Box component="span" sx={{ color: 'text.disabled' }}>clashes with </Box>
            {otherDesc}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.35 }}>
            {prettyMessage(issue.message)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function ConflictDrawer({ open, onClose, conflicts, loading, entriesById, periodId }) {
  const total = conflicts.length;
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!periodId) return;
    setExporting(true);
    try {
      const res = await exportExcel({ academic_period: periodId, type: 'conflicts' });
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

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: 380 } }}>
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="h6">Conflicts</Typography>
          <IconButton onClick={onClose}><Close /></IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {loading
            ? 'Checking every class for conflicts…'
            : total === 0
              ? 'No conflicts found.'
              : `${total} class${total === 1 ? '' : 'es'} need attention`}
        </Typography>
        {!loading && total > 0 && (
          <Button fullWidth size="small" variant="outlined" startIcon={<FileDownload />}
            onClick={handleExport} disabled={exporting} sx={{ mb: 1.5 }}>
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </Button>
        )}
        <Divider sx={{ mb: 1.5 }} />

        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, mt: 5 }}>
            <CircularProgress />
            <Typography color="text.secondary" variant="body2">
              Analyzing the schedule — this can take a moment for large timetables.
            </Typography>
          </Box>
        ) : total === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            Everything looks clear.
          </Typography>
        ) : (
          conflicts.map((c, i) => {
            const { title, when } = parseEntry(c.entry);
            const hard = c.hard || [];
            const thisEntry = entriesById?.[c.entry_id];
            const thisDesc = describe(thisEntry);
            // Overload warnings are an accepted exemption and intentionally not shown here.
            return (
              <Box key={c.entry_id ?? i} sx={{
                border: '1px solid', borderColor: 'divider', borderRadius: 2,
                p: 1.5, mb: 1.5,
              }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>{title}</Typography>
                  <Chip label="conflict" size="small" color="error" sx={{ height: 20 }} />
                </Box>
                {when && (
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>{when}</Typography>
                )}
                {thisDesc && (
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{thisDesc}</Typography>
                )}
                {hard.map((h, j) => (
                  <IssueRow key={`h${j}`} issue={h} other={entriesById?.[h.conflicting_entry_id]} />
                ))}
              </Box>
            );
          })
        )}
      </Box>
    </Drawer>
  );
}
