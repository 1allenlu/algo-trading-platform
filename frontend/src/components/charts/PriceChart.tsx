/**
 * PriceChart — Recharts area chart for OHLCV data.
 *
 * Features:
 *   - Green/red gradient fill based on total return (positive/negative)
 *   - Custom tooltip showing OHLCV + daily change
 *   - Responsive (fills parent container width)
 *   - Sparse X-axis ticks (auto "preserveStartEnd")
 */

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Box, Typography } from '@mui/material'
import type { OHLCVBar } from '@/services/api'

interface PriceChartProps {
  bars:    OHLCVBar[]
  symbol:  string
  height?: number
}

interface ChartPoint {
  date:   string
  close:  number
  open:   number
  high:   number
  low:    number
  volume: number
  pct:    number   // Day-over-day % change
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as ChartPoint

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        minWidth: 160,
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
        {d.date}
      </Typography>
      <Typography variant="body2" fontWeight={700} fontFamily="IBM Plex Mono, monospace">
        ${d.close.toFixed(2)}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: d.pct >= 0 ? 'secondary.main' : 'error.main', fontWeight: 600 }}
      >
        {d.pct >= 0 ? '+' : ''}{d.pct.toFixed(2)}%
      </Typography>
      <Box mt={0.5}>
        <Typography variant="caption" color="text.secondary" display="block">
          O {d.open.toFixed(2)}  H {d.high.toFixed(2)}  L {d.low.toFixed(2)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Vol {(d.volume / 1_000_000).toFixed(1)}M
        </Typography>
      </Box>
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PriceChart({ bars, symbol, height = 300 }: PriceChartProps) {
  const { data, isPositive } = useMemo(() => {
    const points: ChartPoint[] = bars.map((bar, i) => {
      const prev = i > 0 ? bars[i - 1].close : bar.close
      const pct  = prev > 0 ? ((bar.close - prev) / prev) * 100 : 0

      // Show 4-digit year only for multi-year views (>300 bars)
      const date = new Date(bar.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day:   'numeric',
        year:  bars.length > 300 ? '2-digit' : undefined,
      })

      return { date, close: bar.close, open: bar.open, high: bar.high, low: bar.low, volume: bar.volume, pct }
    })

    const first = points[0]?.close ?? 0
    const last  = points[points.length - 1]?.close ?? 0
    return { data: points, isPositive: last >= first }
  }, [bars])

  const color    = isPositive ? '#00C896' : '#FF6B6B'
  const gradId   = `grad-${symbol}`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#1E2330" vertical={false} />

        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />

        <YAxis
          tick={{ fontSize: 11, fill: '#9CA3AF', fontFamily: 'IBM Plex Mono, monospace' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`}
          domain={['auto', 'auto']}
          width={58}
        />

        <Tooltip content={<ChartTooltip />} />

        <Area
          type="monotone"
          dataKey="close"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: color }}
          isAnimationActive={false}   // Disable animation for large datasets
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
