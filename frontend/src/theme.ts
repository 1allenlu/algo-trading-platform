import { createTheme } from '@mui/material/styles'

/**
 * Clean dark theme — understated, professional.
 *
 * Color semantics:
 *   primary   (#3b82f6 blue)   — interactive elements, links, active states
 *   secondary (#22c55e green)  — positive returns, profits, success
 *   error     (#f87171 red)    — negative returns, losses, alerts
 */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main:  '#3b82f6',
      dark:  '#2563eb',
      light: '#93c5fd',
    },
    secondary: {
      main: '#22c55e',
    },
    error: {
      main: '#f87171',
    },
    background: {
      default: '#111113',   // Near-black — main content area
      paper:   '#18181b',   // Slightly lighter — cards / sidebar
    },
    text: {
      primary:   '#f4f4f5',
      secondary: '#a1a1aa',
    },
    divider: 'rgba(255, 255, 255, 0.07)',
  },

  typography: {
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },

  shape: { borderRadius: 8 },

  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.07)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontFamily: '"Roboto Mono", monospace', fontSize: '0.75rem' },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: '#3b82f6',
            borderColor: '#3b82f6',
          },
        },
      },
    },
  },
})
