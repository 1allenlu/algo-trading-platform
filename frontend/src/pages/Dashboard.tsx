/**
 * Dashboard page — Market Overview.
 *
 * Phase 26: candlestick / area chart toggle.
 * Phase 31: intraday timeframes (5m / 15m / 1H) fetch from /api/intraday.
 *           Intraday controls only appear in Candle mode.
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Grid,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import {
  TrendingDown,
  TrendingUp,
  CandlestickChart as TradeIcon,
  Assessment as BacktestIcon,
  Search as ScannerIcon,
  SignalCellularAlt as SignalsIcon,
  Psychology as MLIcon,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import PriceChart from '@/components/charts/PriceChart'
import CandlestickChart from '@/components/charts/CandlestickChart'
import { useLivePrices } from '@/hooks/useLivePrices'
import WatchlistWidget from '@/components/dashboard/WatchlistWidget'
import GettingStarted from '@/components/dashboard/GettingStarted'

// ── Config ────────────────────────────────────────────────────────────────────
const SYMBOLS = ['SPY', 'QQQ', 'NVDA', 'AAPL'] as const

const DAILY_TIMEFRAMES: Record<string, number> = {
  '1M': 21, '3M': 63, '6M': 126, '1Y': 252, '5Y': 1260,
}

// Intraday timeframe → bar limit (number of bars to fetch)
const INTRADAY_TIMEFRAMES: Record<string, { tf: string; limit: number; label: string }> = {
  '5m':  { tf: '5m',  limit: 390, label: '5m'  },   // ~2 trading days
  '15m': { tf: '15m', limit: 260, label: '15m' },   // ~4 trading days
  '1H':  { tf: '1h',  limit: 200, label: '1H'  },   // ~5 weeks
}

// ── Symbol card ───────────────────────────────────────────────────────────────

interface SymbolCardProps {
  symbol:     string
  chartType:  'area' | 'candle'
  dailyLimit: number
  intraday:   { tf: string; limit: number } | null  // null = daily mode
}

function SymbolCard({ symbol, chartType, dailyLimit, intraday }: SymbolCardProps) {
  // Daily data query
  const dailyQuery = useQuery({
    queryKey: ['market', symbol, dailyLimit],
    queryFn:  () => api.market.getData(symbol, dailyLimit),
    staleTime: 60_000,
    enabled:  !intraday,
  })

  // Intraday data query (only active when intraday mode is on)
  const intradayQuery = useQuery({
    queryKey: ['intraday', symbol, intraday?.tf, intraday?.limit],
    queryFn:  () => api.intraday.getBars(symbol, intraday!.tf, intraday!.limit),
    staleTime: 30_000,
    enabled:  !!intraday,
  })

  const active     = intraday ? intradayQuery : dailyQuery
  const bars       = active.data?.bars ?? []
  const isLoading  = active.isLoading
  const isError    = active.isError

  const lastClose  = bars.at(-1)?.close ?? 0
  const firstClose = bars[0]?.close ?? 0
  const totalPct   = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0
  const isPos      = totalPct >= 0

  return (
    <Card>
      <CardHeader
        disableTypography
        title={
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography variant="h6">{symbol}</Typography>
            {!isLoading && bars.length > 0 && (
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="h6" sx={{ fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1.2 }}>
                  ${lastClose.toFixed(2)}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                  {isPos
                    ? <TrendingUp sx={{ fontSize: 14, color: 'secondary.main' }} />
                    : <TrendingDown sx={{ fontSize: 14, color: 'error.main' }} />}
                  <Typography
                    variant="caption"
                    sx={{ color: isPos ? 'secondary.main' : 'error.main', fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace' }}
                  >
                    {isPos ? '+' : ''}{totalPct.toFixed(2)}%
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        }
        sx={{ pb: 0 }}
      />

      <CardContent sx={{ pt: 1 }}>
        {isLoading && <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 1 }} />}

        {isError && !isLoading && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {intraday
              ? <>No intraday data for <strong>{symbol}</strong>. Run <code>make ingest-intraday symbol={symbol} timeframe={intraday.tf}</code>.</>
              : <>No data for <strong>{symbol}</strong>. Run <code>make ingest</code>.</>
            }
          </Alert>
        )}

        {!isLoading && !isError && bars.length > 0 && (
          chartType === 'candle'
            ? <CandlestickChart bars={bars} height={240} timeframe={intraday ? intraday.tf : '1D'} />
            : <PriceChart bars={bars} symbol={symbol} height={240} />
        )}
      </CardContent>
    </Card>
  )
}

// ── Portfolio snapshot strip ──────────────────────────────────────────────────
function PortfolioSnapshot() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey:  ['analytics', 'summary'],
    queryFn:   () => api.analytics.getSummary(),
    staleTime: 60_000,
    retry:     false,
  })

  const QUICK_ACTIONS = [
    { label: 'Paper Trade',  icon: <TradeIcon sx={{ fontSize: 16 }} />,    path: '/trading',  color: '#00C896' },
    { label: 'Backtest',     icon: <BacktestIcon sx={{ fontSize: 16 }} />, path: '/backtest', color: '#4A9EFF' },
    { label: 'Scan Markets', icon: <ScannerIcon sx={{ fontSize: 16 }} />,  path: '/scanner',  color: '#F59E0B' },
    { label: 'Signals',      icon: <SignalsIcon sx={{ fontSize: 16 }} />,  path: '/signals',  color: '#8B5CF6' },
    { label: 'AI Models',    icon: <MLIcon sx={{ fontSize: 16 }} />,       path: '/ml',       color: '#EC4899' },
  ]

  return (
    <Card sx={{ mb: 3, border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ pb: '16px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>

          {/* Portfolio stats */}
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            {isLoading ? (
              <Skeleton width={280} height={40} />
            ) : data ? (
              <>
                <Box>
                  <Typography variant="caption" color="text.disabled" display="block">Portfolio Value</Typography>
                  <Typography variant="h5" fontWeight={700} fontFamily="IBM Plex Mono, monospace">
                    ${data.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.disabled" display="block">Total Return</Typography>
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    fontFamily="IBM Plex Mono, monospace"
                    sx={{ color: data.total_return >= 0 ? '#00C896' : '#FF6B6B' }}
                  >
                    {data.total_return >= 0 ? '+' : ''}{(data.total_return * 100).toFixed(2)}%
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.disabled" display="block">Trades</Typography>
                  <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace">
                    {data.n_trades}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.disabled" display="block">Win Rate</Typography>
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    fontFamily="IBM Plex Mono, monospace"
                    sx={{ color: data.win_rate >= 0.5 ? '#00C896' : '#FF6B6B' }}
                  >
                    {(data.win_rate * 100).toFixed(0)}%
                  </Typography>
                </Box>
              </>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary">No trading history yet.</Typography>
                <Typography variant="caption" color="text.disabled">Place a paper trade to see your portfolio stats here.</Typography>
              </Box>
            )}
          </Box>

          {/* Quick actions */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {QUICK_ACTIONS.map(({ label, icon, path, color }) => (
              <Button
                key={label}
                size="small"
                startIcon={icon}
                onClick={() => navigate(path)}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color,
                  borderColor: `${color}44`,
                  border: '1px solid',
                  borderRadius: 1.5,
                  px: 1.5,
                  py: 0.5,
                  '&:hover': { bgcolor: `${color}12`, borderColor: color },
                }}
              >
                {label}
              </Button>
            ))}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tf, setTf]               = useState('1Y')
  const [chartType, setChartType] = useState<'area' | 'candle'>('candle')
  const [intradayKey, setIntradayKey] = useState<string | null>(null)  // null = daily mode

  const { prices, status: wsStatus } = useLivePrices()

  const dailyLimit = DAILY_TIMEFRAMES[tf] ?? 252
  const intradayConfig = intradayKey ? INTRADAY_TIMEFRAMES[intradayKey] ?? null : null

  const handleDailyTf = (_: unknown, v: string) => {
    if (v) { setTf(v); setIntradayKey(null) }
  }

  const handleIntradayTf = (key: string) => {
    setIntradayKey(prev => prev === key ? null : key)  // toggle off on re-click
    setTf('')
  }

  return (
    <Box>
      {/* Onboarding checklist */}
      <GettingStarted />

      {/* Portfolio snapshot + quick actions */}
      <PortfolioSnapshot />

      {/* Header row */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3, flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography variant="h4">Market Overview</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {intradayKey ? `Intraday ${intradayKey} bars` : 'Daily OHLCV — TimescaleDB'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Chart type toggle */}
          <ToggleButtonGroup
            value={chartType} exclusive size="small"
            onChange={(_e, v: 'area' | 'candle') => v && setChartType(v)}
          >
            <ToggleButton value="candle" sx={{ px: 1.5, fontSize: '0.72rem', fontFamily: 'IBM Plex Mono, monospace' }}>Candle</ToggleButton>
            <ToggleButton value="area"   sx={{ px: 1.5, fontSize: '0.72rem', fontFamily: 'IBM Plex Mono, monospace' }}>Area</ToggleButton>
          </ToggleButtonGroup>

          {/* Daily timeframe (hidden when intraday is active) */}
          {!intradayKey && (
            <ToggleButtonGroup value={tf} exclusive size="small" onChange={handleDailyTf}>
              {Object.keys(DAILY_TIMEFRAMES).map((label) => (
                <ToggleButton key={label} value={label} sx={{ px: 2, fontSize: '0.75rem' }}>
                  {label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}

          {/* Intraday chips (candle mode only) */}
          {chartType === 'candle' && (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {Object.entries(INTRADAY_TIMEFRAMES).map(([key, cfg]) => (
                <Chip
                  key={key}
                  label={cfg.label}
                  size="small"
                  clickable
                  onClick={() => handleIntradayTf(key)}
                  sx={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '0.72rem',
                    bgcolor:    intradayKey === key ? 'rgba(0,180,216,0.2)' : 'transparent',
                    color:      intradayKey === key ? 'primary.main' : 'text.secondary',
                    border: '1px solid',
                    borderColor: intradayKey === key ? 'primary.main' : 'divider',
                  }}
                />
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {/* Chart grid */}
      <Grid container spacing={2.5}>
        {SYMBOLS.map((sym) => (
          <Grid item xs={12} md={6} key={sym}>
            <SymbolCard
              symbol={sym}
              chartType={chartType}
              dailyLimit={dailyLimit}
              intraday={intradayConfig}
            />
          </Grid>
        ))}
      </Grid>

      {/* Live watchlist */}
      <Box mt={3}>
        <WatchlistWidget prices={prices} status={wsStatus} />
      </Box>
    </Box>
  )
}
