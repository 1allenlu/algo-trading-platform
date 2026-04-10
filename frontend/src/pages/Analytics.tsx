/**
 * Analytics page — Phase 9.
 *
 * Deep-dive portfolio performance report from the paper trading account.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ KPI cards: Return · CAGR · Sharpe · Sortino · Max DD   │
 *   │            Vol · Calmar · Trades · Win Rate · P-Factor  │
 *   ├─────────────────────────────────────────────────────────┤
 *   │ Rolling Sharpe + Volatility line chart (Recharts)       │
 *   ├──────────────────────────┬──────────────────────────────┤
 *   │ P&L Attribution bar      │ Trade stats panel            │
 *   │ chart by symbol          │ Avg win/loss, profit factor  │
 *   ├──────────────────────────┴──────────────────────────────┤
 *   │ Export CSV button                                       │
 *   └─────────────────────────────────────────────────────────┘
 */

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  FileDownload as DownloadIcon,
  Refresh as RefreshIcon,
  Share as ShareIcon,
  TrendingDown,
  TrendingUp,
} from '@mui/icons-material'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { AnalyticsSummary, DailyPnlEntry, DrawdownAnalysis, FactorAttribution, PerformanceScorecard, PnlAttribution, RollingPoint, SectorExposureRow } from '@/services/api'
import { useMutation, useQuery } from '@tanstack/react-query'
import InfoTooltip from '@/components/common/InfoTooltip'
import EmptyState from '@/components/common/EmptyState'
import LastUpdated from '@/components/common/LastUpdated'
import { Insights as AnalyticsIcon } from '@mui/icons-material'
import AICommentary from '@/components/dashboard/AICommentary'

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:    string
  value:    string
  sub?:     string
  tooltip?: string
  positive?: boolean | null  // null = neutral
}

