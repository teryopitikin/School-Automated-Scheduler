import { useState, useEffect } from 'react';
import {
  Card, CardContent, Typography, TextField, Button, Box, Chip, Alert,
  CircularProgress,
} from '@mui/material';
import { AutoAwesome } from '@mui/icons-material';
import { fetchAssistantConfig, saveAssistantKey, testAssistantKey } from '../api/assistant';

// Configure the Claude API key from the app. The key is stored server-side
// (in the backend's gitignored .env) and only its last 4 chars are shown back.
export default function ClaudeAssistantCard() {
  const [status, setStatus] = useState(null);   // {configured, key_tail}
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState('');         // '' | 'save' | 'test'
  const [result, setResult] = useState(null);   // {severity, text}

  useEffect(() => {
    fetchAssistantConfig().then((res) => setStatus(res.data)).catch(() => {});
  }, []);

  const save = async () => {
    setBusy('save'); setResult(null);
    try {
      const res = await saveAssistantKey(keyInput.trim());
      setStatus(res.data);
      setKeyInput('');
      setResult(res.data.configured
        ? { severity: 'success', text: 'API key saved. The assistant is ready — try "Test connection".' }
        : { severity: 'info', text: 'API key cleared. The assistant is disabled.' });
    } catch (err) {
      setResult({ severity: 'error', text: err.response?.data?.detail || 'Failed to save the key.' });
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test'); setResult(null);
    try {
      const res = await testAssistantKey();
      setResult(res.data.ok
        ? { severity: 'success', text: `Connected — ${res.data.model} is reachable.` }
        : { severity: 'error', text: `Connection failed: ${res.data.error}` });
    } catch (err) {
      setResult({ severity: 'error', text: err.response?.data?.detail || 'Test request failed.' });
    } finally {
      setBusy('');
    }
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <AutoAwesome color="primary" fontSize="small" />
          <Typography variant="h6" sx={{ flex: 1 }}>Claude Assistant</Typography>
          {status && (status.configured
            ? <Chip size="small" color="success" label={`Configured ····${status.key_tail}`} />
            : <Chip size="small" label="Not configured" />)}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Paste your Anthropic API key (from console.anthropic.com) to enable the
          in-app Claude assistant. The key is stored on the backend server only and
          is never shown again in full. Saving an empty field removes the key.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small" type="password" label="Anthropic API key"
            placeholder="sk-ant-..." value={keyInput} autoComplete="off"
            onChange={(e) => setKeyInput(e.target.value)} sx={{ flex: 1, minWidth: 260 }} />
          <Button variant="contained" onClick={save}
            disabled={!!busy || (!keyInput.trim() && !status?.configured)}>
            {busy === 'save' ? <CircularProgress size={20} /> : (keyInput.trim() ? 'Save key' : 'Clear key')}
          </Button>
          <Button variant="outlined" onClick={test} disabled={!!busy || !status?.configured}>
            {busy === 'test' ? <CircularProgress size={20} /> : 'Test connection'}
          </Button>
        </Box>
        {result && <Alert severity={result.severity} sx={{ mt: 1.5 }}
          onClose={() => setResult(null)}>{result.text}</Alert>}
      </CardContent>
    </Card>
  );
}
