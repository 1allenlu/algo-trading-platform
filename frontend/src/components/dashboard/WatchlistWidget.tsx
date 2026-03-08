/**
 * WatchlistWidget — live price watchlist for the Dashboard page.
 *
 * Displays a table of symbols with real-time prices from the WebSocket feed.
 * Columns: Symbol | Price | Change ($) | Change (%) | Day Range
 *
 * This component does NOT call useLivePrices() itself — it receives
 * prices and status as props from Dashboard so the single WS connection
 * opened by TopBar is not duplicated on the same page.
 *
 * Note: Dashboard opens its own useLivePrices() separately from TopBar's.
 * Two WS connections total per browser tab — acceptable for this setup.
 */

import {
  Box,
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { TrendingDown, TrendingUp } from '@mui/icons-material'
import type { PriceMap } from '@/hooks/useLivePrices'
import type { WsStatus } from '@/hooks/useWebSocket'

const SYMBOLS = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'TSLA']

interface WatchlistWidgetProps {
  prices: PriceMap
  status: WsStatus
}

function StatusChip({ status }: { status: WsStatus }) {
  const label  = status === 'open' ? 'LIVE' : status === 'connecting' ? 'CONNECTING' : 'RECONNECTING'
  const color  = status === 'open' ? 'success' : status === 'connecting' ? 'warning' : 'default'
  return (
    <Chip
      label={label}
      color={color as 'success' | 'warning' | 'default'}
      size="small"
      sx={{ fontSize: '0.6rem', height: 18, fontWeight: 700 }}
    />
  )
}

export default function WatchlistWidget({ prices, status }: WatchlistWidgetProps) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={700}>Live Watchlist</Typography>
          <StatusChip status={status} />
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Symbol', 'Price', 'Change', '% Change', 'Day Range'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {SYMBOLS.map((sym) => {
                const tick = prices[sym]
                const isUp = (tick?.change_pct ?? 0) >= 0

                return (
                  <TableRow key={sym} hover>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                      {sym}
                    </TableCell>

                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem', fontWeight: 600 }}>
                      {tick ? `$${tick.price.toFixed(2)}` : '—'}
                    </TableCell>

                    <TableCell>
                      {tick ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                          {isUp
                            ? <TrendingUp sx={{ fontSize: 12, color: '#00C896' }} />
                            : <TrendingDown sx={{ fontSize: 12, color: '#FF6B6B' }} />
                          }
                          <Typography
                            variant="caption"
                            fontFamily="IBM Plex Mono, monospace"
                            sx={{ color: isUp ? '#00C896' : '#FF6B6B', fontWeight: 600 }}
                          >
                            {tick.change >= 0 ? '+' : ''}${tick.change.toFixed(2)}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>

                    <TableCell sx={{
                      fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', fontWeight: 700,
                      color: tick ? (isUp ? '#00C896' : '#FF6B6B') : 'text.secondary',
                    }}>
                      {tick ? `${tick.change_pct >= 0 ? '+' : ''}${(tick.change_pct * 100).toFixed(2)}%` : '—'}
                    </TableCell>

                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', color: 'text.secondary' }}>
                      {tick ? `$${tick.low.toFixed(2)} – $${tick.high.toFixed(2)}` : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  )
}
