/**
 * Pattern Recognition Page — Phase 41.
 *
 * Scans daily OHLCV data for classic candlestick patterns:
 *   Doji, Hammer, Shooting Star, Engulfing, Morning/Evening Star,
 *   Three White Soldiers, Three Black Crows.
 *
 * Shows a filterable table sorted newest-first with signal color coding.
 */

import {
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import {
  CandlestickChart as PatternIcon,
  Search as SearchIcon,
  TrendingDown,
  TrendingFlat,
  TrendingUp,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type PatternSignal } from '@/services/api'

// ── Signal badge ──────────────────────────────────────────────────────────────

const SIGNAL_COLOR = {
  bullish: { bg: 'rgba(6,214,160,0.12)', text: '#06d6a0', label: 'Bullish' },
  bearish: { bg: 'rgba(255,107,107,0.12)', text: '#ff6b6b', label: 'Bearish' },
  neutral: { bg: 'rgba(148,163,184,0.12)', text: '#94a3b8', label: 'Neutral' },
} as const

function SignalChip({ signal }: { signal: PatternSignal['signal'] }) {
  const { bg, text, label } = SIGNAL_COLOR[signal]
  const Icon =
    signal === 'bullish' ? TrendingUp : signal === 'bearish' ? TrendingDown : TrendingFlat
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: '2px',
        borderRadius: '4px',
        bgcolor: bg,
        color: text,
        fontSize: '0.72rem',
        fontWeight: 600,
        fontFamily: 'IBM Plex Mono, monospace',
      }}
    >
      <Icon sx={{ fontSize: 13 }} />
      {label}
    </Box>
  )
}

// ── Pattern table ─────────────────────────────────────────────────────────────

function PatternTable({ patterns }: { patterns: PatternSignal[] }) {
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}>DATE</TableCell>
            <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}>PATTERN</TableCell>
            <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}>SIGNAL</TableCell>
            <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}>CLOSE</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {patterns.map((p, idx) => (
            <TableRow key={`${p.date}-${p.pattern}-${idx}`} hover>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                {p.date}
              </TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', fontWeight: 600 }}>
                {p.pattern}
              </TableCell>
              <TableCell>
                <SignalChip signal={p.signal} />
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                {p.close.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type SignalFilter = 'all' | 'bullish' | 'bearish' | 'neutral'

export default function PatternsPage() {
  const [input,       setInput]       = useState('SPY')
  const [symbol,      setSymbol]      = useState('SPY')
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all')

  const { data, isFetching, error } = useQuery({
    queryKey:  ['patterns', symbol],
    queryFn:   () => api.patterns.get(symbol, 252),
    staleTime: 5 * 60 * 1000,
    enabled:   !!symbol,
  })

  const handleSearch = () => {
    const s = input.trim().toUpperCase()
    if (s) setSymbol(s)
  }

  const filtered =
    data?.patterns.filter(
      (p) => signalFilter === 'all' || p.signal === signalFilter,
    ) ?? []

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <PatternIcon sx={{ color: '#4A9EFF', fontSize: 22 }} />
        <Typography variant="h6" fontWeight={700}>
          Candlestick Pattern Recognition
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          Doji · Hammer · Engulfing · Morning Star · Three Soldiers
        </Typography>
      </Stack>

      {/* Controls */}
      <Stack direction="row" gap={1.5} sx={{ mb: 3 }} flexWrap="wrap" alignItems="center">
        <TextField
          size="small"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Ticker…"
          sx={{ width: 160 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            sx: { fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.85rem' },
          }}
        />
        <Button variant="contained" size="small" onClick={handleSearch} disableElevation>
          Scan
        </Button>

        <ToggleButtonGroup
          size="small"
          value={signalFilter}
          exclusive
          onChange={(_, val) => val && setSignalFilter(val)}
          sx={{ ml: 1 }}
        >
          <ToggleButton value="all"     sx={{ fontSize: '0.7rem', px: 1.5 }}>All</ToggleButton>
          <ToggleButton value="bullish" sx={{ fontSize: '0.7rem', px: 1.5, color: '#06d6a0' }}>Bullish</ToggleButton>
          <ToggleButton value="bearish" sx={{ fontSize: '0.7rem', px: 1.5, color: '#ff6b6b' }}>Bearish</ToggleButton>
          <ToggleButton value="neutral" sx={{ fontSize: '0.7rem', px: 1.5 }}>Neutral</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Status chips */}
      {data && (
        <Stack direction="row" gap={1} sx={{ mb: 2 }} flexWrap="wrap">
          <Chip
            label={`${data.bars_scanned} bars scanned`}
            size="small"
            variant="outlined"
            sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}
          />
          <Chip
            label={`${data.count} patterns found`}
            size="small"
            variant="outlined"
            sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}
          />
          <Chip
            label={`${filtered.length} shown`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}
          />
        </Stack>
      )}

      {/* Loading */}
      {isFetching && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4 }}>
          <CircularProgress size={20} />
          <Typography color="text.secondary">Scanning {symbol} for patterns…</Typography>
        </Box>
      )}

      {/* Error */}
      {error && !isFetching && (
        <Paper variant="outlined" sx={{ p: 3, borderColor: 'error.main', borderRadius: 2 }}>
          <Typography color="error.main" fontWeight={600}>
            No data found for {symbol}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Make sure the symbol has been ingested. Run <code>make ingest</code> to download data.
          </Typography>
        </Paper>
      )}

      {/* Results */}
      {!isFetching && data && filtered.length === 0 && (
        <Typography color="text.secondary" sx={{ py: 3 }}>
          No {signalFilter !== 'all' ? signalFilter : ''} patterns found in the last {data.bars_scanned} bars.
        </Typography>
      )}

      {!isFetching && filtered.length > 0 && <PatternTable patterns={filtered} />}
    </Box>
  )
}
