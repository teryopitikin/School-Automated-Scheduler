import { createTheme } from '@mui/material/styles';

// "Chalkboard & Ledger" — the app is a registrar's timetabling instrument,
// so the system is built from that world: chalkboard-green surfaces, paper
// background, brass plotting accent, and mono numerals for anything tabular.

export const FONT_DISPLAY = '"Bricolage Grotesque", "Public Sans", sans-serif';
export const FONT_BODY = '"Public Sans", "Inter", "Helvetica", "Arial", sans-serif';
export const FONT_MONO = '"IBM Plex Mono", "SFMono-Regular", Menlo, monospace';

export const INK = {
  board: '#14342B',      // chalkboard green — sidebar, dark surfaces
  boardEdge: '#0E2620',
  pine: '#1D6E58',       // primary actions
  pineDark: '#155543',
  pineWash: '#E3EFE9',
  brass: '#B98A2F',      // the plotting accent — used sparingly
  brassSoft: '#F3E8CE',
  chalk: '#EDF3EE',      // text on board
  paper: '#F6F7F3',      // app background
  conflict: '#C4453C',
};

export const getTheme = (mode = 'light') => {
  const dark = mode === 'dark';
  const border = dark ? '#25423A' : '#E1E5DE';
  return createTheme({
  palette: {
    mode,
    primary: {
      main: dark ? '#4CAF94' : INK.pine,
      light: dark ? '#1C3B32' : INK.pineWash,
      dark: INK.pineDark,
      contrastText: '#fff',
    },
    secondary: {
      main: INK.brass,
      light: INK.brassSoft,
      dark: '#966E1F',
      contrastText: '#fff',
    },
    success: { main: '#2E9E6B', light: '#A7E3C6', dark: '#1F7A50' },
    warning: { main: '#D99A26', light: '#F3D48F', dark: '#A87313' },
    error: { main: INK.conflict, light: '#EDB0AB', dark: '#A03329' },
    background: {
      default: dark ? '#0F1D18' : INK.paper,
      paper: dark ? '#152720' : '#FFFFFF',
    },
    text: {
      primary: dark ? '#DCE7E0' : '#1F2A26',
      secondary: dark ? '#8FA79C' : '#5C6B64',
    },
    divider: border,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    h4: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.85rem', letterSpacing: '-0.01em' },
    h5: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.005em' },
    h6: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: '1.12rem' },
    subtitle1: { fontWeight: 600, fontSize: '0.95rem' },
    body1: { fontSize: '0.9rem' },
    body2: { fontSize: '0.85rem' },
    button: { fontWeight: 600, fontSize: '0.85rem' },
    // mono "ledger" styles for data: times, counts, codes
    mono: { fontFamily: FONT_MONO, fontWeight: 500 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { fontFamily: FONT_BODY },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: `1px solid ${border}`,
          boxShadow: 'none',
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
        containedPrimary: {
          '&:hover': { backgroundColor: INK.pineDark },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
        sizeSmall: { fontSize: '0.72rem' },
      },
    },
    MuiDataGrid: {
      defaultProps: { density: 'compact', disableColumnMenu: true },
      styleOverrides: {
        root: {
          border: `1px solid ${border}`,
          borderRadius: 12,
          backgroundColor: dark ? '#152720' : '#FFFFFF',
          fontSize: '0.84rem',
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: dark ? '#1A2F27' : '#F1F4EF',
          },
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 700,
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: dark ? '#8FA79C' : '#5C6B64',
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 14, border: `1px solid ${border}` },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: INK.board, fontSize: '0.75rem' },
        arrow: { color: INK.board },
      },
    },
  },
  });
};

export default getTheme('light');
