import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#0d9488',
      light: '#ccfbf1',
      dark: '#0f766e',
      contrastText: '#fff',
    },
    secondary: {
      main: '#6366f1',
      light: '#a5b4fc',
      dark: '#4f46e5',
    },
    success: { main: '#22c55e', light: '#86efac', dark: '#16a34a' },
    warning: { main: '#f59e0b', light: '#fcd34d', dark: '#d97706' },
    error: { main: '#ef4444', light: '#fca5a5', dark: '#dc2626' },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
    },
    divider: '#e2e8f0',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    h4: { fontWeight: 700, fontSize: '1.85rem', letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, fontSize: '1.45rem', letterSpacing: '-0.01em' },
    h6: { fontWeight: 600, fontSize: '1.15rem' },
    subtitle1: { fontWeight: 600, fontSize: '0.95rem' },
    body1: { fontSize: '0.9rem' },
    body2: { fontSize: '0.85rem' },
    button: { fontWeight: 600, fontSize: '0.85rem' },
  },
  components: {
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: '0.85rem',
          padding: '7px 18px',
        },
      },
    },
    MuiDataGrid: {
      defaultProps: { density: 'compact', disableColumnMenu: true },
      styleOverrides: {
        root: {
          border: 'none',
          fontSize: '0.84rem',
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: '#f8fafc',
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 12 },
      },
    },
  },
});

export default theme;
