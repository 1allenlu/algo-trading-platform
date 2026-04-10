/**
 * Dividend Tracker — Phase 71.
 *
 * Shows dividend yield, ex-date, payout ratio, frequency,
 * and 12-quarter payment history for a customisable watchlist.
 */

import { useState } from 'react'
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  Grid, IconButton, InputAdornment, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material'
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  AttachMoney as DivIcon,
} from '@mui/icons-material'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { api, type DividendSummary } from '@/services/api'

const DEFAULT_SYMBOLS = 'AAPL,MSFT,JNJ,KO,PG,VZ,T,XOM,JPM,MCD,PEP,WMT,HD,CVX,BAC'

function YieldBadge({ yield: y }: { yield: number | null }) {
  if (y == null || y === 0) return <Typography variant="caption" color="text.disabled">No div</Typography>
  const color = y > 5 ? '#00C896' : y > 2 ? '#4A9EFF' : '#94a3b8'
  return (
    <Typography variant="body2" fontFamily="IBM Plex Mono, monospace" fontWeight={700} sx={{ color }}>
      {y.toFixed(2)}%
    </Typography>
  )
}

function DetailCard({ data }: { data: DividendSummary }) {
  if (!data.history || data.history.length === 0) return null
  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <DivIcon sx={{ fontSize: 18, color: '#00C896' }} />
          <Typography variant="subtitle2" fontWeight={700}>{data.symbol} — Payment History</Typography>
          {data.frequency && (
            <Chip label={data.frequency} size="small"
              sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#4A9EFF22', color: '#4A9EFF' }} />
          )}
        </Box>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data.history.slice().reverse()} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d) => d.slice(2, 7)} />
            <YAxis tick={{ fontSize: 9 }} width={42} tickFormatter={(v) => `$${v.toFixed(2)}`} />
            <RTooltip
              formatter={(v: number) => [`$${v.toFixed(4)}`, 'Dividend']}
              contentStyle={{ background: '#12161F', border: '1px solid #2D3548', fontSize: 11 }}
            />
            <Bar dataKey="amount" fill="#00C896" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export default function DividendsPage() {
  const [input,     setInput]     = useState(DEFAULT_SYMBOLS)
  const [symbols,   setSymbols]   = useState(DEFAULT_SYMBOLS)
  const [selected,  setSelected]  = useState<DividendSummary | null>(null)

  const { data = [], isLoading, error, refetch } = useQuery<DividendSummary[]>({
    queryKey:  ['dividends', symbols],
    queryFn:   () => api.dividends.getCalendar(symbols),
    staleTime: 60 * 60_000,
    retry: 1,
  })

  const paying = data.filter((d) => (d.dividend_yield ?? 0) > 0)

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Dividend Tracker</Typography>
        <Typography variant="body2" color="text.secondary">
          Dividend yield, ex-date, payout ratio, and historical payment chart.
          Click a row to see the payment history. Data via yfinance (cached 1 hr).
        </Typography>
      </Box>

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
            <IconButton onClick={() => refetch()} size="small"><RefreshIcon sx={{ fontSize: 18 }} /></IconButton>
          </Box>
        </CardContent>
      </Card>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">Failed to load dividend data.</Alert>}

      {data.length > 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={selected ? 7 : 12}>
            {/* Summary stats */}
            <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="caption" color="text.disabled">PAYING DIVIDENDS</Typography>
                <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace">{paying.length} / {data.length}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.disabled">AVG YIELD</Typography>
                <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color: '#00C896' }}>
                  {paying.length > 0
                    ? `${(paying.reduce((s, d) => s + (d.dividend_yield ?? 0), 0) / paying.length).toFixed(2)}%`
                    : '—'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.disabled">HIGHEST YIELD</Typography>
                <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color: '#00C896' }}>
                  {paying.length > 0 ? `${paying[0].dividend_yield?.toFixed(2)}%` : '—'}
                </Typography>
              </Box>
            </Box>

            <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {['Symbol', 'Company', 'Yield', 'Annual Div', 'Ex-Date', 'Payout Ratio', 'Frequency', 'Sector'].map((h) => (
                          <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.map((row) => (
                        <TableRow
                          key={row.symbol} hover
                          onClick={() => setSelected(selected?.symbol === row.symbol ? null : row)}
                          sx={{
                            cursor: 'pointer',
                            bgcolor: selected?.symbol === row.symbol ? 'rgba(74,158,255,0.06)' : 'transparent',
                          }}
                        >
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main', fontSize: '0.8rem' }}>
                            {row.symbol}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', maxWidth: 160 }}>
                            {row.company_name ?? '—'}
                          </TableCell>
                          <TableCell><YieldBadge yield={row.dividend_yield} /></TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                            {row.trailing_annual_div != null ? `$${row.trailing_annual_div.toFixed(4)}` : '—'}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {row.ex_dividend_date ?? '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem',
                            color: (row.payout_ratio ?? 0) > 100 ? '#FF6B6B' : 'text.primary' }}>
                            {row.payout_ratio != null && row.payout_ratio > 0 ? `${row.payout_ratio.toFixed(1)}%` : '—'}
                          </TableCell>
                          <TableCell>
                            {row.frequency ? (
                              <Chip label={row.frequency} size="small"
                                sx={{ height: 17, fontSize: '0.62rem', bgcolor: '#4A9EFF22', color: '#4A9EFF' }} />
                            ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.73rem', color: 'text.secondary' }}>
                            {row.sector ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          {selected && (
            <Grid item xs={12} md={5}>
              <DetailCard data={selected} />
            </Grid>
          )}
        </Grid>
      )}

      {!isLoading && data.length === 0 && !error && (
        <Alert severity="info">No dividend data returned. Try different symbols.</Alert>
      )}
    </Box>
  )
}
