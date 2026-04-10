/**
 * VIX & Market Sentiment Dashboard — Phase 60.
 *
 * Shows:
 *   • Fear/Greed gauge (0–100)
 *   • VIX, VVIX, VXN spot values
 *   • Volatility regime badge
 *   • 30-day VIX sparkline
 */

import {
  Alert, Box, Card, CardContent, Chip, CircularProgress, Grid, Typography,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import {
  Area, AreaChart, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, type VixSnapshot } from '@/services/api'

// ── Fear/Greed gauge ──────────────────────────────────────────────────────────

function FearGreedGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const angle = -135 + (score / 100) * 270   // -135° → +135°
  const r = 80
  const cx = 100, cy = 100

  // Arc path helper
  const polarToXY = (deg: number) => ({
    x: cx + r * Math.cos((deg * Math.PI) / 180),
    y: cy + r * Math.sin((deg * Math.PI) / 180),
  })

  const start = polarToXY(-135)
  const end   = polarToXY(135)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={200} height={130} viewBox="0 0 200 130">
        {/* Background arc */}
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={14} strokeLinecap="round"
        />
        {/* Coloured fill arc — draw from -135° to current angle */}
        {(() => {
          const current = polarToXY(angle)
          const large = score > 50 ? 1 : 0
          return (
            <path
              d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${current.x} ${current.y}`}
              fill="none" stroke={color} strokeWidth={14} strokeLinecap="round"
            />
          )
        })()}
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={cx + (r - 20) * Math.cos((angle * Math.PI) / 180)}
          y2={cy + (r - 20) * Math.sin((angle * Math.PI) / 180)}
          stroke={color} strokeWidth={2.5} strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={6} fill={color} />
        {/* Score text */}
        <text x={cx} y={cy + 30} textAnchor="middle" fill={color} fontSize={28} fontWeight={700}>
          {score}
        </text>
      </svg>
      <Typography variant="h6" fontWeight={700} sx={{ color, mt: -1 }}>{label}</Typography>
    </Box>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const REGIME_COLOR: Record<string, string> = {
  low_vol:    '#00C896',
  normal_vol: '#4A9EFF',
  elevated:   '#F59E0B',
  panic:      '#FF6B6B',
}

const REGIME_LABEL: Record<string, string> = {
  low_vol:    'Low Volatility',
  normal_vol: 'Normal',
  elevated:   'Elevated',
  panic:      'Panic',
}

export default function VixPage() {
  const { data, isLoading, error } = useQuery({
    queryKey:  ['vix', 'snapshot'],
    queryFn:   () => api.vix.getSnapshot(),
    staleTime: 15 * 60 * 1000,
    retry:     2,
  })

  const sparkData = data?.sparkline?.map((v, i) => ({ i, vix: v })) ?? []

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>VIX & Market Sentiment</Typography>
        <Typography variant="body2" color="text.secondary">
          CBOE Volatility Index dashboard — fear/greed gauge, VIX term structure, and 30-day trend.
          Data via yfinance (15-min delayed, cached 15 min).
        </Typography>
      </Box>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">Failed to load VIX data.</Alert>}

      {data && (
        <Grid container spacing={3}>
          {/* Fear/Greed gauge */}
          <Grid item xs={12} md={4}>
            <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>Fear & Greed Index</Typography>
                <FearGreedGauge score={data.fear_greed} label={data.label} color={data.label_color} />
                <Chip
                  size="small"
                  label={REGIME_LABEL[data.regime] ?? data.regime}
                  sx={{
                    mt: 1,
                    bgcolor: (REGIME_COLOR[data.regime] ?? '#94a3b8') + '22',
                    color:    REGIME_COLOR[data.regime] ?? '#94a3b8',
                    fontWeight: 700,
                  }}
                />
                <Typography variant="caption" color="text.disabled" mt={1}>
                  Based on VIX vs 52-week range ({data.low_52w} – {data.high_52w})
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* VIX metrics */}
          <Grid item xs={12} md={4}>
            <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={2}>Volatility Indices</Typography>
                {[
                  { label: 'VIX (S&P 500 vol)',  value: data.vix,   desc: 'Expected 30-day vol of S&P 500' },
                  { label: 'VVIX (vol of VIX)',  value: data.vvix,  desc: 'Volatility of the VIX itself' },
                  { label: 'VXN (Nasdaq vol)',   value: data.vxn,   desc: 'Nasdaq 100 implied volatility' },
                  { label: 'VIX3M (3-month)',    value: data.vix3m, desc: '3-month S&P vol expectation' },
                ].map(({ label, value, desc }) => (
                  <Box key={label} mb={2}>
                    <Typography variant="caption" color="text.disabled">{label}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography
                        variant="h5" fontFamily="IBM Plex Mono, monospace" fontWeight={700}
                        sx={{ color: value && value > 25 ? '#F59E0B' : 'text.primary' }}
                      >
                        {value?.toFixed(2) ?? '—'}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.disabled">{desc}</Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>

          {/* 30-day sparkline */}
          <Grid item xs={12} md={4}>
            <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={2}>VIX — 30-Day Trend</Typography>
                {sparkData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={sparkData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <defs>
                        <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#F59E0B" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="i" hide />
                      <YAxis tick={{ fontSize: 10 }} width={32} domain={['auto', 'auto']} />
                      <ReferenceLine y={20} stroke="#F59E0B" strokeDasharray="3 3" />
                      <ReferenceLine y={30} stroke="#FF6B6B" strokeDasharray="3 3" />
                      <Tooltip
                        formatter={(v: number) => [v.toFixed(2), 'VIX']}
                        contentStyle={{ background: '#12161F', border: '1px solid #2D3548', fontSize: 11 }}
                      />
                      <Area type="monotone" dataKey="vix" stroke="#F59E0B" fill="url(#vixGrad)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>No sparkline data</Typography>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                  <Typography variant="caption" sx={{ color: '#F59E0B' }}>VIX 20 = Elevated</Typography>
                  <Typography variant="caption" sx={{ color: '#FF6B6B' }}>VIX 30 = Fear</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
