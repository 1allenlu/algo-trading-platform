import {
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material'
import {
  Assessment as BacktestIcon,
  Dashboard as DashboardIcon,
  Psychology as MLIcon,
  Settings as SettingsIcon,
  ShowChart as LogoIcon,
  TrendingUp as StrategiesIcon,
  AccountBalance as RiskIcon,
} from '@mui/icons-material'
import { useLocation, useNavigate } from 'react-router-dom'

interface SidebarProps {
  width: number
}

const NAV_ITEMS = [
  { label: 'Dashboard',   path: '/dashboard',  icon: <DashboardIcon />,   phase: '' },
  { label: 'ML Models',   path: '/ml',         icon: <MLIcon />,          phase: '' },
  { label: 'Strategies',  path: '/strategies', icon: <StrategiesIcon />,  phase: 'Phase 3' },
  { label: 'Backtest',    path: '/backtest',   icon: <BacktestIcon />,    phase: 'Phase 3' },
  { label: 'Risk',        path: '/risk',       icon: <RiskIcon />,        phase: 'Phase 4' },
  { label: 'Settings',    path: '/settings',   icon: <SettingsIcon />,    phase: '' },
]

export default function Sidebar({ width }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      {/* ── Logo ────────────────────────────────────────────────────────── */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <LogoIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Box>
          <Typography
            variant="h6"
            sx={{ lineHeight: 1.2, fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.3px' }}
          >
            TradingOS
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Quant · ML · Live
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* ── Nav items ───────────────────────────────────────────────────── */}
      <List sx={{ pt: 1, flexGrow: 1 }}>
        {NAV_ITEMS.map(({ label, path, icon, phase }) => {
          const isActive = location.pathname === path || location.pathname.startsWith(path + '/')

          return (
            <ListItem key={path} disablePadding>
              <ListItemButton
                selected={isActive}
                onClick={() => navigate(path)}
                sx={{
                  mx: 1,
                  mb: 0.5,
                  borderRadius: 1.5,
                  '&.Mui-selected': {
                    bgcolor: 'rgba(0, 180, 216, 0.12)',
                    color: 'primary.main',
                    '& .MuiListItemIcon-root': { color: 'primary.main' },
                    '&:hover': { bgcolor: 'rgba(0, 180, 216, 0.18)' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>
                  {icon}
                </ListItemIcon>
                <ListItemText primary={label} />
                {phase && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.disabled',
                      fontSize: '0.65rem',
                      bgcolor: 'rgba(255,255,255,0.05)',
                      px: 0.8,
                      py: 0.2,
                      borderRadius: 1,
                    }}
                  >
                    {phase}
                  </Typography>
                )}
              </ListItemButton>
            </ListItem>
          )
        })}
      </List>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.disabled" display="block">
          Phase 2 — ML Pipeline
        </Typography>
        <Typography variant="caption" color="text.disabled">
          v0.2.0
        </Typography>
      </Box>
    </Drawer>
  )
}
