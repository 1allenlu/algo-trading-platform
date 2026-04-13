/**
 * useWebSocket — generic WebSocket hook with auto-reconnect.
 *
 * Features:
 *   - Connects on mount, disconnects on unmount
 *   - Exponential back-off reconnect (1s → 2s → 4s → max 30s)
 *   - Parses incoming JSON messages automatically
 *   - Exposes connection status for UI indicators
 *
 * URL resolution:
 *   VITE_API_URL is "http://localhost:8000" (set in docker-compose).
 *   The browser connects directly to the backend WebSocket endpoint —
 *   no Vite proxy needed since port 8000 is exposed to the host.
 *   http:// → ws://, https:// → wss://
 *
 * Usage:
 *   const { lastMessage, status } = useWebSocket<PriceTick>('/ws/prices')
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error'

export interface UseWebSocketResult<T> {
  lastMessage: T | null
  status:      WsStatus
  reconnect:   () => void
}

const BASE_DELAY_MS = 1_000
const MAX_DELAY_MS  = 30_000

function buildWsUrl(path: string): string {
  // Derive ws:// URL from the REST base URL
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
  if (base) {
    const wsBase = base
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')
      .replace(/\/$/, '')   // strip trailing slash
    return `${wsBase}${path}`
  }
  // Fallback: same host as page (for production nginx setup)
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}

export function useWebSocket<T = unknown>(path: string): UseWebSocketResult<T> {
  const [lastMessage, setLastMessage] = useState<T | null>(null)
  const [status, setStatus]           = useState<WsStatus>('connecting')

  const wsRef      = useRef<WebSocket | null>(null)
  const delayRef   = useRef(BASE_DELAY_MS)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  // Incremented on every connect() call so stale socket callbacks are ignored
  const genRef     = useRef(0)

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    const url = buildWsUrl(path)
    setStatus('connecting')

    const myGen = ++genRef.current
    const ws    = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current || genRef.current !== myGen) return
      setStatus('open')
      delayRef.current = BASE_DELAY_MS   // Reset back-off on success
    }

    ws.onmessage = ({ data }: MessageEvent<string>) => {
      if (!mountedRef.current || genRef.current !== myGen) return
      try {
        setLastMessage(JSON.parse(data) as T)
      } catch {
        // Non-JSON ping/pong — ignore
      }
    }

    ws.onerror = () => {
      if (!mountedRef.current || genRef.current !== myGen) return
      setStatus('error')
    }

    ws.onclose = () => {
      if (!mountedRef.current || genRef.current !== myGen) return
      setStatus('closed')
      const delay = delayRef.current
      delayRef.current = Math.min(delay * 2, MAX_DELAY_MS)
      timerRef.current = setTimeout(connect, delay)
    }
  }, [path])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      genRef.current++   // Invalidate any in-flight socket from this mount
      if (timerRef.current) clearTimeout(timerRef.current)
      // Only close if not still CONNECTING (avoids StrictMode "closed before established" error)
      const ws = wsRef.current
      if (ws && ws.readyState !== WebSocket.CONNECTING) {
        ws.close()
      } else if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
      }
    }
  }, [connect])

  const reconnect = useCallback(() => {
    wsRef.current?.close()
    delayRef.current = BASE_DELAY_MS
    connect()
  }, [connect])

  return { lastMessage, status, reconnect }
}
