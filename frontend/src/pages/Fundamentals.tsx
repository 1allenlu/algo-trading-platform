/**
 * Fundamentals Page — Phase 40.
 *
 * Shows key fundamental metrics for any stock symbol:
 *   - Valuation: P/E, Forward P/E, P/B, P/S, PEG, EV/EBITDA
 *   - Earnings:  EPS TTM, EPS Forward
 *   - Financials: Revenue, Gross Profit, EBITDA, Profit Margin
 *   - Growth:    Revenue Growth, Earnings Growth
 *   - Size:      Market Cap, Enterprise Value, Shares Outstanding
 *   - Risk:      Beta, Dividend Yield
 *   - Range:     52-Week High/Low
 *   - Analyst:   Target Price, # Analysts, Recommendation
 *
 * Data sourced from yfinance (15-min delayed).
 */

import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  AccountBalance as FundIcon,
  Search as SearchIcon,
  TrendingUp as BullIcon,
  TrendingDown as BearIcon,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type FundamentalsData } from '@/services/api'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: number | null | undefined, decimals = 2, suffix = ''): string {
  if (val == null) return '—'
  return `${val.toFixed(decimals)}${suffix}`
}

function fmtLarge(val: number | null | undefined): string {
  if (val == null) return '—'
  if (Math.abs(val) >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (Math.abs(val) >= 1e9)  return `$${(val / 1e9).toFixed(2)}B`
  if (Math.abs(val) >= 1e6)  return `$${(val / 1e6).toFixed(2)}M`
  return `$${val.toFixed(0)}`
}

function fmtPct(val: number | null | undefined): string {
  if (val == null) return '—'
  return `${(val * 100).toFixed(2)}%`
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  tooltip,
  color,
}: {
  label: string
  value: string
  tooltip?: string
  color?: string
}) {
  const inner = (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2,
        minWidth: 130,
        flex: 1,
        cursor: tooltip ? 'help' : 'default',
      }}
    >
      <Typography
        sx={{ fontSize: '0.65rem', fontFamily: 'IBM Plex Mono, monospace', color: 'text.disabled', mb: 0.5 }}
      >
        {label}
      </Typography>
      <Typography
        sx={{ fontSize: '1rem', fontWeight: 600, color: color ?? 'text.primary', fontFamily: 'IBM Plex Mono, monospace' }}
      >
        {value}
      </Typography>
    </Paper>
  )
  return tooltip ? <Tooltip title={tooltip}>{inner}</Tooltip> : inner
}

// ── Section heading ───────────────────────────────────────────────────────────

function Section({ title }: { title: string }) {
  return (
    <Box sx={{ mt: 3, mb: 1 }}>
      <Typography
        sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', color: 'text.disabled', textTransform: 'uppercase', fontFamily: 'IBM Plex Mono, monospace' }}
      >
        {title}
      </Typography>
      <Divider sx={{ mt: 0.5 }} />
    </Box>
  )
}

// ── Fundamentals panel ────────────────────────────────────────────────────────

