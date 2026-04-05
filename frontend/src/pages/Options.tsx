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
  Button,
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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Search as ScanIcon } from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, type OptionContract, type OptionsChain, type ScreenedSymbol } from '@/services/api'

// ── Options Screener (Phase 50) ────────────────────────────────────────────────

const SCREEN_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META']

function OptionsScreener() {
  const [strategy, setStrategy] = useState<'covered_call' | 'cash_secured_put' | 'iron_condor'>('covered_call')
  const [symbols,  setSymbols]  = useState(SCREEN_SYMBOLS.join(','))
  const [enabled,  setEnabled]  = useState(false)

  const { data, isLoading, isError, refetch } = useQuery<ScreenedSymbol[]>({
    queryKey:  ['options-screen', strategy, symbols],
    queryFn:   () => api.optionsScreener.scan(symbols.split(',').map((s) => s.trim()).filter(Boolean), strategy),
    enabled,
    staleTime: 5 * 60_000,
  })

  const STRATEGY_LABELS: Record<string, string> = {
    covered_call:    'Covered Call',
    cash_secured_put:'Cash-Secured Put',
    iron_condor:     'Iron Condor',
  }

  return (
    <Box>
      <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Strategy</InputLabel>
              <Select value={strategy} label="Strategy"
                onChange={(e) => { setStrategy(e.target.value as typeof strategy); setEnabled(false) }}>
                {Object.entries(STRATEGY_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              size="small" label="Symbols (comma-separated)" value={symbols}
              onChange={(e) => setSymbols(e.target.value.toUpperCase())}
              sx={{ minWidth: 280 }} />
            <Button
              variant="contained" size="small"
              startIcon={isLoading ? <CircularProgress size={14} color="inherit" /> : <ScanIcon />}
              onClick={() => { setEnabled(true); refetch() }}
              disabled={isLoading}
              sx={{ textTransform: 'none' }}>
              {isLoading ? 'Scanning…' : 'Scan'}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {strategy === 'covered_call' && 'Near-the-money calls with IV ≥ 20%, 0–8% OTM. Best for selling premium against long stock positions.'}
            {strategy === 'cash_secured_put' && 'Near-the-money puts with IV ≥ 20%, 0–8% OTM. Best for acquiring stock at a discount while collecting premium.'}
            {strategy === 'iron_condor' && 'Balanced put + call spreads with positive net credit. Best in low-volatility, range-bound markets.'}
          </Typography>
        </CardContent>
      </Card>

      {isError && <Alert severity="warning" sx={{ mb: 2 }}>Scan failed. yfinance may be rate-limited — try fewer symbols.</Alert>}

      {data && data.length === 0 && (
        <Alert severity="info">No opportunities found matching the criteria. Try different symbols or a different strategy.</Alert>
      )}

      {data && data.map((sym) => (
        <Card key={sym.symbol} sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} fontFamily="IBM Plex Mono, monospace" color="primary.main">
                {sym.symbol}
              </Typography>
              {sym.current_price && (
                <Typography variant="body2" color="text.secondary">${sym.current_price.toFixed(2)}</Typography>
              )}
              <Chip label={STRATEGY_LABELS[strategy]} size="small" color="primary" variant="outlined" sx={{ fontSize: '0.65rem' }} />
              <Chip label={`Exp: ${sym.expiration}`} size="small" sx={{ fontSize: '0.65rem' }} />
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {strategy === 'iron_condor'
                      ? ['Short Put', 'Long Put', 'Short Call', 'Long Call', 'Net Credit', 'Max Loss', 'Credit/Risk'].map((h) => (
                          <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                        ))
                      : ['Strike', 'IV', 'Premium', 'OTM %', 'Ann. Yield', 'Volume', 'OI'].map((h) => (
                          <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                        ))
                    }
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sym.opportunities.map((opp, i) => (
                    <TableRow key={i} hover>
                      {strategy === 'iron_condor' ? (
                        <>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>${opp.short_put_strike?.toFixed(2)}</TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>${opp.long_put_strike?.toFixed(2)}</TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>${opp.short_call_strike?.toFixed(2)}</TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>${opp.long_call_strike?.toFixed(2)}</TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: '#00C896', fontWeight: 700 }}>${opp.net_credit?.toFixed(2)}</TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: '#FF6B6B' }}>${opp.max_loss?.toFixed(2)}</TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: '#00C896' }}>
                            {opp.credit_to_risk != null ? `${(opp.credit_to_risk * 100).toFixed(1)}%` : '—'}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: '0.8rem' }}>${opp.strike?.toFixed(2)}</TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem',
                            color: (opp.iv ?? 0) > 0.5 ? '#FF6B6B' : (opp.iv ?? 0) > 0.3 ? '#F59E0B' : 'text.primary' }}>
                            {opp.iv != null ? `${(opp.iv * 100).toFixed(1)}%` : '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>${opp.premium?.toFixed(2)}</TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>{opp.otm_pct?.toFixed(1)}%</TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: '#00C896' }}>
                            {opp.annualized_yield != null ? `${(opp.annualized_yield * 100).toFixed(1)}%` : '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>{opp.volume?.toLocaleString()}</TableCell>
                          <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>{opp.open_interest?.toLocaleString()}</TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      ))}
    </Box>
  )
}

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
  const [tab,    setTab]    = useState(0)
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 2 }}>
        <Box>
          <Typography variant="h4">Options</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Calls &amp; Puts chain · Strategy Screener — 15-min delayed via yfinance
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

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tab label="Chain" sx={{ textTransform: 'none' }} />
        <Tab label="Screener" sx={{ textTransform: 'none' }} />
      </Tabs>

      {tab === 1 && <OptionsScreener />}

      {tab === 0 && <>
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
      </>}
    </Box>
  )
}
