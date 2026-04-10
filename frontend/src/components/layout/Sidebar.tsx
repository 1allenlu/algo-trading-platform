import { Box, Drawer, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import {
  Assessment as BacktestIcon,
  AutoMode as AutoTradeIcon,
  BookOutlined as JournalIcon,
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
  BarChart as FundamentalsIcon,
  Grain as PatternIcon,
  AutoFixHigh as RLIcon,
  CompareArrows as CompareIcon,
  BookmarkBorder as WatchlistIcon,
  Balance as RebalanceIcon,
  Receipt as TaxIcon,
  Build as StrategyBuilderIcon,
  EmojiEvents as TournamentIcon,
  Event as EconomicsIcon,
  GridView as SectorsIcon,
  Calculate as SizingIcon,
  Waves as VixIcon,
  MultilineChart as BenchmarksIcon,
  Bolt as EarningsVolIcon,
  FolderSpecial as PortfoliosIcon,
  Leaderboard as LeaderboardIcon,
  CallMerge as OptionPayoffIcon,
  WaterfallChart as OptionsFlowIcon,
  Paid as DividendsIcon,
  Troubleshoot as AnomalyIcon,
  SignalWifi4Bar as BreadthIcon,
  ManageAccounts as InsiderIcon,
} from '@mui/icons-material'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

interface SidebarProps {
  width:         number
  mobileOpen:    boolean
  onMobileClose: () => void
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
      { label: 'Dashboard',  path: '/dashboard',  icon: <DashboardIcon  sx={{ fontSize: 17 }} /> },
      { label: 'Trading',    path: '/trading',    icon: <TradingIcon    sx={{ fontSize: 17 }} /> },
      { label: 'Watchlist',  path: '/watchlist',  icon: <WatchlistIcon  sx={{ fontSize: 17 }} /> },
      { label: 'Crypto',     path: '/crypto',     icon: <CryptoIcon     sx={{ fontSize: 17 }} /> },
      { label: 'Options',       path: '/options',      icon: <OptionsIcon     sx={{ fontSize: 17 }} /> },
      { label: 'Options Flow',  path: '/options-flow', icon: <OptionsFlowIcon sx={{ fontSize: 17 }} /> },
      { label: 'Dividends',     path: '/dividends',    icon: <DividendsIcon   sx={{ fontSize: 17 }} /> },
      { label: 'Insider',       path: '/insider',      icon: <InsiderIcon     sx={{ fontSize: 17 }} /> },
      { label: 'News',          path: '/news',         icon: <NewsIcon        sx={{ fontSize: 17 }} /> },
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
      { label: 'Earnings',      path: '/earnings',      icon: <EarningsIcon      sx={{ fontSize: 17 }} /> },
      { label: 'Eco. Calendar', path: '/economics',     icon: <EconomicsIcon     sx={{ fontSize: 17 }} /> },
      { label: 'Sectors',       path: '/sectors',       icon: <SectorsIcon       sx={{ fontSize: 17 }} /> },
      { label: 'VIX & Sentiment', path: '/vix',         icon: <VixIcon           sx={{ fontSize: 17 }} /> },
      { label: 'Benchmarks',    path: '/benchmarks',    icon: <BenchmarksIcon    sx={{ fontSize: 17 }} /> },
      { label: 'Earnings Vol',  path: '/earnings-vol',  icon: <EarningsVolIcon   sx={{ fontSize: 17 }} /> },
      { label: 'Fundamentals', path: '/fundamentals', icon: <FundamentalsIcon  sx={{ fontSize: 17 }} /> },
      { label: 'Patterns',    path: '/patterns',    icon: <PatternIcon sx={{ fontSize: 17 }} /> },
      { label: 'RL Agent',   path: '/rl',          icon: <RLIcon      sx={{ fontSize: 17 }} /> },
      { label: 'Anomaly',    path: '/anomaly',     icon: <AnomalyIcon  sx={{ fontSize: 17 }} /> },
      { label: 'Breadth',    path: '/breadth',     icon: <BreadthIcon  sx={{ fontSize: 17 }} /> },
      { label: 'Compare',    path: '/compare',     icon: <CompareIcon  sx={{ fontSize: 17 }} /> },
    ],
  },
  {
    heading: 'Tools',
    items: [
      { label: 'Optimize',   path: '/optimize',   icon: <OptimizeIcon   sx={{ fontSize: 17 }} /> },
      { label: 'Scanner',    path: '/scanner',    icon: <ScannerIcon    sx={{ fontSize: 17 }} /> },
      { label: 'Auto Trade', path: '/autotrade',  icon: <AutoTradeIcon  sx={{ fontSize: 17 }} /> },
      { label: 'Rebalance',        path: '/rebalance',        icon: <RebalanceIcon      sx={{ fontSize: 17 }} /> },
      { label: 'Strategy Builder', path: '/strategy-builder', icon: <StrategyBuilderIcon sx={{ fontSize: 17 }} /> },
      { label: 'Alerts',           path: '/alerts',           icon: <AlertsIcon          sx={{ fontSize: 17 }} /> },
      { label: 'Journal',          path: '/journal',          icon: <JournalIcon         sx={{ fontSize: 17 }} /> },
      { label: 'Tax Report',       path: '/tax',              icon: <TaxIcon             sx={{ fontSize: 17 }} /> },
      { label: 'Tournaments',      path: '/tournament',       icon: <TournamentIcon      sx={{ fontSize: 17 }} /> },
      { label: 'Position Sizing',  path: '/sizing',           icon: <SizingIcon          sx={{ fontSize: 17 }} /> },
      { label: 'Option Payoff',    path: '/option-payoff',    icon: <OptionPayoffIcon    sx={{ fontSize: 17 }} /> },
      { label: 'Portfolios',       path: '/portfolios',       icon: <PortfoliosIcon      sx={{ fontSize: 17 }} /> },
      { label: 'Leaderboard',      path: '/leaderboard',      icon: <LeaderboardIcon     sx={{ fontSize: 17 }} /> },
    ],
  },
  {
    heading: 'System',
    items: [
      { label: 'Settings',   path: '/settings',  icon: <SettingsIcon   sx={{ fontSize: 17 }} /> },
    ],
  },
]

