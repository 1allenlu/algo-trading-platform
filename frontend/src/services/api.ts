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
  status:       string   // "healthy" | "degraded"
  database:     string
  redis:        string
  version:      string
  price_source: string   // "alpaca" | "simulator" (Phase 19)
}

// ── Phase 20: Notifications ───────────────────────────────────────────────────

export interface NotificationConfig {
  email_enabled:   boolean
  email_recipient: string
  smtp_host:       string
  slack_enabled:   boolean
}

// ── Phase 21: Scheduler ───────────────────────────────────────────────────────

export interface JobStatus {
  job_id:        string
  name:          string
  next_run_time: string | null
  last_run_at:   string | null
  last_status:   string
  last_error:    string | null
}

// ── Phase 22: Signals ─────────────────────────────────────────────────────────

export interface SignalRow {
  symbol:          string
  last_price:      number | null
  composite:       string   // "buy" | "hold" | "sell"
  confidence:      number
  score:           number
  ml_direction:    string   // "up" | "down" | "none"
  ml_confidence:   number
  rsi:             number | null
  rsi_signal:      string   // "oversold" | "neutral" | "overbought"
  sentiment_score: number | null
  sentiment_label: string
  last_updated:    string
}

// ── Phase 23: Multi-user ──────────────────────────────────────────────────────

export interface UserInfo {
  id:            number
  username:      string
  email:         string | null
  role:          string   // "admin" | "viewer"
  is_active:     boolean
  created_at:    string
  last_login_at: string | null
}

// ── Live Trading types — Phase 25 ────────────────────────────────────────────

export interface LiveOrder {
  id:               number
  alpaca_order_id:  string | null
  symbol:           string
  side:             'buy' | 'sell'
  order_type:       'market' | 'limit'
  qty:              number
  filled_qty:       number
  status:           'pending' | 'accepted' | 'filled' | 'canceled' | 'rejected'
  limit_price:      number | null
  filled_avg_price: number | null
  error_message:    string | null
  submitted_at:     string   // ISO 8601
}

export interface LivePosition {
  symbol:             string
  qty:                number
  avg_entry:          number
  current_price:      number
  market_value:       number
  unrealized_pnl:     number
  unrealized_pnl_pct: number
}

export interface LiveAccountInfo {
  equity:          number
  cash:            number
  buying_power:    number
  day_pnl:         number
  day_pnl_pct:     number
  portfolio_value: number
  trading_mode:    'paper' | 'live'
}

export interface LiveTradingState {
  alpaca_enabled: boolean
  account:        LiveAccountInfo | null
  positions:      LivePosition[]
  orders:         LiveOrder[]
}

