/**
 * Crypto page — Phase 32.
 *
 * Displays a table of supported cryptocurrency pairs with latest price,
 * 24h change, and volume from the local TimescaleDB.
 *
 * Data is ingested via "Sync Crypto Data" button → POST /api/crypto/ingest
 * which downloads 5yr daily OHLCV from yfinance into market_data.
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  CurrencyBitcoin as CryptoIcon,
  Refresh as RefreshIcon,
  SyncAlt as SyncIcon,
  TrendingDown,
  TrendingUp,
} from '@mui/icons-material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { CryptoSymbolInfo } from '@/services/api'

// ── Category chip ─────────────────────────────────────────────────────────────

function CategoryChip({ label }: { label: string }) {
  const colors: Record<string, string> = {
    'Layer 1': '#6366F1', 'Layer 0': '#8B5CF6',
    'DeFi':    '#10B981', 'Meme':    '#F59E0B',
  }
  const color = colors[label] ?? '#94A3B8'
  return (
    <Chip
      label={label}
      size="small"
      sx={{ bgcolor: color + '22', color, fontWeight: 700, fontSize: '0.68rem' }}
    />
  )
}

// ── Sparkline (last 7 bars from cached data) ──────────────────────────────────
// Lightweight inline SVG path — no chart library needed

function Sparkline({ symbol, isPos }: { symbol: string; isPos: boolean | null }) {
  const { data } = useQuery({
    queryKey: ['market', symbol, 14],
    queryFn:  () => api.market.getData(symbol, 14),
    staleTime: 5 * 60_000,
  })
  const bars = data?.bars ?? []
  if (bars.length < 2) return <Box sx={{ width: 80 }} />

  const prices = bars.map(b => b.close)
  const min    = Math.min(...prices)
  const max    = Math.max(...prices)
  const range  = max - min || 1
  const W = 80, H = 28
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W
    const y = H - ((p - min) / range) * H
    return `${x},${y}`
  }).join(' ')

  const color = isPos === false ? '#FF6B6B' : '#00C896'
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CryptoPage() {
  const qc = useQueryClient()
  const [snack, setSnack] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey:  ['crypto', 'symbols'],
    queryFn:   () => api.crypto.getSymbols(),
    staleTime: 60_000,
  })

  const { mutate: ingest, isPending: ingesting } = useMutation({
    mutationFn: () => api.crypto.ingest(),
    onSuccess:  (res) => {
      const total = (res as any).results?.reduce((s: number, r: any) => s + (r.inserted ?? 0), 0) ?? 0
      setSnack(`Synced ${total.toLocaleString()} bars across ${(res as any).total_symbols} pairs`)
      qc.invalidateQueries({ queryKey: ['crypto'] })
      qc.invalidateQueries({ queryKey: ['market'] })
    },
    onError: () => setSnack('Sync failed — check backend logs'),
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CryptoIcon sx={{ color: 'primary.main' }} />
            Crypto
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Daily OHLCV from yfinance — stored in TimescaleDB alongside equities
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small" variant="outlined" startIcon={<RefreshIcon />}
            onClick={() => refetch()}
          >
            Refresh
          </Button>
          <Button
            size="small" variant="contained" startIcon={ingesting ? <CircularProgress size={14} /> : <SyncIcon />}
            onClick={() => ingest()}
            disabled={ingesting}
          >
            {ingesting ? 'Syncing…' : 'Sync Crypto Data'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>Failed to load crypto symbols.</Alert>
      )}

      <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 0 }}>
          {isLoading
            ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            : (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                    {['Asset', 'Symbol', 'Category', '7-Day', 'Price (USD)', '24h Change', 'Volume'].map(h => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data as CryptoSymbolInfo[] ?? []).map(row => {
                    const isPos = row.change_pct === null ? null : row.change_pct >= 0
                    return (
                      <TableRow
                        key={row.symbol}
                        sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}>{row.name}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="caption"
                            sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}
                          >
                            {row.symbol}
                          </Typography>
                        </TableCell>
                        <TableCell><CategoryChip label={row.category} /></TableCell>
                        <TableCell>
                          <Sparkline symbol={row.symbol} isPos={isPos} />
                        </TableCell>
                        <TableCell>
                          {row.last_price != null
                            ? <Typography variant="body2" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>
                                ${row.last_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: row.last_price < 1 ? 6 : 2 })}
                              </Typography>
                            : <Typography variant="caption" color="text.disabled">—</Typography>
                          }
                        </TableCell>
                        <TableCell>
                          {row.change_pct != null ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {isPos
                                ? <TrendingUp sx={{ fontSize: 14, color: 'secondary.main' }} />
                                : <TrendingDown sx={{ fontSize: 14, color: 'error.main' }} />}
                              <Typography
                                variant="caption"
                                sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: isPos ? 'secondary.main' : 'error.main' }}
                              >
                                {isPos ? '+' : ''}{row.change_pct.toFixed(2)}%
                              </Typography>
                            </Box>
                          ) : (
                            <Tooltip title="Run 'Sync Crypto Data' to load prices">
                              <Typography variant="caption" color="text.disabled">No data</Typography>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'IBM Plex Mono, monospace', color: 'text.secondary' }}>
                            {row.volume != null ? row.volume.toLocaleString() : '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )
          }
        </CardContent>
      </Card>

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </Box>
  )
}
