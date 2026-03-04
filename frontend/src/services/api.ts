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

// ── ML types (mirrors backend app/models/schemas.py) ─────────────────────────

export interface MLModelInfo {
  id:                 number
  name:               string
  symbol:             string
  model_type:         string
  version:            number
  accuracy:           number | null
  f1_score:           number | null
  roc_auc:            number | null
  train_samples:      number | null
  test_samples:       number | null
  feature_count:      number | null
  feature_importance: Record<string, number> | null
  created_at:         string
}

export interface MLModelsResponse {
  models: MLModelInfo[]
  count:  number
}

export interface PredictionBar {
  timestamp:     string
  predicted_dir: 'up' | 'down'
  confidence:    number
  actual_return: number | null
}

export interface MLPredictResponse {
  symbol:     string
  model_name: string
  model_type: string
  accuracy:   number | null
  bars:       PredictionBar[]
  count:      number
}

export interface TrainJobResponse {
  job_id:     string
  symbol:     string
  model_type: string
  status:     string
  message:    string
}

export interface TrainStatusResponse {
  job_id:  string
  status:  string
  result:  Record<string, unknown> | null
  error:   string | null
}

export interface FeatureImportanceResponse {
  symbol:     string
  model_name: string
  model_type: string
  accuracy:   number | null
  features:   Record<string, number>
  count:      number
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

  ml: {
    listModels: (): Promise<MLModelsResponse> =>
      apiClient.get<MLModelsResponse>('/api/ml/models').then((r) => r.data),

    getPredictions: (symbol: string, limit = 60): Promise<MLPredictResponse> =>
      apiClient
        .get<MLPredictResponse>(`/api/ml/predict/${symbol}`, { params: { limit } })
        .then((r) => r.data),

    getFeatureImportance: (symbol: string, topN = 20): Promise<FeatureImportanceResponse> =>
      apiClient
        .get<FeatureImportanceResponse>(`/api/ml/features/${symbol}`, { params: { top_n: topN } })
        .then((r) => r.data),

    trainModel: (symbol: string, modelType: string): Promise<TrainJobResponse> =>
      apiClient
        .post<TrainJobResponse>('/api/ml/train', { symbol, model_type: modelType })
        .then((r) => r.data),

    getTrainStatus: (jobId: string): Promise<TrainStatusResponse> =>
      apiClient.get<TrainStatusResponse>(`/api/ml/status/${jobId}`).then((r) => r.data),
  },
}
