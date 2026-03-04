/**
 * EfficientFrontierChart — Markowitz mean-variance frontier visualization.
 *
 * Shows the space of possible portfolios:
 *   Gray dots  — random Monte Carlo portfolios (portfolio possibility cloud)
 *   Cyan line  — efficient frontier (optimal portfolios at each return level)
 *   Gold dot   — Max Sharpe ratio (tangency portfolio — best risk/reward)
 *   Blue dot   — Min Volatility (global minimum variance)
 *
 * The efficient frontier represents portfolios where you can't get higher
 * return without accepting more risk. Rational investors should only hold
 * portfolios ON the frontier.
 *
 * Color encodes Sharpe ratio for the random cloud (higher = better).
 */

import { useMemo } from 'react'
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Box, Typography } from '@mui/material'
import type { FrontierPoint } from '@/services/api'

interface EfficientFrontierChartProps {
  random:     FrontierPoint[]
  frontier:   FrontierPoint[]
  maxSharpe:  FrontierPoint | null
  minVol:     FrontierPoint | null
  height?:    number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FrontierTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null

  return (
    <Box
      sx={{
        bgcolor:     'background.paper',
        border:      '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        minWidth: 180,
      }}
    >
      {d.label && (
        <Typography variant="caption" color="primary.main" fontWeight={700} display="block" mb={0.5}>
          {d.label}
        </Typography>
      )}
      <Typography variant="body2">
        Return: <strong>{(d.return_ann * 100).toFixed(1)}%</strong>
      </Typography>
      <Typography variant="body2">
        Volatility: <strong>{(d.volatility * 100).toFixed(1)}%</strong>
      </Typography>
      <Typography variant="body2">
        Sharpe: <strong>{d.sharpe?.toFixed(2)}</strong>
      </Typography>
    </Box>
  )
}

export default function EfficientFrontierChart({
  random,
  frontier,
  maxSharpe,
  minVol,
  height = 340,
}: EfficientFrontierChartProps) {
  const randomData = useMemo(
    () => random.map((p) => ({ ...p, fill: '#334155', opacity: 0.5 })),
    [random],
  )

  const frontierData = useMemo(
    () => frontier.map((p) => ({ ...p, fill: '#00b4d8' })),
    [frontier],
  )

  const specialPoints = useMemo(() => {
    const pts = []
    if (maxSharpe) pts.push({ ...maxSharpe, fill: '#fbbf24', label: '★ Max Sharpe', r: 8 })
    if (minVol)    pts.push({ ...minVol,    fill: '#818cf8', label: '● Min Vol',    r: 8 })
    return pts
  }, [maxSharpe, minVol])

  if (random.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height }}>
        <Typography color="text.secondary">No frontier data</Typography>
      </Box>
    )
  }

  const fmt = (v: number) => `${(v * 100).toFixed(0)}%`

  return (
    <Box>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />

          <XAxis
            dataKey="volatility"
            type="number"
            name="Volatility"
            tickFormatter={fmt}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Annual Volatility', position: 'insideBottom', offset: -2, fill: '#475569', fontSize: 11 }}
          />

          <YAxis
            dataKey="return_ann"
            type="number"
            name="Return"
            tickFormatter={fmt}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Annual Return', angle: -90, position: 'insideLeft', offset: 8, fill: '#475569', fontSize: 11 }}
          />

          <Tooltip content={<FrontierTooltip />} />

          {/* Random portfolio cloud */}
          <Scatter data={randomData}   fill="#334155" opacity={0.45} r={2.5} isAnimationActive={false} />

          {/* Efficient frontier line */}
          <Scatter data={frontierData} fill="#00b4d8" opacity={0.85} r={3}   isAnimationActive={false} line={{ stroke: '#00b4d8', strokeWidth: 1.5 }} lineType="joint" />

          {/* Optimal points */}
          <Scatter data={specialPoints} isAnimationActive={false} r={7}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shape={(props: any) => {
              const { cx, cy, payload } = props
              return (
                <circle
                  cx={cx} cy={cy} r={7}
                  fill={payload.fill}
                  stroke="#0f172a"
                  strokeWidth={2}
                />
              )
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>

      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', mt: 1 }}>
        {[
          { color: '#334155', label: 'Random portfolios', opacity: 0.7 },
          { color: '#00b4d8', label: 'Efficient frontier' },
          { color: '#fbbf24', label: 'Max Sharpe' },
          { color: '#818cf8', label: 'Min Volatility' },
        ].map(({ color, label, opacity }) => (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, opacity: opacity ?? 1 }} />
            <Typography variant="caption" color="text.disabled">{label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
