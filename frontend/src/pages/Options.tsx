/**
 * Options Chain — Phase 27.
 *
 * Displays call + put option chains for a chosen equity and expiry.
 * Data sourced via yfinance (15-min delayed for free accounts).
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ Symbol input · Expiry selector · current px  │
 *   ├──────────────┬───────────────────────────────┤
 *   │   CALLS      │   PUTS                        │
 *   │ Strike table │ Strike table (mirrored)        │
 *   └──────────────┴───────────────────────────────┘
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { api, OptionContract, OptionsChain } from '@/services/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct = (v: number | null) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`

const num = (v: number | null, dp = 2) =>
  v === null ? '—' : v.toFixed(dp)

// ── Options table ──────────────────────────────────────────────────────────────

interface ContractTableProps {
  contracts:    OptionContract[]
  type:         'call' | 'put'
  currentPrice: number | null
}

function ContractTable({ contracts, type, currentPrice }: ContractTableProps) {
  // Highlight strikes near the money (within 5%)
  const isNTM = (strike: number) =>
    currentPrice ? Math.abs(strike - currentPrice) / currentPrice < 0.05 : false

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 480 }}>
        <TableHead>
          <TableRow>
            {['Strike', 'Last', 'Bid', 'Ask', 'IV', 'Vol', 'OI', 'ITM'].map((h) => (
              <TableCell
                key={h}
                align={h === 'ITM' ? 'center' : 'right'}
                sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem', color: 'text.secondary', py: 0.75 }}
              >
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {contracts.map((c) => {
            const ntm = isNTM(c.strike)
            const bgColor = c.in_the_money
              ? type === 'call' ? 'rgba(0,200,150,0.06)' : 'rgba(255,107,107,0.06)'
              : 'transparent'
            return (
              <TableRow
                key={c.strike}
                sx={{
                  bgcolor:    bgColor,
                  outline:    ntm ? '1px solid rgba(74,158,255,0.4)' : 'none',
                  outlineOffset: '-1px',
                  '&:hover':  { bgcolor: 'rgba(255,255,255,0.03)' },
                }}
              >
                <TableCell
                  align="right"
                  sx={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '0.78rem',
                    fontWeight: ntm ? 700 : 400,
                    color: ntm ? '#4A9EFF' : 'text.primary',
                  }}
                >
                  {c.strike.toFixed(2)}
                </TableCell>
                <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem' }}>
                  {num(c.last_price)}
                </TableCell>
                <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', color: 'text.secondary' }}>
                  {num(c.bid)}
                </TableCell>
                <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', color: 'text.secondary' }}>
                  {num(c.ask)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '0.75rem',
                    color: c.implied_volatility > 0.5 ? '#FF6B6B' : c.implied_volatility > 0.3 ? '#F59E0B' : 'text.secondary',
                  }}
                >
                  {c.implied_volatility > 0 ? pct(c.implied_volatility) : '—'}
                </TableCell>
                <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem' }}>
                  {c.volume.toLocaleString()}
                </TableCell>
                <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', color: 'text.secondary' }}>
                  {c.open_interest.toLocaleString()}
                </TableCell>
                <TableCell align="center">
                  {c.in_the_money && (
                    <Chip
                      label="ITM"
                      size="small"
                      sx={{
                        fontSize: '0.6rem',
                        height: 16,
                        bgcolor: type === 'call' ? 'rgba(0,200,150,0.18)' : 'rgba(255,107,107,0.18)',
                        color:   type === 'call' ? '#00C896' : '#FF6B6B',
                      }}
                    />
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OptionsPage() {
  const [symbol, setSymbol] = useState('SPY')
  const [input,  setInput]  = useState('SPY')
  const [expiry, setExpiry] = useState<string>('')

  // Fetch options chain
  const { data, isLoading, isError, isFetching } = useQuery<OptionsChain>({
    queryKey:  ['options', symbol, expiry || null],
    queryFn:   () => api.options.getChain(symbol, expiry || undefined),
    staleTime: 5 * 60_000,
    enabled:   symbol.length > 0,
  })

  const handleSearch = () => {
    const sym = input.trim().toUpperCase()
    if (sym) {
      setSymbol(sym)
      setExpiry('')
    }
  }

  const expirations = data?.expirations ?? []

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3 }}>
        <Box>
          <Typography variant="h4">Options Chain</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Calls &amp; Puts — 15-min delayed via yfinance
          </Typography>
        </Box>

        {data?.current_price && (
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="body2" color="text.secondary">Underlying</Typography>
            <Typography variant="h5" sx={{ fontFamily: 'IBM Plex Mono, monospace', color: '#E8EAED' }}>
              ${data.current_price.toFixed(2)}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label="Symbol"
              value={input}
              size="small"
              sx={{ width: 120 }}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              inputProps={{ style: { fontFamily: 'IBM Plex Mono, monospace' } }}
            />

            <FormControl size="small" sx={{ minWidth: 180 }} disabled={expirations.length === 0}>
              <InputLabel>Expiry</InputLabel>
              <Select
                value={expiry || (expirations[0] ?? '')}
                label="Expiry"
                onChange={(e) => setExpiry(e.target.value)}
              >
                {expirations.map((d) => (
                  <MenuItem key={d} value={d} sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.85rem' }}>
                    {d}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {isFetching && <CircularProgress size={18} />}
          </Box>
        </CardContent>
      </Card>

      {/* Error */}
      {isError && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Failed to load options for <strong>{symbol}</strong>. Options may not be available for this ticker.
        </Alert>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {/* No data */}
      {!isLoading && data && data.calls.length === 0 && data.puts.length === 0 && (
        <Alert severity="info">
          No options data available for <strong>{symbol}</strong> on expiry <strong>{data.expiration}</strong>.
        </Alert>
      )}

      {/* Calls + Puts side by side */}
      {!isLoading && data && (data.calls.length > 0 || data.puts.length > 0) && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6">Calls</Typography>
                    <Chip label={`${data.calls.length} contracts`} size="small" sx={{ bgcolor: 'rgba(0,200,150,0.12)', color: '#00C896', fontSize: '0.7rem' }} />
                  </Box>
                }
                subheader={`Expiry: ${data.expiration}`}
                sx={{ pb: 0.5 }}
              />
              <CardContent sx={{ pt: 0.5 }}>
                <ContractTable
                  contracts={data.calls}
                  type="call"
                  currentPrice={data.current_price}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6">Puts</Typography>
                    <Chip label={`${data.puts.length} contracts`} size="small" sx={{ bgcolor: 'rgba(255,107,107,0.12)', color: '#FF6B6B', fontSize: '0.7rem' }} />
                  </Box>
                }
                subheader={`Expiry: ${data.expiration}`}
                sx={{ pb: 0.5 }}
              />
              <CardContent sx={{ pt: 0.5 }}>
                <ContractTable
                  contracts={data.puts}
                  type="put"
                  currentPrice={data.current_price}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
