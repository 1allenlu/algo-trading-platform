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
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  FileDownload as DownloadIcon,
  Refresh as RefreshIcon,
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
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { AnalyticsSummary, FactorAttribution, PnlAttribution, RollingPoint } from '@/services/api'
import { useQuery } from '@tanstack/react-query'

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:    string
  value:    string
  sub?:     string
  positive?: boolean | null  // null = neutral
}

function KpiCard({ label, value, sub, positive }: KpiCardProps) {
  const valueColor =
    positive === null || positive === undefined
      ? 'text.primary'
      : positive ? '#00C896' : '#FF6B6B'

  return (
    <Card>
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
          {label}
        </Typography>
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
                <Table size="small">
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [summary,  setSummary]  = useState<AnalyticsSummary | null>(null)
  const [pnl,      setPnl]      = useState<PnlAttribution[]>([])
  const [rolling,  setRolling]  = useState<RollingPoint[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  // Phase 29: factor attribution (separate query, fails silently if no data)
  const { data: attribution } = useQuery<FactorAttribution>({
    queryKey:  ['analytics', 'attribution'],
    queryFn:   () => api.attribution.get(),
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
    } catch {
      setError('Failed to load analytics. Make sure the backend is running and paper trading has history.')
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

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <CircularProgress />
    </Box>
  )

  if (error) return (
    <Box>
      <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>
      <Button onClick={load} startIcon={<RefreshIcon />}>Retry</Button>
    </Box>
  )

  if (!summary) return null

  const kpis: KpiCardProps[] = [
    {
      label:    'Total Return',
      value:    `${summary.total_return >= 0 ? '+' : ''}${(summary.total_return * 100).toFixed(2)}%`,
      positive: summary.total_return >= 0,
    },
    {
      label:    'Yearly Growth (CAGR)',
      value:    summary.n_days >= 2 ? `${(summary.cagr * 100).toFixed(2)}%` : '—',
      sub:      'annualised return rate',
      positive: summary.cagr >= 0,
    },
    {
      label:    'Risk-Adjusted Return',
      value:    summary.n_days >= 5 ? summary.sharpe_ratio.toFixed(2) : '—',
      sub:      'Sharpe Ratio — higher is better',
      positive: summary.sharpe_ratio >= 1 ? true : summary.sharpe_ratio >= 0 ? null : false,
    },
    {
      label:    'Downside Risk Score',
      value:    summary.n_days >= 5 ? summary.sortino_ratio.toFixed(2) : '—',
      sub:      'Sortino — penalises losing days only',
      positive: summary.sortino_ratio >= 1 ? true : summary.sortino_ratio >= 0 ? null : false,
    },
    {
      label:    'Biggest Drop',
      value:    `${(summary.max_drawdown * 100).toFixed(2)}%`,
      sub:      'Max Drawdown — peak-to-trough loss',
      positive: summary.max_drawdown < 0.10 ? true : summary.max_drawdown < 0.20 ? null : false,
    },
    {
      label:    'Recovery Score',
      value:    summary.max_drawdown > 0 ? summary.calmar_ratio.toFixed(2) : '—',
      sub:      'Calmar — return vs biggest drop',
      positive: summary.calmar_ratio >= 1 ? true : null,
    },
    {
      label:    'Equity',
      value:    `$${summary.equity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      sub:      'current paper value',
      positive: summary.equity >= summary.starting_cash ? true : false,
    },
    {
      label:    'Trading Days',
      value:    `${summary.n_days}`,
      positive: null,
    },
  ]

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Portfolio Analytics</Typography>
          <Typography variant="body2" color="text.secondary">
            Performance report for your paper trading account
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Download filled trades as CSV">
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}>
              Export CSV
            </Button>
          </Tooltip>
          <Button size="small" startIcon={<RefreshIcon />} onClick={load}>
            Refresh
          </Button>
        </Box>
      </Box>

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
    </Box>
  )
}
