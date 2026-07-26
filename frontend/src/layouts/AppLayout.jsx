import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, Divider, IconButton, AppBar, Toolbar, Avatar, Menu, MenuItem,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  CalendarMonth, School, Business, MenuBook, Person,
  MeetingRoom, Settings, Assessment, UploadFile,
  Menu as MenuIcon, Logout, EventNote, DarkMode, LightMode,
} from '@mui/icons-material';
import { logout } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useColorMode } from '../context/ColorModeContext';

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

  const handleLogout = async () => {
    setAnchorEl(null);
    try { await logout(); } catch {}
    setUser(null);
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2.5, pb: 1.5 }}>
        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
          School Automated Scheduler
        </Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
          Schedule Management
        </Typography>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {menuSections.map((section) => (
          <Box key={section.title} sx={{ mb: 1 }}>
            <Typography
              variant="caption"
              sx={{ px: 2.5, py: 1, display: 'block', color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.7rem' }}
            >
              {section.title}
            </Typography>
            <List disablePadding>
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <ListItemButton
                    key={item.path}
                    onClick={() => { navigate(item.path); setMobileOpen(false); }}
                    sx={{
                      mx: 1, borderRadius: 1.5, mb: 0.3,
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
                      bgcolor: isActive ? 'rgba(13,148,136,0.25)' : 'transparent',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                    }}
                  >
                    <ListItemIcon sx={{ color: isActive ? '#0d9488' : 'rgba(255,255,255,0.5)', minWidth: 36 }}>
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
            width: DRAWER_WIDTH, bgcolor: '#0f172a', border: 'none',
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
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, bgcolor: '#0f172a' },
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
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.85rem' }}>
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </Avatar>
            </IconButton>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
              <MenuItem disabled>
                <Typography variant="body2">{user?.username}</Typography>
              </MenuItem>
              <Divider />
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
    </Box>
  );
}
