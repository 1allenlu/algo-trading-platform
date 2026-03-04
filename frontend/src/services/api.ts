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

// ── Backtest types (mirrors backend app/models/schemas.py) ───────────────────

export interface EquityPoint {
  date:     string
  value:    number
  drawdown: number
}

export interface TradeRecord {
  date:   string
  symbol: string
  side:   'buy' | 'sell'
  price:  number
  size:   number
}

export interface BacktestMetrics {
  total_return:  number
  cagr:          number
  annual_vol:    number
  sharpe_ratio:  number
  sortino_ratio: number
  max_drawdown:  number
  calmar_ratio:  number
  win_rate:      number
}

export interface BacktestRunResponse {
  id:            number
  strategy_name: string
  symbols:       string[]
  status:        'running' | 'done' | 'failed'
  error:         string | null
  total_return:  number | null
  cagr:          number | null
  sharpe_ratio:  number | null
  sortino_ratio: number | null
  max_drawdown:  number | null
  calmar_ratio:  number | null
  win_rate:      number | null
  num_trades:    number | null
  equity_curve:      EquityPoint[] | null
  benchmark_metrics: BacktestMetrics | null
  trades:            TradeRecord[] | null
  created_at:    string
}

export interface BacktestListItem {
  id:            number
  strategy_name: string
  symbols:       string[]
  status:        string
  sharpe_ratio:  number | null
  total_return:  number | null
  max_drawdown:  number | null
  created_at:    string
}

export interface BacktestListResponse {
  runs:  BacktestListItem[]
  count: number
}

// ── Strategy types ────────────────────────────────────────────────────────────

export interface StrategyInfo {
  name:            string
  description:     string
  method:          string
  default_symbols: string[]
  min_symbols:     number
  max_symbols:     number
  tags:            string[]
  default_params:  Record<string, unknown>
}

export interface StrategiesResponse {
  strategies: StrategyInfo[]
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

  strategies: {
    list: (): Promise<StrategiesResponse> =>
      apiClient.get<StrategiesResponse>('/api/strategies').then((r) => r.data),
  },

  backtest: {
    run: (
      strategy: string,
      symbols:  string[],
      params:   Record<string, unknown> = {},
    ): Promise<BacktestRunResponse> =>
      apiClient
        .post<BacktestRunResponse>('/api/backtest/run', { strategy, symbols, params })
        .then((r) => r.data),

    get: (runId: number): Promise<BacktestRunResponse> =>
      apiClient.get<BacktestRunResponse>(`/api/backtest/${runId}`).then((r) => r.data),

    list: (limit = 20): Promise<BacktestListResponse> =>
      apiClient
        .get<BacktestListResponse>('/api/backtest/list', { params: { limit } })
        .then((r) => r.data),
  },
}
