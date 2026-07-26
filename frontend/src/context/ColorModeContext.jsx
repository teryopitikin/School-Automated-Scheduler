import { createContext, useContext, useMemo, useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { getTheme } from '../theme';

const ColorModeContext = createContext({ mode: 'light', toggle: () => {} });

export const useColorMode = () => useContext(ColorModeContext);

export function ColorModeProvider({ children }) {
  const [mode, setMode] = useState(
    () => localStorage.getItem('themeMode') || 'light',
  );
  const value = useMemo(() => ({
    mode,
    toggle: () => setMode((m) => {
      const next = m === 'light' ? 'dark' : 'light';
      localStorage.setItem('themeMode', next);
      return next;
    }),
  }), [mode]);
  const theme = useMemo(() => getTheme(mode), [mode]);
  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