function KpiCard({ label, value, sub, tooltip, positive }: KpiCardProps) {
  const valueColor =
    positive === null || positive === undefined
      ? 'text.primary'
      : positive ? '#00C896' : '#FF6B6B'

  return (
    <Card>
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          {tooltip && <InfoTooltip text={tooltip} />}
        </Box>
        <Typography
          variant="h6"
          fontWeight={700}
          fontFamily="IBM Plex Mono, monospace"
          sx={{ color: valueColor, lineHeight: 1.2 }}
        >
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.disabled">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

// ── Rolling chart ─────────────────────────────────────────────────────────────

function RollingChart({ data }: { data: RollingPoint[] }) {
  if (data.length === 0) return null
  const fmtDate = (d: string) => d.slice(5)  // "MM-DD" from "YYYY-MM-DD"

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>
          How Has My Portfolio Performed Over Time?
        </Typography>
        <Typography variant="caption" color="text.disabled" display="block" mb={1}>
          Risk-adjusted return (blue) and daily price swings (yellow) — higher blue + lower yellow is ideal
        </Typography>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2330" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fill: '#9CA3AF', fontSize: 10 }}
              interval={Math.floor(data.length / 6)}
            />
            <YAxis yAxisId="sharpe" tick={{ fill: '#9CA3AF', fontSize: 10 }} width={40} />
            <YAxis yAxisId="vol" orientation="right" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#9CA3AF', fontSize: 10 }} width={44} />
            <RTooltip
              contentStyle={{ background: '#141820', border: '1px solid #2D3548', borderRadius: 8 }}
              labelStyle={{ color: '#9CA3AF', fontSize: 11 }}
              formatter={(v: number, name: string) =>
                name === 'Sharpe' ? [v.toFixed(2), name] : [`${(v * 100).toFixed(1)}%`, name]
              }
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine yAxisId="sharpe" y={0} stroke="#4B5563" strokeDasharray="4 4" />
            <Line yAxisId="sharpe" type="monotone" dataKey="rolling_sharpe" name="Sharpe" stroke="#4A9EFF" dot={false} strokeWidth={1.5} />
            <Line yAxisId="vol" type="monotone" dataKey="rolling_vol" name="Volatility" stroke="#F59E0B" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ── P&L Attribution chart ──────────────────────────────────────────────────────

function PnlAttributionChart({ data }: { data: PnlAttribution[] }) {
  if (data.length === 0) return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={1}>P&L by Symbol</Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
          No filled trades yet. Place orders on the Trading page.
        </Typography>
      </CardContent>
    </Card>
  )

  const chartData = data.map((d) => ({
    symbol:        d.symbol,
    realized:      d.realized_pnl,
    unrealized:    d.unrealized_pnl,
  }))

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>
          P&L Attribution by Symbol
        </Typography>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2330" />
            <XAxis dataKey="symbol" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} width={52} tickFormatter={(v) => `$${v.toFixed(0)}`} />
            <RTooltip
              contentStyle={{ background: '#141820', border: '1px solid #2D3548', borderRadius: 8 }}
              labelStyle={{ color: '#9CA3AF', fontSize: 11 }}
              formatter={(v: number, name: string) => [`$${v.toFixed(2)}`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#4B5563" />
            <Bar dataKey="realized" name="Realized P&L" stackId="a" radius={[0, 0, 0, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.symbol} fill={entry.realized >= 0 ? '#00C896' : '#FF6B6B'} />
              ))}
            </Bar>
            <Bar dataKey="unrealized" name="Unrealized P&L" stackId="b">
              {chartData.map((entry) => (
                <Cell key={entry.symbol} fill={entry.unrealized >= 0 ? '#4A9EFF' : '#F59E0B'} fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ── Trade Stats panel ─────────────────────────────────────────────────────────

function TradeStatsPanel({ summary }: { summary: AnalyticsSummary }) {
  const rows = [
    { label: 'Total Trades',    value: `${summary.n_trades}`,                   positive: null },
    { label: 'Win Rate',        value: `${(summary.win_rate * 100).toFixed(1)}%`,  positive: summary.win_rate >= 0.5 },
    { label: 'Avg Win',         value: `$${summary.avg_win.toFixed(2)}`,         positive: true },
    { label: 'Avg Loss',        value: `$${summary.avg_loss.toFixed(2)}`,        positive: false },
    { label: 'Profit Factor',   value: summary.profit_factor > 0 ? summary.profit_factor.toFixed(2) : '—', positive: summary.profit_factor >= 1 },
    { label: 'Yearly Price Swings', value: `${(summary.annual_vol * 100).toFixed(1)}%`, positive: null },
  ]

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>Trade Statistics</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rows.map(({ label, value, positive }) => (
            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary">{label}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {positive === true  && <TrendingUp sx={{ fontSize: 13, color: '#00C896' }} />}
                {positive === false && <TrendingDown sx={{ fontSize: 13, color: '#FF6B6B' }} />}
                <Typography
                  variant="body2"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight={700}
                  sx={{ color: positive === null ? 'text.primary' : positive ? '#00C896' : '#FF6B6B' }}
                >
                  {value}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Factor Attribution card — Phase 29 ────────────────────────────────────────

function FactorCard({ data }: { data: FactorAttribution }) {
  const metrics = [
    { label: 'Market Sensitivity (Beta)',  value: data.beta !== null ? data.beta.toFixed(3) : '—',          positive: null },
    { label: 'Extra Return vs Market',     value: data.alpha_ann !== null ? `${(data.alpha_ann * 100).toFixed(2)}%` : '—', positive: data.alpha_ann !== null ? data.alpha_ann >= 0 : null },
    { label: 'Market Correlation (R²)',    value: data.r_squared !== null ? data.r_squared.toFixed(3) : '—', positive: null },
    { label: 'Deviation from Benchmark',  value: data.tracking_error !== null ? `${(data.tracking_error * 100).toFixed(2)}%` : '—', positive: null },
    { label: 'Skill Score (Info Ratio)',   value: data.information_ratio !== null ? data.information_ratio.toFixed(3) : '—', positive: data.information_ratio !== null ? data.information_ratio >= 0 : null },
  ]

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>
          How Does My Portfolio Compare to the Market? (vs {data.benchmark_symbol})
        </Typography>
        <Grid container spacing={2}>
          {/* Factor KPIs */}
          <Grid item xs={12} sm={5}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {metrics.map(({ label, value, positive }) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography
                    variant="body2"
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight={700}
                    sx={{ color: positive === null ? 'text.primary' : positive ? '#00C896' : '#FF6B6B' }}
                  >
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Grid>

          {/* Brinson table */}
          <Grid item xs={12} sm={7}>
            {data.brinson.length > 0 ? (
              <>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Return contribution by stock — how much each holding helped or hurt
                </Typography>
                <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 340 }}>
                  <TableHead>
                    <TableRow>
                      {['Symbol', 'Sizing Effect', 'Stock Picking', 'Total Impact'].map((h) => (
                        <TableCell key={h} align="right" sx={{ fontSize: '0.7rem', color: 'text.secondary', py: 0.5 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.brinson.map((row) => (
                      <TableRow key={row.symbol}>
                        <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', py: 0.5 }}>{row.symbol}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.72rem', color: row.allocation_effect >= 0 ? '#00C896' : '#FF6B6B', py: 0.5 }}>
                          {row.allocation_effect >= 0 ? '+' : ''}{(row.allocation_effect * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.72rem', color: row.selection_effect >= 0 ? '#00C896' : '#FF6B6B', py: 0.5 }}>
                          {row.selection_effect >= 0 ? '+' : ''}{(row.selection_effect * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.72rem', fontWeight: 700, color: row.total_effect >= 0 ? '#00C896' : '#FF6B6B', py: 0.5 }}>
                          {row.total_effect >= 0 ? '+' : ''}{(row.total_effect * 100).toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </Box>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ pt: 2 }}>
                No trades to attribute yet.
              </Typography>
            )}
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

// ── Calendar Heatmap — Phase 45 ──────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function CalendarHeatmap({ data }: { data: DailyPnlEntry[] }) {
  if (data.length === 0) return null

  // Build a lookup: date-string → entry
  const byDate = new Map(data.map((d) => [d.date, d]))

  // Range for the colour scale
  const pnlVals = data.map((d) => d.pnl_pct)
  const maxAbs   = Math.max(0.001, ...pnlVals.map(Math.abs))

  const cellColor = (pnl: number | undefined): string => {
    if (pnl === undefined || pnl === 0) return 'rgba(156,163,175,0.12)'
    const intensity = Math.min(1, Math.abs(pnl) / maxAbs)
    return pnl > 0
      ? `rgba(0,200,150,${0.2 + 0.65 * intensity})`
      : `rgba(255,107,107,${0.2 + 0.65 * intensity})`
  }

  // Group entries by ISO week (Monday-based), covering last 26 weeks
  const today   = new Date()
  const weeks: { start: Date; days: (DailyPnlEntry | null)[] }[] = []

  // Find the most recent Sunday
  const endSunday = new Date(today)
  endSunday.setDate(today.getDate() - today.getDay())

  for (let w = 25; w >= 0; w--) {
    const weekStart = new Date(endSunday)
    weekStart.setDate(endSunday.getDate() - w * 7)
    const days: (DailyPnlEntry | null)[] = []
    for (let d = 0; d < 7; d++) {
      const day   = new Date(weekStart)
      day.setDate(weekStart.getDate() + d)
      const iso   = day.toISOString().slice(0, 10)
      days.push(byDate.get(iso) ?? null)
    }
    weeks.push({ start: weekStart, days })
  }

  // Month labels: collect first week index per month
  const monthLabels: { label: string; idx: number }[] = []
  let lastMonth = -1
  weeks.forEach((wk, idx) => {
    const m = wk.start.getMonth()
    if (m !== lastMonth) {
      monthLabels.push({
        label: wk.start.toLocaleString('en-US', { month: 'short' }),
        idx,
      })
      lastMonth = m
    }
  })

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>
          Daily P&L Heatmap (Last 6 Months)
        </Typography>

        {/* Month labels */}
        <Box sx={{ display: 'flex', gap: '1px', mb: 0.5, pl: '32px' }}>
          {weeks.map((_, i) => {
            const lbl = monthLabels.find((m) => m.idx === i)
            return (
              <Box key={i} sx={{ width: 13, flexShrink: 0 }}>
                {lbl && (
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
                    {lbl.label}
                  </Typography>
                )}
              </Box>
            )
          })}
        </Box>

        {/* Grid: rows = days of week, cols = calendar weeks */}
        <Box sx={{ display: 'flex', gap: '4px' }}>
          {/* Day-of-week labels */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '1px', pt: '1px' }}>
            {DAYS.map((d, i) => (
              <Box key={d} sx={{ height: 13, display: 'flex', alignItems: 'center' }}>
                {i % 2 === 1 && (
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', width: 28 }}>
                    {d}
                  </Typography>
                )}
                {i % 2 === 0 && <Box sx={{ width: 28 }} />}
              </Box>
            ))}
          </Box>

          {/* Week columns */}
          <Box sx={{ display: 'flex', gap: '2px' }}>
            {weeks.map((wk, wi) => (
              <Box key={wi} sx={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {wk.days.map((entry, di) => (
                  <Tooltip
                    key={di}
                    title={entry
                      ? `${entry.date}: ${entry.pnl_pct >= 0 ? '+' : ''}${(entry.pnl_pct * 100).toFixed(2)}%`
                      : ''}
                    placement="top"
                  >
                    <Box
                      sx={{
                        width: 13, height: 13,
                        borderRadius: '2px',
                        bgcolor: cellColor(entry?.pnl_pct),
                        cursor: entry ? 'default' : 'default',
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Legend */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5 }}>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>Less</Typography>
          {[0.1, 0.3, 0.6, 1.0].map((i) => (
            <Box key={i} sx={{ width: 13, height: 13, borderRadius: '2px',
              bgcolor: `rgba(0,200,150,${0.2 + 0.65 * i})` }} />
          ))}
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', mx: 1 }}>vs</Typography>
          {[0.1, 0.3, 0.6, 1.0].map((i) => (
            <Box key={i} sx={{ width: 13, height: 13, borderRadius: '2px',
              bgcolor: `rgba(255,107,107,${0.2 + 0.65 * i})` }} />
          ))}
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>More</Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [summary,     setSummary]     = useState<AnalyticsSummary | null>(null)
  const [pnl,         setPnl]         = useState<PnlAttribution[]>([])
  const [rolling,     setRolling]     = useState<RollingPoint[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Phase 29: factor attribution (separate query, fails silently if no data)
  const { data: attribution } = useQuery<FactorAttribution>({
    queryKey:  ['analytics', 'attribution'],
    queryFn:   () => api.attribution.get(),
    staleTime: 5 * 60_000,
    retry:     false,
  })

  // Phase 45: daily P&L for calendar heatmap
  const { data: dailyPnl = [] } = useQuery<DailyPnlEntry[]>({
    queryKey:  ['analytics', 'daily-pnl'],
    queryFn:   () => api.analytics.getDailyPnl(),
    staleTime: 5 * 60_000,
    retry:     false,
  })

  // Phase 51: drawdown recovery tracker
  const { data: drawdownData } = useQuery<DrawdownAnalysis>({
    queryKey:  ['analytics', 'drawdown'],
    queryFn:   () => api.drawdown.getAnalysis(),
  })

  // Phase 64: sector exposure of open positions
  const { data: sectorExposure = [] } = useQuery<SectorExposureRow[]>({
    queryKey:  ['analytics', 'sector-exposure'],
    queryFn:   () => api.analytics.getSectorExposure(),
    staleTime: 60_000,
    retry:     false,
  })

  // Phase 58: multi-period performance scorecard
  const { data: scorecard } = useQuery<PerformanceScorecard>({
    queryKey:  ['analytics', 'scorecard'],
    queryFn:   () => api.scorecard.get(),
    staleTime: 5 * 60_000,
    retry:     false,
  })

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, p, r] = await Promise.all([
        api.analytics.getSummary(),
        api.analytics.getPnlAttribution(),
        api.analytics.getRolling(),
      ])
      setSummary(s)
      setPnl(p)
      setRolling(r)
      setLastUpdated(new Date())
    } catch {
      setError('no_data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleExport = () => {
    // Open export URL directly — browser triggers file download
    window.open(
      `${import.meta.env.VITE_API_URL ?? ''}/api/analytics/export`,
      '_blank',
    )
  }

  // Phase 54: share portfolio snapshot
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const shareMutation = useMutation({
    mutationFn: () => api.share.create('Portfolio Snapshot'),
    onSuccess: (data) => setShareUrl(`${window.location.origin}/share/${data.token}`),
  })

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <CircularProgress />
    </Box>
  )

  if (error) return (
    <Box>
      <EmptyState
        icon={<AnalyticsIcon sx={{ fontSize: 56 }} />}
        title="No trading history yet"
        description="Your analytics will appear here once you've placed some paper trades. Head to the Trading page to get started."
        actionLabel="Go to Trading"
        onAction={() => window.location.href = '/trading'}
        hint="Or run: make ingest to load market data first"
      />
    </Box>
  )

  if (!summary) return null

  const kpis: KpiCardProps[] = [
    {
      label:    'Total Return',
      value:    `${summary.total_return >= 0 ? '+' : ''}${(summary.total_return * 100).toFixed(2)}%`,
      tooltip:  'How much your portfolio has grown (or shrunk) overall since you started trading.',
      positive: summary.total_return >= 0,
    },
    {
      label:    'Yearly Growth (CAGR)',
      value:    summary.n_days >= 2 ? `${(summary.cagr * 100).toFixed(2)}%` : '—',
      sub:      'annualised return rate',
      tooltip:  'Your average yearly return if the growth had been steady. Useful for comparing against benchmarks like the S&P 500.',
      positive: summary.cagr >= 0,
    },
    {
      label:    'Risk-Adjusted Return',
      value:    summary.n_days >= 5 ? summary.sharpe_ratio.toFixed(2) : '—',
      sub:      'Sharpe Ratio — higher is better',
      tooltip:  'Return earned per unit of risk taken. Above 1.0 is good, above 2.0 is excellent. A high number means you\'re getting rewarded well for the risk.',
      positive: summary.sharpe_ratio >= 1 ? true : summary.sharpe_ratio >= 0 ? null : false,
    },
    {
      label:    'Downside Risk Score',
      value:    summary.n_days >= 5 ? summary.sortino_ratio.toFixed(2) : '—',
      sub:      'Sortino — penalises losing days only',
      tooltip:  'Like the Risk-Adjusted Return but only counts bad days as "risk." Higher is better. Rewards strategies that have big wins but small losses.',
      positive: summary.sortino_ratio >= 1 ? true : summary.sortino_ratio >= 0 ? null : false,
    },
    {
      label:    'Biggest Drop',
      value:    `${(summary.max_drawdown * 100).toFixed(2)}%`,
      sub:      'Max Drawdown — peak-to-trough loss',
      tooltip:  'The largest peak-to-trough loss your portfolio experienced. Under 10% is great, over 20% means you took on significant risk.',
      positive: summary.max_drawdown < 0.10 ? true : summary.max_drawdown < 0.20 ? null : false,
    },
    {
      label:    'Recovery Score',
      value:    summary.max_drawdown > 0 ? summary.calmar_ratio.toFixed(2) : '—',
      sub:      'Calmar — return vs biggest drop',
      tooltip:  'Your yearly return divided by your biggest drop. Above 1.0 means you earned more than you lost at your worst point.',
      positive: summary.calmar_ratio >= 1 ? true : null,
    },
    {
      label:    'Portfolio Value',
      value:    `$${summary.equity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      sub:      'current paper value',
      tooltip:  'Current total value of your paper trading account including open positions.',
      positive: summary.equity >= summary.starting_cash ? true : false,
    },
    {
      label:    'Trading Days',
      value:    `${summary.n_days}`,
      tooltip:  'Number of days your paper trading account has been active.',
      positive: null,
    },
  ]

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Portfolio Analytics</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.25 }}>
            <Typography variant="body2" color="text.secondary">
              Performance report for your paper trading account
            </Typography>
            <LastUpdated timestamp={lastUpdated} loading={loading} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Download filled trades as CSV">
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}>
              Export CSV
            </Button>
          </Tooltip>
          <Tooltip title="Generate public share link (expires in 7 days)">
            <Button
              size="small" variant="outlined" startIcon={shareMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <ShareIcon />}
              onClick={() => { setShareUrl(null); shareMutation.mutate() }}
              disabled={shareMutation.isPending}
            >
              Share
            </Button>
          </Tooltip>
          <Button size="small" startIcon={<RefreshIcon />} onClick={load}>
            Refresh
          </Button>
        </Box>
      </Box>

      {/* AI Commentary — Phase 43 */}
      <AICommentary />

      {/* Phase 54: share link toast */}
      {shareUrl && (
        <Alert
          severity="success"
          onClose={() => setShareUrl(null)}
          sx={{ mb: 2 }}
          action={
            <Button
              size="small" color="inherit"
              onClick={() => { navigator.clipboard.writeText(shareUrl) }}
            >
              Copy
            </Button>
          }
        >
          Share link created (expires in 7 days): <strong>{shareUrl}</strong>
        </Alert>
      )}

      {/* KPI row */}
      <Grid container spacing={2} mb={3}>
        {kpis.map((kpi) => (
          <Grid item xs={6} sm={4} md={3} key={kpi.label}>
            <KpiCard {...kpi} />
          </Grid>
        ))}
      </Grid>

      {/* Rolling chart */}
      <Box mb={3}>
        <RollingChart data={rolling} />
      </Box>

      {/* Calendar heatmap — Phase 45 */}
      {dailyPnl.length > 0 && (
        <Box mb={3}>
          <CalendarHeatmap data={dailyPnl} />
        </Box>
      )}

      {/* P&L attribution + trade stats */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={7}>
          <PnlAttributionChart data={pnl} />
        </Grid>
        <Grid item xs={12} md={5}>
          <TradeStatsPanel summary={summary} />
        </Grid>
      </Grid>

      {/* Factor Attribution — Phase 29 */}
      {attribution && attribution.beta !== null && (
        <Box mb={3}>
          <FactorCard data={attribution} />
        </Box>
      )}

      {/* Drawdown Recovery Tracker — Phase 51 */}
      {drawdownData && drawdownData.underwater.length > 1 && (
        <Box mb={3}>
          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                Drawdown Recovery Tracker
              </Typography>
              {/* KPIs */}
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 2 }}>
                {[
                  { label: 'Current Drawdown', value: `${(drawdownData.current_dd_pct * 100).toFixed(2)}%`, color: drawdownData.current_dd_pct < 0 ? '#FF6B6B' : '#00C896' },
                  { label: 'Dollar Drawdown',  value: `$${drawdownData.current_drawdown.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: '#FF6B6B' },
                  { label: 'Duration',          value: `${drawdownData.drawdown_duration} days`, color: 'text.primary' },
                  { label: 'Peak Equity',       value: `$${drawdownData.peak_equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: 'text.primary' },
                  { label: 'Est. Recovery',     value: drawdownData.recovery_days_est ? `~${drawdownData.recovery_days_est} days` : 'N/A', color: '#F59E0B' },
                ].map(({ label, value, color }) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.disabled" display="block">{label.toUpperCase()}</Typography>
                    <Typography variant="body1" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color }}>{value}</Typography>
                  </Box>
                ))}
              </Box>
              {/* Underwater equity area chart */}
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={drawdownData.underwater}>
                  <defs>
                    <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#FF6B6B" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#FF6B6B" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2330" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false}
                    interval={Math.max(0, Math.floor(drawdownData.underwater.length / 6) - 1)} />
                  <YAxis tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} domain={['auto', 0]} />
                  <ReferenceLine y={0} stroke="#2D3548" strokeDasharray="4 4" />
                  <RTooltip contentStyle={{ background: '#12161F', border: '1px solid #2D3548', borderRadius: 8 }}
                    formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, 'Drawdown']} />
                  <Area type="monotone" dataKey="dd_pct" stroke="#FF6B6B" strokeWidth={1.5}
                    fill="url(#ddGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Phase 64: Sector Exposure donut chart */}
      {sectorExposure.length > 0 && (() => {
        const SECTOR_COLORS = ['#4A9EFF','#A78BFA','#00C896','#F59E0B','#FF6B6B','#34D399','#F97316','#EAB308','#60A5FA','#E879F9','#FB923C']
        // Aggregate by sector
        const bySector = sectorExposure.reduce<Record<string, number>>((acc, row) => {
          acc[row.sector] = (acc[row.sector] ?? 0) + row.value
          return acc
        }, {})
        const pieData = Object.entries(bySector).map(([name, value]) => ({ name, value }))
        const total   = pieData.reduce((s, d) => s + d.value, 0)
        return (
          <Box mt={4}>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>Sector Exposure — Open Positions</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={5}>
                <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90}>
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                          ))}
                        </Pie>
                        <RTooltip
                          formatter={(v: number, name: string) => [`${((v / total) * 100).toFixed(1)}% ($${v.toFixed(0)})`, name]}
                          contentStyle={{ background: '#12161F', border: '1px solid #2D3548', fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={7}>
                <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
                  <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          {['Symbol', 'Sector', 'Value', 'Weight'].map((h) => (
                            <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sectorExposure.map((row) => (
                          <TableRow key={row.symbol} hover>
                            <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main', fontSize: '0.8rem' }}>{row.symbol}</TableCell>
                            <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{row.sector}</TableCell>
                            <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>${row.value.toFixed(0)}</TableCell>
                            <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>{row.weight_pct.toFixed(1)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        )
      })()}

      {/* Phase 58: Multi-period performance scorecard */}
      {scorecard && scorecard.periods.length > 0 && (
        <Box mt={4}>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>
            Performance Scorecard — Portfolio vs SPY
          </Typography>
          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Period', 'Portfolio', 'SPY', 'Alpha', 'vs Benchmark'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {scorecard.periods.map((p) => {
                    const fmtRet = (v: number | null) =>
                      v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
                    return (
                      <TableRow key={p.period} hover>
                        <TableCell sx={{ fontWeight: 700 }}>{p.period}</TableCell>
                        <TableCell sx={{
                          fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', fontWeight: 700,
                          color: (p.portfolio_ret ?? 0) >= 0 ? '#00C896' : '#FF6B6B',
                        }}>
                          {fmtRet(p.portfolio_ret)}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                          {fmtRet(p.spy_ret)}
                        </TableCell>
                        <TableCell sx={{
                          fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', fontWeight: 700,
                          color: (p.alpha ?? 0) >= 0 ? '#00C896' : '#FF6B6B',
                        }}>
                          {fmtRet(p.alpha)}
                        </TableCell>
                        <TableCell>
                          <Tooltip title={p.outperforms ? 'Outperforms SPY' : 'Underperforms SPY'}>
                            <Typography
                              variant="caption"
                              sx={{
                                px: 1, py: 0.25, borderRadius: 1,
                                bgcolor: p.outperforms ? 'rgba(0,200,150,0.12)' : 'rgba(255,107,107,0.12)',
                                color:   p.outperforms ? '#00C896' : '#FF6B6B',
                                fontWeight: 700,
                              }}
                            >
                              {p.outperforms ? '▲ Alpha' : '▼ Lag'}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  )
}
