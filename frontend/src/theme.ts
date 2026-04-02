import { createTheme } from '@mui/material/styles'

/**
 * Trading Platform theme factory.
 *
 * Call `createAppTheme('dark')` or `createAppTheme('light')`.
 * Mode is persisted by ThemeContext in localStorage ('tradingos-theme').
 *
 * Color roles (consistent across both modes):
 *   primary   (#4A9EFF sky blue)  — interactive elements, active nav, buttons
 *   secondary (#00C896 teal)      — buy side, positive returns, profits
 *   error     (#EF4444 red)       — errors, sell alerts
 *   warning   (#F59E0B amber)     — caution states
 *   info      (#8B5CF6 purple)    — pending states
 */
export function createAppTheme(mode: 'dark' | 'light') {
  const isDark = mode === 'dark'

  return createTheme({
    palette: {
      mode,
      primary: {
        main:  '#4A9EFF',
        dark:  '#2980E8',
        light: '#7DBFFF',
      },
      secondary: {
        main:  '#00C896',
        light: '#00E0A8',
      },
      error: {
        main:  '#EF4444',
        light: '#FF6B6B',
      },
      warning: {
        main:  '#F59E0B',
        light: '#FFB020',
      },
      info: {
        main: '#8B5CF6',
      },
      background: isDark
        ? {
            default: '#0A0E17',   // Deep navy — main content area
            paper:   '#12161F',   // Card & sidebar backgrounds
          }
        : {
            default: '#F0F2F5',   // Soft gray — main content area
            paper:   '#FFFFFF',   // White cards
          },
      text: isDark
        ? {
            primary:   '#E8EAED',
            secondary: '#9CA3AF',
            disabled:  '#4B5563',
          }
        : {
            primary:   '#0F172A',
            secondary: '#475569',
            disabled:  '#94A3B8',
          },
      divider: isDark ? '#2D3548' : '#E2E8F0',
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
            backgroundColor: isDark ? '#12161F' : '#FFFFFF',
            border: `1px solid ${isDark ? '#2D3548' : '#E2E8F0'}`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            backgroundColor: isDark ? '#0B0E14' : '#F8FAFC',
            borderRightColor: isDark ? '#1C2030' : '#E2E8F0',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: { backgroundColor: isDark ? '#232938' : '#F1F5F9' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          notchedOutline: { borderColor: isDark ? '#2D3548' : '#CBD5E1' },
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
            borderColor: isDark ? '#2D3548' : '#CBD5E1',
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
            backgroundColor: isDark ? '#1A1F2E' : '#F8FAFC',
            borderBottomColor: isDark ? '#2D3548' : '#E2E8F0',
            color: isDark ? '#9CA3AF' : '#64748B',
          },
          body: { borderBottomColor: isDark ? '#1E2330' : '#F1F5F9' },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: isDark ? '#2D3548' : '#E2E8F0' },
        },
      },
    },
  })
}

// Keep a default dark export for backwards compat (used nowhere now but kept for safety)
export const theme = createAppTheme('dark')

// Convenience color constants for chart components (always dark — charts stay dark)
export const CHART_COLORS = {
  positive:   '#00C896',
  negative:   '#FF6B6B',
  neutral:    '#4A9EFF',
  grid:       '#1E2330',
  cardBg:     '#12161F',
  surface:    '#1A1F2E',
  textMuted:  '#9CA3AF',
}
