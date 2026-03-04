/**
 * EquityCurveChart — strategy vs benchmark performance over time.
 *
 * Renders two series:
 *   - Strategy equity curve (portfolio value from $100k initial)
 *   - Benchmark buy-and-hold (first symbol, e.g. SPY)
 *
 * Uses Recharts ComposedChart with a custom tooltip showing:
 *   - Date
 *   - Strategy value ($)
 *   - Benchmark value ($)
 *   - Current drawdown (%)
 */

import { useMemo } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Box, Typography } from '@mui/material'
import type { EquityPoint } from '@/services/api'

interface EquityCurveChartProps {
  equityCurve:    EquityPoint[]
  benchmarkCurve?: EquityPoint[]   // Optional — same structure, value = benchmark $
  height?:        number
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EquityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  const strategy  = payload.find((p: any) => p.dataKey === 'value')
  const benchmark = payload.find((p: any) => p.dataKey === 'benchmark')
  const drawdown  = payload[0]?.payload?.drawdown

  return (
    <Box
      sx={{
        bgcolor:     'background.paper',
        border:      '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        minWidth: 200,
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
        {label}
      </Typography>
      {strategy && (
        <Typography variant="body2">
          Strategy:{' '}
          <strong style={{ color: '#00b4d8' }}>
            ${strategy.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </strong>
        </Typography>
      )}
      {benchmark && (
        <Typography variant="body2">
          Benchmark:{' '}
          <strong style={{ color: '#94a3b8' }}>
            ${benchmark.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </strong>
        </Typography>
      )}
      {drawdown != null && (
        <Typography variant="caption" color={drawdown < -0.1 ? 'error.main' : 'text.secondary'}>
          Drawdown: {(drawdown * 100).toFixed(1)}%
        </Typography>
      )}
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EquityCurveChart({
  equityCurve,
  benchmarkCurve,
  height = 320,
}: EquityCurveChartProps) {
  const data = useMemo(() => {
    // If we have benchmark data, normalize it to the same starting capital
    const bmMap = new Map(benchmarkCurve?.map((p) => [p.date, p.value]) ?? [])

    return equityCurve.map((pt) => ({
      date:      pt.date.slice(0, 10),   // "YYYY-MM-DD"
      value:     pt.value,
      drawdown:  pt.drawdown,
      benchmark: bmMap.get(pt.date) ?? null,
    }))
  }, [equityCurve, benchmarkCurve])

  if (data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height }}>
        <Typography color="text.secondary">No equity curve data</Typography>
      </Box>
    )
  }

  // Format axis labels: only show year when it changes
  const formatXAxis = (tick: string) => tick.slice(0, 7)   // "YYYY-MM"

  const formatYAxis = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />

        <XAxis
          dataKey="date"
          tickFormatter={formatXAxis}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />

        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          width={55}
        />

        <Tooltip content={<EquityTooltip />} />

        {/* Benchmark (gray, dashed) */}
        {benchmarkCurve && (
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke="#475569"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            isAnimationActive={false}
            name="Benchmark"
          />
        )}

        {/* Strategy (cyan, solid) */}
        <Line
          type="monotone"
          dataKey="value"
          stroke="#00b4d8"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          name="Strategy"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