export interface SubmitLiveOrderRequest {
  symbol:      string
  side:        'buy' | 'sell'
  qty:         number
  order_type?: 'market' | 'limit'
  limit_price?: number
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

// ── Risk types (mirrors backend app/models/schemas.py) ───────────────────────

export interface AssetRiskMetrics {
  symbol:        string
  annual_return: number
  annual_vol:    number
  sharpe:        number
  max_drawdown:  number
  beta:          number
  var_95:        number
}

export interface PortfolioRiskResponse {
  symbols:               string[]
  weights:               number[]
  assets:                AssetRiskMetrics[]
  correlation:           number[][]
  portfolio_return:      number
  portfolio_vol:         number
  portfolio_sharpe:      number
  portfolio_max_drawdown: number
  portfolio_var_95:      number
  portfolio_cvar_95:     number
  n_days:                number
}

export interface FrontierPoint {
  return_ann: number
  volatility: number
  sharpe:     number
  weights?:   number[]
}

export interface EfficientFrontierResponse {
  symbols:    string[]
  random:     FrontierPoint[]
  frontier:   FrontierPoint[]
  max_sharpe: FrontierPoint | null
  min_vol:    FrontierPoint | null
}

// ── Advanced ML types — Phase 6 ──────────────────────────────────────────────

export interface SHAPFeatureContribution {
  name:          string
  shap_value:    number   // Signed: >0 pushes toward UP, <0 toward DOWN
  feature_value: number   // Raw feature value for context
}

export interface SHAPResponse {
  symbol:          string
  model_name:      string
  base_value:      number   // E[f(X)] — average model log-odds output
  predicted_proba: number   // P(up) for the latest bar
  predicted_dir:   'up' | 'down'
  features:        SHAPFeatureContribution[]   // Top N by |SHAP|
  count:           number
}

export interface SentimentComponents {
  rsi_component:    number
  sma50_component:  number
  sma200_component: number
}

export interface SentimentResponse {
  symbol:          string
  score:           number   // [-1, +1] composite sentiment score
  label:           'bullish' | 'bearish' | 'neutral'
  rsi_14:          number   // Raw RSI(14) value (0-100)
  price_vs_sma50:  number   // (close / sma50 - 1) as fraction
  price_vs_sma200: number   // (close / sma200 - 1) as fraction
  components:      SentimentComponents
}

export interface SubSignal {
  vote:  number   // Normalized [-1, +1] vote from this source
  label: string   // Human-readable description
}

export interface SubSignals {
  ml:        SubSignal
  sentiment: SubSignal
  technical: SubSignal
}

export interface SignalResponse {
  symbol:      string
  signal:      'buy' | 'hold' | 'sell'
  confidence:  number      // abs(composite score) in [0, 1]
  score:       number      // Raw weighted composite in [-1, +1]
  reasoning:   string[]    // Human-readable explanation bullet points
  sub_signals: SubSignals
}

// ── Paper Trading types (mirrors backend app/models/schemas.py) ───────────────

export interface AccountInfo {
  equity:        number
  cash:          number
  buying_power:  number
  day_pnl:       number
  day_pnl_pct:   number
  total_pnl:     number
  total_pnl_pct: number
}

export interface PaperPosition {
  symbol:             string
  qty:                number
  avg_entry_price:    number
  current_price:      number
  market_value:       number
  unrealized_pnl:     number
  unrealized_pnl_pct: number
}

export interface PaperOrder {
  id:               string
  symbol:           string
  side:             'buy' | 'sell'
  order_type:       string
  qty:              number
  filled_qty:       number
  status:           string   // "new" | "partially_filled" | "filled" | "canceled" | "expired"
  filled_avg_price: number | null
  limit_price:      number | null
  created_at:       string
}

export interface PortfolioPoint {
  timestamp: string
  equity:    number
  pnl_pct:   number
}

export interface PaperTradingState {
  account:           AccountInfo
  positions:         PaperPosition[]
  orders:            PaperOrder[]
  portfolio_history: PortfolioPoint[]
  last_updated:      string
}

export interface SubmitOrderRequest {
  symbol:      string
  side:        'buy' | 'sell'
  qty:         number
  order_type?: 'market' | 'limit'
  limit_price?: number
}

export interface OrderResponse {
  order_id: string
  status:   string
  message:  string
}

// ── WebSocket types — Phase 7 ─────────────────────────────────────────────────

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

/** WebSocket endpoint paths (relative to backend base URL). */
export const WS_PATHS = {
  allPrices:   '/ws/prices',
  symbolPrice: (symbol: string) => `/ws/prices/${symbol}`,
  alerts:      '/ws/alerts',
} as const

// ── Alert types — Phase 8 ─────────────────────────────────────────────────────

export type AlertCondition =
  | 'price_above'
  | 'price_below'
  | 'change_pct_above'
  | 'change_pct_below'

export interface AlertRule {
  id:               number
  symbol:           string
  condition:        AlertCondition
  threshold:        number
  is_active:        boolean
  cooldown_seconds: number
  last_triggered_at: string | null
  created_at:       string
}

export interface AlertRulesListResponse {
  rules: AlertRule[]
  count: number
}

export interface AlertEvent {
  id:            number
  rule_id:       number
  symbol:        string
  condition:     AlertCondition
  threshold:     number
  current_value: number
  message:       string
  triggered_at:  string
  acknowledged:  boolean
}

export interface AlertEventsListResponse {
  events: AlertEvent[]
  count:  number
}

export interface CreateAlertRuleRequest {
  symbol:           string
  condition:        AlertCondition
  threshold:        number
  cooldown_seconds?: number
}

/** Real-time alert payload pushed over /ws/alerts WebSocket. */
export interface AlertWsMessage {
  type:          'alert'
  id:            number
  rule_id:       number
  symbol:        string
  condition:     AlertCondition
  threshold:     number
  current_value: number
  message:       string
  triggered_at:  string
}

// ── Analytics types — Phase 9 ─────────────────────────────────────────────────

export interface AnalyticsSummary {
  equity:         number
  starting_cash:  number
  total_return:   number   // fraction, e.g. 0.12 = +12%
  cagr:           number
  sharpe_ratio:   number
  sortino_ratio:  number
  max_drawdown:   number   // positive fraction, e.g. 0.08 = 8% drawdown
  annual_vol:     number
  calmar_ratio:   number
  n_days:         number
  n_trades:       number
  win_rate:       number
  avg_win:        number   // dollars
  avg_loss:       number   // dollars (negative)
  profit_factor:  number
}

export interface PnlAttribution {
  symbol:         string
  buy_cost:       number
  sell_proceeds:  number
  realized_pnl:   number
  unrealized_pnl: number
  total_pnl:      number
  n_buys:         number
  n_sells:        number
}

export interface RollingPoint {
  date:            string   // YYYY-MM-DD
  equity:          number
  rolling_sharpe:  number
  rolling_vol:     number   // annualized fraction
}

// ── Scanner types — Phase 11 ──────────────────────────────────────────────────

export interface SymbolSnapshot {
  symbol:         string
  price:          number
  change_pct:     number
  rsi_14:         number
  sma_20:         number | null
  sma_50:         number | null
  sma_200:        number | null
  vs_sma50:       number | null
  vs_sma200:      number | null
  volume:         number
  avg_volume_20:  number | null
  volume_ratio:   number | null
  high_52w:       number
  low_52w:        number
  vs_52w_high:    number
  vs_52w_low:     number
  bar_count:      number
}

export interface ScanRequest {
  rsi_max?:            number
  rsi_min?:            number
  price_above_sma50?:  boolean
  price_below_sma50?:  boolean
  price_above_sma200?: boolean
  price_below_sma200?: boolean
  volume_ratio_min?:   number
  change_pct_min?:     number
  change_pct_max?:     number
  near_52w_high_pct?:  number
  near_52w_low_pct?:   number
  symbols?:            string[]
  sort_by?:            'symbol' | 'rsi' | 'change_pct' | 'volume_ratio' | 'vs_sma50' | 'vs_sma200' | 'vs_52w_high' | 'vs_52w_low'
  sort_desc?:          boolean
}

// ── Auto-Trade types — Phase 12 ───────────────────────────────────────────────

export interface AutoTradeConfig {
  id:                 number
  enabled:            boolean
  symbols:            string[]
  signal_threshold:   number
  position_size_pct:  number
  check_interval_sec: number
  updated_at:         string | null
}

export interface UpdateAutoTradeConfigRequest {
  symbols?:            string
  signal_threshold?:   number
  position_size_pct?:  number
  check_interval_sec?: number
}

export interface AutoTradeLogEntry {
  id:         number
  symbol:     string
  signal:     string
  confidence: number
  score:      number
  action:     string
  qty:        number | null
  price:      number | null
  reason:     string
  created_at: string
}

// ── News / Sentiment types — Phase 14 ────────────────────────────────────────

export interface NewsArticle {
  title:     string
  publisher: string
  link:      string
  published: string   // ISO 8601
  compound:  number   // VADER compound [-1, +1]
  label:     'bullish' | 'bearish' | 'neutral'
  summary?:  string
}

export interface NewsAggregateSentiment {
  symbol:        string
  article_count: number
  avg_compound:  number
  bullish_count: number
  bearish_count: number
  neutral_count: number
  label:         'bullish' | 'bearish' | 'neutral'
  articles:      NewsArticle[]
}

// ── Optimization types — Phase 10 ─────────────────────────────────────────────

export interface OptimizationRunSummary {
  id:               number
  strategy:         string
  symbols:          string[]
  objective:        string
  status:           'queued' | 'running' | 'done' | 'failed'
  total_trials:     number
  completed_trials: number
  best_sharpe:      number | null
  best_return:      number | null
  best_params:      Record<string, unknown> | null
  created_at:       string
}

export interface TrialResult {
  params:       Record<string, unknown>
  sharpe_ratio: number | null
  total_return: number | null
  max_drawdown: number | null
  calmar_ratio: number | null
  num_trades:   number | null
  objective_value: number
}

export interface OptimizationRunDetail extends OptimizationRunSummary {
  param_grid:   Record<string, unknown[]>
  error:        string | null
  results:      TrialResult[]
  completed_at: string | null
}

export interface StartOptimizationRequest {
  strategy:   string
  symbols:    string[]
  param_grid: Record<string, unknown[]>
  objective?: 'sharpe' | 'total_return' | 'calmar' | 'sortino'
}

export interface StartOptimizationResponse {
  opt_id:       number
  total_trials: number
  status:       string
}

// ── Options types — Phase 27 ──────────────────────────────────────────────────

export interface OptionContract {
  strike:             number
  last_price:         number | null
  bid:                number | null
  ask:                number | null
  change:             number | null
  change_pct:         number | null
  volume:             number
  open_interest:      number
  implied_volatility: number
  in_the_money:       boolean
  contract_type:      'call' | 'put'
}

export interface OptionsChain {
  symbol:        string
  current_price: number | null
  expiration:    string | null
  expirations:   string[]
  calls:         OptionContract[]
  puts:          OptionContract[]
}

// ── Walk-Forward Optimization types — Phase 28 ────────────────────────────────

export interface WFORequest {
  strategy:    string
  symbols:     string[]
  param_grid:  Record<string, unknown[]>
  objective?:  string
  n_windows?:  number
  train_ratio?: number
}

export interface WFOWindowMetrics {
  sharpe_ratio:  number | null
  total_return:  number | null
  max_drawdown:  number | null
}

export interface WFOWindow {
  window_idx:    number
  train_start:   string | null
  train_end:     string | null
  test_start:    string | null
  test_end:      string | null
  best_params:   Record<string, unknown>
  train_metrics: WFOWindowMetrics
  test_metrics:  WFOWindowMetrics
  oos_sharpe:    number
  oos_return:    number
  oos_max_dd:    number
}

export interface WFOSummary {
  avg_oos_sharpe:     number
  avg_oos_return:     number
  stability_score:    number
  recommended_params: Record<string, unknown>
  best_window_idx:    number
}

export interface WFOResult {
  strategy:    string
  symbols:     string[]
  objective:   string
  n_windows:   number
  train_ratio: number
  windows:     WFOWindow[]
  summary:     WFOSummary
}

// ── Factor Attribution types — Phase 29 ───────────────────────────────────────

export interface RollingFactorPoint {
  date:          string
  beta:          number
  alpha:         number
  portfolio_ret: number
  benchmark_ret: number
}

export interface BrinsonRow {
  symbol:            string
  weight:            number
  symbol_return:     number
  allocation_effect: number
  selection_effect:  number
  total_effect:      number
}

export interface FactorAttribution {
  beta:              number | null
  alpha_ann:         number | null
  r_squared:         number | null
  tracking_error:    number | null
  information_ratio: number | null
  rolling:           RollingFactorPoint[]
  brinson:           BrinsonRow[]
  benchmark_symbol:  string
}

// ── Auth types — Phase 17 ─────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string
  token_type:   string
  expires_in:   number
}

