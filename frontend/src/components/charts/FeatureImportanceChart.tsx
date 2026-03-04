/**
 * FeatureImportanceChart — horizontal bar chart for XGBoost feature importance.
 *
 * Displays top N features sorted by importance (gain).
 * Color encodes feature group:
 *   - Trend indicators:  blue
 *   - Momentum:          purple
 *   - Volatility:        orange
 *   - Volume:            teal
 *   - Returns:           green
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
  ResponsiveContainer,
} from 'recharts'
import { Box, Typography } from '@mui/material'

interface FeatureImportanceChartProps {
  features: Record<string, number>
  height?: number
  topN?: number
}

// ── Feature group classification ──────────────────────────────────────────────
const FEATURE_GROUPS: Record<string, string> = {
  // Trend
  sma_20: 'trend', sma_50: 'trend', sma_200: 'trend', ema_12: 'trend', ema_26: 'trend',
  price_sma20_ratio: 'trend', price_sma50_ratio: 'trend', price_sma200_ratio: 'trend',
  sma20_sma50_ratio: 'trend', macd_line: 'trend', macd_signal: 'trend', macd_hist: 'trend',
  adx: 'trend',
  // Momentum
  rsi_14: 'momentum', roc_10: 'momentum', williams_r: 'momentum',
  stoch_k: 'momentum', stoch_d: 'momentum', rsi_norm: 'momentum',
  // Volatility
  bb_pct_b: 'volatility', bb_width: 'volatility', atr_14: 'volatility',
  atr_pct: 'volatility', hist_vol_20: 'volatility', hist_vol_60: 'volatility',
  // Volume
  obv: 'volume', vol_sma_ratio: 'volume', vol_zscore: 'volume', obv_ratio: 'volume',
  // Returns
  ret_1d: 'returns', ret_5d: 'returns', ret_20d: 'returns', ret_60d: 'returns',
  ret_1d_lag1: 'returns', ret_1d_lag2: 'returns', ret_1d_lag3: 'returns', ret_5d_lag1: 'returns',
  hl_range_pct: 'returns', close_position: 'returns',
}

const GROUP_COLORS: Record<string, string> = {
  trend:      '#00b4d8',   // Cyan-blue
  momentum:   '#9d4edd',   // Purple
  volatility: '#f77f00',   // Orange
  volume:     '#06d6a0',   // Teal-green
  returns:    '#4cc9f0',   // Light blue
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FeatureTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value, group } = payload[0].payload

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        minWidth: 200,
      }}
    >
      <Typography variant="body2" fontWeight={700} fontFamily="Roboto Mono, monospace">
        {name}
      </Typography>
      <Typography variant="caption" sx={{ color: GROUP_COLORS[group] ?? '#94a3b8', display: 'block' }}>
        {group}
      </Typography>
      <Typography variant="body2" color="text.secondary" mt={0.5}>
        Importance: <strong>{(value * 100).toFixed(3)}%</strong>
      </Typography>
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FeatureImportanceChart({
  features,
  height = 400,
  topN = 15,
}: FeatureImportanceChartProps) {
  const data = useMemo(() => {
    const entries = Object.entries(features)
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)

    // Normalize to sum = 1 within shown features for cleaner visualization
    const total = entries.reduce((s, [, v]) => s + v, 0)

    return entries.map(([name, raw]) => ({
      name:  name.replace(/_/g, ' '),     // e.g. "rsi_14" → "rsi 14"
      value: total > 0 ? raw / total : raw,
      group: FEATURE_GROUPS[name] ?? 'returns',
    }))
  }, [features, topN])

  if (data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height }}>
        <Typography color="text.secondary">No feature importance data</Typography>
      </Box>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 100, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />

        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
        />

        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'Roboto Mono, monospace' }}
          tickLine={false}
          axisLine={false}
          width={95}
        />

        <Tooltip content={<FeatureTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />

        <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {data.map((entry, i) => (
            <Cell key={i} fill={GROUP_COLORS[entry.group] ?? '#94a3b8'} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
