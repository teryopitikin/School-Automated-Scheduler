import { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Grid, Alert, TextField,
  LinearProgress, List, ListItem, ListItemIcon, ListItemText, Chip,
} from '@mui/material';
import {
  UploadFile, Download, CheckCircle, Error as ErrorIcon, Warning,
} from '@mui/icons-material';
import {
  importExcel, exportExcel, importFullExport, importMetadata, wipeSchedule,
} from '../api/importExport';
import { fetchAcademicPeriods } from '../api/academicPeriods';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/permissions';

export default function ImportExport() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);
  const fullExportRef = useRef(null);
  const metadataRef = useRef(null);
  const [fullResult, setFullResult] = useState(null);
  const [metaResult, setMetaResult] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [wipeText, setWipeText] = useState('');
  const [wipeResult, setWipeResult] = useState(null);
  const [busy, setBusy] = useState('');

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

  const handleFullExportImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy('full');
    setFullResult(null);
    setError('');
    try {
      const res = await importFullExport(file, activePeriod);
      setFullResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Full-export import failed');
    } finally {
      setBusy('');
      setConfirmText('');
      if (fullExportRef.current) fullExportRef.current.value = '';
    }
  };

  const handleMetadataImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy('meta');
    setMetaResult(null);
    setError('');
    try {
      const res = await importMetadata(file);
      setMetaResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Metadata import failed');
    } finally {
      setBusy('');
      if (metadataRef.current) metadataRef.current.value = '';
    }
  };

  const handleWipe = async () => {
    setBusy('wipe');
    setWipeResult(null);
    setError('');
    try {
      const res = await wipeSchedule();
      setWipeResult(res.data.wiped);
    } catch (err) {
      setError(err.response?.data?.detail || 'Wipe failed');
    } finally {
      setBusy('');
      setWipeText('');
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
        {/* Import (cleaned registrar format) — admin only */}
        {admin && (
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
        )}

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

        {/* Full-export import (wipe & replace) — admin only */}
        {admin && (
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Full Schedule Import</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Upload a full schedule export workbook (the format produced by
                Schedule Export — metadata sheets plus &ldquo;All Entries&rdquo;).
              </Typography>
              <Alert severity="warning" sx={{ mb: 2 }}>
                This <strong>deletes ALL current schedule data</strong> (classes,
                sections, courses, faculty, rooms, programs) and rebuilds it
                from the file. Type <strong>REPLACE</strong> to enable.
              </Alert>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <TextField size="small" placeholder="Type REPLACE" value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)} sx={{ width: 160 }} />
                <input type="file" accept=".xlsx" ref={fullExportRef} style={{ display: 'none' }}
                  onChange={handleFullExportImport} />
                <Button variant="contained" color="warning" startIcon={<UploadFile />}
                  disabled={confirmText !== 'REPLACE' || busy === 'full' || !activePeriod}
                  onClick={() => fullExportRef.current?.click()}>
                  {busy === 'full' ? 'Importing…' : 'Choose File & Replace'}
                </Button>
              </Box>
              {busy === 'full' && <LinearProgress sx={{ mt: 2 }} />}
              {fullResult && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  Imported {fullResult.created?.entries} entries,{' '}
                  {fullResult.created?.sections} sections,{' '}
                  {fullResult.created?.courses} courses,{' '}
                  {fullResult.created?.faculty} faculty,{' '}
                  {fullResult.created?.rooms} rooms.
                  {fullResult.unknown_sections?.length > 0 &&
                    ` Unlinked section labels: ${fullResult.unknown_sections.join(', ')}`}
                  {fullResult.skipped?.length > 0 && ` Skipped rows: ${fullResult.skipped.length}.`}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
        )}

        {/* Departments / Programs / Courses metadata import — admin only */}
        {admin && (
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Import Departments / Programs / Courses</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Upload a workbook with any of the sheets <strong>Departments</strong>{' '}
                (Code, Name), <strong>Programs</strong> (Code, Name) or{' '}
                <strong>Courses</strong> (Code, Title, Department, Lec, Lab, Has Lab).
                Existing records are updated by code, new ones added — the
                schedule itself is not touched.
              </Typography>
              <input type="file" accept=".xlsx" ref={metadataRef} style={{ display: 'none' }}
                onChange={handleMetadataImport} />
              <Button variant="outlined" startIcon={<UploadFile />}
                disabled={busy === 'meta'}
                onClick={() => metadataRef.current?.click()}>
                {busy === 'meta' ? 'Importing…' : 'Choose File'}
              </Button>
              {busy === 'meta' && <LinearProgress sx={{ mt: 2 }} />}
              {metaResult && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  {['departments', 'programs', 'courses']
                    .filter((k) => metaResult[k])
                    .map((k) => `${k}: ${metaResult[k].created} added, ${metaResult[k].updated} updated`)
                    .join(' · ')}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
        )}

        {/* Wipe current schedule — admin only */}
        {admin && (
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Wipe Current Schedule</Typography>
              <Alert severity="error" sx={{ mb: 2 }}>
                Deletes <strong>ALL schedule data</strong> — classes, sections,
                courses, faculty, rooms, programs and departments. User
                accounts, academic periods and settings survive. This cannot
                be undone from the app. Type <strong>WIPE</strong> to enable.
              </Alert>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <TextField size="small" placeholder="Type WIPE" value={wipeText}
                  onChange={(e) => setWipeText(e.target.value)} sx={{ width: 140 }} />
                <Button variant="contained" color="error"
                  disabled={wipeText !== 'WIPE' || busy === 'wipe'}
                  onClick={handleWipe}>
                  {busy === 'wipe' ? 'Wiping…' : 'Wipe Schedule'}
                </Button>
              </Box>
              {wipeResult && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  Wiped: {Object.entries(wipeResult)
                    .map(([k, v]) => `${v} ${k}`).join(', ')}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
        )}
      </Grid>
    </Box>
  );
}
