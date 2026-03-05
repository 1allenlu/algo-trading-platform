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
import type { AnalyticsSummary, PnlAttribution, RollingPoint } from '@/services/api'

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
          fontFamily="Roboto Mono, monospace"
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
          Rolling 20-Day Sharpe & Annualised Volatility
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
    { label: 'Ann. Volatility', value: `${(summary.annual_vol * 100).toFixed(1)}%`, positive: null },
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
                  fontFamily="Roboto Mono, monospace"
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [summary,  setSummary]  = useState<AnalyticsSummary | null>(null)
  const [pnl,      setPnl]      = useState<PnlAttribution[]>([])
  const [rolling,  setRolling]  = useState<RollingPoint[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

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
      label:    'CAGR',
      value:    summary.n_days >= 2 ? `${(summary.cagr * 100).toFixed(2)}%` : '—',
      sub:      'annualised',
      positive: summary.cagr >= 0,
    },
    {
      label:    'Sharpe Ratio',
      value:    summary.n_days >= 5 ? summary.sharpe_ratio.toFixed(2) : '—',
      positive: summary.sharpe_ratio >= 1 ? true : summary.sharpe_ratio >= 0 ? null : false,
    },
    {
      label:    'Sortino Ratio',
      value:    summary.n_days >= 5 ? summary.sortino_ratio.toFixed(2) : '—',
      positive: summary.sortino_ratio >= 1 ? true : summary.sortino_ratio >= 0 ? null : false,
    },
    {
      label:    'Max Drawdown',
      value:    `${(summary.max_drawdown * 100).toFixed(2)}%`,
      positive: summary.max_drawdown < 0.10 ? true : summary.max_drawdown < 0.20 ? null : false,
    },
    {
      label:    'Calmar Ratio',
      value:    summary.max_drawdown > 0 ? summary.calmar_ratio.toFixed(2) : '—',
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
    </Box>
  )
}
