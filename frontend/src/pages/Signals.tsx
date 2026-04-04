/**
 * Signals Page — Phase 22.
 *
 * Displays the live composite BUY / HOLD / SELL signal for every tracked
 * symbol in a colour-coded table. Auto-refreshes every 30 seconds.
 *
 * Enhancements:
 *   - Expandable "Why?" rows explaining the signal reasoning
 *   - LinearProgress confidence bar
 *   - "Trade This" button with confirmation dialog
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Snackbar,
  Alert,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  ShoppingCart as TradeIcon,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, SignalRow, MultiTFRow, KellyRow } from '@/services/api'
import { CHART_COLORS } from '@/theme'

const REFRESH_INTERVAL_MS = 30_000

// ── Colour helpers ─────────────────────────────────────────────────────────────

function signalColor(signal: string): string {
  if (signal === 'buy')  return CHART_COLORS.positive
  if (signal === 'sell') return CHART_COLORS.negative
  return CHART_COLORS.textMuted
}

function signalBg(signal: string): string {
  if (signal === 'buy')  return 'rgba(0,200,150,0.12)'
  if (signal === 'sell') return 'rgba(255,107,107,0.12)'
  return 'rgba(156,163,175,0.08)'
}

function rsiColor(rsiSignal: string): string {
  if (rsiSignal === 'oversold')   return CHART_COLORS.positive
  if (rsiSignal === 'overbought') return CHART_COLORS.negative
  return CHART_COLORS.textMuted
}

/** Human-readable explanation of what drove the signal. */
function buildExplanation(row: SignalRow): { factor: string; detail: string; positive: boolean }[] {
  const items: { factor: string; detail: string; positive: boolean }[] = []

  // ML model direction
  if (row.ml_direction !== 'none') {
    const up = row.ml_direction === 'up'
    items.push({
      factor:   'ML Model',
      detail:   `Predicts price going ${up ? 'UP' : 'DOWN'} with ${(row.ml_confidence * 100).toFixed(0)}% confidence`,
      positive: up,
    })
  }

  // RSI
  if (row.rsi != null && row.rsi_signal !== 'neutral') {
    const oversold = row.rsi_signal === 'oversold'
    items.push({
      factor:   'RSI',
      detail:   oversold
        ? `RSI ${row.rsi.toFixed(1)} — stock looks oversold (potentially undervalued)`
        : `RSI ${row.rsi.toFixed(1)} — stock looks overbought (potentially overvalued)`,
      positive: oversold,
    })
  } else if (row.rsi != null) {
    items.push({
      factor:   'RSI',
      detail:   `RSI ${row.rsi.toFixed(1)} — neutral range, no strong signal`,
      positive: true,
    })
  }

  // Sentiment
  if (row.sentiment_score != null) {
    const bull = row.sentiment_label === 'bullish'
    const bear = row.sentiment_label === 'bearish'
    items.push({
      factor:   'News Sentiment',
      detail:   bull
        ? `Recent news is ${bull ? 'positive' : 'negative'} (score ${row.sentiment_score.toFixed(2)})`
        : bear
        ? `Recent news is negative (score ${row.sentiment_score.toFixed(2)})`
        : `News sentiment is neutral (score ${row.sentiment_score.toFixed(2)})`,
      positive: bull,
    })
  }

  // Overall confidence
  items.push({
    factor:   'Overall Confidence',
    detail:   `Combined signal strength: ${(row.confidence * 100).toFixed(0)}%`,
    positive: row.composite === 'buy',
  })

  return items
}

// ── Summary chips ─────────────────────────────────────────────────────────────

function SummaryBar({ rows }: { rows: SignalRow[] }) {
  const buy  = rows.filter((r) => r.composite === 'buy').length
  const sell = rows.filter((r) => r.composite === 'sell').length
  const hold = rows.filter((r) => r.composite === 'hold').length

  return (
    <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
      <Chip
        label={`${buy} BUY`}
        sx={{ bgcolor: 'rgba(0,200,150,0.15)', color: CHART_COLORS.positive,
              fontWeight: 700, fontSize: '0.85rem', px: 1 }}
      />
      <Chip
        label={`${hold} HOLD`}
        sx={{ bgcolor: 'rgba(156,163,175,0.12)', color: CHART_COLORS.textMuted,
              fontWeight: 700, fontSize: '0.85rem', px: 1 }}
      />
      <Chip
        label={`${sell} SELL`}
        sx={{ bgcolor: 'rgba(255,107,107,0.15)', color: CHART_COLORS.negative,
              fontWeight: 700, fontSize: '0.85rem', px: 1 }}
      />
    </Stack>
  )
}

