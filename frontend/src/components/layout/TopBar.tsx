import {
  Alert,
  AppBar,
  Badge,
  Box,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Snackbar,
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography,
  Button,
} from '@mui/material'
import {
  Assessment as BacktestIcon,
  Circle as DotIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  NotificationsOutlined as BellIcon,
  Refresh as RefreshIcon,
  TrendingUp as TradeIcon,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useLivePrices } from '@/hooks/useLivePrices'
import { useAlerts } from '@/hooks/useAlerts'
import { useAuth } from '@/contexts/AuthContext'
import { useThemeMode } from '@/contexts/ThemeContext'
import TickerBar from '@/components/layout/TickerBar'
import SymbolSearch from '@/components/layout/SymbolSearch'

export default function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { data: health, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: api.health.check,
    refetchInterval: 30_000,
  })

  const { prices, status: wsStatus } = useLivePrices()
  const { alerts, unreadCount, clearUnread } = useAlerts()
  const navigate = useNavigate()
  const { user, authEnabled, logout } = useAuth()
  const { mode, toggleTheme } = useThemeMode()

  // Bell popover state
  const bellRef = useRef<HTMLButtonElement>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  // Phase 46: toast notification when a new alert fires via WebSocket
  const [toastOpen,    setToastOpen]    = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const prevUnreadRef = useRef(0)

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && alerts.length > 0) {
      setToastMessage(alerts[0].message)
      setToastOpen(true)
    }
    prevUnreadRef.current = unreadCount
  }, [unreadCount, alerts])

  // Activity feed — recent backtests + paper orders
  const { data: paperState } = useQuery({
    queryKey:  ['paper-state'],
    queryFn:   api.paper.getState,
    staleTime: 15_000,
    enabled:   popoverOpen && activeTab === 1,
  })
  const { data: backtestData } = useQuery({
    queryKey:  ['backtests'],
    queryFn:   () => api.backtest.list(),
    staleTime: 30_000,
    enabled:   popoverOpen && activeTab === 1,
  })
  const backtestList = backtestData?.runs

  const handleBellClick = () => {
    setPopoverOpen(true)
    clearUnread()
  }

  const handleClose = () => setPopoverOpen(false)

  const handleAcknowledgeAll = async () => {
    await api.alerts.acknowledgeAll()
  }

  const allHealthy = health?.database === 'healthy' && health?.redis === 'healthy'
  const dotColor = isFetching ? 'text.disabled' : allHealthy ? 'secondary.main' : 'error.main'

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Toolbar variant="dense" sx={{ gap: 1.5 }}>
        {/* Hamburger — mobile only */}
        <IconButton
          size="small"
          onClick={onMenuClick}
          sx={{ display: { md: 'none' }, color: 'text.secondary', mr: 0.5 }}
        >
          <MenuIcon fontSize="small" />
        </IconButton>

        {/* Live price ticker (Phase 7) */}
        <TickerBar prices={prices} status={wsStatus} />

        {/* Global symbol search */}
        <SymbolSearch />

        {/* System status indicator */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <DotIcon sx={{ fontSize: 9, color: dotColor }} />
          <Typography variant="caption" color="text.secondary">
            {isFetching
              ? 'Checking...'
              : health
                ? allHealthy ? 'All systems nominal' : 'System degraded'
                : 'Connecting...'}
          </Typography>
        </Box>

        {/* DB status */}
        <Chip
          label={`DB ${health?.database ?? '…'}`}
          size="small"
          variant="outlined"
          color={health?.database === 'healthy' ? 'success' : health ? 'error' : 'default'}
          sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}
        />

        {/* Redis status */}
        <Chip
          label={`Redis ${health?.redis ?? '…'}`}
          size="small"
          variant="outlined"
          color={health?.redis === 'healthy' ? 'success' : health ? 'error' : 'default'}
          sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}
        />

        {/* Phase 19: price source */}
        {health?.price_source && (
          <Tooltip title={health.price_source === 'alpaca' ? 'Live prices from Alpaca' : 'Simulated prices (set Alpaca keys for live data)'}>
            <Chip
              label={health.price_source === 'alpaca' ? '● Live' : '◌ Sim'}
              size="small"
              variant="outlined"
              color={health.price_source === 'alpaca' ? 'success' : 'default'}
              sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}
            />
          </Tooltip>
        )}

        <Tooltip title="Refresh health check">
          <IconButton size="small" onClick={() => refetch()}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Theme toggle */}
        <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <IconButton size="small" onClick={toggleTheme} sx={{ color: 'text.secondary' }}>
            {mode === 'dark'
              ? <LightModeIcon fontSize="small" />
              : <DarkModeIcon  fontSize="small" />
            }
          </IconButton>
        </Tooltip>

        {/* Auth: user badge + logout (Phase 17) */}
        {authEnabled && user && (
          <Tooltip title={`Signed in as ${user}`}>
            <Chip
              label={user}
              size="small"
              variant="outlined"
              sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem', cursor: 'default' }}
            />
          </Tooltip>
        )}
        {authEnabled && (
          <Tooltip title="Sign out">
            <IconButton
              size="small"
              onClick={() => { logout(); navigate('/login') }}
              sx={{ color: 'text.secondary' }}
            >
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Alerts bell — Phase 8 */}
        <Tooltip title="Notifications">
          <IconButton
            size="small"
            ref={bellRef}
            onClick={handleBellClick}
            sx={{ color: unreadCount > 0 ? '#F59E0B' : 'text.secondary' }}
          >
            <Badge
              badgeContent={unreadCount}
              max={99}
              color="error"
              sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', minWidth: 16, height: 16 } }}
            >
              <BellIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>
      </Toolbar>

      {/* Notification dropdown popover */}
      <Popover
        open={popoverOpen}
        anchorEl={bellRef.current}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            width: 380,
            maxHeight: 480,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ px: 2, pt: 1.5, pb: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" fontWeight={700}>Notifications</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {activeTab === 0 && (
              <Button size="small" onClick={handleAcknowledgeAll} sx={{ fontSize: '0.7rem' }}>
                Mark all read
              </Button>
            )}
            <Button
              size="small"
              onClick={() => { handleClose(); navigate(activeTab === 0 ? '/alerts' : '/trading') }}
              sx={{ fontSize: '0.7rem' }}
            >
              {activeTab === 0 ? 'View alerts' : 'View trades'}
            </Button>
          </Box>
        </Box>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="fullWidth"
          sx={{
            minHeight: 36,
            '& .MuiTab-root': { minHeight: 36, fontSize: '0.75rem', textTransform: 'none' },
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Tab label={`Alerts${alerts.length > 0 ? ` (${alerts.length})` : ''}`} />
          <Tab label="Activity" />
        </Tabs>

        {/* Tab content */}
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          {/* ── Alerts tab ── */}
          {activeTab === 0 && (
            alerts.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <BellIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No alerts yet. Create rules on the Alerts page.
                </Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {alerts.slice(0, 20).map((alert) => (
                  <ListItem
                    key={`${alert.id}-${alert.triggered_at}`}
                    divider
                    sx={{ py: 1, alignItems: 'flex-start' }}
                  >
                    <ListItemText
                      primary={
                        <Typography variant="caption" fontWeight={600} color="text.primary">
                          {alert.message}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.disabled">
                          {new Date(alert.triggered_at).toLocaleTimeString()}
                        </Typography>
                      }
                      sx={{ m: 0 }}
                    />
                  </ListItem>
                ))}
              </List>
            )
          )}

          {/* ── Activity tab ── */}
          {activeTab === 1 && (
            <List dense disablePadding>
              {/* Recent paper orders */}
              {(paperState?.orders ?? []).slice(0, 8).map((order) => (
                <ListItem key={order.id} divider sx={{ py: 1, alignItems: 'flex-start' }}>
                  <Box sx={{
                    width: 28, height: 28, borderRadius: '50%',
                    bgcolor: order.side === 'buy' ? 'rgba(0,200,150,0.15)' : 'rgba(255,107,107,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    mr: 1.25, flexShrink: 0, mt: 0.25,
                  }}>
                    <TradeIcon sx={{
                      fontSize: 14,
                      color: order.side === 'buy' ? '#00C896' : '#FF6B6B',
                    }} />
                  </Box>
                  <ListItemText
                    primary={
                      <Typography variant="caption" fontWeight={600} color="text.primary">
                        {order.side.toUpperCase()} {order.qty} × {order.symbol}
                        {' '}
                        <Typography component="span" variant="caption"
                          sx={{ color: order.status === 'filled' ? '#00C896' : 'text.disabled' }}>
                          ({order.status})
                        </Typography>
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.disabled">
                        {new Date(order.created_at).toLocaleString()}
                        {order.filled_avg_price ? ` · avg $${order.filled_avg_price.toFixed(2)}` : ''}
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                </ListItem>
              ))}

              {/* Recent backtests */}
              {(backtestList ?? []).slice(0, 5).map((bt) => (
                <ListItem key={bt.id} divider sx={{ py: 1, alignItems: 'flex-start' }}>
                  <Box sx={{
                    width: 28, height: 28, borderRadius: '50%',
                    bgcolor: 'rgba(74,158,255,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    mr: 1.25, flexShrink: 0, mt: 0.25,
                  }}>
                    <BacktestIcon sx={{ fontSize: 14, color: '#4A9EFF' }} />
                  </Box>
                  <ListItemText
                    primary={
                      <Typography variant="caption" fontWeight={600} color="text.primary">
                        Backtest: {bt.symbols.join(', ')} · {bt.strategy_name}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.disabled">
                        {bt.status === 'done' && bt.total_return != null
                          ? `Return: ${bt.total_return >= 0 ? '+' : ''}${(bt.total_return * 100).toFixed(1)}%`
                          : bt.status}
                        {' · '}{new Date(bt.created_at).toLocaleDateString()}
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                </ListItem>
              ))}

              {/* Empty state */}
              {(paperState?.orders ?? []).length === 0 && (backtestList ?? []).length === 0 && (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    No recent activity. Try a backtest or paper trade.
                  </Typography>
                </Box>
              )}
            </List>
          )}
        </Box>
      </Popover>

      {/* Phase 46: real-time alert toast */}
      <Snackbar
        open={toastOpen}
        autoHideDuration={6000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity="warning"
          onClose={() => setToastOpen(false)}
          sx={{ maxWidth: 360, fontSize: '0.82rem' }}
        >
          {toastMessage}
        </Alert>
      </Snackbar>
    </AppBar>
  )
}
