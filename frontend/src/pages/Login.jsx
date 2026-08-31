import { useState } from 'react';
import {
  Box, TextField, Button, Typography, Alert, Paper,
} from '@mui/material';
import { login as loginApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { INK, FONT_DISPLAY, FONT_MONO } from '../theme';

// A plotted week: the sign-in panel sits on a chalkboard ruled like the
// timetable itself, with a few "class blocks" plotted behind the card.
const PLOTTED = [
  { top: '14%', left: '8%', width: 130, height: 64, delay: '0ms' },
  { top: '38%', left: '16%', width: 110, height: 88, delay: '120ms' },
  { top: '62%', left: '6%', width: 150, height: 56, delay: '240ms' },
  { top: '22%', right: '10%', width: 120, height: 74, delay: '180ms' },
  { top: '58%', right: '15%', width: 138, height: 60, delay: '300ms' },
];

export default function Login() {
  const { refreshUser } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await loginApi(form);
      refreshUser();
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid username or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', p: 2,
      bgcolor: INK.board,
      backgroundImage: `
        repeating-linear-gradient(180deg, transparent 0px, transparent 47px, rgba(237,243,238,0.05) 47px, rgba(237,243,238,0.05) 48px),
        repeating-linear-gradient(90deg, transparent 0px, transparent 119px, rgba(237,243,238,0.035) 119px, rgba(237,243,238,0.035) 120px)`,
      position: 'relative', overflow: 'hidden',
      '@keyframes plot': {
        from: { opacity: 0, transform: 'translateY(6px)' },
        to: { opacity: 1, transform: 'none' },
      },
      '@keyframes rise': {
        from: { opacity: 0, transform: 'translateY(10px)' },
        to: { opacity: 1, transform: 'none' },
      },
      '@media (prefers-reduced-motion: reduce)': {
        '& *': { animation: 'none !important' },
      },
    }}>
      {PLOTTED.map((b, i) => (
        <Box key={i} sx={{
          position: 'absolute', ...b,
          display: { xs: 'none', md: 'block' },
          bgcolor: 'rgba(237,243,238,0.05)',
          border: '1px solid rgba(237,243,238,0.12)',
          borderLeft: '3px solid rgba(185,138,47,0.55)',
          borderRadius: '6px',
          animation: 'plot 500ms ease-out both',
          animationDelay: b.delay,
        }} />
      ))}

      <Paper elevation={0} sx={{
        width: 400, maxWidth: '100%', p: 4, borderRadius: '14px',
        border: '1px solid', borderColor: 'divider',
        animation: 'rise 400ms ease-out both',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 3 }}>
          <Box sx={{
            width: 38, height: 38, borderRadius: '8px',
            bgcolor: INK.brassSoft, border: `1px solid ${INK.brass}`,
            borderLeft: `3px solid ${INK.brass}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography sx={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: '0.85rem', color: '#7A5A15' }}>
              Sa
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.3rem', lineHeight: 1.15 }}>
              Scheduler
            </Typography>
            <Typography sx={{
              fontFamily: FONT_MONO, fontSize: '0.6rem', letterSpacing: '0.14em',
              color: 'text.secondary', textTransform: 'uppercase',
            }}>
              School timetabling
            </Typography>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Sign in to plot and manage class schedules.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth label="Username" sx={{ mb: 2 }} autoFocus
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <TextField
            fullWidth label="Password" type="password" sx={{ mb: 3 }}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Button
            fullWidth type="submit" variant="contained" size="large"
            disabled={submitting || !form.username || !form.password}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
