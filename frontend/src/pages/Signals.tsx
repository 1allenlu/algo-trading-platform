/**
 * Signals Page — Phase 22.
 *
 * Displays the live composite BUY / HOLD / SELL signal for every tracked
 * symbol in a colour-coded table. Auto-refreshes every 30 seconds.
 *
 * Layout:
 *   Summary bar — # BUY | # HOLD | # SELL
 *   Signal matrix table — Symbol | Price | Composite | ML Direction |
 *                         Confidence | RSI | Sentiment | Updated
 *   Each row is clickable → navigates to /trading
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { Refresh as RefreshIcon } from '@mui/icons-material'
import { api, SignalRow } from '@/services/api'
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

// ── Main component ────────────────────────────────────────────────────────────

export default function SignalsPage() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState<SignalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

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

  return (
    <Box>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Live Signals
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Composite BUY / HOLD / SELL for all tracked symbols · auto-refreshes every 30s
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
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {rows.length > 0 && <SummaryBar rows={rows} />}

      {/* ── Signal Table ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                  {['Symbol', 'Price', 'Signal', 'ML Direction', 'Confidence', 'RSI', 'Sentiment', 'Updated'].map(
                    (h) => (
                      <TableCell
                        key={h}
                        sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.78rem' }}
                      >
                        {h}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No signal data — run{' '}
                      <code style={{ color: '#4A9EFF' }}>make ingest</code> and{' '}
                      <code style={{ color: '#4A9EFF' }}>make train-all</code> first
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow
                      key={row.symbol}
                      hover
                      onClick={() => navigate('/trading')}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(74,158,255,0.05)' },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {row.symbol}
                      </TableCell>
                      <TableCell>
                        {row.last_price != null ? `$${row.last_price.toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            px: 1.2,
                            py: 0.3,
                            borderRadius: 1,
                            bgcolor: signalBg(row.composite),
                            color: signalColor(row.composite),
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {row.composite}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{
                            color: row.ml_direction === 'up'
                              ? CHART_COLORS.positive
                              : row.ml_direction === 'down'
                              ? CHART_COLORS.negative
                              : CHART_COLORS.textMuted,
                            fontSize: '0.82rem',
                          }}
                        >
                          {row.ml_direction === 'none' ? '—' : row.ml_direction === 'up' ? '↑ UP' : '↓ DOWN'}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Box
                            sx={{
                              width: 40,
                              height: 4,
                              borderRadius: 2,
                              bgcolor: signalColor(row.composite),
                              opacity: 0.3,
                            }}
                          />
                          <Box
                            sx={{
                              width: `${row.confidence * 40}px`,
                              height: 4,
                              borderRadius: 2,
                              bgcolor: signalColor(row.composite),
                              position: 'absolute',
                            }}
                          />
                          <Typography variant="caption" sx={{ ml: 1 }}>
                            {(row.confidence * 100).toFixed(0)}%
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ color: rsiColor(row.rsi_signal), fontSize: '0.82rem' }}>
                          {row.rsi != null ? row.rsi.toFixed(1) : '—'}
                          {row.rsi_signal !== 'neutral' && (
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{ ml: 0.5, color: rsiColor(row.rsi_signal), opacity: 0.8 }}
                            >
                              ({row.rsi_signal})
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{
                            color:
                              row.sentiment_label === 'bullish'
                                ? CHART_COLORS.positive
                                : row.sentiment_label === 'bearish'
                                ? CHART_COLORS.negative
                                : CHART_COLORS.textMuted,
                            fontSize: '0.82rem',
                          }}
                        >
                          {row.sentiment_score != null
                            ? `${row.sentiment_score > 0 ? '+' : ''}${row.sentiment_score.toFixed(2)}`
                            : '—'}{' '}
                          <Typography component="span" variant="caption" sx={{ opacity: 0.7 }}>
                            ({row.sentiment_label})
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                        {new Date(row.last_updated).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        Click any row to open the Trading page. Signals require ≥ 210 OHLCV bars and a trained model.
      </Typography>
    </Box>
  )
}
