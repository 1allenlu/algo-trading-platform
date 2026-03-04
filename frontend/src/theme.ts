import { createTheme } from '@mui/material/styles'

/**
 * Dark "terminal" theme — professional trading platform aesthetic.
 *
 * Color semantics:
 *   primary   (#00b4d8 cyan)   — interactive elements, links, active states
 *   secondary (#06d6a0 green)  — positive returns, profits, success
 *   error     (#ef476f red)    — negative returns, losses, alerts
 *   background.default         — main content area
 *   background.paper           — cards, sidebar, elevated surfaces
 */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main:  '#00b4d8',
      dark:  '#0077b6',
      light: '#90e0ef',
    },
    secondary: {
      main: '#06d6a0',  // Profit green
    },
    error: {
      main: '#ef476f',  // Loss red
    },
    background: {
      default: '#0a0e1a',   // Near-black — main content
      paper:   '#111827',   // Dark blue-gray — cards / sidebar
    },
    text: {
      primary:   '#e2e8f0',
      secondary: '#94a3b8',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
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
          border: '1px solid rgba(255, 255, 255, 0.08)',
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
            backgroundColor: 'rgba(0, 180, 216, 0.15)',
            color: '#00b4d8',
            borderColor: '#00b4d8',
          },
        },
      },
    },
  },
})
