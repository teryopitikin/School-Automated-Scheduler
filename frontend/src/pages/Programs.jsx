import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Alert, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, IconButton, Grid, Typography,
  Accordion, AccordionSummary, AccordionDetails, Chip,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Edit, Delete, ExpandMore, Add } from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { fetchPrograms, createProgram, updateProgram, deleteProgram } from '../api/programs';
import { fetchSections, createSection, deleteSection } from '../api/sections';
import { fetchAcademicPeriods } from '../api/academicPeriods';

export default function Programs() {
  const [programs, setPrograms] = useState([]);
  const [sections, setSections] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code: '', name: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sectionDialog, setSectionDialog] = useState(null);
  const [sectionForm, setSectionForm] = useState({ year_level: 1, section_number: 1, academic_period: '' });
  const [deleteSectionTarget, setDeleteSectionTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [progRes, secRes, periodRes] = await Promise.all([
        fetchPrograms(), fetchSections(), fetchAcademicPeriods(),
      ]);
      setPrograms(progRes.data.results ?? progRes.data);
      setSections(secRes.data.results ?? secRes.data);
      setPeriods(periodRes.data.results ?? periodRes.data);
    } catch {
      setError('Failed to load data');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ code: '', name: '' }); setDialogOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ code: row.code, name: row.name }); setDialogOpen(true); };

  const handleSave = async () => {
    try {
      if (editing) await updateProgram(editing.id, form);
      else await createProgram(form);
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProgram(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch {
      setError('Failed to delete');
    }
  };

  const openSectionDialog = (program) => {
    setSectionDialog(program);
    setSectionForm({ year_level: 1, section_number: 1, academic_period: periods[0]?.id || '' });
  };

  const handleCreateSection = async () => {
    try {
      await createSection({ ...sectionForm, program: sectionDialog.id });
      setSectionDialog(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create section');
    }
  };

  const handleDeleteSection = async () => {
    try {
      await deleteSection(deleteSectionTarget.id);
      setDeleteSectionTarget(null);
      load();
    } catch {
      setError('Failed to delete section');
    }
  };

  return (
    <Box>
      <PageHeader title="Programs & Sections" buttonLabel="Add Program" onButtonClick={openCreate} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Typography color="text.secondary">Loading...</Typography>
      ) : (
        programs.map((prog) => {
          const progSections = sections.filter((s) => s.program === prog.id);
          return (
            <Accordion key={prog.id} defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                  <Chip label={prog.code} size="small" color="primary" variant="outlined" />
                  <Typography sx={{ flex: 1 }}>{prog.name}</Typography>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEdit(prog); }}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDeleteTarget(prog); }}><Delete fontSize="small" /></IconButton>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  {progSections.length === 0 && <Typography variant="body2" color="text.secondary">No sections yet.</Typography>}
                  {progSections.map((sec) => (
                    <Chip
                      key={sec.id}
                      label={`${prog.code} ${sec.year_level}-${sec.section_number}`}
                      onDelete={() => setDeleteSectionTarget(sec)}
                      size="small"
                    />
                  ))}
                </Box>
                <Button size="small" startIcon={<Add />} onClick={() => openSectionDialog(prog)}>
                  Add Section
                </Button>
              </AccordionDetails>
            </Accordion>
          );
        })
      )}

      {/* Program dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Program' : 'Add Program'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={4}>
              <TextField fullWidth label="Code" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Grid>
            <Grid size={8}>
              <TextField fullWidth label="Name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.code || !form.name}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Section dialog */}
      <Dialog open={Boolean(sectionDialog)} onClose={() => setSectionDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Section to {sectionDialog?.code}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={6}>
              <TextField fullWidth label="Year Level" type="number" value={sectionForm.year_level}
                onChange={(e) => setSectionForm({ ...sectionForm, year_level: parseInt(e.target.value) || 1 })}
                inputProps={{ min: 1, max: 5 }} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Section #" type="number" value={sectionForm.section_number}
                onChange={(e) => setSectionForm({ ...sectionForm, section_number: parseInt(e.target.value) || 1 })}
                inputProps={{ min: 1 }} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth select label="Academic Period" value={sectionForm.academic_period}
                onChange={(e) => setSectionForm({ ...sectionForm, academic_period: e.target.value })}
                SelectProps={{ native: true }}>
                {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSectionDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateSection}>Create</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)} title="Delete Program"
        message={`Delete "${deleteTarget?.name}"? All sections in this program will also be deleted.`}
        onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(deleteSectionTarget)} title="Delete Section"
        message={`Delete this section? Schedule entries for this section will also be removed.`}
        onConfirm={handleDeleteSection} onCancel={() => setDeleteSectionTarget(null)}
      />
    </Box>
  );
}
