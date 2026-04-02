import { Box, Drawer, Tooltip, Typography } from '@mui/material'
import {
  Assessment as BacktestIcon,
  AutoMode as AutoTradeIcon,
  CandlestickChart as TradingIcon,
  Dashboard as DashboardIcon,
  Insights as AnalyticsIcon,
  Newspaper as NewsIcon,
  NotificationsOutlined as AlertsIcon,
  Psychology as MLIcon,
  Search as ScannerIcon,
  Settings as SettingsIcon,
  ShowChart as LogoIcon,
  Tune as OptimizeIcon,
  TrendingUp as StrategiesIcon,
  AccountBalance as RiskIcon,
  SignalCellularAlt as SignalsIcon,
  Layers as OptionsIcon,
  CurrencyBitcoin as CryptoIcon,
  EventNote as EarningsIcon,
} from '@mui/icons-material'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

interface SidebarProps {
  width: number
}

interface NavItem {
  label: string
  path:  string
  icon:  ReactNode
}

interface NavSection {
  heading: string
  items:   NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Markets',
    items: [
      { label: 'Dashboard',  path: '/dashboard', icon: <DashboardIcon sx={{ fontSize: 17 }} /> },
      { label: 'Trading',    path: '/trading',   icon: <TradingIcon   sx={{ fontSize: 17 }} /> },
      { label: 'Crypto',     path: '/crypto',    icon: <CryptoIcon    sx={{ fontSize: 17 }} /> },
      { label: 'Options',    path: '/options',   icon: <OptionsIcon   sx={{ fontSize: 17 }} /> },
      { label: 'News',       path: '/news',      icon: <NewsIcon      sx={{ fontSize: 17 }} /> },
    ],
  },
  {
    heading: 'Analytics',
    items: [
      { label: 'ML Models',  path: '/ml',         icon: <MLIcon          sx={{ fontSize: 17 }} /> },
      { label: 'Strategies', path: '/strategies', icon: <StrategiesIcon  sx={{ fontSize: 17 }} /> },
      { label: 'Backtest',   path: '/backtest',   icon: <BacktestIcon    sx={{ fontSize: 17 }} /> },
      { label: 'Risk',       path: '/risk',       icon: <RiskIcon        sx={{ fontSize: 17 }} /> },
      { label: 'Analytics',  path: '/analytics',  icon: <AnalyticsIcon   sx={{ fontSize: 17 }} /> },
      { label: 'Signals',    path: '/signals',    icon: <SignalsIcon     sx={{ fontSize: 17 }} /> },
      { label: 'Earnings',   path: '/earnings',   icon: <EarningsIcon    sx={{ fontSize: 17 }} /> },
    ],
  },
  {
    heading: 'Tools',
    items: [
      { label: 'Optimize',   path: '/optimize',  icon: <OptimizeIcon   sx={{ fontSize: 17 }} /> },
      { label: 'Scanner',    path: '/scanner',   icon: <ScannerIcon    sx={{ fontSize: 17 }} /> },
      { label: 'Auto Trade', path: '/autotrade', icon: <AutoTradeIcon  sx={{ fontSize: 17 }} /> },
      { label: 'Alerts',     path: '/alerts',    icon: <AlertsIcon     sx={{ fontSize: 17 }} /> },
    ],
  },
  {
    heading: 'System',
    items: [
      { label: 'Settings',   path: '/settings',  icon: <SettingsIcon   sx={{ fontSize: 17 }} /> },
    ],
  },
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
          bgcolor: '#0B0E14',
          borderRight: '1px solid #1C2030',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* ── Logo ── */}
      <Box
        sx={{
          px: 2,
          pt: 2.5,
          pb: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          borderBottom: '1px solid #1C2030',
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '6px',
            bgcolor: '#4A9EFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <LogoIcon sx={{ fontSize: 17, color: '#fff' }} />
        </Box>
        <Box>
          <Typography
            sx={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.85rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: '#E8EAED',
              lineHeight: 1,
            }}
          >
            TRADING<span style={{ color: '#4A9EFF' }}>OS</span>
          </Typography>
          <Typography
            sx={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.6rem',
              color: '#4B5563',
              letterSpacing: '0.06em',
              mt: '2px',
            }}
          >
            v0.30.0
          </Typography>
        </Box>
      </Box>

      {/* ── Nav sections ── */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5 }}>
        {NAV_SECTIONS.map((section) => (
          <Box key={section.heading} sx={{ mb: 0.5 }}>
            {/* Section heading */}
            <Typography
              sx={{
                px: 2.5,
                py: 0.75,
                fontSize: '0.6rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: '#374151',
                textTransform: 'uppercase',
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              {section.heading}
            </Typography>

            {/* Items */}
            {section.items.map(({ label, path, icon }) => {
              const isActive =
                location.pathname === path ||
                location.pathname.startsWith(path + '/')

              return (
                <Tooltip key={path} title="" placement="right">
                  <Box
                    onClick={() => navigate(path)}
                    sx={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      mx: 1,
                      px: 1.5,
                      py: '7px',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                      bgcolor: isActive ? 'rgba(74,158,255,0.08)' : 'transparent',
                      // Left accent bar
                      '&::before': isActive
                        ? {
                            content: '""',
                            position: 'absolute',
                            left: 0,
                            top: '20%',
                            bottom: '20%',
                            width: '2px',
                            borderRadius: '2px',
                            bgcolor: '#4A9EFF',
                          }
                        : {},
                      '&:hover': {
                        bgcolor: isActive
                          ? 'rgba(74,158,255,0.11)'
                          : 'rgba(255,255,255,0.04)',
                      },
                    }}
                  >
                    <Box
                      sx={{
                        color: isActive ? '#4A9EFF' : '#6B7280',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {icon}
                    </Box>
                    <Typography
                      sx={{
                        fontSize: '0.8125rem',
                        fontWeight: isActive ? 500 : 400,
                        color: isActive ? '#E8EAED' : '#9CA3AF',
                        letterSpacing: '0.01em',
                        lineHeight: 1,
                        userSelect: 'none',
                      }}
                    >
                      {label}
                    </Typography>
                  </Box>
                </Tooltip>
              )
            })}
          </Box>
        ))}
      </Box>

      {/* ── Footer ── */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          borderTop: '1px solid #1C2030',
        }}
      >
        <Typography
          sx={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.58rem',
            color: '#2D3548',
            letterSpacing: '0.05em',
          }}
        >
          QUANT · ML · LIVE
        </Typography>
      </Box>
    </Drawer>
  )
}
