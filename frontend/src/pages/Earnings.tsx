/**
 * Earnings Calendar page — Phase 33.
 *
 * Shows upcoming and recent earnings dates for a configurable watchlist.
 * Data sourced from yfinance (ticker.calendar + ticker.earnings_dates).
 * Cached 1 hour server-side per symbol.
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  Add as AddIcon,
  Close as CloseIcon,
  EventNote as EarningsIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { EarningsCalendarEntry } from '@/services/api'

// ── Default watchlist ─────────────────────────────────────────────────────────
const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'JPM', 'V', 'SPY']

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

function daysLabel(days: number | null): { text: string; color: string } {
  if (days === null) return { text: '—', color: 'text.disabled' }
  if (days === 0)    return { text: 'Today',       color: '#F59E0B' }
  if (days === 1)    return { text: 'Tomorrow',    color: '#F59E0B' }
  if (days > 0)      return { text: `in ${days}d`, color: days <= 7 ? '#F59E0B' : 'text.secondary' }
  return { text: `${Math.abs(days)}d ago`, color: 'text.disabled' }
}

function surpriseColor(pct: number | null): string {
  if (pct === null) return 'text.secondary'
  return pct >= 0 ? '#00C896' : '#FF6B6B'
}

function fmt(v: number | null, prefix = ''): string {
  if (v === null || v === undefined) return '—'
  const s = v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)
  return prefix + s
}

// ── History row expander ──────────────────────────────────────────────────────

function HistoryRow({ history }: { history: EarningsCalendarEntry['earnings_history'] }) {
  if (!history.length) return (
    <Typography variant="caption" color="text.disabled">No historical data</Typography>
  )
  return (
    <Table size="small" sx={{ mt: 1 }}>
      <TableHead>
        <TableRow>
          {['Date', 'EPS Est.', 'EPS Actual', 'Surprise'].map(h => (
            <TableCell key={h} sx={{ fontSize: '0.68rem', color: 'text.disabled', py: 0.5 }}>{h}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {history.map(h => (
          <TableRow key={h.date}>
            <TableCell sx={{ fontSize: '0.72rem', fontFamily: 'IBM Plex Mono, monospace' }}>{h.date}</TableCell>
            <TableCell sx={{ fontSize: '0.72rem', fontFamily: 'IBM Plex Mono, monospace', color: 'text.secondary' }}>
              {h.eps_estimate != null ? `$${h.eps_estimate.toFixed(2)}` : '—'}
            </TableCell>
            <TableCell sx={{ fontSize: '0.72rem', fontFamily: 'IBM Plex Mono, monospace' }}>
              {h.eps_actual != null ? `$${h.eps_actual.toFixed(2)}` : '—'}
            </TableCell>
            <TableCell sx={{ fontSize: '0.72rem', fontFamily: 'IBM Plex Mono, monospace', color: surpriseColor(h.surprise_pct) }}>
              {h.surprise_pct != null ? `${h.surprise_pct > 0 ? '+' : ''}${h.surprise_pct.toFixed(1)}%` : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS)
  const [input, setInput]     = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey:  ['earnings', 'calendar', symbols.join(',')],
    queryFn:   () => api.earnings.getCalendar(symbols.join(',')),
    staleTime: 3_600_000,  // 1 hour — matches server cache TTL
    retry: 1,
  })

  const addSymbol = () => {
    const sym = input.trim().toUpperCase()
    if (sym && !symbols.includes(sym)) setSymbols(prev => [...prev, sym])
    setInput('')
  }

  const removeSymbol = (sym: string) => setSymbols(prev => prev.filter(s => s !== sym))

  const rows: EarningsCalendarEntry[] = (data as EarningsCalendarEntry[]) ?? []

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EarningsIcon sx={{ color: 'primary.main' }} />
            Earnings Calendar
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Upcoming &amp; recent earnings — EPS estimates + actuals via yfinance. Cached 1 hour.
          </Typography>
        </Box>
        <IconButton onClick={() => refetch()} size="small">
          <RefreshIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Symbol builder */}
      <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <CardContent sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={1}>
            <TextField
              size="small"
              placeholder="Add symbol…"
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && addSymbol()}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={addSymbol}><AddIcon sx={{ fontSize: 16 }} /></IconButton>
                  </InputAdornment>
                ),
                sx: { fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 },
              }}
              sx={{ width: 160 }}
            />
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            {symbols.map(sym => (
              <Chip
                key={sym}
                label={sym}
                size="small"
                onDelete={() => removeSymbol(sym)}
                deleteIcon={<CloseIcon />}
                sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}
              />
            ))}
          </Stack>
        </CardContent>
      </Card>

      {isLoading && <LinearProgress sx={{ borderRadius: 1, mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load earnings data.</Alert>}

      {/* Calendar table */}
      {rows.length > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                {['Symbol', 'Next Earnings', 'When', 'EPS Estimate', 'Last EPS', 'Last Surprise', 'History'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(row => {
                const days    = daysUntil(row.next_earnings_date)
                const dayInfo = daysLabel(days)
                const lastH   = row.earnings_history[0]
                const isOpen  = expanded === row.symbol

                return (
                  <>
                    <TableRow
                      key={row.symbol}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: isOpen ? 'rgba(255,255,255,0.03)' : undefined,
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                      }}
                      onClick={() => setExpanded(isOpen ? null : row.symbol)}
                    >
                      <TableCell>
                        <Typography variant="caption" fontWeight={700} color="primary.main"
                          sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                          {row.symbol}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                          {row.next_earnings_date ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={dayInfo.text}
                          sx={{ bgcolor: (dayInfo.color === '#F59E0B' ? '#F59E0B22' : 'transparent'),
                                color: dayInfo.color, fontWeight: 700, fontSize: '0.68rem',
                                border: '1px solid', borderColor: dayInfo.color + '44' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'IBM Plex Mono, monospace', color: 'text.secondary' }}>
                          {row.eps_estimate != null ? `$${row.eps_estimate.toFixed(2)}` : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                          {lastH?.eps_actual != null ? `$${lastH.eps_actual.toFixed(2)}` : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption"
                          sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700,
                                color: surpriseColor(lastH?.surprise_pct ?? null) }}>
                          {lastH?.surprise_pct != null
                            ? `${lastH.surprise_pct > 0 ? '+' : ''}${lastH.surprise_pct.toFixed(1)}%`
                            : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.disabled">
                          {row.earnings_history.length > 0 ? `${row.earnings_history.length}Q ▾` : '—'}
                        </Typography>
                      </TableCell>
                    </TableRow>

                    {/* Expanded history */}
                    {isOpen && (
                      <TableRow key={`${row.symbol}-history`}>
                        <TableCell colSpan={7} sx={{ bgcolor: 'rgba(0,0,0,0.15)', px: 3, py: 1.5 }}>
                          <HistoryRow history={row.earnings_history} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {!isLoading && rows.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6, color: 'text.disabled' }}>
          <EarningsIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
          <Typography>No earnings data found for the selected symbols.</Typography>
        </Box>
      )}
    </Box>
  )
}
