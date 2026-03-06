/**
 * Market Scanner — Phase 11.
 *
 * Technical screener that filters all symbols in the DB against indicator criteria.
 *
 * Layout:
 *   ┌───────────────────────────────────────────────────────┐
 *   │ Preset buttons (Oversold, Overbought, Momentum, etc.) │
 *   ├───────────────────────────────────────────────────────┤
 *   │ Filter panel: RSI, MA relationships, volume, change%  │
 *   │ Sort controls + [Run Scan] button                     │
 *   ├───────────────────────────────────────────────────────┤
 *   │ Results table: Symbol | Price | Chg% | RSI |          │
 *   │   vs SMA50 | vs SMA200 | Vol Ratio | 52w Pos          │
 *   └───────────────────────────────────────────────────────┘
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormGroup,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
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
  FilterList as FilterIcon,
  Search as ScanIcon,
  TrendingDown as BearIcon,
  TrendingUp as BullIcon,
} from '@mui/icons-material'

import { api, ScanRequest, SymbolSnapshot } from '@/services/api'

// ── Presets ────────────────────────────────────────────────────────────────────

const PRESETS: Record<string, { label: string; req: ScanRequest }> = {
  oversold: {
    label: 'Oversold',
    req: { rsi_max: 35, sort_by: 'rsi', sort_desc: false },
  },
  overbought: {
    label: 'Overbought',
    req: { rsi_min: 65, sort_by: 'rsi', sort_desc: true },
  },
  momentum: {
    label: 'Momentum',
    req: { price_above_sma50: true, price_above_sma200: true, sort_by: 'vs_sma200', sort_desc: true },
  },
  breakdown: {
    label: 'Breakdown',
    req: { price_below_sma50: true, price_below_sma200: true, sort_by: 'vs_sma200', sort_desc: false },
  },
  volume_spike: {
    label: 'Volume Spike',
    req: { volume_ratio_min: 1.5, sort_by: 'volume_ratio', sort_desc: true },
  },
  near_52w_high: {
    label: 'Near 52w High',
    req: { near_52w_high_pct: 5, sort_by: 'vs_52w_high', sort_desc: false },
  },
  all: {
    label: 'All Symbols',
    req: { sort_by: 'symbol', sort_desc: false },
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pctColor(v: number) {
  return v > 0 ? 'success.main' : v < 0 ? 'error.main' : 'text.secondary'
}

function rsiColor(rsi: number) {
  if (rsi >= 70) return '#EF4444'
  if (rsi <= 30) return '#10B981'
  return '#888'
}

function fmt(v: number | null, digits = 2, suffix = ''): string {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(digits)}${suffix}`
}

function pctFmt(v: number | null): string {
  if (v === null || v === undefined) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(2)}%`
}

// ── Results table ─────────────────────────────────────────────────────────────

function ResultsTable({ rows }: { rows: SymbolSnapshot[] }) {
  if (!rows.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No symbols match the current filters.
      </Typography>
    )
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {[
              'Symbol', 'Price', 'Chg %', 'RSI(14)',
              'vs SMA50', 'vs SMA200', 'Vol Ratio',
              '52w High', '52w Low',
            ].map((h) => (
              <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.symbol}
              sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}
            >
              <TableCell>
                <Typography variant="caption" fontWeight={700} color="primary.main">
                  {r.symbol}
                </Typography>
                <Typography variant="caption" color="text.disabled" display="block">
                  {r.bar_count} bars
                </Typography>
              </TableCell>

              <TableCell>
                <Typography variant="caption" fontFamily="Roboto Mono, monospace" fontWeight={600}>
                  ${fmt(r.price, 2)}
                </Typography>
              </TableCell>

              <TableCell>
                <Typography variant="caption" color={pctColor(r.change_pct)} fontWeight={600}>
                  {r.change_pct > 0 ? '+' : ''}{fmt(r.change_pct, 2)}%
                </Typography>
              </TableCell>

              <TableCell>
                <Tooltip title={`RSI ${r.rsi_14 >= 70 ? '— Overbought' : r.rsi_14 <= 30 ? '— Oversold' : ''}`}>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      px: 0.8,
                      py: 0.2,
                      borderRadius: 1,
                      bgcolor: `${rsiColor(r.rsi_14)}22`,
                    }}
                  >
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      sx={{ color: rsiColor(r.rsi_14), fontFamily: 'Roboto Mono, monospace' }}
                    >
                      {fmt(r.rsi_14, 1)}
                    </Typography>
                  </Box>
                </Tooltip>
              </TableCell>

              <TableCell>
                <Typography
                  variant="caption"
                  color={r.vs_sma50 !== null ? pctColor(r.vs_sma50) : 'text.disabled'}
                >
                  {pctFmt(r.vs_sma50)}
                </Typography>
              </TableCell>

              <TableCell>
                <Typography
                  variant="caption"
                  color={r.vs_sma200 !== null ? pctColor(r.vs_sma200) : 'text.disabled'}
                >
                  {pctFmt(r.vs_sma200)}
                </Typography>
              </TableCell>

              <TableCell>
                <Typography
                  variant="caption"
                  color={
                    r.volume_ratio !== null && r.volume_ratio > 1.5
                      ? 'warning.main'
                      : 'text.secondary'
                  }
                  fontWeight={r.volume_ratio !== null && r.volume_ratio > 1.5 ? 700 : 400}
                >
                  {r.volume_ratio !== null ? `${fmt(r.volume_ratio, 2)}×` : '—'}
                </Typography>
              </TableCell>

              <TableCell>
                <Tooltip title={`52w High: $${fmt(r.high_52w, 2)}`}>
                  <Typography variant="caption" color="text.secondary">
                    {fmt(r.vs_52w_high * 100, 1)}% below
                  </Typography>
                </Tooltip>
              </TableCell>

              <TableCell>
                <Tooltip title={`52w Low: $${fmt(r.low_52w, 2)}`}>
                  <Typography variant="caption" color="text.secondary">
                    {fmt(r.vs_52w_low * 100, 1)}% above
                  </Typography>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  // Filter state
  const [rsiMax,           setRsiMax]           = useState<string>('')
  const [rsiMin,           setRsiMin]           = useState<string>('')
  const [aboveSma50,       setAboveSma50]       = useState(false)
  const [belowSma50,       setBelowSma50]       = useState(false)
  const [aboveSma200,      setAboveSma200]      = useState(false)
  const [belowSma200,      setBelowSma200]      = useState(false)
  const [volRatioMin,      setVolRatioMin]      = useState<string>('')
  const [changePctMin,     setChangePctMin]     = useState<string>('')
  const [changePctMax,     setChangePctMax]     = useState<string>('')
  const [near52High,       setNear52High]       = useState<string>('')
  const [near52Low,        setNear52Low]        = useState<string>('')
  const [sortBy,           setSortBy]           = useState<ScanRequest['sort_by']>('symbol')
  const [sortDesc,         setSortDesc]         = useState(false)
  const [activePreset,     setActivePreset]     = useState<string | null>(null)

  // Results state
  const [results,  setResults]  = useState<SymbolSnapshot[] | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  function applyPreset(key: string) {
    setActivePreset(key)
    const { req } = PRESETS[key]
    // Reset all filters then apply preset values
    setRsiMax(req.rsi_max !== undefined ? String(req.rsi_max) : '')
    setRsiMin(req.rsi_min !== undefined ? String(req.rsi_min) : '')
    setAboveSma50(req.price_above_sma50 ?? false)
    setBelowSma50(req.price_below_sma50 ?? false)
    setAboveSma200(req.price_above_sma200 ?? false)
    setBelowSma200(req.price_below_sma200 ?? false)
    setVolRatioMin(req.volume_ratio_min !== undefined ? String(req.volume_ratio_min) : '')
    setChangePctMin('')
    setChangePctMax('')
    setNear52High(req.near_52w_high_pct !== undefined ? String(req.near_52w_high_pct) : '')
    setNear52Low('')
    setSortBy(req.sort_by ?? 'symbol')
    setSortDesc(req.sort_desc ?? false)
  }

  async function runScan() {
    setLoading(true)
    setError(null)
    try {
      const req: ScanRequest = {
        ...(rsiMax      ? { rsi_max:           parseFloat(rsiMax)      } : {}),
        ...(rsiMin      ? { rsi_min:           parseFloat(rsiMin)      } : {}),
        ...(aboveSma50  ? { price_above_sma50:  true }                   : {}),
        ...(belowSma50  ? { price_below_sma50:  true }                   : {}),
        ...(aboveSma200 ? { price_above_sma200: true }                   : {}),
        ...(belowSma200 ? { price_below_sma200: true }                   : {}),
        ...(volRatioMin ? { volume_ratio_min:   parseFloat(volRatioMin) } : {}),
        ...(changePctMin ? { change_pct_min:    parseFloat(changePctMin) } : {}),
        ...(changePctMax ? { change_pct_max:    parseFloat(changePctMax) } : {}),
        ...(near52High  ? { near_52w_high_pct:  parseFloat(near52High)  } : {}),
        ...(near52Low   ? { near_52w_low_pct:   parseFloat(near52Low)   } : {}),
        sort_by:   sortBy,
        sort_desc: sortDesc,
      }
      const data = await api.scanner.scan(req)
      setResults(data)
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Scan failed — check backend logs'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ScanIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        <Box>
          <Typography variant="h5" fontWeight={700} lineHeight={1.2}>
            Market Scanner
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Screen symbols by RSI, moving averages, volume, and price action
          </Typography>
        </Box>
      </Box>

      {/* ── Presets ─────────────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="caption" color="text.disabled" display="block" mb={1}>
          Quick presets
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
          {Object.entries(PRESETS).map(([key, { label }]) => (
            <Chip
              key={key}
              label={label}
              onClick={() => applyPreset(key)}
              variant={activePreset === key ? 'filled' : 'outlined'}
              color={activePreset === key ? 'primary' : 'default'}
              size="small"
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>
      </Paper>

      {/* ── Filter panel ────────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <FilterIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          <Typography variant="subtitle2" fontWeight={700}>
            Filters
          </Typography>
        </Box>
        <Grid container spacing={2}>
          {/* RSI */}
          <Grid item xs={6} sm={3}>
            <TextField
              label="RSI max (≤)"
              value={rsiMax}
              onChange={(e) => { setRsiMax(e.target.value); setActivePreset(null) }}
              size="small"
              fullWidth
              placeholder="e.g. 30"
              inputProps={{ type: 'number', min: 0, max: 100 }}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              label="RSI min (≥)"
              value={rsiMin}
              onChange={(e) => { setRsiMin(e.target.value); setActivePreset(null) }}
              size="small"
              fullWidth
              placeholder="e.g. 70"
              inputProps={{ type: 'number', min: 0, max: 100 }}
            />
          </Grid>

          {/* Volume */}
          <Grid item xs={6} sm={3}>
            <TextField
              label="Vol ratio min (≥)"
              value={volRatioMin}
              onChange={(e) => { setVolRatioMin(e.target.value); setActivePreset(null) }}
              size="small"
              fullWidth
              placeholder="e.g. 1.5"
              inputProps={{ type: 'number', min: 0, step: 0.1 }}
            />
          </Grid>

          {/* Change % */}
          <Grid item xs={6} sm={3}>
            <TextField
              label="Change % min"
              value={changePctMin}
              onChange={(e) => { setChangePctMin(e.target.value); setActivePreset(null) }}
              size="small"
              fullWidth
              placeholder="e.g. -5"
              inputProps={{ type: 'number' }}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              label="Change % max"
              value={changePctMax}
              onChange={(e) => { setChangePctMax(e.target.value); setActivePreset(null) }}
              size="small"
              fullWidth
              placeholder="e.g. 5"
              inputProps={{ type: 'number' }}
            />
          </Grid>

          {/* 52-week */}
          <Grid item xs={6} sm={3}>
            <TextField
              label="Within N% of 52w High"
              value={near52High}
              onChange={(e) => { setNear52High(e.target.value); setActivePreset(null) }}
              size="small"
              fullWidth
              placeholder="e.g. 5"
              inputProps={{ type: 'number', min: 0 }}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              label="Within N% of 52w Low"
              value={near52Low}
              onChange={(e) => { setNear52Low(e.target.value); setActivePreset(null) }}
              size="small"
              fullWidth
              placeholder="e.g. 5"
              inputProps={{ type: 'number', min: 0 }}
            />
          </Grid>

          {/* MA toggles */}
          <Grid item xs={12}>
            <FormGroup row sx={{ gap: 2 }}>
              <FormControlLabel
                control={<Switch size="small" checked={aboveSma50}  onChange={(e) => { setAboveSma50(e.target.checked);  setActivePreset(null) }} />}
                label={<Typography variant="caption">Above SMA50</Typography>}
              />
              <FormControlLabel
                control={<Switch size="small" checked={belowSma50}  onChange={(e) => { setBelowSma50(e.target.checked);  setActivePreset(null) }} />}
                label={<Typography variant="caption">Below SMA50</Typography>}
              />
              <FormControlLabel
                control={<Switch size="small" checked={aboveSma200} onChange={(e) => { setAboveSma200(e.target.checked); setActivePreset(null) }} />}
                label={<Typography variant="caption">Above SMA200</Typography>}
              />
              <FormControlLabel
                control={<Switch size="small" checked={belowSma200} onChange={(e) => { setBelowSma200(e.target.checked); setActivePreset(null) }} />}
                label={<Typography variant="caption">Below SMA200</Typography>}
              />
            </FormGroup>
          </Grid>

          {/* Sort */}
          <Grid item xs={6} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Sort by</InputLabel>
              <Select
                label="Sort by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as ScanRequest['sort_by'])}
              >
                {(['symbol','rsi','change_pct','volume_ratio','vs_sma50','vs_sma200'] as const).map((v) => (
                  <MenuItem key={v} value={v}>{v}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} sx={{ display: 'flex', alignItems: 'center' }}>
            <FormControlLabel
              control={<Switch size="small" checked={sortDesc} onChange={(e) => setSortDesc(e.target.checked)} />}
              label={<Typography variant="caption">Descending</Typography>}
            />
          </Grid>

          {/* Run button */}
          <Grid item xs={12}>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <ScanIcon />}
              onClick={runScan}
              disabled={loading}
              sx={{ fontWeight: 700 }}
            >
              {loading ? 'Scanning…' : 'Run Scan'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {results !== null && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            {results.length > 0
              ? <BullIcon sx={{ color: 'success.main', fontSize: 18 }} />
              : <BearIcon sx={{ color: 'error.main',   fontSize: 18 }} />
            }
            <Typography variant="subtitle2" fontWeight={700}>
              {results.length} symbol{results.length !== 1 ? 's' : ''} matched
            </Typography>
          </Box>
          <ResultsTable rows={results} />
        </Paper>
      )}
    </Box>
  )
}