export interface MeResponse {
  username:     string
  auth_enabled: boolean
}

// ── Phase 31: Intraday ────────────────────────────────────────────────────────

export interface IntradayBar {
  symbol:    string
  timestamp: string    // ISO 8601
  timeframe: string    // '1m' | '5m' | '15m' | '1h'
  open:      number
  high:      number
  low:       number
  close:     number
  volume:    number
}

export interface IntradayResponse {
  symbol:    string
  timeframe: string
  bars:      IntradayBar[]
  count:     number
}

// ── Phase 32: Crypto ──────────────────────────────────────────────────────────

export interface CryptoSymbolInfo {
  symbol:      string
  name:        string
  category:    string
  last_price:  number | null
  change_pct:  number | null
  volume:      number | null
  has_data:    boolean
}

// ── Phase 33: Earnings ────────────────────────────────────────────────────────

export interface EarningsHistoryEntry {
  date:         string
  eps_estimate: number | null
  eps_actual:   number | null
  surprise_pct: number | null
}

export interface EarningsCalendarEntry {
  symbol:             string
  next_earnings_date: string | null
  eps_estimate:       number | null
  earnings_history:   EarningsHistoryEntry[]
}

// ── API functions ─────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (username: string, password: string): Promise<TokenResponse> =>
      apiClient
        .post<TokenResponse>('/api/auth/login', { username, password })
        .then((r) => r.data),

    me: (): Promise<MeResponse> =>
      apiClient.get<MeResponse>('/api/auth/me').then((r) => r.data),

    generateHash: (password: string): Promise<{ hash: string }> =>
      apiClient
        .post<{ hash: string }>('/api/auth/hash', { password })
        .then((r) => r.data),
  },

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

    // Phase 6: Advanced ML
    getSentiment: (symbol: string): Promise<SentimentResponse> =>
      apiClient.get<SentimentResponse>(`/api/ml/sentiment/${symbol}`).then((r) => r.data),

    getSignal: (symbol: string): Promise<SignalResponse> =>
      apiClient.get<SignalResponse>(`/api/ml/signal/${symbol}`).then((r) => r.data),

    getShapValues: (symbol: string, topN = 12): Promise<SHAPResponse> =>
      apiClient
        .get<SHAPResponse>(`/api/ml/shap/${symbol}`, { params: { top_n: topN } })
        .then((r) => r.data),
  },

  strategies: {
    list: (): Promise<StrategiesResponse> =>
      apiClient.get<StrategiesResponse>('/api/strategies').then((r) => r.data),
  },

  backtest: {
    run: (
      strategy:       string,
      symbols:        string[],
      params:         Record<string, unknown> = {},
      commissionPct?: number,
      slippagePct?:   number,
    ): Promise<BacktestRunResponse> =>
      apiClient
        .post<BacktestRunResponse>('/api/backtest/run', {
          strategy,
          symbols,
          params,
          commission_pct: commissionPct ?? 0.001,
          slippage_pct:   slippagePct ?? 0.0005,
        })
        .then((r) => r.data),

    get: (runId: number): Promise<BacktestRunResponse> =>
      apiClient.get<BacktestRunResponse>(`/api/backtest/${runId}`).then((r) => r.data),

    list: (limit = 20): Promise<BacktestListResponse> =>
      apiClient
        .get<BacktestListResponse>('/api/backtest/list', { params: { limit } })
        .then((r) => r.data),
  },

  risk: {
    getAnalysis: (symbols: string[], weights?: number[]): Promise<PortfolioRiskResponse> =>
      apiClient
        .get<PortfolioRiskResponse>('/api/risk/analysis', {
          params: {
            symbols: symbols.join(','),
            ...(weights ? { weights: weights.join(',') } : {}),
          },
        })
        .then((r) => r.data),

    getFrontier: (symbols: string[]): Promise<EfficientFrontierResponse> =>
      apiClient
        .get<EfficientFrontierResponse>('/api/risk/frontier', {
          params: { symbols: symbols.join(',') },
        })
        .then((r) => r.data),
  },

  paper: {
    getState: (): Promise<PaperTradingState> =>
      apiClient.get<PaperTradingState>('/api/paper/state').then((r) => r.data),

    submitOrder: (req: SubmitOrderRequest): Promise<OrderResponse> =>
      apiClient.post<OrderResponse>('/api/paper/orders', req).then((r) => r.data),

    cancelOrder: (orderId: string): Promise<{ message: string }> =>
      apiClient.delete<{ message: string }>(`/api/paper/orders/${orderId}`).then((r) => r.data),

    reset: (): Promise<{ message: string }> =>
      apiClient.post<{ message: string }>('/api/paper/reset').then((r) => r.data),
  },

  alerts: {
    listRules: (): Promise<AlertRulesListResponse> =>
      apiClient.get<AlertRulesListResponse>('/api/alerts/rules').then((r) => r.data),

    createRule: (req: CreateAlertRuleRequest): Promise<AlertRule> =>
      apiClient.post<AlertRule>('/api/alerts/rules', req).then((r) => r.data),

    toggleRule: (ruleId: number): Promise<AlertRule> =>
      apiClient.patch<AlertRule>(`/api/alerts/rules/${ruleId}/toggle`).then((r) => r.data),

    deleteRule: (ruleId: number): Promise<void> =>
      apiClient.delete(`/api/alerts/rules/${ruleId}`).then(() => undefined),

    listEvents: (limit = 100, unreadOnly = false): Promise<AlertEventsListResponse> =>
      apiClient
        .get<AlertEventsListResponse>('/api/alerts/events', {
          params: { limit, unread_only: unreadOnly },
        })
        .then((r) => r.data),

    acknowledgeAll: (): Promise<{ acknowledged: number }> =>
      apiClient
        .patch<{ acknowledged: number }>('/api/alerts/events/acknowledge')
        .then((r) => r.data),
  },

  analytics: {
    getSummary: (): Promise<AnalyticsSummary> =>
      apiClient.get<AnalyticsSummary>('/api/analytics/summary').then((r) => r.data),

    getPnlAttribution: (): Promise<PnlAttribution[]> =>
      apiClient.get<PnlAttribution[]>('/api/analytics/pnl_attribution').then((r) => r.data),

    getRolling: (window = 20): Promise<RollingPoint[]> =>
      apiClient
        .get<RollingPoint[]>('/api/analytics/rolling', { params: { window } })
        .then((r) => r.data),
  },

  optimize: {
    getDefaultParams: (): Promise<Record<string, Record<string, unknown[]>>> =>
      apiClient.get('/api/optimize/params').then((r) => r.data),

    start: (req: StartOptimizationRequest): Promise<StartOptimizationResponse> =>
      apiClient.post<StartOptimizationResponse>('/api/optimize/run', req).then((r) => r.data),

    get: (optId: number): Promise<OptimizationRunDetail> =>
      apiClient.get<OptimizationRunDetail>(`/api/optimize/${optId}`).then((r) => r.data),

    list: (limit = 20): Promise<OptimizationRunSummary[]> =>
      apiClient
        .get<OptimizationRunSummary[]>('/api/optimize/list', { params: { limit } })
        .then((r) => r.data),
  },

  scanner: {
    getSymbols: (): Promise<string[]> =>
      apiClient.get<string[]>('/api/scanner/symbols').then((r) => r.data),

    scan: (req: ScanRequest): Promise<SymbolSnapshot[]> =>
      apiClient.post<SymbolSnapshot[]>('/api/scanner/scan', req).then((r) => r.data),
  },

  news: {
    getSentiment: (symbol: string, maxArticles = 20): Promise<NewsAggregateSentiment> =>
      apiClient
        .get<NewsAggregateSentiment>(`/api/news/${symbol}`, { params: { max_articles: maxArticles } })
        .then((r) => r.data),

    getArticles: (symbol: string, maxArticles = 10): Promise<NewsArticle[]> =>
      apiClient
        .get<NewsArticle[]>(`/api/news/${symbol}/articles`, { params: { max_articles: maxArticles } })
        .then((r) => r.data),
  },

  autotrade: {
    getConfig: (): Promise<AutoTradeConfig> =>
      apiClient.get<AutoTradeConfig>('/api/autotrade/config').then((r) => r.data),

    updateConfig: (req: UpdateAutoTradeConfigRequest): Promise<AutoTradeConfig> =>
      apiClient.post<AutoTradeConfig>('/api/autotrade/config', req).then((r) => r.data),

    enable: (): Promise<AutoTradeConfig> =>
      apiClient.post<AutoTradeConfig>('/api/autotrade/enable').then((r) => r.data),

    disable: (): Promise<AutoTradeConfig> =>
      apiClient.post<AutoTradeConfig>('/api/autotrade/disable').then((r) => r.data),

    getLog: (limit = 100): Promise<AutoTradeLogEntry[]> =>
      apiClient
        .get<AutoTradeLogEntry[]>('/api/autotrade/log', { params: { limit } })
        .then((r) => r.data),
  },

  // ── Phase 20: Notifications ────────────────────────────────────────────────
  notifications: {
    getConfig: (): Promise<NotificationConfig> =>
      apiClient.get<NotificationConfig>('/api/notifications/config').then((r) => r.data),

    test: (channel: 'email' | 'slack'): Promise<{ ok: boolean; message: string }> =>
      apiClient
        .post<{ ok: boolean; message: string }>('/api/notifications/test', { channel })
        .then((r) => r.data),
  },

  // ── Phase 21: Scheduler ────────────────────────────────────────────────────
  scheduler: {
    getJobs: (): Promise<JobStatus[]> =>
      apiClient.get<JobStatus[]>('/api/scheduler/jobs').then((r) => r.data),

    runNow: (jobId: string): Promise<{ job_id: string; message: string }> =>
      apiClient
        .post<{ job_id: string; message: string }>(`/api/scheduler/jobs/${jobId}/run`)
        .then((r) => r.data),
  },

  // ── Phase 22: Signals ──────────────────────────────────────────────────────
  signals: {
    getAll: (): Promise<SignalRow[]> =>
      apiClient.get<SignalRow[]>('/api/signals').then((r) => r.data),
  },

  // ── Phase 23: User management ──────────────────────────────────────────────
  users: {
    list: (): Promise<UserInfo[]> =>
      apiClient.get<UserInfo[]>('/api/auth/users').then((r) => r.data),

    create: (username: string, password: string, email?: string, role = 'viewer'): Promise<UserInfo> =>
      apiClient
        .post<UserInfo>('/api/auth/users', { username, password, email, role })
        .then((r) => r.data),

    deactivate: (userId: number): Promise<void> =>
      apiClient.delete(`/api/auth/users/${userId}`).then(() => undefined),

    changePassword: (userId: number, newPassword: string): Promise<{ message: string }> =>
      apiClient
        .post<{ message: string }>(`/api/auth/users/${userId}/password`, { new_password: newPassword })
        .then((r) => r.data),
  },

  // ── Phase 24: PDF report ────────────────────────────────────────────────────
  reports: {
    /** Open PDF in new tab / trigger browser download */
    downloadBacktest: (runId: number): void => {
      const base = (import.meta.env.VITE_API_URL ?? '') as string
      window.open(`${base}/api/backtest/${runId}/report`, '_blank')
    },
  },

  // ── Phase 27: Options chain ────────────────────────────────────────────────
  options: {
    getExpirations: (symbol: string): Promise<string[]> =>
      apiClient.get<string[]>(`/api/options/${symbol}/expirations`).then((r) => r.data),

    getChain: (symbol: string, expiry?: string): Promise<OptionsChain> =>
      apiClient
        .get<OptionsChain>(`/api/options/${symbol}`, { params: expiry ? { expiry } : {} })
        .then((r) => r.data),
  },

  // ── Phase 28: Walk-Forward Optimization ────────────────────────────────────
  wfo: {
    run: (req: WFORequest): Promise<WFOResult> =>
      apiClient.post<WFOResult>('/api/optimize/wfo', req).then((r) => r.data),
  },

  // ── Phase 29: Factor Attribution ───────────────────────────────────────────
  attribution: {
    get: (): Promise<FactorAttribution> =>
      apiClient.get<FactorAttribution>('/api/analytics/attribution').then((r) => r.data),
  },

  // ── Phase 25: Live order execution ─────────────────────────────────────────
  live: {
    getState: (): Promise<LiveTradingState> =>
      apiClient.get<LiveTradingState>('/api/live/state').then((r) => r.data),

    submitOrder: (req: SubmitLiveOrderRequest): Promise<LiveOrder> =>
      apiClient.post<LiveOrder>('/api/live/orders', req).then((r) => r.data),

    getOrders: (): Promise<LiveOrder[]> =>
      apiClient.get<LiveOrder[]>('/api/live/orders').then((r) => r.data),

    cancelOrder: (orderId: number): Promise<{ message: string }> =>
      apiClient
        .delete<{ message: string }>(`/api/live/orders/${orderId}`)
        .then((r) => r.data),

    syncOrder: (orderId: number): Promise<LiveOrder> =>
      apiClient
        .post<LiveOrder>(`/api/live/orders/${orderId}/sync`)
        .then((r) => r.data),
  },

  // ── Phase 31: Intraday data ─────────────────────────────────────────────────
  intraday: {
    getBars: (symbol: string, timeframe: string, limit = 500): Promise<IntradayResponse> =>
      apiClient
        .get<IntradayResponse>(`/api/intraday/${symbol}`, { params: { timeframe, limit } })
        .then((r) => r.data),

    ingest: (symbol: string, timeframe: string): Promise<{ inserted: number; symbol: string; timeframe: string }> =>
      apiClient
        .post('/api/intraday/ingest', { symbol, timeframe })
        .then((r) => r.data),
  },

  // ── Phase 32: Crypto ────────────────────────────────────────────────────────
  crypto: {
    getSymbols: (): Promise<CryptoSymbolInfo[]> =>
      apiClient.get<CryptoSymbolInfo[]>('/api/crypto/symbols').then((r) => r.data),

    ingest: (): Promise<{ results: Array<{ symbol: string; inserted: number }>; total_symbols: number }> =>
      apiClient.post('/api/crypto/ingest').then((r) => r.data),
  },

  // ── Phase 33: Earnings calendar ─────────────────────────────────────────────
  earnings: {
    getCalendar: (symbols: string): Promise<EarningsCalendarEntry[]> =>
      apiClient
        .get<EarningsCalendarEntry[]>('/api/earnings/calendar', { params: { symbols } })
        .then((r) => r.data),

    getForSymbol: (symbol: string): Promise<EarningsCalendarEntry> =>
      apiClient.get<EarningsCalendarEntry>(`/api/earnings/${symbol}`).then((r) => r.data),
  },
}
