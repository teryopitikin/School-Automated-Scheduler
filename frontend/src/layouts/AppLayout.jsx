import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, Divider, IconButton, AppBar, Toolbar, Avatar, Menu, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Alert,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  CalendarMonth, School, Business, MenuBook, Person,
  MeetingRoom, Settings, Assessment, UploadFile,
  Menu as MenuIcon, Logout, EventNote, DarkMode, LightMode, Group, LockReset,
} from '@mui/icons-material';
import { logout, changePassword } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/permissions';
import { useColorMode } from '../context/ColorModeContext';
import AssistantDrawer from '../components/AssistantDrawer';
import { INK, FONT_DISPLAY, FONT_MONO } from '../theme';

const DRAWER_WIDTH = 264;

const menuSections = [
  {
    title: 'Scheduling',
    items: [
      { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
      { label: 'Schedule Builder', path: '/schedule', icon: <CalendarMonth /> },
    ],
  },
  {
    title: 'Data',
    items: [
      { label: 'Academic Periods', path: '/academic-periods', icon: <EventNote /> },
      { label: 'Programs', path: '/programs', icon: <School /> },
      { label: 'Departments', path: '/departments', icon: <Business /> },
      { label: 'Courses', path: '/courses', icon: <MenuBook /> },
      { label: 'Faculty', path: '/faculty', icon: <Person /> },
      { label: 'Rooms', path: '/rooms', icon: <MeetingRoom /> },
    ],
  },
  {
    title: 'Tools',
    items: [
      { label: 'Configuration', path: '/config', icon: <Settings /> },
      { label: 'Reports', path: '/reports', icon: <Assessment /> },
      { label: 'Import / Export', path: '/import-export', icon: <UploadFile /> },
      { label: 'Users', path: '/users', icon: <Group />, adminOnly: true },
    ],
  },
];

export default function AppLayout() {
  const { user, setUser } = useAuth();
  const { mode, toggle: toggleColorMode } = useColorMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const openPwDialog = () => {
    setAnchorEl(null);
    setPwForm({ current: '', next: '', confirm: '' });
    setPwError('');
    setPwDone(false);
    setPwOpen(true);
  };

  const submitPassword = async () => {
    if (pwForm.next !== pwForm.confirm) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwBusy(true);
    setPwError('');
    try {
      await changePassword({ current_password: pwForm.current, new_password: pwForm.next });
      setPwDone(true);
      setTimeout(() => setPwOpen(false), 1200);
    } catch (err) {
      setPwError(err.response?.data?.detail || 'Failed to change password.');
    } finally {
      setPwBusy(false);
    }
  };

  const handleLogout = async () => {
    setAnchorEl(null);
    try { await logout(); } catch {}
    setUser(null);
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2.5, pb: 2, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{
          width: 34, height: 34, borderRadius: '8px', flexShrink: 0,
          bgcolor: 'rgba(185,138,47,0.18)', border: '1px solid rgba(185,138,47,0.55)',
          borderLeft: '3px solid #B98A2F',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Typography sx={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: '0.8rem', color: '#E9C87A' }}>
            Sa
          </Typography>
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{
            fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.15rem',
            color: INK.chalk, lineHeight: 1.15, letterSpacing: '-0.01em',
          }}>
            Scheduler
          </Typography>
          <Typography sx={{
            fontFamily: FONT_MONO, fontSize: '0.6rem', letterSpacing: '0.14em',
            color: 'rgba(237,243,238,0.45)', textTransform: 'uppercase',
          }}>
            School timetabling
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: 'rgba(237,243,238,0.08)' }} />
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {menuSections.map((section) => (
          <Box key={section.title} sx={{ mb: 1 }}>
            <Typography
              variant="caption"
              sx={{ px: 2.5, py: 1, display: 'block', color: 'rgba(233,200,122,0.55)',
                fontFamily: FONT_MONO, fontWeight: 600, letterSpacing: '0.14em',
                textTransform: 'uppercase', fontSize: '0.62rem' }}
            >
              {section.title}
            </Typography>
            <List disablePadding>
              {section.items
                .filter((item) => !item.adminOnly || isAdmin(user))
                .map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <ListItemButton
                    key={item.path}
                    onClick={() => { navigate(item.path); setMobileOpen(false); }}
                    sx={{
                      mx: 1, borderRadius: '6px', mb: 0.3,
                      borderLeft: '3px solid',
                      borderLeftColor: isActive ? '#B98A2F' : 'transparent',
                      color: isActive ? INK.chalk : 'rgba(237,243,238,0.66)',
                      bgcolor: isActive ? 'rgba(237,243,238,0.08)' : 'transparent',
                      transition: 'background-color 120ms, border-color 120ms',
                      '&:hover': { bgcolor: 'rgba(237,243,238,0.06)' },
                    }}
                  >
                    <ListItemIcon sx={{ color: isActive ? '#E9C87A' : 'rgba(237,243,238,0.45)', minWidth: 36 }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.85rem' }} />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH, bgcolor: INK.board, border: 'none',
            backgroundImage: 'repeating-linear-gradient(180deg, transparent 0px, transparent 35px, rgba(237,243,238,0.045) 35px, rgba(237,243,238,0.045) 36px)',
          },
        }}
      >
        {drawer}
      </Drawer>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, bgcolor: INK.board, backgroundImage: 'repeating-linear-gradient(180deg, transparent 0px, transparent 35px, rgba(237,243,238,0.045) 35px, rgba(237,243,238,0.045) 36px)', },
        }}
      >
        {drawer}
      </Drawer>
      <Box sx={{ flex: 1, ml: { md: `${DRAWER_WIDTH}px` } }}>
        <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
          <Toolbar>
            <IconButton onClick={() => setMobileOpen(true)} sx={{ display: { md: 'none' }, mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <Box sx={{ flex: 1 }} />
            <IconButton onClick={toggleColorMode} sx={{ mr: 0.5 }}
              title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
              {mode === 'light' ? <DarkMode /> : <LightMode />}
            </IconButton>
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, flexDirection: 'column',
              alignItems: 'flex-end', mr: 1, ml: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                {user?.full_name || user?.username}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                {{ ADMIN: 'Administrator', REGISTRAR: 'Registrar', DEPT_HEAD: 'Department Head', VIEWER: 'Viewer' }[user?.role] || ''}
              </Typography>
            </Box>
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main',
                fontSize: '0.85rem', fontWeight: 700 }}>
                {(user?.full_name || user?.username)?.[0]?.toUpperCase() || 'U'}
              </Avatar>
            </IconButton>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
              <MenuItem disabled>
                <Typography variant="body2">{user?.username}</Typography>
              </MenuItem>
              <Divider />
              <MenuItem onClick={openPwDialog}>
                <ListItemIcon><LockReset fontSize="small" /></ListItemIcon>
                Change Password
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 3 }}>
          <Outlet />
        </Box>
      </Box>
      <AssistantDrawer />

      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          {pwDone && <Alert severity="success">Password changed.</Alert>}
          {pwError && <Alert severity="error">{pwError}</Alert>}
          <TextField label="Current password" type="password" size="small" autoFocus
            value={pwForm.current}
            onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
          <TextField label="New password (min 6 characters)" type="password" size="small"
            value={pwForm.next}
            onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} />
          <TextField label="Confirm new password" type="password" size="small"
            value={pwForm.confirm}
            onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPassword(); }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitPassword}
            disabled={pwBusy || pwDone || !pwForm.current || pwForm.next.length < 6 || !pwForm.confirm}>
            Change
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
