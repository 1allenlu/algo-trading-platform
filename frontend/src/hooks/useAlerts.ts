/**
 * useAlerts — receives real-time alert events from the /ws/alerts WebSocket.
 *
 * Accumulates an in-memory list of alerts (newest first), capped at MAX_ALERTS.
 * The unreadCount is the number of alerts received since the last acknowledge.
 *
 * Usage:
 *   const { alerts, unreadCount, clearUnread } = useAlerts()
 *
 * Components can call clearUnread() to reset the badge when the user opens
 * the notification panel (this does NOT acknowledge events in the DB).
 * Call api.alerts.acknowledgeAll() separately to persist the read state.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSocket } from './useWebSocket'
import type { AlertWsMessage } from '@/services/api'

const MAX_ALERTS = 200

export interface UseAlertsResult {
  alerts:     AlertWsMessage[]
  unreadCount: number
  clearUnread: () => void
}

export function useAlerts(): UseAlertsResult {
  const { lastMessage } = useWebSocket<AlertWsMessage>('/ws/alerts')
  const [alerts, setAlerts]           = useState<AlertWsMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  useEffect(() => {
    if (!lastMessage) return
    // Validate that it's an alert message (WebSocket might carry other payloads)
    if (lastMessage.type !== 'alert') return

    setAlerts((prev) => [lastMessage, ...prev].slice(0, MAX_ALERTS))
    setUnreadCount((n) => n + 1)
  }, [lastMessage])

  const clearUnread = useCallback(() => {
    setUnreadCount(0)
  }, [])

  return { alerts, unreadCount, clearUnread }
}
