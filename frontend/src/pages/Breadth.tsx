/**
 * Market Breadth Dashboard — Phase 74.
 *
 * Aggregate breadth metrics derived from ~35 major equities and
 * the 11 SPDR sector ETFs:
 *   • Advance / Decline ratio
 *   • % trading above SMA-50 / SMA-200
 *   • 52-week new highs / new lows count
 *   • RSI distribution (overbought / neutral / oversold)
 *   • Sector ETF heatmap — 1d / 5d / 1mo returns
 *
 * Data cached 30 min server-side.
 */

import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  IconButton, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material'
import { Refresh as RefreshIcon } from '@mui/icons-material'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { api, type BreadthSnapshot } from '@/services/api'

// ── Colour helpers ─────────────────────────────────────────────────────────────

function retColor(v: number | null) {
  if (v == null) return 'text.secondary'
  if (v > 0) return '#00C896'
  if (v < 0) return '#FF6B6B'
  return 'text.secondary'
}

function rsiColor(v: number | null) {
  if (v == null) return 'text.secondary'
  if (v >= 70) return '#FF6B6B'
  if (v <= 30) return '#00C896'
  return 'text.primary'
}

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiBox({ label, value, color = 'text.primary' }: { label: string; value: string | number; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.disabled" display="block">{label}</Typography>
      <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color }}>
        {value}
      </Typography>
    </Box>
  )
}

// ── Sector table ───────────────────────────────────────────────────────────────

function SectorTable({ data }: { data: BreadthSnapshot['sectors'] }) {
  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Sector', 'ETF', '1d', '5d', '1mo', 'vs SMA-50', 'RSI'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.symbol} hover>
                  <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{row.name}</TableCell>
                  <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', color: 'primary.main' }}>
                    {row.symbol}
                  </TableCell>
                  {([row.ret_1d, row.ret_5d, row.ret_1mo, row.vs_sma50] as (number | null)[]).map((v, i) => (
                    <TableCell key={i} sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem', color: retColor(v) }}>
                      {fmtPct(v)}
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem', color: rsiColor(row.rsi) }}>
                    {row.rsi ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BreadthPage() {
  const { data, isLoading, error, refetch } = useQuery<BreadthSnapshot>({
    queryKey:  ['breadth'],
    queryFn:   () => api.breadth.getSnapshot(),
    staleTime: 30 * 60_000,
    retry: 1,
  })

  const adData = data ? [
    { name: 'Advance',   value: data.advance,   fill: '#00C896' },
    { name: 'Decline',   value: data.decline,   fill: '#FF6B6B' },
    { name: 'Unchanged', value: data.unchanged,  fill: '#4A9EFF' },
  ] : []

  const rsiData = data ? [
    { name: 'Overbought (≥70)', value: data.rsi_overbought, fill: '#FF6B6B' },
    { name: 'Neutral',          value: data.rsi_neutral,    fill: '#4A9EFF' },
    { name: 'Oversold (≤30)',   value: data.rsi_oversold,   fill: '#00C896' },
  ] : []

  const smaData = data ? [
    { name: '> SMA-50',  pct: data.pct_above_sma50  },
    { name: '> SMA-200', pct: data.pct_above_sma200 },
  ] : []

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Market Breadth</Typography>
          <Typography variant="body2" color="text.secondary">
            Advance/Decline, SMA position, RSI distribution & sector heatmap.
            Universe: ~35 major equities + 11 SPDR sector ETFs. Cached 30 min.
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={() => refetch()} size="small"><RefreshIcon sx={{ fontSize: 18 }} /></IconButton>
        </Tooltip>
      </Box>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">Failed to load breadth data.</Alert>}

      {data && (
        <>
          {/* KPI row */}
          <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <KpiBox label="A/D RATIO" value={data.adv_dec_ratio}
                  color={data.adv_dec_ratio >= 1 ? '#00C896' : '#FF6B6B'} />
                <KpiBox label="ADVANCE" value={data.advance} color="#00C896" />
                <KpiBox label="DECLINE"  value={data.decline}  color="#FF6B6B" />
                <KpiBox label="% > SMA-50"  value={`${data.pct_above_sma50}%`}
                  color={data.pct_above_sma50 >= 50 ? '#00C896' : '#FF6B6B'} />
                <KpiBox label="% > SMA-200" value={`${data.pct_above_sma200}%`}
                  color={data.pct_above_sma200 >= 50 ? '#00C896' : '#FF6B6B'} />
                <KpiBox label="52W HIGHS" value={data.new_highs} color="#00C896" />
                <KpiBox label="52W LOWS"  value={data.new_lows}  color="#FF6B6B" />
                <KpiBox label="AVG RSI"   value={data.avg_rsi}
                  color={data.avg_rsi >= 70 ? '#FF6B6B' : data.avg_rsi <= 30 ? '#00C896' : 'text.primary'} />
              </Box>
            </CardContent>
          </Card>

          {/* Charts row */}
          <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
            {/* Advance/Decline pie */}
            <Card sx={{ border: '1px solid', borderColor: 'divider', flex: 1, minWidth: 240 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>Advance / Decline</Typography>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={adData} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {adData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <RTooltip contentStyle={{ background: '#12161F', border: '1px solid #2D3548', fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* RSI distribution pie */}
            <Card sx={{ border: '1px solid', borderColor: 'divider', flex: 1, minWidth: 240 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>RSI Distribution</Typography>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={rsiData} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {rsiData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <RTooltip contentStyle={{ background: '#12161F', border: '1px solid #2D3548', fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* % Above SMA bars */}
            <Card sx={{ border: '1px solid', borderColor: 'divider', flex: 1, minWidth: 240 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>% Above Moving Average</Typography>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={smaData} layout="vertical" margin={{ left: 20, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={64} />
                    <RTooltip formatter={(v: number) => [`${v}%`, '% of universe']} contentStyle={{ background: '#12161F', border: '1px solid #2D3548', fontSize: 11 }} />
                    <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                      {smaData.map((d, i) => (
                        <Cell key={i} fill={d.pct >= 50 ? '#00C896' : '#FF6B6B'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Box>

          {/* Sector heatmap */}
          <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Sector Heatmap</Typography>
          <SectorTable data={data.sectors} />
        </>
      )}
    </Box>
  )
}
