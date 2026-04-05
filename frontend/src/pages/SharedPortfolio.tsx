/**
 * Shared Portfolio — Phase 54.
 *
 * Public read-only view of a portfolio snapshot.  Accessed via
 * /share/:token — no authentication required.
 *
 * Shows: equity curve, open positions table, and key stats.
 */

import { useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Lock as LockIcon, ShowChart as ChartIcon } from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, type PortfolioSnapshot } from '@/services/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtPct(n: number | string | null) {
  if (n === null || n === undefined) return '—'
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function pnlColor(n: number) {
  if (n > 0) return '#00C896'
  if (n < 0) return '#FF6B6B'
  return 'inherit'
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: Record<string, number | string | null> }) {
  const items = [
    { label: 'Total Return', value: fmtPct(stats.total_return_pct as number) },
    { label: 'Sharpe Ratio', value: (stats.sharpe_ratio as number)?.toFixed(3) ?? '—' },
    { label: 'Max Drawdown', value: fmtPct(stats.max_drawdown_pct as number) },
    { label: 'Total Trades', value: String(stats.total_trades ?? '—') },
    { label: 'Win Rate',     value: fmtPct(stats.win_rate_pct as number) },
  ]

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {items.map(({ label, value }) => (
            <Box key={label}>
              <Typography variant="caption" color="text.disabled" display="block">{label.toUpperCase()}</Typography>
              <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace">
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Equity curve ──────────────────────────────────────────────────────────────

function EquityCurve({ curve }: { curve: { date: string; equity: number }[] }) {
  if (!curve.length) return null

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={curve} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#4A9EFF" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#4A9EFF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          width={56}
        />
        <Tooltip
          formatter={(v: number) => [fmt$(v), 'Equity']}
          labelStyle={{ color: '#aaa', fontSize: 11 }}
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', fontSize: 12 }}
        />
        <Area
          type="monotone" dataKey="equity" stroke="#4A9EFF"
          fill="url(#eqGrad)" strokeWidth={2} dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Positions table ───────────────────────────────────────────────────────────

function PositionsTable({ positions }: { positions: PortfolioSnapshot['positions'] }) {
  if (!positions.length) return (
    <Typography variant="body2" color="text.secondary" py={2} textAlign="center">
      No open positions at snapshot time.
    </Typography>
  )

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Symbol', 'Qty', 'Avg Price'].map((h) => (
              <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {positions.map((p, i) => (
            <TableRow key={i} hover>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                {p.symbol}
              </TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>{p.qty}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                ${p.avg_price.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SharedPortfolioPage() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, error } = useQuery({
    queryKey:  ['share', token],
    queryFn:   () => api.share.get(token!),
    enabled:   !!token,
    retry:     1,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
        <ChartIcon sx={{ fontSize: 28, color: '#4A9EFF' }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {data?.title ?? 'Portfolio Snapshot'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              icon={<LockIcon sx={{ fontSize: 12 }} />}
              label="Read-only snapshot"
              sx={{ fontSize: '0.68rem', height: 20 }}
            />
            {data?.created_at && (
              <Typography variant="caption" color="text.secondary">
                Created {new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </Typography>
            )}
            {data?.expires_at && (
              <Typography variant="caption" color="text.disabled">
                · Expires {new Date(data.expires_at).toLocaleDateString()}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error">
          This snapshot was not found or has expired. Ask the owner to share a new link.
        </Alert>
      )}

      {data && (
        <>
          <StatsStrip stats={data.stats} />

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={2}>Portfolio Equity</Typography>
                  <EquityCurve curve={data.equity_curve} />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={2}>
                    Open Positions ({data.positions.length})
                  </Typography>
                  <PositionsTable positions={data.positions} />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={2}>All Stats</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    {Object.entries(data.stats).map(([k, v]) => (
                      <Box key={k}>
                        <Typography variant="caption" color="text.disabled" display="block">
                          {k.replace(/_/g, ' ').toUpperCase()}
                        </Typography>
                        <Typography
                          variant="body2"
                          fontFamily="IBM Plex Mono, monospace"
                          fontWeight={600}
                          sx={{ color: typeof v === 'number' ? pnlColor(v) : 'text.primary' }}
                        >
                          {v === null ? '—' : String(typeof v === 'number' ? v.toFixed(4) : v)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Typography variant="caption" color="text.disabled" display="block" mt={4} textAlign="center">
            Generated by QuantStream · Paper trading simulation only · Not financial advice
          </Typography>
        </>
      )}
    </Box>
  )
}
