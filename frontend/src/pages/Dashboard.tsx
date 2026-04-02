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
import { TrendingDown, TrendingUp } from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import PriceChart from '@/components/charts/PriceChart'
import CandlestickChart from '@/components/charts/CandlestickChart'
import { useLivePrices } from '@/hooks/useLivePrices'
import WatchlistWidget from '@/components/dashboard/WatchlistWidget'

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
