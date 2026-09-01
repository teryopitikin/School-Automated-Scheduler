import { useState, useRef, useEffect } from 'react';
import {
  Box, Drawer, Fab, Typography, TextField, IconButton, CircularProgress,
  Button, Alert, Chip, Tooltip, Divider,
} from '@mui/material';
import {
  AutoAwesome, Send, Close, AttachFile, AddComment,
} from '@mui/icons-material';
import { assistantChat, assistantExecute } from '../api/assistant';
import { INK, FONT_MONO, FONT_DISPLAY } from '../theme';

// Chat with Claude about the schedule. Write actions Claude stages arrive as
// cards; nothing changes until the user clicks Approve, which executes through
// the normal conflict-checked flows.

// Starters shown on an empty chat — one per thing the assistant is good at.
const STARTERS = [
  { label: 'Who is double-booked?', text: 'Which teachers are double-booked this week? List the worst first.' },
  { label: 'Find a free slot', text: 'Find a free 2-hour slot this week for BEED 1-1.' },
  { label: "What's unscheduled?", text: 'Which courses have no schedule yet?' },
  { label: 'Heaviest loads', text: 'Which teachers carry the most units right now?' },
];

function ClaudeMark({ size = 26 }) {
  return (
    <Box sx={{
      width: size, height: size, borderRadius: '7px', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      bgcolor: 'rgba(185,138,47,0.16)', border: '1px solid rgba(185,138,47,0.5)',
    }}>
      <AutoAwesome sx={{ fontSize: size * 0.55, color: '#B98A2F' }} />
    </Box>
  );
}

function ThinkingDots() {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.6,
      '@keyframes blink': {
        '0%, 80%, 100%': { opacity: 0.25, transform: 'translateY(0)' },
        '40%': { opacity: 1, transform: 'translateY(-2px)' },
      },
      '@media (prefers-reduced-motion: reduce)': { '& span': { animation: 'none' } },
    }}>
      {[0, 1, 2].map((i) => (
        <Box key={i} component="span" sx={{
          width: 5, height: 5, borderRadius: '50%', bgcolor: 'secondary.main',
          animation: 'blink 1.2s infinite both', animationDelay: `${i * 0.16}s`,
        }} />
      ))}
    </Box>
  );
}

