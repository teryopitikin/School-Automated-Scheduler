import { useState, useEffect } from 'react';
import {
  Card, CardContent, Typography, Box, Switch, Alert, CircularProgress,
} from '@mui/material';
import { ReportProblem } from '@mui/icons-material';
import { fetchConflictTypeSettings, updateConflictTypeSettings } from '../api/schedules';
import { FONT_MONO } from '../theme';

const TYPES = [
  { key: 'faculty', label: 'Faculty double-booked',
    help: 'Flag when the same teacher is in two overlapping classes.' },
  { key: 'section', label: 'Section overlap',
    help: 'Flag when a section sits in two overlapping classes.' },
];

// Admin-only: turn OFF flagging for a whole conflict type, everywhere —
// dashboard, conflicts drawer, exports, the assistant, and save-blocking.
// The conflict list itself still updates live; this only controls which
// types of clash it's allowed to report.
export default function ConflictFlagsCard() {
  const [flags, setFlags] = useState(null);   // {faculty: bool, section: bool}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchConflictTypeSettings().then((res) => setFlags(res.data)).catch(() => {});
  }, []);

  const toggle = async (key) => {
    if (!flags) return;
    const next = { [key]: !flags[key] };
    setBusy(true);
    setError('');
    try {
      const res = await updateConflictTypeSettings(next);
      setFlags(res.data);
      window.dispatchEvent(new Event('conflict-settings-changed'));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <ReportProblem color="error" fontSize="small" />
          <Typography variant="h6" sx={{ flex: 1 }}>Conflict Flags</Typography>
          {busy && <CircularProgress size={16} />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Turn off a conflict type to stop it being flagged anywhere — the
          dashboard, the schedule builder, exports, and the assistant — and
          stop it from blocking saves. Existing classes aren't changed;
          only whether this type of clash gets reported.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>{error}</Alert>}
        {!flags ? (
          <CircularProgress size={20} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {TYPES.map((t) => (
              <Box key={t.key} sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                px: 1.5, py: 1, borderRadius: '8px',
                border: '1px solid', borderColor: 'divider',
                borderLeft: '3px solid',
                borderLeftColor: flags[t.key] ? 'error.main' : 'divider',
              }}>
                <Box>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{t.help}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{
                    fontFamily: FONT_MONO, fontSize: '0.62rem', fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: flags[t.key] ? 'error.main' : 'text.disabled',
                    minWidth: 52, textAlign: 'right',
                  }}>
                    {flags[t.key] ? 'Flagged' : 'Ignored'}
                  </Typography>
                  <Switch checked={flags[t.key]} disabled={busy}
                    onChange={() => toggle(t.key)} color="error" />
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
