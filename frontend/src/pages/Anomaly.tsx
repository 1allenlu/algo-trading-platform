/**
 * Anomaly Detection — Phase 73.
 *
 * Scans a watchlist for statistically unusual behaviour today:
 *   • Volume spike (N× 20-day average)
 *   • Price gap up / down
 *   • RSI extreme (overbought / oversold)
 *   • Large daily move
 *
 * Configurable thresholds via sliders.
 */

import { useState } from 'react'
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  Collapse, Grid, IconButton, InputAdornment, Slider,
  Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Tune as TuneIcon,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, type AnomalyRow } from '@/services/api'

const DEFAULT_SYMBOLS = (
  'SPY,QQQ,AAPL,MSFT,NVDA,AMZN,TSLA,GOOGL,META,AMD,' +
  'JPM,BAC,XOM,GLD,TLT,IWM,BTC-USD,ETH-USD'
)

const SEV_META: Record<string, { color: string; bg: string }> = {
  critical: { color: '#FF6B6B', bg: '#FF6B6B22' },
  warning:  { color: '#F59E0B', bg: '#F59E0B22' },
  info:     { color: '#4A9EFF', bg: '#4A9EFF22' },
}

function pct(n: number | null) {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export default function AnomalyPage() {
  const [input,   setInput]   = useState(DEFAULT_SYMBOLS)
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS)
  const [showConfig, setShowConfig] = useState(false)

  // Thresholds
  const [volMult, setVolMult] = useState(2.5)
  const [gapPct,  setGapPct]  = useState(3.0)
  const [rsiHi,   setRsiHi]   = useState(80)
  const [rsiLo,   setRsiLo]   = useState(20)
  const [movePct, setMovePct] = useState(5.0)

  const { data = [], isLoading, error, refetch } = useQuery<AnomalyRow[]>({
    queryKey:  ['anomaly', symbols, volMult, gapPct, rsiHi, rsiLo, movePct],
    queryFn:   () => api.anomaly.scan(symbols, volMult, gapPct, rsiHi, rsiLo, movePct),
    staleTime: 30 * 60_000,
    retry: 1,
  })

  const critical = data.filter((r) => r.severity === 'critical').length
  const warning  = data.filter((r) => r.severity === 'warning').length

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Anomaly Detection</Typography>
        <Typography variant="body2" color="text.secondary">
          Flags unusual price and volume behaviour across your watchlist today.
          Adjust thresholds with the settings panel. Cached 30 min.
        </Typography>
      </Box>

      {/* Search + config bar */}
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
            <IconButton onClick={() => setSymbols(input)} size="small" color="primary"><SearchIcon /></IconButton>
            <Tooltip title="Adjust thresholds">
              <IconButton size="small" onClick={() => setShowConfig((v) => !v)} color={showConfig ? 'primary' : 'default'}>
                <TuneIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <IconButton onClick={() => refetch()} size="small"><RefreshIcon sx={{ fontSize: 18 }} /></IconButton>
          </Box>

          <Collapse in={showConfig}>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {[
                { label: `Volume spike threshold: ${volMult}× avg`, value: volMult, set: setVolMult, min: 1.5, max: 10, step: 0.5 },
                { label: `Gap open threshold: ${gapPct}%`,          value: gapPct,  set: setGapPct,  min: 0.5, max: 15, step: 0.5 },
                { label: `RSI overbought: ${rsiHi}`,                value: rsiHi,   set: setRsiHi,   min: 65,  max: 99, step: 1   },
                { label: `RSI oversold: ${rsiLo}`,                  value: rsiLo,   set: setRsiLo,   min: 1,   max: 35, step: 1   },
                { label: `Large move threshold: ${movePct}%`,       value: movePct, set: setMovePct, min: 1,   max: 20, step: 0.5 },
              ].map(({ label, value, set, min, max, step }) => (
                <Grid item xs={12} sm={6} md={4} key={label}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Slider
                    value={value} min={min} max={max} step={step} size="small"
                    onChange={(_, v) => set(v as number)}
                  />
                </Grid>
              ))}
            </Grid>
          </Collapse>
        </CardContent>
      </Card>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">Failed to scan for anomalies.</Alert>}

      {data.length > 0 && (
        <>
          {/* Stats */}
          <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.disabled">ANOMALIES FOUND</Typography>
              <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace">{data.length}</Typography>
            </Box>
            {critical > 0 && (
              <Box>
                <Typography variant="caption" color="text.disabled">CRITICAL</Typography>
                <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color: '#FF6B6B' }}>{critical}</Typography>
              </Box>
            )}
            {warning > 0 && (
              <Box>
                <Typography variant="caption" color="text.disabled">WARNING</Typography>
                <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color: '#F59E0B' }}>{warning}</Typography>
              </Box>
            )}
          </Box>

          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['Sev', 'Symbol', 'Price', 'Change', 'Volume', 'Vol Ratio', 'RSI', 'Gap', 'Flags'].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.map((row) => {
                      const sev = SEV_META[row.severity] ?? SEV_META.info
                      return (
                        <TableRow key={row.symbol} hover>
                          <TableCell>
                            <Chip
                              size="small" label={row.severity.toUpperCase()}
                              sx={{ bgcolor: sev.bg, color: sev.color, fontWeight: 700, fontSize: '0.6rem', height: 17 }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main', fontSize: '0.8rem' }}>
                            {row.symbol}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                            {row.price != null ? `$${row.price.toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem',
                            color: (row.change_pct ?? 0) >= 0 ? '#00C896' : '#FF6B6B' }}>
                            {pct(row.change_pct)}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem' }}>
                            {row.volume != null ? row.volume.toLocaleString() : '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem',
                            color: (row.volume_ratio ?? 0) > 5 ? '#FF6B6B' : (row.volume_ratio ?? 0) > 2.5 ? '#F59E0B' : 'text.primary' }}>
                            {row.volume_ratio != null ? `${row.volume_ratio}×` : '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem',
                            color: (row.rsi_14 ?? 50) > 70 ? '#FF6B6B' : (row.rsi_14 ?? 50) < 30 ? '#00C896' : 'text.primary' }}>
                            {row.rsi_14 ?? '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem',
                            color: (row.gap_pct ?? 0) > 0 ? '#00C896' : (row.gap_pct ?? 0) < 0 ? '#FF6B6B' : 'text.secondary' }}>
                            {row.gap_pct != null ? pct(row.gap_pct) : '—'}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 300 }}>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              {row.anomalies.map((flag, i) => (
                                <Chip key={i} label={flag} size="small"
                                  sx={{ height: 17, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.05)', color: 'text.secondary' }} />
                              ))}
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
        </>
      )}

      {!isLoading && data.length === 0 && !error && (
        <Alert severity="success">
          No anomalies detected in your watchlist with the current thresholds.
          Try lowering the volume multiplier or move threshold.
        </Alert>
      )}
    </Box>
  )
}
