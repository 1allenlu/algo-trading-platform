/**
 * Watchlist page — manage saved symbols, see live prices + signals in one place.
 * Symbol list persisted in localStorage under 'qs_watchlist'.
 */

import { useState, useEffect } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  LinearProgress,
  Snackbar,
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
  Add as AddIcon,
  Close as RemoveIcon,
  DeleteOutline as ClearIcon,
  BookmarkBorder as WatchlistIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { useLivePrices } from '@/hooks/useLivePrices'
import EmptyState from '@/components/common/EmptyState'

const STORAGE_KEY = 'qs_watchlist'
const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA']

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return DEFAULT_SYMBOLS
}

function saveWatchlist(symbols: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols))
}

function signalColor(signal: string) {
  if (signal === 'buy')  return '#00C896'
  if (signal === 'sell') return '#FF6B6B'
  return '#9CA3AF'
}

function signalBg(signal: string) {
  if (signal === 'buy')  return 'rgba(0,200,150,0.12)'
  if (signal === 'sell') return 'rgba(255,107,107,0.12)'
  return 'rgba(156,163,175,0.08)'
}

export default function WatchlistPage() {
  const [symbols,  setSymbols]  = useState<string[]>(loadWatchlist)
  const [input,    setInput]    = useState('')
  const [inputErr, setInputErr] = useState('')
  const [toast,    setToast]    = useState('')

  const { prices, status: wsStatus } = useLivePrices()

  const { data: signalRows, refetch: refetchSignals, isFetching } = useQuery({
    queryKey:  ['signals'],
    queryFn:   () => api.signals.getAll(),
    staleTime: 30_000,
    retry:     false,
  })

  // Persist whenever symbols change
  useEffect(() => { saveWatchlist(symbols) }, [symbols])

  const handleAdd = () => {
    const sym = input.trim().toUpperCase()
    if (!sym) { setInputErr('Enter a symbol'); return }
    if (!/^[A-Z0-9.\-]{1,10}$/.test(sym)) { setInputErr('Invalid symbol'); return }
    if (symbols.includes(sym)) { setInputErr('Already in watchlist'); return }
    setSymbols((prev) => [...prev, sym])
    setInput('')
    setInputErr('')
    setToast(`${sym} added to watchlist`)
  }

  const handleRemove = (sym: string) => {
    setSymbols((prev) => prev.filter((s) => s !== sym))
  }

  const handleClear = () => {
    setSymbols([])
  }

  const signalMap = Object.fromEntries((signalRows ?? []).map((r) => [r.symbol, r]))

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Watchlist</Typography>
          <Typography variant="body2" color="text.secondary">
            Track your favourite symbols — live prices and AI signals in one place
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh signals">
            <span>
              <IconButton size="small" onClick={() => refetchSignals()} disabled={isFetching}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {symbols.length > 0 && (
            <Button size="small" color="error" startIcon={<ClearIcon />} onClick={handleClear}
              sx={{ textTransform: 'none', fontSize: '0.78rem' }}>
              Clear all
            </Button>
          )}
        </Box>
      </Box>

      {/* Add symbol */}
      <Card sx={{ mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="e.g. TSLA"
              value={input}
              onChange={(e) => { setInput(e.target.value.toUpperCase()); setInputErr('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              error={!!inputErr}
              helperText={inputErr}
              inputProps={{ style: { fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase' } }}
              sx={{ width: 160 }}
            />
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}
              sx={{ textTransform: 'none', fontWeight: 700 }}>
              Add Symbol
            </Button>
            {/* WS status */}
            <Chip
              size="small"
              label={wsStatus === 'open' ? '● Live prices' : '◌ Connecting…'}
              sx={{
                fontSize: '0.7rem',
                color: wsStatus === 'open' ? '#00C896' : '#9CA3AF',
                bgcolor: 'transparent',
                border: '1px solid',
                borderColor: wsStatus === 'open' ? '#00C89644' : 'divider',
                ml: 'auto',
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Table */}
      {symbols.length === 0 ? (
        <EmptyState
          icon={<WatchlistIcon sx={{ fontSize: 56 }} />}
          title="Your watchlist is empty"
          description="Add symbols above to track their live prices and AI signals in one place."
        />
      ) : (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          {isFetching && <LinearProgress sx={{ height: 2 }} />}
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                    {['Symbol', 'Live Price', 'Change', 'AI Signal', 'Confidence', 'RSI', 'Actions'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {symbols.map((sym) => {
                    const tick   = prices[sym]
                    const signal = signalMap[sym]
                    const isPos  = (tick?.change_pct ?? 0) >= 0

                    return (
                      <TableRow key={sym} hover sx={{ '&:hover': { bgcolor: 'rgba(74,158,255,0.04)' } }}>
                        <TableCell sx={{ fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: 'primary.main' }}>
                          {sym}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.85rem' }}>
                          {tick ? `$${tick.price.toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell>
                          {tick ? (
                            <Typography
                              variant="body2"
                              fontFamily="IBM Plex Mono, monospace"
                              fontWeight={700}
                              sx={{ color: isPos ? '#00C896' : '#FF6B6B', fontSize: '0.82rem' }}
                            >
                              {isPos ? '+' : ''}{tick.change_pct.toFixed(2)}%
                            </Typography>
                          ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                        </TableCell>
                        <TableCell>
                          {signal ? (
                            <Box sx={{
                              display: 'inline-flex', px: 1.2, py: 0.3, borderRadius: 1,
                              bgcolor: signalBg(signal.composite),
                              color: signalColor(signal.composite),
                              fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase',
                            }}>
                              {signal.composite}
                            </Box>
                          ) : <Typography variant="caption" color="text.disabled">No model</Typography>}
                        </TableCell>
                        <TableCell>
                          {signal ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <LinearProgress
                                variant="determinate"
                                value={signal.confidence * 100}
                                sx={{
                                  width: 48, height: 5, borderRadius: 2,
                                  bgcolor: 'rgba(255,255,255,0.08)',
                                  '& .MuiLinearProgress-bar': { bgcolor: signalColor(signal.composite), borderRadius: 2 },
                                }}
                              />
                              <Typography variant="caption" fontFamily="IBM Plex Mono, monospace">
                                {(signal.confidence * 100).toFixed(0)}%
                              </Typography>
                            </Box>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {signal?.rsi != null ? (
                            <Typography variant="caption" fontFamily="IBM Plex Mono, monospace"
                              sx={{ color: signal.rsi_signal === 'oversold' ? '#00C896' : signal.rsi_signal === 'overbought' ? '#FF6B6B' : 'text.primary' }}>
                              {signal.rsi.toFixed(1)}
                            </Typography>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <Tooltip title={`Remove ${sym}`}>
                            <IconButton size="small" onClick={() => handleRemove(sym)} sx={{ color: 'text.disabled', '&:hover': { color: '#FF6B6B' } }}>
                              <RemoveIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      <Snackbar
        open={!!toast}
        autoHideDuration={2500}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}
