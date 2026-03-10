/**
 * Dashboard page — Market Overview.
 *
 * Phase 26: adds candlestick / area chart toggle (TradingView lightweight-charts).
 * Shows price charts for key symbols with selectable timeframes.
 * Each card is independently fetched + cached via React Query.
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
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
const TIMEFRAMES: Record<string, number> = {
  '1M': 21,
  '3M': 63,
  '6M': 126,
  '1Y': 252,
  '5Y': 1260,
}

// ── Symbol card ───────────────────────────────────────────────────────────────
interface SymbolCardProps {
  symbol:    string
  limit:     number
  chartType: 'area' | 'candle'
}

function SymbolCard({ symbol, limit, chartType }: SymbolCardProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['market', symbol, limit],
    queryFn:  () => api.market.getData(symbol, limit),
    staleTime: 60_000,
  })

  const bars      = data?.bars ?? []
  const lastClose = bars.at(-1)?.close ?? 0
  const firstClose = bars[0]?.close ?? 0
  const totalPct  = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0
  const isPos     = totalPct >= 0

  return (
    <Card>
      <CardHeader
        disableTypography
        title={
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography variant="h6">{symbol}</Typography>

            {!isLoading && bars.length > 0 && (
              <Box sx={{ textAlign: 'right' }}>
                <Typography
                  variant="h6"
                  sx={{ fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1.2 }}
                >
                  ${lastClose.toFixed(2)}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                  {isPos
                    ? <TrendingUp sx={{ fontSize: 14, color: 'secondary.main' }} />
                    : <TrendingDown sx={{ fontSize: 14, color: 'error.main' }} />}
                  <Typography
                    variant="caption"
                    sx={{
                      color:      isPos ? 'secondary.main' : 'error.main',
                      fontWeight: 700,
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
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

        {isError && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            No data for <strong>{symbol}</strong>.
            Run <code>make ingest</code> to populate the database.
          </Alert>
        )}

        {!isLoading && !isError && bars.length > 0 && (
          chartType === 'candle'
            ? <CandlestickChart bars={bars} height={240} />
            : <PriceChart bars={bars} symbol={symbol} height={240} />
        )}
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tf, setTf]           = useState('1Y')
  const [chartType, setChartType] = useState<'area' | 'candle'>('candle')
  const limit = TIMEFRAMES[tf]
  const { prices, status: wsStatus } = useLivePrices()

  return (
    <Box>
      {/* Header row */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3 }}>
        <Box>
          <Typography variant="h4">Market Overview</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Daily OHLCV — TimescaleDB
          </Typography>
        </Box>

        {/* Controls: chart type + timeframe */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <ToggleButtonGroup
            value={chartType}
            exclusive
            size="small"
            onChange={(_e, v: 'area' | 'candle') => v && setChartType(v)}
          >
            <ToggleButton value="candle" sx={{ px: 1.5, fontSize: '0.72rem', fontFamily: 'IBM Plex Mono, monospace' }}>
              Candle
            </ToggleButton>
            <ToggleButton value="area"   sx={{ px: 1.5, fontSize: '0.72rem', fontFamily: 'IBM Plex Mono, monospace' }}>
              Area
            </ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup
            value={tf}
            exclusive
            size="small"
            onChange={(_, v: string) => v && setTf(v)}
          >
            {Object.keys(TIMEFRAMES).map((label) => (
              <ToggleButton key={label} value={label} sx={{ px: 2, fontSize: '0.75rem' }}>
                {label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* Chart grid */}
      <Grid container spacing={2.5}>
        {SYMBOLS.map((sym) => (
          <Grid item xs={12} md={6} key={sym}>
            <SymbolCard symbol={sym} limit={limit} chartType={chartType} />
          </Grid>
        ))}
      </Grid>

      {/* Live watchlist (Phase 7) */}
      <Box mt={3}>
        <WatchlistWidget prices={prices} status={wsStatus} />
      </Box>
    </Box>
  )
}
