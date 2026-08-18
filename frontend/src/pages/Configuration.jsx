import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, Grid, Slider,
  Alert, IconButton, Chip,
} from '@mui/material';
import { Add, Delete, Save } from '@mui/icons-material';
import { fetchConfig, updateConfig } from '../api/config';
import { fetchAcademicPeriods } from '../api/academicPeriods';
import ClaudeAssistantCard from '../components/ClaudeAssistantCard';

const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const GRANULARITY_OPTIONS = [15, 30, 60];

export default function Configuration() {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [config, setConfig] = useState(null);
  const [configId, setConfigId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAcademicPeriods().then((res) => {
      const p = res.data.results ?? res.data;
      setPeriods(p);
      const active = p.find((x) => x.status === 'ACTIVE') || p[0];
      if (active) setSelectedPeriod(active.id);
    });
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return;
    setLoading(true);
    fetchConfig({ academic_period: selectedPeriod }).then((res) => {
      const items = res.data.results ?? res.data;
      const cfg = Array.isArray(items) ? items[0] : items;
      if (cfg) {
        setConfigId(cfg.id);
        setConfig({
          earliest_start_time: cfg.earliest_start_time || '07:00',
          latest_end_time: cfg.latest_end_time || '21:00',
          time_slot_granularity_minutes: cfg.time_slot_granularity_minutes || 30,
          operating_days: cfg.operating_days || ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
          break_periods: cfg.break_periods || [],
          weight_faculty_priority: cfg.weight_faculty_priority ?? 50,
          weight_room_proximity: cfg.weight_room_proximity ?? 50,
          weight_time_gap_minimization: cfg.weight_time_gap_minimization ?? 30,
          weight_load_distribution: cfg.weight_load_distribution ?? 30,
        });
      } else {
        setConfig(null);
        setConfigId(null);
      }
    }).catch(() => {
      setError('Failed to load configuration');
    }).finally(() => setLoading(false));
  }, [selectedPeriod]);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    try {
      await updateConfig(configId, { ...config, academic_period: selectedPeriod });
      setSuccess('Configuration saved.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
    }
  };

  const toggleDay = (day) => {
    const days = config.operating_days.includes(day)
      ? config.operating_days.filter((d) => d !== day)
      : [...config.operating_days, day];
    setConfig({ ...config, operating_days: days });
  };

  const addBreak = () => {
    setConfig({
      ...config,
      break_periods: [...config.break_periods, { day: 'ALL', start: '12:00', end: '13:00', label: 'Lunch' }],
    });
  };

  const updateBreak = (index, field, value) => {
    const breaks = [...config.break_periods];
    breaks[index] = { ...breaks[index], [field]: value };
    setConfig({ ...config, break_periods: breaks });
  };

  const removeBreak = (index) => {
    setConfig({ ...config, break_periods: config.break_periods.filter((_, i) => i !== index) });
  };

  if (loading) return <Typography>Loading...</Typography>;

  if (!config) {
    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 2 }}>Configuration</Typography>
        <Alert severity="info" sx={{ mb: 2.5 }}>No configuration found for this period. Create one from the admin panel or via API.</Alert>
        <ClaudeAssistantCard />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Configuration</Typography>
        <TextField select size="small" value={selectedPeriod} sx={{ minWidth: 250 }}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          SelectProps={{ native: true }}>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </TextField>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Grid container spacing={2.5}>
        {/* Time boundaries */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Time Boundaries</Typography>
              <Grid container spacing={2}>
                <Grid size={6}>
                  <TextField fullWidth label="Earliest Start" type="time" value={config.earliest_start_time}
                    onChange={(e) => setConfig({ ...config, earliest_start_time: e.target.value })}
                    InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid size={6}>
                  <TextField fullWidth label="Latest End" type="time" value={config.latest_end_time}
                    onChange={(e) => setConfig({ ...config, latest_end_time: e.target.value })}
                    InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid size={12}>
                  <TextField fullWidth select label="Slot Granularity" value={config.time_slot_granularity_minutes}
                    onChange={(e) => setConfig({ ...config, time_slot_granularity_minutes: parseInt(e.target.value) })}
                    SelectProps={{ native: true }}>
                    {GRANULARITY_OPTIONS.map((g) => <option key={g} value={g}>{g} minutes</option>)}
                  </TextField>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Operating days */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Operating Days</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {ALL_DAYS.map((day) => (
                  <Chip key={day} label={day} clickable
                    color={config.operating_days.includes(day) ? 'primary' : 'default'}
                    variant={config.operating_days.includes(day) ? 'filled' : 'outlined'}
                    onClick={() => toggleDay(day)}
                  />
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Break periods */}
        <Grid size={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Break Periods</Typography>
                <Button size="small" startIcon={<Add />} onClick={addBreak}>Add Break</Button>
              </Box>
              {config.break_periods.map((bp, i) => (
                <Grid container spacing={1.5} key={i} sx={{ mb: 1.5 }}>
                  <Grid size={3}>
                    <TextField fullWidth size="small" label="Day" value={bp.day}
                      onChange={(e) => updateBreak(i, 'day', e.target.value)} />
                  </Grid>
                  <Grid size={2.5}>
                    <TextField fullWidth size="small" label="Start" type="time" value={bp.start}
                      onChange={(e) => updateBreak(i, 'start', e.target.value)} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid size={2.5}>
                    <TextField fullWidth size="small" label="End" type="time" value={bp.end}
                      onChange={(e) => updateBreak(i, 'end', e.target.value)} InputLabelProps={{ shrink: true }} />
                  </Grid>
                  <Grid size={3}>
                    <TextField fullWidth size="small" label="Label" value={bp.label}
                      onChange={(e) => updateBreak(i, 'label', e.target.value)} />
                  </Grid>
                  <Grid size={1} sx={{ display: 'flex', alignItems: 'center' }}>
                    <IconButton size="small" color="error" onClick={() => removeBreak(i)}><Delete fontSize="small" /></IconButton>
                  </Grid>
                </Grid>
              ))}
              {config.break_periods.length === 0 && (
                <Typography variant="body2" color="text.secondary">No break periods configured.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Suggestion weights */}
        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Suggestion Engine Weights</Typography>
              <Grid container spacing={3}>
                {[
                  { key: 'weight_faculty_priority', label: 'Faculty Priority' },
                  { key: 'weight_room_proximity', label: 'Room Proximity' },
                  { key: 'weight_time_gap_minimization', label: 'Time Gap Minimization' },
                  { key: 'weight_load_distribution', label: 'Load Distribution' },
                ].map(({ key, label }) => (
                  <Grid size={{ xs: 12, md: 6 }} key={key}>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>{label}: {config[key]}</Typography>
                    <Slider value={config[key]} min={0} max={100}
                      onChange={(_, v) => setConfig({ ...config, [key]: v })}
                      valueLabelDisplay="auto" />
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" size="large" startIcon={<Save />} onClick={handleSave}>
          Save Configuration
        </Button>
      </Box>

      <Box sx={{ mt: 2.5 }}>
        <ClaudeAssistantCard />
      </Box>
    </Box>
  );
}
