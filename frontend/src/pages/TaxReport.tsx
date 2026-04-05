/**
 * Tax Report — Phase 47.
 *
 * FIFO / LIFO capital gains report derived from paper trading fills.
 * Short-term vs long-term split, open lots, and wash-sale warnings.
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { Warning as WarnIcon } from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, type TaxLotRealized, type TaxLotOpen, type WashSaleWarning } from '@/services/api'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}$${abs}`
}

function pnlColor(n: number) {
  if (n > 0) return '#00C896'
  if (n < 0) return '#FF6B6B'
  return 'text.primary'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

// ── Summary KPI strip ──────────────────────────────────────────────────────────

function SummaryStrip({ summary }: { summary: ReturnType<typeof api.tax.getReport> extends Promise<infer T> ? T['summary'] : never }) {
  const items = [
    { label: 'Short-Term Net', value: fmt$(summary.short_term_net), color: pnlColor(summary.short_term_net) },
    { label: 'Long-Term Net',  value: fmt$(summary.long_term_net),  color: pnlColor(summary.long_term_net)  },
    { label: 'Total Realized', value: fmt$(summary.total_realized), color: pnlColor(summary.total_realized) },
    { label: 'Open Lots',      value: String(summary.n_open_lots),  color: 'text.primary' },
    { label: 'Wash Sales',     value: String(summary.n_wash_sales), color: summary.n_wash_sales > 0 ? '#F59E0B' : 'text.primary' },
  ]

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {items.map(({ label, value, color }) => (
            <Box key={label}>
              <Typography variant="caption" color="text.disabled" display="block">{label.toUpperCase()}</Typography>
              <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Realized Lots table ────────────────────────────────────────────────────────

function RealizedTable({ lots }: { lots: TaxLotRealized[] }) {
  if (!lots.length) return (
    <Typography variant="body2" color="text.secondary" py={2} textAlign="center">
      No realized lots yet. Make some sells to see gains/losses here.
    </Typography>
  )

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Symbol', 'Qty', 'Cost Basis', 'Proceeds', 'Acquired', 'Disposed', 'Held', 'P&L', 'Term'].map((h) => (
              <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {lots.map((lot, i) => (
            <TableRow key={i} hover>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>{lot.symbol}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>{lot.qty}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>${lot.cost_basis.toFixed(2)}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>${lot.proceeds_per_share.toFixed(2)}</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{fmtDate(lot.acquired)}</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{fmtDate(lot.disposed)}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>{lot.days_held}d</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: pnlColor(lot.pnl), fontWeight: 700 }}>
                {fmt$(lot.pnl)}
              </TableCell>
              <TableCell>
                <Chip
                  label={lot.term === 'long' ? 'Long-term' : 'Short-term'}
                  size="small"
                  color={lot.term === 'long' ? 'success' : 'default'}
                  sx={{ fontSize: '0.62rem', height: 18 }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ── Open Lots table ────────────────────────────────────────────────────────────

function OpenLotsTable({ lots }: { lots: TaxLotOpen[] }) {
  if (!lots.length) return (
    <Typography variant="body2" color="text.secondary" py={2} textAlign="center">No open lots.</Typography>
  )

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Symbol', 'Qty', 'Cost Basis', 'Total Cost', 'Acquired', 'Held', 'Status'].map((h) => (
              <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {lots.map((lot, i) => (
            <TableRow key={i} hover>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>{lot.symbol}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>{lot.qty}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>${lot.cost_basis.toFixed(2)}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>${lot.total_cost.toFixed(2)}</TableCell>
              <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{fmtDate(lot.acquired)}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>{lot.days_held}d</TableCell>
              <TableCell>
                <Chip
                  label={lot.days_held >= 365 ? 'Long-term' : 'Short-term'}
                  size="small"
                  color={lot.days_held >= 365 ? 'success' : 'default'}
                  sx={{ fontSize: '0.62rem', height: 18 }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ── Wash Sale Warnings ─────────────────────────────────────────────────────────

function WashSaleList({ warnings }: { warnings: WashSaleWarning[] }) {
  if (!warnings.length) return null

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle2" fontWeight={700} mb={1} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <WarnIcon sx={{ fontSize: 16, color: '#F59E0B' }} />
        Potential Wash Sale Violations ({warnings.length})
      </Typography>
      {warnings.map((w, i) => (
        <Alert key={i} severity="warning" sx={{ mb: 1, fontSize: '0.78rem' }}>
          <strong>{w.symbol}</strong>: {fmt$(w.loss_amount)} loss on {fmtDate(w.disposed)},
          repurchased {Math.abs(w.days_difference)}d {w.days_difference < 0 ? 'before' : 'after'} ({fmtDate(w.repurchase_date)}).
          The IRS may disallow this loss deduction.
        </Alert>
      ))}
    </Box>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TaxReportPage() {
  const [method, setMethod] = useState<'FIFO' | 'LIFO'>('FIFO')

  const { data, isLoading, error } = useQuery({
    queryKey:  ['tax-report', method],
    queryFn:   () => api.tax.getReport(method),
    staleTime: 30_000,
  })

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Tax Report</Typography>
        <Typography variant="body2" color="text.secondary">
          Capital gains analysis from paper trading fills — FIFO or LIFO lot matching.
          Short-term (&lt;365 days) vs long-term (≥365 days) breakdown with wash-sale detection.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="body2" color="text.secondary">Accounting method:</Typography>
        <ToggleButtonGroup
          value={method} exclusive
          onChange={(_, v) => v && setMethod(v)}
          size="small"
          sx={{ '& .MuiToggleButton-root': { py: 0.5, px: 2, textTransform: 'none', fontSize: '0.8rem' } }}
        >
          <ToggleButton value="FIFO">FIFO</ToggleButton>
          <ToggleButton value="LIFO">LIFO</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error    && <Alert severity="error" sx={{ mb: 2 }}>Failed to load tax report.</Alert>}

      {data && (
        <>
          <SummaryStrip summary={data.summary} />

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={2}>
                    Realized Lots ({data.realized_lots.length})
                  </Typography>
                  <RealizedTable lots={data.realized_lots} />
                  <WashSaleList warnings={data.wash_sales} />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight={700}>Open Lots ({data.open_lots.length})</Typography>
                    <Tooltip title="Unrealized positions — gains/losses here are not yet taxable">
                      <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help', mt: 0.25 }}>
                        (unrealized)
                      </Typography>
                    </Tooltip>
                  </Box>
                  <OpenLotsTable lots={data.open_lots} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  )
}