function SidebarContent({ width, onNavigate }: { width: number; onNavigate?: () => void }) {
  const location = useLocation()
  const navigate  = useNavigate()
  const theme     = useTheme()
  const isDark    = theme.palette.mode === 'dark'

  return (
    <Box
      sx={{
        width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
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
          borderBottom: '1px solid',
          borderColor: 'divider',
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
              color: 'text.primary',
              lineHeight: 1,
            }}
          >
            QUANT<span style={{ color: '#4A9EFF' }}>STREAM</span>
          </Typography>
          <Typography
            sx={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.6rem',
              color: 'text.disabled',
              letterSpacing: '0.06em',
              mt: '2px',
            }}
          >
            v0.77.0
          </Typography>
        </Box>
      </Box>

      {/* ── Nav sections ── */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5 }}>
        {NAV_SECTIONS.map((section) => (
          <Box key={section.heading} sx={{ mb: 0.5 }}>
            <Typography
              sx={{
                px: 2.5,
                py: 0.75,
                fontSize: '0.6rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: 'text.disabled',
                textTransform: 'uppercase',
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              {section.heading}
            </Typography>

            {section.items.map(({ label, path, icon }) => {
              const isActive =
                location.pathname === path ||
                location.pathname.startsWith(path + '/')

              return (
                <Tooltip key={path} title="" placement="right">
                  <Box
                    onClick={() => {
                      navigate(path)
                      onNavigate?.()   // close mobile drawer after nav
                    }}
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
                          : isDark
                            ? 'rgba(255,255,255,0.04)'
                            : 'rgba(0,0,0,0.04)',
                      },
                    }}
                  >
                    <Box
                      sx={{
                        color: isActive ? '#4A9EFF' : 'text.secondary',
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
                        color: isActive ? 'text.primary' : 'text.secondary',
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
      <Box sx={{ px: 2.5, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography
          sx={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.58rem',
            color: 'text.disabled',
            letterSpacing: '0.05em',
          }}
        >
          QUANT · ML · LIVE
        </Typography>
      </Box>
    </Box>
  )
}

export default function Sidebar({ width, mobileOpen, onMobileClose }: SidebarProps) {
  const theme    = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}   // better mobile perf
        sx={{
          '& .MuiDrawer-paper': { width, boxSizing: 'border-box', border: 'none' },
        }}
      >
        <SidebarContent width={width} onNavigate={onMobileClose} />
      </Drawer>
    )
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        '& .MuiDrawer-paper': { width, boxSizing: 'border-box', border: 'none' },
      }}
    >
      <SidebarContent width={width} />
    </Drawer>
  )
}
