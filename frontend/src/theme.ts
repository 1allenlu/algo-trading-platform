import { createTheme } from '@mui/material/styles'

/**
 * Trading Platform theme — deep navy palette.
 *
 * Color roles:
 *   primary   (#4A9EFF sky blue)  — interactive elements, links, neutral info
 *   secondary (#00C896 teal)      — positive returns, buy side, profits
 *   error     (#EF4444 red)       — errors, sell alerts
 *   warning   (#F59E0B amber)     — caution states
 *   info      (#8B5CF6 purple)    — pending states
 */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main:  '#4A9EFF',   // Sky blue — links, active nav, buttons
      dark:  '#2980E8',
      light: '#7DBFFF',
    },
    secondary: {
      main:  '#00C896',   // Teal green — buy / positive / profit
      light: '#00E0A8',
    },
    error: {
      main:  '#EF4444',   // True red — errors
      light: '#FF6B6B',   // Coral — sell / danger (softer)
    },
    warning: {
      main: '#F59E0B',    // Orange amber
      light: '#FFB020',
    },
    info: {
      main: '#8B5CF6',    // Purple — pending states
    },
    background: {
      default: '#0A0E17',   // Deep navy — main content area
      paper:   '#12161F',   // Card & sidebar backgrounds
    },
    text: {
      primary:   '#E8EAED',   // Near white
      secondary: '#9CA3AF',   // Light gray — labels, metadata
      disabled:  '#4B5563',   // Very muted
    },
    divider: '#2D3548',
  },

  typography: {
    fontFamily: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 500 },
    body1: { fontSize: '0.875rem' },
    body2: { fontSize: '0.8125rem' },
  },

  shape: { borderRadius: 8 },

  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#12161F',
          border: '1px solid #2D3548',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { backgroundColor: '#232938' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: '#2D3548' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.72rem' },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderColor: '#2D3548',
          '&.Mui-selected': {
            backgroundColor: 'rgba(74, 158, 255, 0.15)',
            color: '#4A9EFF',
            borderColor: '#4A9EFF',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: '#1A1F2E',
          borderBottomColor: '#2D3548',
          color: '#9CA3AF',
        },
        body: { borderBottomColor: '#1E2330' },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: '#2D3548' },
      },
    },
  },
})

// Convenience color constants for use in chart components
export const CHART_COLORS = {
  positive:   '#00C896',
  negative:   '#FF6B6B',
  neutral:    '#4A9EFF',
  grid:       '#1E2330',
  cardBg:     '#12161F',
  surface:    '#1A1F2E',
  textMuted:  '#9CA3AF',
}
