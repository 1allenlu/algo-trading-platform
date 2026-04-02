import {
  AppBar,
  Badge,
  Box,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Toolbar,
  Tooltip,
  Typography,
  Button,
} from '@mui/material'
import {
  Circle as DotIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Logout as LogoutIcon,
  Menu as MenuIcon,
  NotificationsOutlined as BellIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useLivePrices } from '@/hooks/useLivePrices'
import { useAlerts } from '@/hooks/useAlerts'
import { useAuth } from '@/contexts/AuthContext'
import { useThemeMode } from '@/contexts/ThemeContext'
import TickerBar from '@/components/layout/TickerBar'

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
            width: 360,
            maxHeight: 440,
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
        <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Alerts {alerts.length > 0 && `(${alerts.length})`}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" onClick={handleAcknowledgeAll} sx={{ fontSize: '0.7rem' }}>
              Mark all read
            </Button>
            <Button
              size="small"
              onClick={() => { handleClose(); navigate('/alerts') }}
              sx={{ fontSize: '0.7rem' }}
            >
              View all
            </Button>
          </Box>
        </Box>

        <Divider />

        {/* Alert list */}
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          {alerts.length === 0 ? (
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
          )}
        </Box>
      </Popover>
    </AppBar>
  )
}
