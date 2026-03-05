import {
  AppBar,
  Box,
  Chip,
  IconButton,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { Circle as DotIcon, Refresh as RefreshIcon } from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useLivePrices } from '@/hooks/useLivePrices'
import TickerBar from '@/components/layout/TickerBar'

export default function TopBar() {
  const { data: health, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: api.health.check,
    refetchInterval: 30_000,
  })

  const { prices, status: wsStatus } = useLivePrices()

  const allHealthy = health?.database === 'healthy' && health?.redis === 'healthy'
  const dotColor = isFetching ? 'text.disabled' : allHealthy ? 'secondary.main' : 'error.main'

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Toolbar variant="dense" sx={{ gap: 1.5 }}>
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
          sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.7rem' }}
        />

        {/* Redis status */}
        <Chip
          label={`Redis ${health?.redis ?? '…'}`}
          size="small"
          variant="outlined"
          color={health?.redis === 'healthy' ? 'success' : health ? 'error' : 'default'}
          sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.7rem' }}
        />

        <Tooltip title="Refresh health check">
          <IconButton size="small" onClick={() => refetch()}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  )
}
