/**
 * Options Flow Scanner — Phase 70.
 *
 * Screens a watchlist for unusual options activity:
 *   • Volume / OI ratio spikes ("sweep" and "unusual_vol" flags)
 *   • High absolute volume
 *   • Put/Call breakdown
 *
 * Data via yfinance (15-min delayed), cached 15 min.
 */

import { useState } from 'react'
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  IconButton, InputAdornment, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import { Refresh as RefreshIcon, Search as SearchIcon } from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, type OptionsFlowRow } from '@/services/api'

const DEFAULT_SYMBOLS = 'SPY,QQQ,AAPL,MSFT,NVDA,AMZN,TSLA,GOOGL,META,AMD'

const FLAG_META: Record<string, { color: string; bg: string; label: string }> = {
  sweep:       { color: '#FF6B6B', bg: '#FF6B6B22', label: 'Sweep' },
  unusual_vol: { color: '#F59E0B', bg: '#F59E0B22', label: 'Unusual Vol' },
  high_oi:     { color: '#A78BFA', bg: '#A78BFA22', label: 'High OI' },
  normal:      { color: '#94a3b8', bg: '#94a3b822', label: 'Normal' },
}

function fmtVol(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export default function OptionsFlowPage() {
  const [input,   setInput]   = useState(DEFAULT_SYMBOLS)
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS)
  const [filter,  setFilter]  = useState<'all' | 'calls' | 'puts'>('all')

  const { data = [], isLoading, error, refetch } = useQuery<OptionsFlowRow[]>({
    queryKey:  ['options-flow', symbols],
    queryFn:   () => api.optionsFlow.scan(symbols),
    staleTime: 15 * 60_000,
    retry: 1,
  })

  const filtered = filter === 'all'
    ? data
    : data.filter((r) => r.contract_type === (filter === 'calls' ? 'call' : 'put'))

  // Aggregate call/put volume
  const callVol = data.filter((r) => r.contract_type === 'call').reduce((s, r) => s + r.volume, 0)
  const putVol  = data.filter((r) => r.contract_type === 'put').reduce((s, r) => s + r.volume, 0)
  const pcRatio = callVol > 0 ? (putVol / callVol).toFixed(2) : '—'

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Options Flow Scanner</Typography>
        <Typography variant="body2" color="text.secondary">
          Unusual options activity — volume/OI spikes, sweep orders, and large prints.
          Flags: <strong style={{ color: '#FF6B6B' }}>Sweep</strong> = vol {'>'} 500 &amp; vol/OI {'>'} 5×,{' '}
          <strong style={{ color: '#F59E0B' }}>Unusual Vol</strong> = vol/OI {'>'} 2×.
          Data via yfinance (15-min delayed, cached 15 min).
        </Typography>
      </Box>

      {/* Search bar */}
      <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              fullWidth size="small" placeholder="Comma-separated symbols…"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && setSymbols(input)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
                sx: { fontFamily: 'IBM Plex Mono, monospace' },
              }}
            />
            <IconButton onClick={() => setSymbols(input)} size="small" color="primary">
              <SearchIcon />
            </IconButton>
            <IconButton onClick={() => refetch()} size="small">
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">Failed to load options flow. Markets may be closed or data unavailable.</Alert>}

      {data.length > 0 && (
        <>
          {/* Stats bar */}
          <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Box>
              <Typography variant="caption" color="text.disabled">TOTAL CONTRACTS</Typography>
              <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace">{data.length}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.disabled">CALL VOLUME</Typography>
              <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color: '#00C896' }}>{fmtVol(callVol)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.disabled">PUT VOLUME</Typography>
              <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color: '#FF6B6B' }}>{fmtVol(putVol)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.disabled">PUT/CALL RATIO</Typography>
              <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace"
                sx={{ color: Number(pcRatio) > 1.2 ? '#FF6B6B' : Number(pcRatio) < 0.7 ? '#00C896' : 'text.primary' }}>
                {pcRatio}
              </Typography>
            </Box>
            <Box sx={{ ml: 'auto' }}>
              <ToggleButtonGroup
                value={filter} exclusive size="small"
                onChange={(_, v) => v && setFilter(v)}
                sx={{ '& .MuiToggleButton-root': { py: 0.5, px: 1.5, textTransform: 'none', fontSize: '0.78rem' } }}
              >
                <ToggleButton value="all">All</ToggleButton>
                <ToggleButton value="calls" sx={{ color: '#00C896' }}>Calls</ToggleButton>
                <ToggleButton value="puts"  sx={{ color: '#FF6B6B' }}>Puts</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>

          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <TableContainer sx={{ maxHeight: 560 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Flag', 'Symbol', 'Type', 'Strike', 'Expiry', 'Volume', 'OI', 'Vol/OI', 'IV', 'Last', 'OTM %'].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary', bgcolor: 'background.paper' }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.map((row, i) => {
                      const meta = FLAG_META[row.flag] ?? FLAG_META.normal
                      return (
                        <TableRow key={i} hover>
                          <TableCell>
                            <Chip
                              size="small" label={meta.label}
                              sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700, fontSize: '0.62rem', height: 17 }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main', fontSize: '0.8rem' }}>
                            {row.symbol}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={row.contract_type === 'call' ? 'CALL' : 'PUT'}
                              sx={{
                                height: 17, fontSize: '0.62rem', fontWeight: 700,
                                bgcolor: row.contract_type === 'call' ? '#00C89622' : '#FF6B6B22',
                                color:   row.contract_type === 'call' ? '#00C896'   : '#FF6B6B',
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                            ${row.strike}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {row.expiry}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', fontWeight: 700 }}>
                            {fmtVol(row.volume)}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem', color: 'text.secondary' }}>
                            {row.open_interest != null ? fmtVol(row.open_interest) : '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem',
                            color: (row.vol_oi_ratio ?? 0) > 5 ? '#FF6B6B' : (row.vol_oi_ratio ?? 0) > 2 ? '#F59E0B' : 'text.primary' }}>
                            {row.vol_oi_ratio != null ? `${row.vol_oi_ratio}×` : '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem' }}>
                            {row.iv != null ? `${row.iv}%` : '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem' }}>
                            {row.last_price != null ? `$${row.last_price.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem',
                            color: (row.otm_pct ?? 0) > 10 ? '#94a3b8' : (row.otm_pct ?? 0) < 0 ? '#00C896' : 'text.primary' }}>
                            {row.otm_pct != null ? `${row.otm_pct > 0 ? '+' : ''}${row.otm_pct.toFixed(1)}%` : '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}

      {!isLoading && data.length === 0 && !error && (
        <Alert severity="info">No options flow data returned. Try different symbols or check during market hours.</Alert>
      )}
    </Box>
  )
}
