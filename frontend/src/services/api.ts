/**
 * API client — typed wrappers around axios.
 *
 * Single source of truth for:
 *   - Base URL configuration
 *   - Request/response types (match backend Pydantic schemas)
 *   - Error handling (logged + re-thrown)
 *
 * Usage:
 *   import { api } from '@/services/api'
 *   const data = await api.market.getData('SPY', 252)
 */

import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',  // '' = same origin (proxied by Vite/nginx)
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// Log API errors centrally
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const url     = err.config?.url ?? 'unknown'
    const status  = err.response?.status ?? 'network error'
    const detail  = err.response?.data?.detail ?? err.message
    console.error(`[API] ${status} ${url} — ${detail}`)
    return Promise.reject(err)
  },
)

// ── Response types (mirrors backend app/models/schemas.py) ────────────────────

export interface OHLCVBar {
  symbol:    string
  timestamp: string    // ISO 8601
  open:      number
  high:      number
  low:       number
  close:     number
  volume:    number
}

export interface MarketDataResponse {
  symbol:     string
  bars:       OHLCVBar[]
  count:      number
  start_date: string | null
  end_date:   string | null
}

export interface HealthResponse {
  status:   string   // "healthy" | "degraded"
  database: string
  redis:    string
  version:  string
}

// ── API functions ─────────────────────────────────────────────────────────────

export const api = {
  health: {
    check: (): Promise<HealthResponse> =>
      apiClient.get<HealthResponse>('/api/health').then((r) => r.data),
  },

  market: {
    getData: (symbol: string, limit = 252): Promise<MarketDataResponse> =>
      apiClient
        .get<MarketDataResponse>(`/api/data/market/${symbol}`, { params: { limit } })
        .then((r) => r.data),
  },
}
