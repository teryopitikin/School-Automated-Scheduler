import { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Grid, Alert, TextField,
  LinearProgress, List, ListItem, ListItemIcon, ListItemText, Chip,
} from '@mui/material';
import {
  UploadFile, Download, CheckCircle, Error as ErrorIcon, Warning,
} from '@mui/icons-material';
import { importExcel, exportExcel } from '../api/importExport';
import { fetchAcademicPeriods } from '../api/academicPeriods';

export default function ImportExport() {
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    fetchAcademicPeriods().then((res) => {
      const p = res.data.results ?? res.data;
      setPeriods(p);
      const active = p.find((x) => x.status === 'ACTIVE') || p[0];
      if (active) setActivePeriod(active.id);
    });
  }, []);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError('');
    try {
      const res = await importExcel(file, activePeriod);
      setImportResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleExport = async (type) => {
    try {
      const res = await exportExcel({ academic_period: activePeriod, type });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type || 'schedule'}_export.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Export failed');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Import / Export</Typography>
        <TextField select size="small" value={activePeriod} sx={{ minWidth: 250 }}
          onChange={(e) => setActivePeriod(e.target.value)}
          SelectProps={{ native: true }}>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </TextField>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2.5}>
        {/* Import */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Import Excel</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Upload an Excel file matching the faculty loading format. The system will parse
                programs, courses, faculty, rooms, sections, and schedule entries.
              </Typography>
              <input type="file" accept=".xlsx,.xls" ref={fileRef} style={{ display: 'none' }}
                onChange={handleImport} />
              <Button variant="outlined" startIcon={<UploadFile />}
                onClick={() => fileRef.current?.click()} disabled={importing || !activePeriod}>
                {importing ? 'Importing...' : 'Choose File'}
              </Button>
              {importing && <LinearProgress sx={{ mt: 2 }} />}

              {importResult && (
                <Box sx={{ mt: 2 }}>
                  <Alert severity="success" sx={{ mb: 1 }}>
                    Import complete: {importResult.created || 0} entries created
                  </Alert>
                  {importResult.skipped?.length > 0 && (
                    <>
                      <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 0.5 }}>
                        Skipped Rows ({importResult.skipped.length})
                      </Typography>
                      <List dense>
                        {importResult.skipped.slice(0, 10).map((s, i) => (
                          <ListItem key={i}>
                            <ListItemIcon><Warning color="warning" fontSize="small" /></ListItemIcon>
                            <ListItemText primary={s.reason || s} secondary={s.row ? `Row ${s.row}` : ''} />
                          </ListItem>
                        ))}
                      </List>
                    </>
                  )}
                  {importResult.conflicts?.length > 0 && (
                    <>
                      <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 0.5 }}>
                        Conflicts ({importResult.conflicts.length})
                      </Typography>
                      <List dense>
                        {importResult.conflicts.slice(0, 10).map((c, i) => (
                          <ListItem key={i}>
                            <ListItemIcon><ErrorIcon color="error" fontSize="small" /></ListItemIcon>
                            <ListItemText primary={c.message || c} />
                          </ListItem>
                        ))}
                      </List>
                    </>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Export */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Export Excel</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Download schedule data as Excel workbooks.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Button variant="outlined" startIcon={<Download />} disabled={!activePeriod}
                  onClick={() => handleExport('schedule')}>
                  Schedule Export
                </Button>
                <Button variant="outlined" startIcon={<Download />} disabled={!activePeriod}
                  onClick={() => handleExport('faculty_loading')}>
                  Faculty Loading Report
                </Button>
                <Button variant="outlined" startIcon={<Download />} disabled={!activePeriod}
                  onClick={() => handleExport('room_utilization')}>
                  Room Utilization Report
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
