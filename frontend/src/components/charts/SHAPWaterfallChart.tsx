/**
 * SHAPWaterfallChart — horizontal signed-bar chart for SHAP feature contributions.
 *
 * Positive bars (green) → feature pushes prediction toward UP.
 * Negative bars (red)   → feature pushes prediction toward DOWN.
 * A vertical reference line at x=0 separates the two directions.
 *
 * Modeled on FeatureImportanceChart.tsx but uses signed SHAP values instead of
 * normalized importance scores.
 */

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { Box, Typography } from '@mui/material'
import type { SHAPFeatureContribution } from '@/services/api'

interface SHAPWaterfallChartProps {
  features: SHAPFeatureContribution[]
  height?:  number
}

const UP_COLOR   = '#00C896'   // Teal-green — pushes toward UP
const DOWN_COLOR = '#FF6B6B'   // Coral-red  — pushes toward DOWN

// ── Custom tooltip ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SHAPTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as { name: string; shap_value: number; feature_value: number }

  const isUp = d.shap_value >= 0
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        minWidth: 220,
      }}
    >
      <Typography variant="body2" fontWeight={700} fontFamily="Roboto Mono, monospace">
        {d.name}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: isUp ? UP_COLOR : DOWN_COLOR, display: 'block', mt: 0.5 }}
      >
        {isUp ? '▲ Pushes toward UP' : '▼ Pushes toward DOWN'}
      </Typography>
      <Typography variant="body2" color="text.secondary" mt={0.5}>
        SHAP: <strong style={{ color: isUp ? UP_COLOR : DOWN_COLOR }}>
          {isUp ? '+' : ''}{d.shap_value.toFixed(4)}
        </strong>
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Value: <strong>{d.feature_value.toFixed(4)}</strong>
      </Typography>
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SHAPWaterfallChart({
  features,
  height = 380,
}: SHAPWaterfallChartProps) {
  const data = useMemo(
    () =>
      features.map((f) => ({
        name:          f.name.replace(/_/g, ' '),
        shap_value:    f.shap_value,
        feature_value: f.feature_value,
      })),
    [features],
  )

  if (data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height }}>
        <Typography color="text.secondary">No SHAP data available</Typography>
      </Box>
    )
  }

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.shap_value)), 0.01)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 110, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1E2330" horizontal={false} />

        <XAxis
          type="number"
          domain={[-maxAbs * 1.1, maxAbs * 1.1]}
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => (v >= 0 ? `+${v.toFixed(3)}` : v.toFixed(3))}
        />

        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: '#9CA3AF', fontFamily: 'Roboto Mono, monospace' }}
          tickLine={false}
          axisLine={false}
          width={105}
        />

        <Tooltip content={<SHAPTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />

        {/* Zero reference line — separates bullish vs bearish contributions */}
        <ReferenceLine x={0} stroke="#4B5563" strokeWidth={1.5} />

        <Bar dataKey="shap_value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.shap_value >= 0 ? UP_COLOR : DOWN_COLOR}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
