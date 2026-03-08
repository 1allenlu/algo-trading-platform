/**
 * SentimentGauge — SVG semicircular gauge for a sentiment score in [-1, +1].
 *
 * Layout:
 *   - 180° arc track (dark gray background)
 *   - Colored needle pointer that rotates with the score
 *   - Score label centered below the arc
 *   - Three stat rows: RSI, vs SMA50, vs SMA200
 *
 * Color mapping:
 *   score <= -0.4  → red   (#FF6B6B) — bearish
 *   score >= +0.4  → green (#00C896) — bullish
 *   else           → gray  (#9CA3AF) — neutral
 */

import { Box, Chip, Typography } from '@mui/material'
import type { SentimentResponse } from '@/services/api'

interface SentimentGaugeProps {
  data: SentimentResponse
}

// Map score [-1, +1] to label color
function scoreColor(score: number): string {
  if (score >= 0.4)  return '#00C896'   // Bullish green
  if (score <= -0.4) return '#FF6B6B'   // Bearish red
  return '#9CA3AF'                       // Neutral gray
}

// Map score [-1, +1] to needle angle in degrees (0° = left, 180° = right)
function scoreToAngle(score: number): number {
  // score -1 → 0°, score 0 → 90°, score +1 → 180°
  return ((score + 1) / 2) * 180
}

// Polar to Cartesian for SVG arc path
function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180   // Shift so 0°=left in SVG coords
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

// Build SVG arc path for a semicircle
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarToCart(cx, cy, r, startDeg)
  const e = polarToCart(cx, cy, r, endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

// Stat row component
function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.25 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="caption" fontWeight={700} sx={{ color: color ?? 'text.primary', fontFamily: 'IBM Plex Mono, monospace' }}>
        {value}
      </Typography>
    </Box>
  )
}

export default function SentimentGauge({ data }: SentimentGaugeProps) {
  const { score, label, rsi_14, price_vs_sma50, price_vs_sma200 } = data

  // SVG dimensions
  const W  = 220
  const H  = 130
  const cx = W / 2
  const cy = H - 20      // Center of the semicircle arc (near bottom)
  const R  = 80          // Arc radius

  const needleAngle = scoreToAngle(score)   // 0-180 degrees
  const color       = scoreColor(score)

  // Needle tip position
  const tip = polarToCart(cx, cy, R - 12, needleAngle)

  // Colored arc fill from start to needle position (shows "how far" we are)
  const filledArc = arcPath(cx, cy, R - 4, 0, needleAngle)
  const trackArc  = arcPath(cx, cy, R - 4, 0, 180)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
      {/* SVG gauge */}
      <svg width={W} height={H} aria-label={`Sentiment gauge: ${label}`}>
        {/* Track (background arc) */}
        <path
          d={trackArc}
          fill="none"
          stroke="#2D3548"
          strokeWidth={12}
          strokeLinecap="round"
        />

        {/* Filled arc (colored up to needle position) */}
        <path
          d={filledArc}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          opacity={0.7}
        />

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={tip.x}
          y2={tip.y}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* Pivot dot */}
        <circle cx={cx} cy={cy} r={5} fill={color} />

        {/* Zone labels */}
        <text x={14} y={cy + 4} fontSize={9} fill="#FF6B6B" fontWeight="bold">-1</text>
        <text x={cx - 4} y={cy - R + 14} fontSize={9} fill="#9CA3AF">0</text>
        <text x={W - 22} y={cy + 4} fontSize={9} fill="#00C896" fontWeight="bold">+1</text>
      </svg>

      {/* Score + label */}
      <Box sx={{ textAlign: 'center', mt: -1 }}>
        <Typography variant="h5" fontWeight={800} sx={{ color, fontFamily: 'IBM Plex Mono, monospace' }}>
          {score >= 0 ? '+' : ''}{score.toFixed(2)}
        </Typography>
        <Chip
          label={label.toUpperCase()}
          size="small"
          sx={{
            bgcolor: `${color}22`,
            color,
            fontWeight: 700,
            fontSize: '0.7rem',
            letterSpacing: '0.08em',
            mt: 0.5,
          }}
        />
      </Box>

      {/* Stat rows */}
      <Box sx={{ width: '100%', px: 1 }}>
        <StatRow
          label="RSI (14)"
          value={rsi_14.toFixed(1)}
          color={rsi_14 > 70 ? '#FF6B6B' : rsi_14 < 30 ? '#00C896' : '#9CA3AF'}
        />
        <StatRow
          label="vs SMA 50"
          value={`${price_vs_sma50 >= 0 ? '+' : ''}${(price_vs_sma50 * 100).toFixed(2)}%`}
          color={price_vs_sma50 > 0 ? '#00C896' : '#FF6B6B'}
        />
        <StatRow
          label="vs SMA 200"
          value={`${price_vs_sma200 >= 0 ? '+' : ''}${(price_vs_sma200 * 100).toFixed(2)}%`}
          color={price_vs_sma200 > 0 ? '#00C896' : '#FF6B6B'}
        />
      </Box>
    </Box>
  )
}
