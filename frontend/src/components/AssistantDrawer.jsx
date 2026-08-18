import { useState, useRef, useEffect } from 'react';
import {
  Box, Drawer, Fab, Typography, TextField, IconButton, CircularProgress,
  Paper, Button, Alert, Chip,
} from '@mui/material';
import { AutoAwesome, Send, Close } from '@mui/icons-material';
import { assistantChat, assistantExecute } from '../api/assistant';

// Chat with Claude about the schedule. Write actions Claude stages arrive as
// cards; nothing changes until the user clicks Approve, which executes through
// the normal conflict-checked flows.
export default function AssistantDrawer() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState([]);       // {role: 'user'|'claude'|'error', text}
  const [history, setHistory] = useState([]); // opaque API message history
  const [actions, setActions] = useState([]); // staged actions awaiting approval
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, actions, busy]);

  const send = async () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setChat((c) => [...c, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await assistantChat({ message, history });
      setHistory(res.data.history);
      setChat((c) => [...c, { role: 'claude', text: res.data.reply || '(no reply)' }]);
      if (res.data.actions?.length) {
        setActions((a) => [...a, ...res.data.actions.map((x) => ({ ...x, status: 'pending' }))]);
      }
    } catch (err) {
      const detail = err.response?.data?.detail || 'Request failed — is the backend running?';
      setChat((c) => [...c, { role: 'error', text: detail }]);
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (idx, allowConflicts = false) => {
    const action = actions[idx];
    setActions((a) => a.map((x, i) => (i === idx ? { ...x, status: 'running' } : x)));
    try {
      await assistantExecute({ action, allow_conflicts: allowConflicts });
      setActions((a) => a.map((x, i) => (i === idx ? { ...x, status: 'done' } : x)));
      window.dispatchEvent(new Event('assistant-data-changed'));
    } catch (err) {
      if (err.response?.status === 409) {
        const hard = err.response.data.hard || [];
        setActions((a) => a.map((x, i) => (i === idx
          ? { ...x, status: 'blocked', clashes: hard.map((h) => h.message) } : x)));
      } else {
        setActions((a) => a.map((x, i) => (i === idx
          ? { ...x, status: 'error', error: err.response?.data?.detail || 'Failed' } : x)));
      }
    }
  };

  const dismiss = (idx) => setActions((a) => a.filter((_, i) => i !== idx));

  const statusChip = {
    done: <Chip size="small" color="success" label="Applied" />,
    running: <CircularProgress size={16} />,
    error: <Chip size="small" color="error" label="Failed" />,
  };

  return (
    <>
      <Fab color="primary" onClick={() => setOpen(true)} title="Ask Claude"
        sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: (t) => t.zIndex.drawer - 1 }}>
        <AutoAwesome />
      </Fab>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, display: 'flex', flexDirection: 'column' } }}>
        <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider',
          display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesome color="primary" fontSize="small" />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>Claude</Typography>
          <IconButton size="small" onClick={() => setOpen(false)}><Close fontSize="small" /></IconButton>
        </Box>

        <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 1.5,
          display: 'flex', flexDirection: 'column', gap: 1 }}>
          {chat.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              Ask about schedules, conflicts, faculty loads, or free slots —
              or ask me to plot, move, or delete a class. Changes always wait
              for your approval.
            </Typography>
          )}
          {chat.map((m, i) => (
            m.role === 'error'
              ? <Alert key={i} severity="error" sx={{ py: 0 }}>{m.text}</Alert>
              : (
                <Paper key={i} elevation={0} sx={{
                  p: 1.25, maxWidth: '88%', whiteSpace: 'pre-wrap', fontSize: '0.875rem',
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  bgcolor: m.role === 'user' ? 'primary.main' : 'action.hover',
                  color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                  borderRadius: 2,
                }}>
                  {m.text}
                </Paper>
              )
          ))}

          {actions.map((a, i) => (
            <Paper key={`act-${i}`} variant="outlined" sx={{ p: 1.25, borderColor: 'warning.main' }}>
              <Typography variant="caption" color="warning.main" sx={{ fontWeight: 700 }}>
                PROPOSED CHANGE
              </Typography>
              <Typography variant="body2" sx={{ my: 0.5 }}>{a.summary}</Typography>
              {a.status === 'blocked' && (
                <Alert severity="warning" sx={{ py: 0, mb: 0.5 }}>
                  Clashes: {a.clashes?.join('; ')}
                </Alert>
              )}
              {a.status === 'error' && <Alert severity="error" sx={{ py: 0, mb: 0.5 }}>{a.error}</Alert>}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {a.status === 'pending' && (
                  <Button size="small" variant="contained" onClick={() => runAction(i)}>Approve</Button>
                )}
                {a.status === 'blocked' && (
                  <Button size="small" color="warning" variant="contained"
                    onClick={() => runAction(i, true)}>Apply anyway</Button>
                )}
                {statusChip[a.status] || null}
                {a.status !== 'running' && (
                  <Button size="small" onClick={() => dismiss(i)}>
                    {a.status === 'done' ? 'Clear' : 'Dismiss'}
                  </Button>
                )}
              </Box>
            </Paper>
          ))}

          {busy && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">Claude is thinking…</Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1 }}>
          <TextField fullWidth size="small" placeholder="Ask Claude…" value={input}
            multiline maxRows={4}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }} />
          <IconButton color="primary" onClick={send} disabled={busy || !input.trim()}>
            <Send />
          </IconButton>
        </Box>
      </Drawer>
    </>
  );
}
