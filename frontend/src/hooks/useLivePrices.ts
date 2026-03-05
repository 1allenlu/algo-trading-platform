/**
 * useLivePrices — accumulates streaming ticks into a per-symbol price map.
 *
 * Subscribes to /ws/prices (all symbols) and updates a Record<symbol, PriceTick>
 * as ticks arrive. Components read the latest price for any symbol from the map.
 *
 * Usage:
 *   const { prices, status } = useLivePrices()
 *   const spy = prices['SPY']   // PriceTick | undefined
 *   const price = prices['SPY']?.price
 */

import { useEffect, useState } from 'react'
import { useWebSocket, type WsStatus } from './useWebSocket'

export interface PriceTick {
  symbol:     string
  price:      number
  open:       number
  high:       number
  low:        number
  prev_close: number
  change:     number
  change_pct: number
  volume:     number
  timestamp:  string
}

export type PriceMap = Record<string, PriceTick>

export interface UseLivePricesResult {
  prices: PriceMap
  status: WsStatus
}

export function useLivePrices(): UseLivePricesResult {
  const { lastMessage, status } = useWebSocket<PriceTick>('/ws/prices')
  const [prices, setPrices] = useState<PriceMap>({})

  useEffect(() => {
    if (!lastMessage) return
    setPrices((prev) => ({ ...prev, [lastMessage.symbol]: lastMessage }))
  }, [lastMessage])

  return { prices, status }
}