function FundamentalsPanel({ data }: { data: FundamentalsData }) {
  const recColor = (rec: string | null) => {
    if (!rec) return 'default' as const
    const r = rec.toLowerCase()
    if (r.includes('buy') || r === 'strong_buy') return 'success' as const
    if (r.includes('sell') || r === 'strong_sell') return 'error' as const
    return 'default' as const
  }

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {data.company_name ?? data.symbol}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {[data.sector, data.industry].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        {data.recommendation && (
          <Chip
            label={data.recommendation.toUpperCase().replace('_', ' ')}
            color={recColor(data.recommendation)}
            size="small"
            sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}
          />
        )}
      </Stack>

      {/* Valuation */}
      <Section title="Valuation" />
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <MetricCard label="P/E (TTM)"      value={fmt(data.pe_ratio)}   tooltip="Price / Trailing 12-month Earnings" />
        <MetricCard label="Forward P/E"    value={fmt(data.forward_pe)} tooltip="Price / Estimated Next-Year Earnings" />
        <MetricCard label="P/B"            value={fmt(data.pb_ratio)}   tooltip="Price / Book Value" />
        <MetricCard label="P/S (TTM)"      value={fmt(data.ps_ratio)}   tooltip="Price / Trailing 12-month Sales" />
        <MetricCard label="PEG"            value={fmt(data.peg_ratio)}  tooltip="P/E ÷ Earnings Growth Rate" />
        <MetricCard label="EV/EBITDA"      value={fmt(data.ev_ebitda)}  tooltip="Enterprise Value / EBITDA" />
      </Stack>

      {/* Earnings */}
      <Section title="Earnings Per Share" />
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <MetricCard label="EPS (TTM)"      value={fmt(data.eps_ttm, 2, '')} />
        <MetricCard label="EPS (Forward)"  value={fmt(data.eps_forward, 2, '')} />
      </Stack>

      {/* Financials */}
      <Section title="Financials (TTM)" />
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <MetricCard label="Revenue"        value={fmtLarge(data.revenue_ttm)} />
        <MetricCard label="Gross Profit"   value={fmtLarge(data.gross_profit)} />
        <MetricCard label="EBITDA"         value={fmtLarge(data.ebitda)} />
        <MetricCard
          label="Profit Margin"
          value={fmtPct(data.profit_margin)}
          color={data.profit_margin != null ? (data.profit_margin >= 0 ? '#06d6a0' : '#ff6b6b') : undefined}
        />
      </Stack>

      {/* Growth */}
      <Section title="Growth" />
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <MetricCard
          label="Revenue Growth (YoY)"
          value={fmtPct(data.revenue_growth)}
          color={data.revenue_growth != null ? (data.revenue_growth >= 0 ? '#06d6a0' : '#ff6b6b') : undefined}
          tooltip="Year-over-year revenue growth"
        />
        <MetricCard
          label="Earnings Growth (YoY)"
          value={fmtPct(data.earnings_growth)}
          color={data.earnings_growth != null ? (data.earnings_growth >= 0 ? '#06d6a0' : '#ff6b6b') : undefined}
          tooltip="Year-over-year earnings growth"
        />
      </Stack>

      {/* Size */}
      <Section title="Size" />
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <MetricCard label="Market Cap"        value={fmtLarge(data.market_cap)} />
        <MetricCard label="Enterprise Value"  value={fmtLarge(data.enterprise_value)} />
        <MetricCard label="Shares Out."       value={data.shares_outstanding != null ? `${(data.shares_outstanding / 1e6).toFixed(1)}M` : '—'} />
      </Stack>

      {/* Risk */}
      <Section title="Risk & Income" />
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <MetricCard
          label="Beta"
          value={fmt(data.beta)}
          tooltip="Sensitivity to market movements (1.0 = market)"
          color={data.beta != null ? (data.beta > 1.5 ? '#f59e0b' : undefined) : undefined}
        />
        <MetricCard
          label="Dividend Yield"
          value={fmtPct(data.dividend_yield)}
          tooltip="Annual dividend / current price"
        />
      </Stack>

      {/* 52-week range */}
      <Section title="52-Week Range" />
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <MetricCard label="52W High" value={fmt(data.week52_high)} color="#06d6a0" />
        <MetricCard label="52W Low"  value={fmt(data.week52_low)}  color="#ff6b6b" />
      </Stack>

      {/* Analyst */}
      <Section title="Analyst Coverage" />
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <MetricCard label="Target Price"  value={fmt(data.target_mean_price)} />
        <MetricCard label="# Analysts"    value={data.analyst_count != null ? String(data.analyst_count) : '—'} />
      </Stack>
    </Box>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FundamentalsPage() {
  const [input,  setInput]  = useState('AAPL')
  const [symbol, setSymbol] = useState('AAPL')

  const { data, isFetching, error } = useQuery({
    queryKey:  ['fundamentals', symbol],
    queryFn:   () => api.fundamentals.get(symbol),
    staleTime: 15 * 60 * 1000,   // 15 min — matches yfinance delay
    enabled:   !!symbol,
  })

  const handleSearch = () => {
    const s = input.trim().toUpperCase()
    if (s) setSymbol(s)
  }

  return (
    <Box>
      {/* Page header */}
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <FundIcon sx={{ color: '#4A9EFF', fontSize: 22 }} />
        <Typography variant="h6" fontWeight={700}>
          Fundamental Data
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          P/E · EPS · Revenue · Market Cap · Analyst Targets
        </Typography>
      </Stack>

      {/* Search bar */}
      <Stack direction="row" gap={1} sx={{ mb: 3, maxWidth: 360 }}>
        <TextField
          size="small"
          fullWidth
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Enter ticker…"
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
          Fetch
        </Button>
      </Stack>

      {/* Content */}
      {isFetching && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4 }}>
          <CircularProgress size={20} />
          <Typography color="text.secondary">Loading fundamentals for {symbol}…</Typography>
        </Box>
      )}

      {error && !isFetching && (
        <Paper
          variant="outlined"
          sx={{ p: 3, borderColor: 'error.main', borderRadius: 2 }}
        >
          <Typography color="error.main" fontWeight={600}>
            Failed to load data for {symbol}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            The symbol may not be supported by yfinance, or the request timed out. Try a different ticker.
          </Typography>
        </Paper>
      )}

      {data && !isFetching && <FundamentalsPanel data={data} />}
    </Box>
  )
}
