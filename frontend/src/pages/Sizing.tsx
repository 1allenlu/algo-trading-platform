/**
 * Position Sizing Calculator — Phase 57.
 *
 * Computes optimal position sizes using three methods:
 *   • Full Kelly Criterion (f* = edge / odds)
 *   • Half-Kelly (conservative, reduces variance)
 *   • Fixed fractional (1% / 2% risk per trade)
 *   • Volatility-adjusted (scale by ATR / price as proxy for risk)
 *
 * Pure frontend — no backend calls needed.
 */

import { useState, useMemo } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Divider,
  Grid,
  InputAdornment,
  Slider,
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
import { InfoOutlined as InfoIcon } from '@mui/icons-material'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SizingResult {
  method:           string
  description:      string
  fraction_pct:     number | null
  shares:           number | null
  dollar_risk:      number | null
  max_loss:         number | null
  warning?:         string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(v: number | null) {
  if (v === null) return '—'
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtPct(v: number | null) {
  if (v === null) return '—'
  return `${v.toFixed(2)}%`
}

function fmtShares(v: number | null) {
  if (v === null) return '—'
  return Math.floor(v).toLocaleString()
}

// ── Computation ───────────────────────────────────────────────────────────────

function compute(
  equity:     number,
  winRate:    number,    // 0-100
  avgWinPct:  number,    // avg win as % of position
  avgLossPct: number,    // avg loss as % of position (positive)
  price:      number,    // current asset price
  stopPct:    number,    // stop-loss distance as % of price
  atrPct:     number,    // ATR as % of price
): SizingResult[] {
  const w = winRate / 100
  const b = avgWinPct / avgLossPct   // odds ratio

  // Kelly fraction
  const kellyFrac = b > 0 ? (w - (1 - w) / b) : null
  const halfKelly  = kellyFrac !== null ? kellyFrac / 2 : null

  // Dollar risk per trade (stop-loss based)
  const stopFrac    = stopPct / 100
  const dollarRisk1 = equity * 0.01   // 1% fixed
  const dollarRisk2 = equity * 0.02   // 2% fixed

  // Shares for fixed risk
  const stopDollar = price * stopFrac
  const shares1    = stopDollar > 0 ? dollarRisk1 / stopDollar : null
  const shares2    = stopDollar > 0 ? dollarRisk2 / stopDollar : null

  // Kelly shares
  const kellyShares   = kellyFrac !== null ? (equity * Math.max(0, kellyFrac)) / price : null
  const halfKellyShares = halfKelly !== null ? (equity * Math.max(0, halfKelly)) / price : null

  // Volatility-adjusted: risk 1% of equity, size by ATR
  const atrDollar       = price * (atrPct / 100)
  const volAdjShares    = atrDollar > 0 ? dollarRisk1 / atrDollar : null

  return [
    {
      method:       'Full Kelly',
      description:  'Maximises log-growth. Aggressive — can cause large drawdowns.',
      fraction_pct: kellyFrac !== null ? kellyFrac * 100 : null,
      shares:       kellyShares,
      dollar_risk:  kellyShares !== null ? kellyShares * price * stopFrac : null,
      max_loss:     kellyShares !== null ? kellyShares * price * stopFrac : null,
      warning:      (kellyFrac ?? 0) > 0.25 ? 'Kelly > 25% — extremely aggressive' : undefined,
    },
    {
      method:       'Half-Kelly',
      description:  'Half the Kelly fraction. Better Sharpe, lower variance.',
      fraction_pct: halfKelly !== null ? halfKelly * 100 : null,
      shares:       halfKellyShares,
      dollar_risk:  halfKellyShares !== null ? halfKellyShares * price * stopFrac : null,
      max_loss:     halfKellyShares !== null ? halfKellyShares * price * stopFrac : null,
    },
    {
      method:       'Fixed 1% Risk',
      description:  'Risk exactly 1% of equity per trade. Conservative and consistent.',
      fraction_pct: shares1 !== null ? (shares1 * price / equity) * 100 : null,
      shares:       shares1,
      dollar_risk:  dollarRisk1,
      max_loss:     dollarRisk1,
    },
    {
      method:       'Fixed 2% Risk',
      description:  'Risk exactly 2% of equity per trade. Standard professional rule.',
      fraction_pct: shares2 !== null ? (shares2 * price / equity) * 100 : null,
      shares:       shares2,
      dollar_risk:  dollarRisk2,
      max_loss:     dollarRisk2,
    },
    {
      method:       'ATR-Adjusted (1× ATR stop)',
      description:  '1% equity risk, stop set at 1× ATR from entry.',
      fraction_pct: volAdjShares !== null ? (volAdjShares * price / equity) * 100 : null,
      shares:       volAdjShares,
      dollar_risk:  dollarRisk1,
      max_loss:     dollarRisk1,
    },
  ]
}

// ── Input field component ─────────────────────────────────────────────────────

function NumField({
  label, value, onChange, adornment, help, min, max, step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  adornment?: string
  help?: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        {help && (
          <Tooltip title={help} placement="top">
            <InfoIcon sx={{ fontSize: 13, color: 'text.disabled', cursor: 'help' }} />
          </Tooltip>
        )}
      </Box>
      <TextField
        size="small" type="number" fullWidth
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(v)
        }}
        inputProps={{ min, max, step: step ?? 1, style: { fontFamily: 'IBM Plex Mono, monospace' } }}
        InputProps={adornment ? {
          startAdornment: <InputAdornment position="start"><Typography variant="caption">{adornment}</Typography></InputAdornment>,
        } : undefined}
      />
    </Box>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SizingPage() {
  const [equity,     setEquity]     = useState(100_000)
  const [winRate,    setWinRate]    = useState(55)
  const [avgWinPct,  setAvgWinPct]  = useState(6)
  const [avgLossPct, setAvgLossPct] = useState(3)
  const [price,      setPrice]      = useState(100)
  const [stopPct,    setStopPct]    = useState(2)
  const [atrPct,     setAtrPct]     = useState(1.5)

  const results = useMemo(
    () => compute(equity, winRate, avgWinPct, avgLossPct, price, stopPct, atrPct),
    [equity, winRate, avgWinPct, avgLossPct, price, stopPct, atrPct],
  )

  const edgeStr  = ((winRate / 100) * avgWinPct - (1 - winRate / 100) * avgLossPct).toFixed(2)
  const edgePos  = parseFloat(edgeStr) > 0

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Position Sizing Calculator</Typography>
        <Typography variant="body2" color="text.secondary">
          Compute optimal share quantities using Kelly Criterion, fixed fractional, and volatility-adjusted methods.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Inputs */}
        <Grid item xs={12} md={5}>
          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>Inputs</Typography>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <NumField
                    label="Account Equity" value={equity} onChange={setEquity}
                    adornment="$" min={1000} step={1000}
                    help="Total paper trading account value"
                  />
                </Grid>
                <Grid item xs={6}>
                  <NumField
                    label="Asset Price" value={price} onChange={setPrice}
                    adornment="$" min={0.01} step={1}
                    help="Current price of the asset to trade"
                  />
                </Grid>
                <Grid item xs={6}>
                  <NumField
                    label="Stop-Loss %" value={stopPct} onChange={setStopPct}
                    adornment="%" min={0.1} max={20} step={0.1}
                    help="How far below entry you would exit if wrong"
                  />
                </Grid>
                <Grid item xs={6}>
                  <NumField
                    label="ATR %" value={atrPct} onChange={setAtrPct}
                    adornment="%" min={0.1} max={20} step={0.1}
                    help="Average True Range as % of price (volatility proxy)"
                  />
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={700} mb={2}>Historical Edge</Typography>

              <Box mb={2}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">Win Rate</Typography>
                  <Typography variant="caption" fontFamily="IBM Plex Mono, monospace" fontWeight={700}>
                    {winRate}%
                  </Typography>
                </Box>
                <Slider
                  value={winRate} min={10} max={90} step={1}
                  onChange={(_, v) => setWinRate(v as number)}
                  size="small"
                  marks={[{ value: 50, label: '50%' }]}
                />
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <NumField
                    label="Avg Win %" value={avgWinPct} onChange={setAvgWinPct}
                    adornment="%" min={0.1} max={100} step={0.5}
                    help="Average winning trade return as % of position"
                  />
                </Grid>
                <Grid item xs={6}>
                  <NumField
                    label="Avg Loss %" value={avgLossPct} onChange={setAvgLossPct}
                    adornment="%" min={0.1} max={100} step={0.5}
                    help="Average losing trade loss as % of position (enter positive)"
                  />
                </Grid>
              </Grid>

              {/* Edge summary */}
              <Box
                sx={{
                  mt: 2, p: 1.5, borderRadius: 1.5,
                  bgcolor: edgePos ? 'rgba(0,200,150,0.08)' : 'rgba(255,107,107,0.08)',
                  border: '1px solid',
                  borderColor: edgePos ? 'rgba(0,200,150,0.3)' : 'rgba(255,107,107,0.3)',
                }}
              >
                <Typography variant="caption" color="text.secondary">Expected Edge per Trade</Typography>
                <Typography variant="h6" fontFamily="IBM Plex Mono, monospace" fontWeight={700} sx={{ color: edgePos ? '#00C896' : '#FF6B6B' }}>
                  {edgePos ? '+' : ''}{edgeStr}%
                </Typography>
                {!edgePos && (
                  <Typography variant="caption" color="error.main">
                    Negative edge — Kelly recommends not trading this setup.
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Results */}
        <Grid item xs={12} md={7}>
          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>Sizing Results</Typography>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['Method', '% of Equity', 'Shares', 'Position $', 'Max Loss $'].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.map((r) => (
                      <TableRow key={r.method} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{r.method}</Typography>
                          <Typography variant="caption" color="text.disabled" display="block">
                            {r.description}
                          </Typography>
                          {r.warning && (
                            <Typography variant="caption" color="warning.main">{r.warning}</Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', fontWeight: 700 }}>
                          {fmtPct(r.fraction_pct)}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                          {fmtShares(r.shares)}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                          {r.shares !== null ? fmt$(r.shares * price) : '—'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: '#FF6B6B' }}>
                          {fmt$(r.max_loss)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Alert severity="info" sx={{ mt: 2, fontSize: '0.75rem' }}>
                Results assume $<strong>{equity.toLocaleString()}</strong> equity · ${price.toLocaleString()} entry ·
                {stopPct}% stop-loss. Kelly formula: f* = (bp − q) / b where b = avg_win / avg_loss.
              </Alert>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
