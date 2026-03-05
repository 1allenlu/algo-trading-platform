/**
 * TickerBar — live price strip rendered inside the TopBar.
 *
 * Shows symbol, price, and colored change% for each tracked symbol.
 * The colored dot on the left shows WebSocket connection state:
 *   green pulse = live, amber = connecting, red = error/disconnected.
 *
 * Props come from the TopBar's single useLivePrices() call so the
 * WebSocket connection is shared and not duplicated.
 */

import { Box, Typography } from '@mui/material'
import { TrendingDown, TrendingUp } from '@mui/icons-material'
import type { PriceMap, PriceTick } from '@/hooks/useLivePrices'
import type { WsStatus } from '@/hooks/useWebSocket'

const TICKER_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'TSLA']

interface TickerBarProps {
  prices: PriceMap
  status: WsStatus
}

function TickerItem({ symbol, tick }: { symbol: string; tick: PriceTick | undefined }) {
  if (!tick) {
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.5, opacity: 0.35 }}>
        <Typography variant="caption" fontFamily="Roboto Mono, monospace" fontWeight={700} color="primary.main">
          {symbol}
        </Typography>
        <Typography variant="caption" fontFamily="Roboto Mono, monospace" color="text.disabled">
          —
        </Typography>
      </Box>
    )
  }

  const isUp = tick.change_pct >= 0

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        borderRight: '1px solid',
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      <Typography variant="caption" fontFamily="Roboto Mono, monospace" fontWeight={700} color="primary.main">
        {symbol}
      </Typography>
      <Typography variant="caption" fontFamily="Roboto Mono, monospace" fontWeight={600} color="text.primary">
        ${tick.price.toFixed(2)}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        {isUp
          ? <TrendingUp sx={{ fontSize: 10, color: '#00C896' }} />
          : <TrendingDown sx={{ fontSize: 10, color: '#FF6B6B' }} />
        }
        <Typography
          variant="caption"
          fontFamily="Roboto Mono, monospace"
          sx={{
            color:      isUp ? '#00C896' : '#FF6B6B',
            fontWeight: 700,
            fontSize:   '0.65rem',
          }}
        >
          {isUp ? '+' : ''}{(tick.change_pct * 100).toFixed(2)}%
        </Typography>
      </Box>
    </Box>
  )
}

export default function TickerBar({ prices, status }: TickerBarProps) {
  const dotColor =
    status === 'open'       ? '#00C896' :
    status === 'connecting' ? '#F59E0B' :
                              '#FF6B6B'

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden', mr: 2 }}>
      {/* Connection status dot */}
      <Box
        sx={{
          width: 6, height: 6,
          borderRadius: '50%',
          bgcolor: dotColor,
          flexShrink: 0,
          mr: 1,
          animation: status === 'open' ? 'wsPulse 2s ease-in-out infinite' : 'none',
          '@keyframes wsPulse': {
            '0%':   { opacity: 1 },
            '50%':  { opacity: 0.35 },
            '100%': { opacity: 1 },
          },
        }}
      />

      {/* Ticker items — scroll horizontally on narrow viewports */}
      <Box sx={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        {TICKER_SYMBOLS.map((sym) => (
          <TickerItem key={sym} symbol={sym} tick={prices[sym]} />
        ))}
      </Box>
    </Box>
  )
}
