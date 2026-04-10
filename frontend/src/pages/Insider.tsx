/**
 * Insider Transactions — Phase 76.
 *
 * Shows recent SEC insider buy/sell filings for a ticker symbol.
 * Data via yfinance (ticker.insider_transactions), cached 2 hours.
 *
 * Buys highlighted in green, sales in red.
 */

import { useState } from 'react'
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  IconButton, InputAdornment, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import { Refresh as RefreshIcon, Search as SearchIcon } from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, type InsiderTransaction } from '@/services/api'

const QUICK_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'JPM']

function fmtValue(v: number | null) {
  if (v == null) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function fmtShares(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function InsiderPage() {
  const [input,   setInput]   = useState('AAPL')
  const [symbol,  setSymbol]  = useState('AAPL')

  const { data = [], isLoading, error, refetch } = useQuery<InsiderTransaction[]>({
    queryKey:  ['insider', symbol],
    queryFn:   () => api.insider.get(symbol),
    staleTime: 2 * 60 * 60_000,
    retry: 1,
  })

  const buys  = data.filter((r) => r.is_buy)
  const sales = data.filter((r) => !r.is_buy)
  const buyValue  = buys.reduce((s, r) => s + (r.value ?? 0), 0)
  const saleValue = sales.reduce((s, r) => s + (r.value ?? 0), 0)

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Insider Transactions</Typography>
        <Typography variant="body2" color="text.secondary">
          Recent SEC insider buying and selling activity. Data via yfinance (cached 2 hr).
        </Typography>
      </Box>

      {/* Search bar */}
      <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small" placeholder="Symbol…" value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && setSymbol(input)}
              sx={{ width: 140 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
                sx: { fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 },
              }}
            />
            <IconButton onClick={() => setSymbol(input)} size="small" color="primary"><SearchIcon /></IconButton>
            {QUICK_SYMBOLS.map((s) => (
              <Chip key={s} label={s} size="small" clickable
                onClick={() => { setInput(s); setSymbol(s) }}
                sx={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  bgcolor: symbol === s ? 'rgba(74,158,255,0.12)' : 'transparent',
                  color:   symbol === s ? 'primary.main' : 'text.secondary',
                  border: '1px solid', borderColor: symbol === s ? 'primary.main' : 'divider',
                  fontWeight: symbol === s ? 700 : 400,
                }}
              />
            ))}
            <IconButton onClick={() => refetch()} size="small" sx={{ ml: 'auto' }}>
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">Failed to load insider transactions for {symbol}.</Alert>}

      {data.length > 0 && (
        <>
          {/* Stats */}
          <Box sx={{ display: 'flex', gap: 4, mb: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.disabled">TOTAL TRANSACTIONS</Typography>
              <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace">{data.length}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.disabled">INSIDER BUYS</Typography>
              <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color: '#00C896' }}>
                {buys.length}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.disabled">INSIDER SALES</Typography>
              <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color: '#FF6B6B' }}>
                {sales.length}
              </Typography>
            </Box>
            {buyValue > 0 && (
              <Box>
                <Typography variant="caption" color="text.disabled">BUY VALUE</Typography>
                <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color: '#00C896' }}>
                  {fmtValue(buyValue)}
                </Typography>
              </Box>
            )}
            {saleValue > 0 && (
              <Box>
                <Typography variant="caption" color="text.disabled">SALE VALUE</Typography>
                <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace" sx={{ color: '#FF6B6B' }}>
                  {fmtValue(saleValue)}
                </Typography>
              </Box>
            )}
          </Box>

          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <TableContainer sx={{ maxHeight: 520 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Type', 'Date', 'Insider', 'Role', 'Shares', 'Value', 'Transaction'].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary', bgcolor: 'background.paper' }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.map((row, i) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Chip
                            size="small"
                            label={row.is_buy ? 'BUY' : 'SELL'}
                            sx={{
                              height: 17, fontSize: '0.6rem', fontWeight: 700,
                              bgcolor: row.is_buy ? '#00C89622' : '#FF6B6B22',
                              color:   row.is_buy ? '#00C896'   : '#FF6B6B',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                          {row.date || '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500, maxWidth: 160 }}>
                          {row.insider}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                          {row.relation || '—'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem' }}>
                          {fmtShares(row.shares)}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem',
                          color: row.is_buy ? '#00C896' : '#FF6B6B' }}>
                          {fmtValue(row.value)}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                          {row.transaction || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}

      {!isLoading && data.length === 0 && !error && (
        <Alert severity="info">
          No insider transaction data found for {symbol}.
          Some tickers may not have recent filings in yfinance.
        </Alert>
      )}
    </Box>
  )
}