export default function AssistantDrawer() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState([]);       // {role: 'user'|'claude'|'error', text}
  const [history, setHistory] = useState([]); // opaque API message history
  const [actions, setActions] = useState([]); // staged actions awaiting approval
  const [file, setFile] = useState(null);     // pending attachment
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, actions, busy]);

  const send = async (override) => {
    const message = (override ?? input).trim();
    if (!message || busy) return;
    const attachment = file;
    setInput('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setChat((c) => [...c, { role: 'user', text: message, fileName: attachment?.name }]);
    setBusy(true);
    try {
      const res = await assistantChat({ message, history, file: attachment });
      setHistory(res.data.history);
      setChat((c) => [...c, { role: 'claude', text: res.data.reply || '(no reply)' }]);
      if (res.data.actions?.length) {
        setActions((a) => [...a, ...res.data.actions.map((x) => ({ ...x, status: 'pending' }))]);
      }
    } catch (err) {
      // No response at all means the request timed out or the network
      // dropped — say which, rather than blaming the backend.
      const detail = err.response?.data?.detail
        || (err.code === 'ECONNABORTED'
          ? 'That took too long and was cancelled. Try a shorter question, or ask again.'
          : 'Could not reach the server. Check your connection and try again.');
      setChat((c) => [...c, { role: 'error', text: detail }]);
    } finally {
      setBusy(false);
    }
  };

  // Each turn re-sends the whole conversation, so long chats get slower.
  const newChat = () => {
    setChat([]); setHistory([]); setActions([]); setInput('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
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
      <Tooltip title="Ask Claude about the schedule" placement="left">
        <Fab color="primary" onClick={() => setOpen(true)} aria-label="Ask Claude"
          sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: (t) => t.zIndex.drawer - 1 }}>
          <AutoAwesome />
        </Fab>
      </Tooltip>

      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, display: 'flex', flexDirection: 'column' } }}>

        {/* Header — the chalkboard, matching the sidebar */}
        <Box sx={{
          px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25,
          bgcolor: INK.board, color: INK.chalk,
          backgroundImage: 'repeating-linear-gradient(180deg, transparent 0px, transparent 27px, rgba(237,243,238,0.05) 27px, rgba(237,243,238,0.05) 28px)',
        }}>
          <ClaudeMark size={30} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>
              Claude
            </Typography>
            <Typography sx={{
              fontFamily: FONT_MONO, fontSize: '0.58rem', letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'rgba(237,243,238,0.5)',
            }}>
              Scheduling assistant
            </Typography>
          </Box>
          {chat.length > 0 && (
            <Tooltip title="Start a new chat">
              <IconButton size="small" onClick={newChat} sx={{ color: 'rgba(237,243,238,0.7)' }}>
                <AddComment fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'rgba(237,243,238,0.7)' }}>
            <Close fontSize="small" />
          </IconButton>
        </Box>

        {/* Conversation */}
        <Box ref={scrollRef} sx={{
          flex: 1, overflowY: 'auto', px: 2, py: 2,
          display: 'flex', flexDirection: 'column', gap: 1.75,
          bgcolor: 'background.default',
        }}>
          {chat.length === 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography sx={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.05rem', mb: 0.5 }}>
                Ask about your timetable
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                I can read the schedule — conflicts, faculty loads, free slots,
                unscheduled courses — and draft changes for you. Nothing is
                saved until you approve it.
              </Typography>
              <Typography sx={{
                fontFamily: FONT_MONO, fontSize: '0.58rem', letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'secondary.dark', mb: 1,
              }}>
                Try one
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {STARTERS.map((s) => (
                  <Box key={s.label} onClick={() => send(s.text)}
                    sx={{
                      px: 1.5, py: 1, borderRadius: '8px', cursor: 'pointer',
                      border: '1px solid', borderColor: 'divider',
                      borderLeft: '3px solid', borderLeftColor: 'secondary.main',
                      bgcolor: 'background.paper',
                      transition: 'border-color 120ms, transform 120ms',
                      '&:hover': { borderColor: 'primary.main', transform: 'translateX(2px)' },
                    }}>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{s.label}</Typography>
                  </Box>
                ))}
              </Box>
              <Divider sx={{ mt: 2.5 }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                You can attach a spreadsheet, PDF or screenshot with the paperclip.
              </Typography>
            </Box>
          )}

          {chat.map((m, i) => {
            if (m.role === 'error') {
              return <Alert key={i} severity="error" sx={{ fontSize: '0.8rem' }}>{m.text}</Alert>;
            }
            const mine = m.role === 'user';
            return (
              <Box key={i} sx={{
                display: 'flex', gap: 1, alignItems: 'flex-start',
                flexDirection: mine ? 'row-reverse' : 'row',
              }}>
                {!mine && <ClaudeMark />}
                <Box sx={{
                  maxWidth: '86%', px: 1.5, py: 1.15, borderRadius: '12px',
                  whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.55,
                  ...(mine
                    ? {
                      bgcolor: 'primary.main', color: 'primary.contrastText',
                      borderTopRightRadius: '4px',
                    }
                    : {
                      bgcolor: 'background.paper', color: 'text.primary',
                      border: '1px solid', borderColor: 'divider',
                      borderTopLeftRadius: '4px',
                    }),
                }}>
                  {m.fileName && (
                    <Chip size="small" icon={<AttachFile />} label={m.fileName}
                      sx={{
                        mb: 0.75, maxWidth: '100%',
                        bgcolor: mine ? 'rgba(255,255,255,0.18)' : 'action.hover',
                        color: 'inherit',
                        '& .MuiChip-icon': { color: 'inherit' },
                      }} />
                  )}
                  {m.text}
                </Box>
              </Box>
            );
          })}

          {actions.map((a, i) => (
            <Box key={`act-${i}`} sx={{
              p: 1.5, borderRadius: '10px', bgcolor: 'background.paper',
              border: '1px solid', borderColor: 'secondary.main',
              borderLeft: '3px solid', borderLeftColor: 'secondary.main',
            }}>
              <Typography sx={{
                fontFamily: FONT_MONO, fontSize: '0.58rem', fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'secondary.dark', mb: 0.5,
              }}>
                Awaiting your approval
              </Typography>
              <Typography sx={{ fontSize: '0.85rem', mb: 1 }}>{a.summary}</Typography>
              {a.status === 'blocked' && (
                <Alert severity="warning" sx={{ py: 0, mb: 1, fontSize: '0.75rem' }}>
                  Clashes with: {a.clashes?.join('; ')}
                </Alert>
              )}
              {a.status === 'error' && (
                <Alert severity="error" sx={{ py: 0, mb: 1, fontSize: '0.75rem' }}>{a.error}</Alert>
              )}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {a.status === 'pending' && (
                  <Button size="small" variant="contained" onClick={() => runAction(i)}>
                    Approve
                  </Button>
                )}
                {a.status === 'blocked' && (
                  <Button size="small" color="warning" variant="contained"
                    onClick={() => runAction(i, true)}>Apply anyway</Button>
                )}
                {statusChip[a.status] || null}
                {a.status !== 'running' && (
                  <Button size="small" color="inherit" onClick={() => dismiss(i)}
                    sx={{ color: 'text.secondary' }}>
                    {a.status === 'done' ? 'Clear' : 'Dismiss'}
                  </Button>
                )}
              </Box>
            </Box>
          ))}

          {busy && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <ClaudeMark />
              <Box sx={{
                px: 1.5, py: 1.15, borderRadius: '12px', borderTopLeftRadius: '4px',
                border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
                display: 'flex', alignItems: 'center', gap: 1,
              }}>
                <ThinkingDots />
                <Typography variant="caption" color="text.secondary">Reading the schedule…</Typography>
              </Box>
            </Box>
          )}
        </Box>

        {/* Composer */}
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          {file && (
            <Chip size="small" icon={<AttachFile />} label={file.name}
              onDelete={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
              sx={{ mb: 1, maxWidth: '100%' }} />
          )}
          <Box sx={{
            display: 'flex', alignItems: 'flex-end', gap: 0.5, p: 0.5,
            border: '1px solid', borderColor: 'divider', borderRadius: '12px',
            bgcolor: 'background.paper',
            transition: 'border-color 120ms',
            '&:focus-within': { borderColor: 'primary.main' },
          }}>
            <input type="file" ref={fileRef} style={{ display: 'none' }}
              accept=".xlsx,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg,.gif,.webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <Tooltip title="Attach a spreadsheet, PDF or image">
              <span>
                <IconButton size="small" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <AttachFile fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <TextField
              fullWidth variant="standard" placeholder="Ask about the schedule…"
              value={input} multiline maxRows={5}
              InputProps={{ disableUnderline: true, sx: { fontSize: '0.85rem', py: 0.5 } }}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }} />
            <IconButton size="small" color="primary" onClick={() => send()}
              disabled={busy || !input.trim()}
              sx={{
                bgcolor: input.trim() && !busy ? 'primary.main' : 'transparent',
                color: input.trim() && !busy ? 'primary.contrastText' : undefined,
                '&:hover': { bgcolor: input.trim() && !busy ? 'primary.dark' : undefined },
              }}>
              <Send fontSize="small" />
            </IconButton>
          </Box>
          <Typography variant="caption" color="text.disabled"
            sx={{ display: 'block', mt: 0.75, fontSize: '0.68rem' }}>
            Enter to send · Shift+Enter for a new line
          </Typography>
        </Box>
      </Drawer>
    </>
  );
}
