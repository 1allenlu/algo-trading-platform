/**
 * Earnings Volatility Screener — Phase 62.
 *
 * Screens a watchlist for pre-earnings options plays:
 *   • Expected move (±% from ATM straddle cost)
 *   • ATM implied volatility
 *   • Historical EPS beat rate
 *   • Setup recommendation: straddle / directional / pass
 */

import { useState } from 'react'
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  IconButton, InputAdornment, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import { Refresh as RefreshIcon, Search as SearchIcon } from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, type EarningsPlay } from '@/services/api'

const DEFAULT_SYMBOLS = 'SPY,QQQ,AAPL,MSFT,NVDA,AMZN,TSLA,GOOGL,META,AMD'

const SETUP_META: Record<string, { color: string; bg: string; label: string }> = {
  straddle:    { color: '#A78BFA', bg: '#A78BFA22', label: 'Straddle' },
  directional: { color: '#00C896', bg: '#00C89622', label: 'Directional' },
  pass:        { color: '#94a3b8', bg: '#94a3b822', label: 'Pass' },
}

export default function EarningsVolPage() {
  const [input, setInput] = useState(DEFAULT_SYMBOLS)
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS)

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey:  ['earnings-vol', symbols],
    queryFn:   () => api.earningsVol.screen(symbols),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })

  const handleSearch = () => setSymbols(input)

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Earnings Volatility Screener</Typography>
        <Typography variant="body2" color="text.secondary">
          Pre-earnings options analysis: expected move (IV-based straddle cost), ATM implied vol,
          and historical EPS beat rate. Identifies straddle and directional play setups.
        </Typography>
      </Box>

      <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              fullWidth size="small" placeholder="Comma-separated symbols…"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
                sx: { fontFamily: 'IBM Plex Mono, monospace' },
              }}
            />
            <IconButton onClick={handleSearch} size="small" color="primary"><SearchIcon /></IconButton>
            <IconButton onClick={() => refetch()} size="small"><RefreshIcon sx={{ fontSize: 18 }} /></IconButton>
          </Box>
        </CardContent>
      </Card>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">Failed to screen earnings plays. Options data requires active market hours.</Alert>}

      {data.length > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Symbol', 'Price', 'Next Earnings', 'Expected Move', 'ATM IV', 'Straddle', 'Beat Rate', 'Setup'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((row) => {
                    const meta = SETUP_META[row.setup] ?? SETUP_META.pass
                    return (
                      <TableRow key={row.symbol} hover>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                          {row.symbol}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                          ${row.price?.toFixed(2) ?? '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                          {row.next_earnings ?? '—'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', fontWeight: 700, color: '#A78BFA' }}>
                          {row.expected_move_pct != null ? `±${row.expected_move_pct.toFixed(2)}%` : '—'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                          {row.atm_iv_pct != null ? `${row.atm_iv_pct.toFixed(1)}%` : '—'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                          {row.straddle_cost != null ? `$${row.straddle_cost.toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell>
                          {row.beat_rate_pct != null ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography
                                variant="caption"
                                fontFamily="IBM Plex Mono, monospace"
                                fontWeight={700}
                                sx={{ color: (row.beat_rate_pct ?? 0) > 60 ? '#00C896' : 'text.secondary' }}
                              >
                                {row.beat_rate_pct.toFixed(0)}%
                              </Typography>
                              <Typography variant="caption" color="text.disabled">
                                ({row.beats}B / {row.misses}M)
                              </Typography>
                            </Box>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small" label={meta.label}
                            sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700, fontSize: '0.65rem', height: 18 }}
                          />
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

      {!isLoading && data.length === 0 && !error && (
        <Alert severity="info">No earnings data returned. Try different symbols or check during market hours.</Alert>
      )}
    </Box>
  )
}