// ── "Why?" expandable detail row ──────────────────────────────────────────────

function WhyRow({ row }: { row: SignalRow }) {
  const items = buildExplanation(row)

  return (
    <TableRow>
      <TableCell colSpan={9} sx={{ py: 0, bgcolor: 'rgba(74,158,255,0.03)', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Signal breakdown for {row.symbol}
          </Typography>
          <Stack spacing={0.75}>
            {items.map((item) => (
              <Box key={item.factor} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{
                  width: 6, height: 6, borderRadius: '50%', mt: '5px', flexShrink: 0,
                  bgcolor: item.positive ? '#00C896' : '#FF6B6B',
                }} />
                <Box>
                  <Typography variant="caption" fontWeight={700} color="text.primary">
                    {item.factor}:
                  </Typography>{' '}
                  <Typography variant="caption" color="text.secondary">
                    {item.detail}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      </TableCell>
    </TableRow>
  )
}

// ── Trade This dialog ─────────────────────────────────────────────────────────

interface TradeDialogProps {
  row:     SignalRow | null
  onClose: () => void
  onDone:  (msg: string, err?: boolean) => void
}

function TradeDialog({ row, onClose, onDone }: TradeDialogProps) {
  const [qty,      setQty]      = useState('10')
  const [loading,  setLoading]  = useState(false)

  if (!row) return null

  const side       = row.composite === 'sell' ? 'sell' : 'buy'
  const color      = side === 'buy' ? '#00C896' : '#FF6B6B'
  const estValue   = parseFloat(qty) * (row.last_price ?? 0)

  const handleSubmit = async () => {
    const q = parseInt(qty, 10)
    if (!q || q <= 0) return
    setLoading(true)
    try {
      await api.paper.submitOrder({ symbol: row.symbol, side, qty: q, order_type: 'market' })
      onDone(`${side.toUpperCase()} ${q} × ${row.symbol} submitted`)
      onClose()
    } catch (err: unknown) {
      onDone(err instanceof Error ? err.message : 'Order failed', true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: signalBg(row.composite), color, fontWeight: 700, fontSize: '0.85rem' }}>
            {side.toUpperCase()}
          </Box>
          {row.symbol}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          AI signal: <strong style={{ color }}>{row.composite.toUpperCase()}</strong> at {(row.confidence * 100).toFixed(0)}% confidence.
          {row.last_price ? ` Current price: $${row.last_price.toFixed(2)}.` : ''}
        </Typography>
        <TextField
          label="Quantity (shares)"
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          fullWidth
          inputProps={{ min: 1, step: 1 }}
          size="small"
        />
        {row.last_price && parseFloat(qty) > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Estimated value: ${estValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </Typography>
        )}
        <Typography variant="caption" color="text.disabled" sx={{ mt: 1.5, display: 'block' }}>
          This is a paper trade — no real money is involved.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || !qty || parseInt(qty) <= 0}
          sx={{ bgcolor: color, '&:hover': { bgcolor: color, filter: 'brightness(1.1)' } }}
        >
          {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : `${side.toUpperCase()} ${qty} shares`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Multi-timeframe alignment panel ──────────────────────────────────────────

function tfColor(signal: string) {
  if (signal === 'buy')  return '#00C896'
  if (signal === 'sell') return '#FF6B6B'
  return '#9CA3AF'
}

function TFBadge({ signal }: { signal: string | null }) {
  if (!signal) return <Typography variant="caption" color="text.disabled">—</Typography>
  return (
    <Box sx={{
      display: 'inline-flex', px: 1, py: 0.2, borderRadius: 1,
      bgcolor: signal === 'buy' ? 'rgba(0,200,150,0.12)' : signal === 'sell' ? 'rgba(255,107,107,0.12)' : 'rgba(156,163,175,0.08)',
      color: tfColor(signal), fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase',
    }}>
      {signal}
    </Box>
  )
}

function strengthLabel(strength: string): { text: string; color: string } {
  switch (strength) {
    case 'strong_buy':     return { text: 'Strong Buy',     color: '#00C896' }
    case 'strong_sell':    return { text: 'Strong Sell',    color: '#FF6B6B' }
    case 'mostly_bullish': return { text: 'Mostly Bullish', color: '#34D399' }
    case 'mostly_bearish': return { text: 'Mostly Bearish', color: '#F87171' }
    default:               return { text: 'Mixed',          color: '#9CA3AF' }
  }
}

function MultiTimeframePanel() {
  const { data: rows, isLoading, refetch } = useQuery<MultiTFRow[]>({
    queryKey:  ['multi-timeframe'],
    queryFn:   api.signals.getMultiTimeframe,
    staleTime: 60_000,
    retry:     false,
  })

  return (
    <Card sx={{ mt: 3, border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>Multi-Timeframe Alignment</Typography>
            <Typography variant="caption" color="text.secondary">
              Daily = full AI signal · Weekly &amp; Monthly = technical trend. Strong signals agree across all three timeframes.
            </Typography>
          </Box>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => refetch()} disabled={isLoading}>
              {isLoading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 520 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                {['Symbol', 'Daily', 'Weekly', 'Monthly', 'Alignment'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}><CircularProgress size={22} /></TableCell></TableRow>
              ) : (rows ?? []).map((row: MultiTFRow) => {
                const { text, color } = strengthLabel(row.strength)
                return (
                  <TableRow key={row.symbol} hover>
                    <TableCell sx={{ fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: 'primary.main', fontSize: '0.82rem' }}>
                      {row.symbol}
                    </TableCell>
                    <TableCell><TFBadge signal={row.daily.signal} /></TableCell>
                    <TableCell><TFBadge signal={row.weekly?.signal ?? null} /></TableCell>
                    <TableCell><TFBadge signal={row.monthly?.signal ?? null} /></TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ color, fontWeight: 600 }}>{text}</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  )
}

// ── Kelly criterion panel ─────────────────────────────────────────────────────

function KellyPanel({ accountEquity }: { accountEquity: number }) {
  const { data: rows, isLoading } = useQuery<KellyRow[]>({
    queryKey:  ['kelly'],
    queryFn:   api.signals.getKelly,
    staleTime: 120_000,
    retry:     false,
  })

  const sourceLabel = (src: string) => {
    if (src === 'model')   return 'ML accuracy'
    if (src === 'trades')  return 'Trade history'
    if (src === 'blended') return 'ML + trades'
    return 'Default'
  }

  return (
    <Card sx={{ mt: 2, border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={700}>Kelly Criterion — Position Sizing</Typography>
          <Typography variant="caption" color="text.secondary">
            Optimal capital fraction to risk per trade. Use Half Kelly to manage drawdowns.
            Based on AI model win-rate and paper trade history.
          </Typography>
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 580 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                {['Symbol', 'Win Rate', 'Win:Loss', 'Full Kelly', 'Half Kelly (recommended)', 'Max Position', 'Basis'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3 }}><CircularProgress size={22} /></TableCell></TableRow>
              ) : (rows ?? []).map((row: KellyRow) => {
                const maxPos = accountEquity * row.half_kelly
                const isHigh = row.full_kelly > 0.3
                return (
                  <TableRow key={row.symbol} hover>
                    <TableCell sx={{ fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: 'primary.main', fontSize: '0.82rem' }}>
                      {row.symbol}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem' }}>
                      {(row.win_rate * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem' }}>
                      {row.win_loss_ratio.toFixed(2)}×
                    </TableCell>
                    <TableCell>
                      <Typography sx={{
                        fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem',
                        color: isHigh ? '#F59E0B' : 'text.primary',
                      }}>
                        {(row.full_kelly * 100).toFixed(1)}%
                        {isHigh && <Typography component="span" variant="caption" sx={{ ml: 0.5, color: '#F59E0B' }}>⚠</Typography>}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(row.half_kelly * 100, 100)}
                          sx={{
                            width: 48, height: 5, borderRadius: 2, flexShrink: 0,
                            bgcolor: 'rgba(255,255,255,0.08)',
                            '& .MuiLinearProgress-bar': { bgcolor: '#4A9EFF', borderRadius: 2 },
                          }}
                        />
                        <Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem', color: '#4A9EFF', fontWeight: 700 }}>
                          {(row.half_kelly * 100).toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem' }}>
                      ${maxPos.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={sourceLabel(row.source)}
                        sx={{ fontSize: '0.65rem', height: 18,
                          bgcolor: row.source === 'blended' ? 'rgba(74,158,255,0.12)' : 'rgba(255,255,255,0.05)',
                          color:   row.source === 'blended' ? '#4A9EFF' : 'text.disabled',
                        }}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.disabled">
            Max Position = account × Half Kelly. Values above 25% Full Kelly are highlighted — unusually high confidence may reflect overfitting.
            {rows?.[0]?.n_trades === 0 && ' No closed paper trades yet — values based on ML model accuracy only.'}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SignalsPage() {
  const navigate   = useNavigate()
  const [rows,       setRows]       = useState<SignalRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set())
  const [tradeRow,   setTradeRow]   = useState<SignalRow | null>(null)

  // Get paper account equity for Kelly position sizing
  const { data: paperState } = useQuery({
    queryKey: ['paper-state'],
    queryFn:  api.paper.getState,
    staleTime: 30_000,
  })
  const accountEquity = paperState?.account?.equity ?? 100_000
  const [toast,      setToast]      = useState('')
  const [toastSev,   setToastSev]   = useState<'success' | 'error'>('success')

  const fetchSignals = useCallback(async () => {
    try {
      const data = await api.signals.getAll()
      setRows(data)
      setLastRefresh(new Date())
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load signals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchSignals])

  const toggleExpand = (sym: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(sym)) next.delete(sym)
      else next.add(sym)
      return next
    })
  }

  const handleTradeDone = (msg: string, err?: boolean) => {
    setToast(msg)
    setToastSev(err ? 'error' : 'success')
  }

  return (
    <Box>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Live Signals</Typography>
          <Typography variant="body2" color="text.secondary">
            AI-generated BUY / HOLD / SELL for all tracked symbols · auto-refreshes every 30s
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          {lastRefresh && (
            <Typography variant="caption" color="text.secondary">
              Updated {lastRefresh.toLocaleTimeString()}
            </Typography>
          )}
          <Tooltip title="Refresh now">
            <IconButton size="small" onClick={fetchSignals} disabled={loading}>
              {loading ? <CircularProgress size={18} /> : <RefreshIcon />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>
      )}

      {rows.length > 0 && <SummaryBar rows={rows} />}

      {/* ── Signal Table ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 780 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                  {['', 'Symbol', 'Price', 'Signal', 'ML Direction', 'Confidence', 'RSI', 'Sentiment', 'Trade'].map(
                    (h) => (
                      <TableCell key={h} sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.78rem' }}>
                        {h}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No signal data — run{' '}
                      <code style={{ color: '#4A9EFF' }}>make ingest</code> and{' '}
                      <code style={{ color: '#4A9EFF' }}>make train-all</code> first
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const isExpanded = expanded.has(row.symbol)
                    return (
                      <>
                        <TableRow
                          key={row.symbol}
                          hover
                          sx={{ '&:hover': { bgcolor: 'rgba(74,158,255,0.05)' }, cursor: 'default' }}
                        >
                          {/* Expand toggle */}
                          <TableCell sx={{ width: 32, p: 0.5 }}>
                            <Tooltip title={isExpanded ? 'Hide explanation' : 'Why this signal?'}>
                              <IconButton size="small" onClick={() => toggleExpand(row.symbol)}
                                sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}>
                                {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          </TableCell>

                          <TableCell
                            sx={{ fontWeight: 700, color: 'primary.main', cursor: 'pointer' }}
                            onClick={() => navigate('/trading')}
                          >
                            {row.symbol}
                          </TableCell>

                          <TableCell>
                            {row.last_price != null ? `$${row.last_price.toFixed(2)}` : '—'}
                          </TableCell>

                          <TableCell>
                            <Box sx={{
                              display: 'inline-flex', alignItems: 'center',
                              px: 1.2, py: 0.3, borderRadius: 1,
                              bgcolor: signalBg(row.composite),
                              color: signalColor(row.composite),
                              fontWeight: 700, fontSize: '0.78rem',
                              textTransform: 'uppercase', letterSpacing: '0.05em',
                            }}>
                              {row.composite}
                            </Box>
                          </TableCell>

                          <TableCell>
                            <Box sx={{
                              color: row.ml_direction === 'up'
                                ? CHART_COLORS.positive
                                : row.ml_direction === 'down'
                                ? CHART_COLORS.negative
                                : CHART_COLORS.textMuted,
                              fontSize: '0.82rem',
                            }}>
                              {row.ml_direction === 'none' ? '—' : row.ml_direction === 'up' ? '↑ UP' : '↓ DOWN'}
                            </Box>
                          </TableCell>

                          {/* Confidence — LinearProgress bar */}
                          <TableCell sx={{ minWidth: 110 }}>
                            <Stack direction="row" alignItems="center" spacing={0.75}>
                              <LinearProgress
                                variant="determinate"
                                value={row.confidence * 100}
                                sx={{
                                  width: 56, height: 5, borderRadius: 2, flexShrink: 0,
                                  bgcolor: 'rgba(255,255,255,0.08)',
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: signalColor(row.composite), borderRadius: 2,
                                  },
                                }}
                              />
                              <Typography variant="caption" fontFamily="IBM Plex Mono, monospace">
                                {(row.confidence * 100).toFixed(0)}%
                              </Typography>
                            </Stack>
                          </TableCell>

                          <TableCell>
                            <Box sx={{ color: rsiColor(row.rsi_signal), fontSize: '0.82rem' }}>
                              {row.rsi != null ? row.rsi.toFixed(1) : '—'}
                              {row.rsi_signal !== 'neutral' && (
                                <Typography component="span" variant="caption"
                                  sx={{ ml: 0.5, color: rsiColor(row.rsi_signal), opacity: 0.8 }}>
                                  ({row.rsi_signal})
                                </Typography>
                              )}
                            </Box>
                          </TableCell>

                          <TableCell>
                            <Box sx={{
                              color: row.sentiment_label === 'bullish'
                                ? CHART_COLORS.positive
                                : row.sentiment_label === 'bearish'
                                ? CHART_COLORS.negative
                                : CHART_COLORS.textMuted,
                              fontSize: '0.82rem',
                            }}>
                              {row.sentiment_score != null
                                ? `${row.sentiment_score > 0 ? '+' : ''}${row.sentiment_score.toFixed(2)}`
                                : '—'}{' '}
                              <Typography component="span" variant="caption" sx={{ opacity: 0.7 }}>
                                ({row.sentiment_label})
                              </Typography>
                            </Box>
                          </TableCell>

                          {/* Trade This button */}
                          <TableCell>
                            {row.composite !== 'hold' && (
                              <Tooltip title={`Paper-trade this ${row.composite} signal`}>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<TradeIcon sx={{ fontSize: 13 }} />}
                                  onClick={() => setTradeRow(row)}
                                  sx={{
                                    textTransform: 'none',
                                    fontSize: '0.7rem',
                                    color:       signalColor(row.composite),
                                    borderColor: `${signalColor(row.composite)}44`,
                                    '&:hover': {
                                      borderColor: signalColor(row.composite),
                                      bgcolor:     signalBg(row.composite),
                                    },
                                    px: 1, py: 0.25,
                                  }}
                                >
                                  Trade
                                </Button>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expandable "Why?" row */}
                        <TableRow key={`${row.symbol}-why`}>
                          <TableCell colSpan={9} sx={{ p: 0, border: 0 }}>
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              <WhyRow row={row} />
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        Click ▾ on any row to see why the signal was generated. Signals require ≥ 210 OHLCV bars and a trained model.
      </Typography>

      {/* Multi-timeframe alignment grid */}
      <MultiTimeframePanel />

      {/* Kelly position sizing */}
      <KellyPanel accountEquity={accountEquity} />

      {/* Trade dialog */}
      {tradeRow && (
        <TradeDialog
          row={tradeRow}
          onClose={() => setTradeRow(null)}
          onDone={handleTradeDone}
        />
      )}

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toastSev} onClose={() => setToast('')} sx={{ width: '100%' }}>
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  )
}
