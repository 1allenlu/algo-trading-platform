/**
 * ML Models page — Phase 2 + Phase 6 (Advanced ML).
 *
 * Sections:
 *   1. Model Cards          — Trained models with accuracy / F1 / AUC metrics
 *   2. Prediction Timeline  — Recent up/down predictions with confidence bars
 *   3. Feature Importance   — Horizontal bar chart for selected model
 *   4. Train Panel          — Trigger training from UI (async + polling)
 *   5. Advanced ML Signals  — SHAP explainability, Sentiment gauge, Composite signal (Phase 6)
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import {
  TrendingDown,
  TrendingUp,
  Psychology as MLIcon,
  Refresh as TrainIcon,
  AutoAwesome as SignalIcon,
  Waves as RegimeIcon,
} from '@mui/icons-material'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type MLModelInfo } from '@/services/api'
import FeatureImportanceChart from '@/components/charts/FeatureImportanceChart'
import SHAPWaterfallChart from '@/components/charts/SHAPWaterfallChart'
import SentimentGauge from '@/components/charts/SentimentGauge'

// ── Constants ────────────────────────────────────────────────────────────────
const SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA'] as const
type Symbol = typeof SYMBOLS[number]

// ── Metric badge ──────────────────────────────────────────────────────────────
function MetricBadge({ label, value, colorize = false }: { label: string; value: number | null | undefined; colorize?: boolean }) {
  const display = value != null ? (value * 100).toFixed(1) + '%' : '—'
  const color   = colorize && value != null
    ? value >= 0.55 ? 'secondary.main'
    : value >= 0.50 ? 'text.primary'
    : 'error.main'
    : 'text.secondary'

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography variant="h6" fontFamily="IBM Plex Mono, monospace" sx={{ color }}>
        {display}
      </Typography>
      <Typography variant="caption" color="text.disabled">{label}</Typography>
    </Box>
  )
}

// ── Model card ────────────────────────────────────────────────────────────────
function ModelCard({ model }: { model: MLModelInfo }) {
  return (
    <Card>
      <CardContent sx={{ pb: '16px !important' }}>
        {/* Header row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700} fontFamily="IBM Plex Mono, monospace">
              {model.name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5 }}>
              <Chip label={model.symbol}     size="small" color="primary" variant="outlined" />
              <Chip label={model.model_type} size="small" sx={{ textTransform: 'uppercase', fontSize: '0.65rem' }} />
              <Chip label={`v${model.version}`} size="small" variant="outlined" sx={{ color: 'text.disabled' }} />
            </Box>
          </Box>
          <Typography variant="caption" color="text.disabled">
            {new Date(model.created_at).toLocaleDateString()}
          </Typography>
        </Box>

        <Divider sx={{ mb: 1.5 }} />

        {/* Metric row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-around' }}>
          <MetricBadge label="Accuracy"         value={model.accuracy}  colorize />
          <MetricBadge label="Balance Score"    value={model.f1_score}  colorize />
          <MetricBadge label="Prediction Score" value={model.roc_auc}   colorize />
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* Dataset info */}
        <Box sx={{ display: 'flex', gap: 3 }}>
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">Train samples</Typography>
            <Typography variant="body2" fontFamily="IBM Plex Mono, monospace">
              {model.train_samples?.toLocaleString() ?? '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">Test samples</Typography>
            <Typography variant="body2" fontFamily="IBM Plex Mono, monospace">
              {model.test_samples?.toLocaleString() ?? '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">Features</Typography>
            <Typography variant="body2" fontFamily="IBM Plex Mono, monospace">
              {model.feature_count ?? '—'}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Prediction timeline ───────────────────────────────────────────────────────
function PredictionTable({ symbol }: { symbol: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey:  ['ml', 'predict', symbol],
    queryFn:   () => api.ml.getPredictions(symbol),
    staleTime: 60_000,
  })

  if (isLoading) return <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
  if (isError)   return (
    <Alert severity="warning">
      No predictions for <strong>{symbol}</strong>.
      Train a model first via <code>POST /api/ml/train</code> or the Train panel below.
    </Alert>
  )

  const bars = data?.bars ?? []
  const recent = [...bars].reverse().slice(0, 30).reverse()  // Last 30 bars

  return (
    <TableContainer sx={{ maxHeight: 380 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell align="center">Prediction</TableCell>
            <TableCell align="right">Confidence</TableCell>
            <TableCell align="center">Model Accuracy</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {recent.map((bar) => {
            const isUp = bar.predicted_dir === 'up'
            return (
              <TableRow key={bar.timestamp} hover>
                <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                  {new Date(bar.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    {isUp
                      ? <TrendingUp  sx={{ fontSize: 16, color: 'secondary.main' }} />
                      : <TrendingDown sx={{ fontSize: 16, color: 'error.main' }} />
                    }
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      sx={{ color: isUp ? 'secondary.main' : 'error.main' }}
                    >
                      {bar.predicted_dir.toUpperCase()}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={(bar.confidence - 0.5) * 200}   // Map [0.5, 1.0] → [0, 100]
                      sx={{
                        width: 60, height: 6, borderRadius: 3,
                        bgcolor: 'rgba(255,255,255,0.08)',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: isUp ? 'secondary.main' : 'error.main',
                          borderRadius: 3,
                        },
                      }}
                    />
                    <Typography
                      variant="caption"
                      fontFamily="IBM Plex Mono, monospace"
                      sx={{ minWidth: 42, textAlign: 'right' }}
                    >
                      {(bar.confidence * 100).toFixed(1)}%
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="caption" color="text.disabled">
                    {data?.accuracy != null ? `${(data.accuracy * 100).toFixed(1)}%` : '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ── Train panel ───────────────────────────────────────────────────────────────
function TrainPanel() {
  const [symbol, setSymbol]     = useState<Symbol>('SPY')
  const [modelType, setModelType] = useState('xgboost')
  const [jobId, setJobId]       = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const trainMutation = useMutation({
    mutationFn: () => api.ml.trainModel(symbol, modelType),
    onSuccess: (res) => {
      setJobId(res.job_id)
      setJobStatus('queued')
      // Poll for status
      const poll = setInterval(async () => {
        try {
          const status = await api.ml.getTrainStatus(res.job_id)
          setJobStatus(status.status)
          if (status.status === 'done' || status.status === 'failed') {
            clearInterval(poll)
            if (status.status === 'done') {
              // Refresh all ML data for the trained symbol
              queryClient.invalidateQueries({ queryKey: ['ml', 'models'] })
              queryClient.invalidateQueries({ queryKey: ['ml', 'predict', symbol] })
              queryClient.invalidateQueries({ queryKey: ['ml', 'features', symbol] })
              queryClient.invalidateQueries({ queryKey: ['ml', 'shap', symbol] })
              queryClient.invalidateQueries({ queryKey: ['ml', 'signal', symbol] })
            }
          }
        } catch {
          clearInterval(poll)
        }
      }, 3000)
    },
  })

  const isRunning = jobStatus === 'queued' || jobStatus === 'running'

  return (
    <Card>
      <CardHeader
        title="Train New Model"
        subheader="Triggers XGBoost training on 5yr of technical features (~1-3 min)"
        titleTypographyProps={{ variant: 'subtitle1', fontWeight: 700 }}
        subheaderTypographyProps={{ variant: 'caption' }}
      />
      <CardContent>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Symbol</InputLabel>
            <Select value={symbol} label="Symbol" onChange={(e) => setSymbol(e.target.value as Symbol)}>
              {SYMBOLS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Model Type</InputLabel>
            <Select value={modelType} label="Model Type" onChange={(e) => setModelType(e.target.value)}>
              <MenuItem value="xgboost">XGBoost</MenuItem>
              <MenuItem value="lstm" disabled>LSTM (coming soon)</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="contained"
            startIcon={isRunning ? <CircularProgress size={16} color="inherit" /> : <TrainIcon />}
            disabled={isRunning || trainMutation.isPending}
            onClick={() => trainMutation.mutate()}
          >
            {isRunning ? 'Training...' : 'Train Model'}
          </Button>
        </Box>

        {/* Status display */}
        {jobStatus && (
          <Box sx={{ mt: 2 }}>
            {jobStatus === 'queued'  && <Alert severity="info">Job queued — starting training...</Alert>}
            {jobStatus === 'running' && <Alert severity="info">Training in progress ({symbol} {modelType})...</Alert>}
            {jobStatus === 'done'    && <Alert severity="success">Training complete! Model saved and predictions generated.</Alert>}
            {jobStatus === 'failed'  && <Alert severity="error">Training failed. Check backend logs: <code>make logs</code></Alert>}
          </Box>
        )}

        {trainMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            API error: {String((trainMutation.error as Error)?.message ?? 'Unknown error')}
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

// ── Phase 6: SHAP Panel ───────────────────────────────────────────────────────
function SHAPPanel({ symbol }: { symbol: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey:  ['ml', 'shap', symbol],
    queryFn:   () => api.ml.getShapValues(symbol, 12),
    staleTime: 120_000,
    retry: 1,
  })

  const headerColor = data?.predicted_dir === 'up' ? 'secondary.main' : 'error.main'

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="Why Did the AI Make This Call?"
        subheader={
          data
            ? `${symbol} · ${(data.predicted_proba * 100).toFixed(1)}% chance of going UP · Top ${data.count} factors`
            : `${symbol} · Factors that influenced the latest prediction`
        }
        titleTypographyProps={{ variant: 'subtitle1', fontWeight: 700 }}
        subheaderTypographyProps={{ variant: 'caption' }}
        action={
          data && (
            <Chip
              label={data.predicted_dir === 'up' ? 'UP' : 'DOWN'}
              size="small"
              sx={{
                bgcolor: `${data.predicted_dir === 'up' ? '#06d6a0' : '#ef476f'}22`,
                color: headerColor,
                fontWeight: 700,
                mr: 1,
                mt: 0.5,
              }}
            />
          )
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {isLoading && <Skeleton variant="rectangular" height={380} sx={{ borderRadius: 1 }} />}
        {isError && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {(error as Error)?.message?.includes('404')
              ? `No trained model for ${symbol}. Train one first.`
              : `Could not load SHAP values. Make sure 'shap' is installed in the backend.`
            }
          </Alert>
        )}
        {data && (
          <>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
              Green bars are reasons the AI thinks it will go UP · Red bars are reasons it thinks DOWN · Longer bar = stronger influence
            </Typography>
            <SHAPWaterfallChart features={data.features} height={380} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Phase 6: Sentiment Panel ──────────────────────────────────────────────────
function SentimentPanel({ symbol }: { symbol: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey:  ['ml', 'sentiment', symbol],
    queryFn:   () => api.ml.getSentiment(symbol),
    staleTime: 60_000,
    retry: 1,
  })

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="Market Mood Score"
        subheader={`${symbol} · Based on price momentum and trend indicators`}
        titleTypographyProps={{ variant: 'subtitle1', fontWeight: 700 }}
        subheaderTypographyProps={{ variant: 'caption' }}
      />
      <CardContent sx={{ pt: 0 }}>
        {isLoading && <Skeleton variant="rectangular" height={340} sx={{ borderRadius: 1 }} />}
        {isError && (
          <Alert severity="warning">
            Could not load sentiment for {symbol}. Make sure market data is ingested.
          </Alert>
        )}
        {data && (
          <>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5 }}>
              -1 = very negative outlook · 0 = neutral · +1 = very positive outlook
            </Typography>
            <SentimentGauge data={data} />

            {/* Components breakdown */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
              Score components
            </Typography>
            {[
              { label: 'Recent momentum (14-day)', value: data.components.rsi_component },
              { label: 'Short-term trend (50-day avg)', value: data.components.sma50_component },
              { label: 'Long-term trend (200-day avg)', value: data.components.sma200_component },
            ].map(({ label, value }) => (
              <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography
                  variant="caption"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight={700}
                  sx={{ color: value > 0 ? 'secondary.main' : value < 0 ? 'error.main' : 'text.disabled' }}
                >
                  {value >= 0 ? '+' : ''}{value.toFixed(3)}
                </Typography>
              </Box>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Phase 6: Signal Panel ─────────────────────────────────────────────────────
function SignalPanel({ symbol }: { symbol: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey:  ['ml', 'signal', symbol],
    queryFn:   () => api.ml.getSignal(symbol),
    staleTime: 60_000,
    retry: 1,
  })

  const signalColor = {
    buy:  '#06d6a0',
    sell: '#ef476f',
    hold: '#94a3b8',
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="AI Trading Signal"
        subheader={`${symbol} · Combines AI prediction, market mood, and price trends`}
        titleTypographyProps={{ variant: 'subtitle1', fontWeight: 700 }}
        subheaderTypographyProps={{ variant: 'caption' }}
        action={<SignalIcon sx={{ color: 'primary.main', mr: 1, mt: 0.5 }} />}
      />
      <CardContent sx={{ pt: 0 }}>
        {isLoading && <Skeleton variant="rectangular" height={340} sx={{ borderRadius: 1 }} />}
        {isError && (
          <Alert severity="warning">
            {(error as Error)?.message?.includes('404')
              ? `No trained model for ${symbol}. Train one first.`
              : `Could not load signal for ${symbol}.`
            }
          </Alert>
        )}
        {data && (
          <>
            {/* Large signal badge */}
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography
                variant="h2"
                fontWeight={900}
                fontFamily="IBM Plex Mono, monospace"
                sx={{ color: signalColor[data.signal], letterSpacing: '0.05em' }}
              >
                {data.signal.toUpperCase()}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Score:
                </Typography>
                <Typography
                  variant="body1"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight={700}
                  sx={{ color: signalColor[data.signal] }}
                >
                  {data.score >= 0 ? '+' : ''}{data.score.toFixed(3)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  · Confidence:
                </Typography>
                <Typography
                  variant="body1"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight={700}
                >
                  {(data.confidence * 100).toFixed(1)}%
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Sub-signal votes */}
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
              What each component is saying — green = bullish, red = bearish
            </Typography>
            {Object.entries(data.sub_signals).map(([key, sub]) => {
              const pct = ((sub.vote + 1) / 2) * 100  // Map [-1, +1] → [0, 100]
              const c   = sub.vote > 0.1 ? '#06d6a0' : sub.vote < -0.1 ? '#ef476f' : '#94a3b8'
              return (
                <Box key={key} sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                      {key}
                    </Typography>
                    <Typography
                      variant="caption"
                      fontFamily="IBM Plex Mono, monospace"
                      fontWeight={700}
                      sx={{ color: c }}
                    >
                      {sub.vote >= 0 ? '+' : ''}{sub.vote.toFixed(3)}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    sx={{
                      height: 5,
                      borderRadius: 3,
                      bgcolor: 'rgba(255,255,255,0.06)',
                      '& .MuiLinearProgress-bar': { bgcolor: c, borderRadius: 3 },
                    }}
                  />
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
                    {sub.label}
                  </Typography>
                </Box>
              )
            })}

            <Divider sx={{ my: 1.5 }} />

            {/* Reasoning */}
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.75 }}>
              Reasoning
            </Typography>
            {data.reasoning.map((line, i) => (
              <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                • {line}
              </Typography>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Phase 15: XGBoost vs LSTM comparison table ───────────────────────────────
function ModelComparisonTable({ models }: { models: MLModelInfo[] }) {
  // Group models by symbol, then by model_type to build comparison rows
  const symbolMap: Record<string, Record<string, MLModelInfo>> = {}
  for (const m of models) {
    if (!symbolMap[m.symbol]) symbolMap[m.symbol] = {}
    // Keep the latest version per type
    const existing = symbolMap[m.symbol][m.model_type]
    if (!existing || m.version > existing.version) {
      symbolMap[m.symbol][m.model_type] = m
    }
  }

  const symbols   = Object.keys(symbolMap).sort()
  const modelTypes = ['xgboost', 'lstm']

  if (symbols.length === 0) return null

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Symbol</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Model Type</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Version</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Accuracy</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>F1 Score</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>AUC-ROC</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Train Samples</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Trained</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {symbols.flatMap((sym) =>
                modelTypes
                  .filter((t) => symbolMap[sym][t])
                  .map((t) => {
                    const m = symbolMap[sym][t]
                    const isLSTM = t === 'lstm'
                    return (
                      <TableRow key={`${sym}-${t}`} hover>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}>
                          {sym}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={t.toUpperCase()}
                            sx={{
                              bgcolor: isLSTM ? 'rgba(168,85,247,0.15)' : 'rgba(0,180,216,0.15)',
                              color:   isLSTM ? '#a855f7' : 'primary.main',
                              fontWeight: 700,
                              fontSize: '0.65rem',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>v{m.version}</TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            fontFamily="IBM Plex Mono, monospace"
                            sx={{ color: m.accuracy && m.accuracy > 0.55 ? '#06d6a0' : 'text.primary' }}
                          >
                            {m.accuracy != null ? (m.accuracy * 100).toFixed(1) + '%' : '—'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                          {m.f1_score != null ? (m.f1_score * 100).toFixed(1) + '%' : '—'}
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            fontFamily="IBM Plex Mono, monospace"
                            sx={{ color: m.roc_auc && m.roc_auc > 0.6 ? '#06d6a0' : 'text.primary' }}
                          >
                            {m.roc_auc != null ? m.roc_auc.toFixed(3) : '—'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                          {m.train_samples?.toLocaleString() ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.disabled">
                            {new Date(m.created_at).toLocaleDateString()}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.disabled">
            Train both XGBoost and LSTM for the same symbol to compare. Use "Train New Model" above or{' '}
            <code>make train symbol=SPY model_type=lstm</code> in the terminal.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Regime Detection panel (Phase 35) ─────────────────────────────────────────
const REGIME_COLORS: Record<string, string> = {
  bull:     '#06d6a0',
  bear:     '#ff6b6b',
  sideways: '#f59e0b',
}

function RegimePanel({ symbol }: { symbol: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey:  ['ml', 'regimes', symbol],
    queryFn:   () => api.ml.getRegimes(symbol, 252),
    staleTime: 60_000,
  })

  if (isLoading) return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </CardContent>
    </Card>
  )

  if (isError || !data) return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Alert severity="info">No data for {symbol}. Run <code>make ingest</code> first.</Alert>
      </CardContent>
    </Card>
  )

  // Build regime spans for ReferenceArea overlays
  const spans: { start: string; end: string; regime: string }[] = []
  if (data.bars.length > 0) {
    let cur = data.bars[0]
    for (let i = 1; i < data.bars.length; i++) {
      if (data.bars[i].regime !== cur.regime) {
        spans.push({ start: cur.date, end: data.bars[i - 1].date, regime: cur.regime })
        cur = data.bars[i]
      }
    }
    spans.push({ start: cur.date, end: data.bars[data.bars.length - 1].date, regime: cur.regime })
  }

  // Downsample for chart performance
  const chartData = data.bars.filter((_, i) => i % 3 === 0 || i === data.bars.length - 1)

  const currentColor = REGIME_COLORS[data.current] ?? '#9CA3AF'

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RegimeIcon sx={{ color: 'primary.main', fontSize: 18 }} />
            <Typography variant="subtitle2" fontWeight={700}>
              {symbol} — Market Regime History
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Chip
              label={`Current: ${data.current.toUpperCase()}`}
              size="small"
              sx={{ bgcolor: `${currentColor}22`, color: currentColor, fontWeight: 700 }}
            />
            {(['bull', 'bear', 'sideways'] as const).map((r) => {
              const pct = r === 'bull' ? data.bull_pct : r === 'bear' ? data.bear_pct : data.sideways_pct
              return (
                <Typography key={r} variant="caption" sx={{ color: REGIME_COLORS[r] }}>
                  {r.charAt(0).toUpperCase() + r.slice(1)} {(pct * 100).toFixed(0)}%
                </Typography>
              )
            })}
          </Box>
        </Box>

        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => d.slice(5)}   // "MM-DD"
              tick={{ fontSize: 10, fill: '#6B7280' }}
              interval={Math.floor(chartData.length / 6)}
            />
            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} width={52} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: '0.75rem' }}
              formatter={(v: number, name: string) =>
                name === 'close' ? [`$${v.toFixed(2)}`, 'Close'] : [v, name]
              }
            />
            {/* Regime background spans */}
            {spans.map((s, i) => (
              <ReferenceArea
                key={i}
                x1={s.start} x2={s.end}
                fill={REGIME_COLORS[s.regime]}
                fillOpacity={0.08}
              />
            ))}
            {/* Price line */}
            <Line
              type="monotone"
              dataKey="close"
              stroke="#4A9EFF"
              strokeWidth={1.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>

        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          Rule: Bull = 20d return &gt;+5%, Bear = &lt;−5%, Sideways = otherwise.
          Colored background spans show regime periods.
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MLModels() {
  const [selectedSymbol, setSelectedSymbol] = useState<Symbol>('SPY')

  // Fetch all models
  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['ml', 'models'],
    queryFn:  () => api.ml.listModels(),
    staleTime: 30_000,
  })

  // Feature importance for selected symbol
  const { data: featureData } = useQuery({
    queryKey: ['ml', 'features', selectedSymbol],
    queryFn:  () => api.ml.getFeatureImportance(selectedSymbol),
    staleTime: 60_000,
  })

  const models = modelsData?.models ?? []

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <MLIcon sx={{ color: 'primary.main', fontSize: 28 }} />
          <Typography variant="h4">ML Models</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          XGBoost direction classifiers · SHAP explainability · Sentiment signals · Composite signal
        </Typography>
      </Box>

      {/* ── Section 1: Trained Models ──────────────────────────────────────── */}
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>Trained Models</Typography>

      {modelsLoading && (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {[1, 2, 3].map((i) => <Grid item xs={12} md={4} key={i}><Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} /></Grid>)}
        </Grid>
      )}

      {!modelsLoading && models.length === 0 && (
        <Alert severity="info" sx={{ mb: 4 }}>
          No trained models yet. Use the <strong>Train New Model</strong> panel below,
          or run <code>make train symbol=SPY</code> from the terminal.
        </Alert>
      )}

      {models.length > 0 && (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {models.map((m) => (
            <Grid item xs={12} md={4} key={m.id}>
              <ModelCard model={m} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* ── Section 2: Symbol selector + Predictions ───────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h6" fontWeight={700}>Recent Predictions</Typography>
        <ToggleButtonGroup
          value={selectedSymbol}
          exclusive
          size="small"
          onChange={(_, v) => v && setSelectedSymbol(v as Symbol)}
        >
          {SYMBOLS.map((s) => (
            <ToggleButton key={s} value={s} sx={{ px: 2, fontSize: '0.75rem' }}>{s}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {/* Predictions table */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardHeader
              title={`${selectedSymbol} — Up/Down Predictions`}
              subheader="Pre-computed at training time · confidence = P(predicted class)"
              titleTypographyProps={{ variant: 'subtitle1', fontWeight: 700 }}
              subheaderTypographyProps={{ variant: 'caption' }}
            />
            <CardContent sx={{ pt: 0 }}>
              <PredictionTable symbol={selectedSymbol} />
            </CardContent>
          </Card>
        </Grid>

        {/* Feature importance */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardHeader
              title={`${selectedSymbol} — Feature Importance`}
              subheader="XGBoost gain-based importance (higher = more useful for splitting)"
              titleTypographyProps={{ variant: 'subtitle1', fontWeight: 700 }}
              subheaderTypographyProps={{ variant: 'caption' }}
            />
            <CardContent sx={{ pt: 0 }}>
              {featureData?.features && Object.keys(featureData.features).length > 0 ? (
                <FeatureImportanceChart features={featureData.features} height={420} topN={15} />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 420 }}>
                  <Typography color="text.disabled">No feature data — train a model first</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Section 3: Train Panel ─────────────────────────────────────────── */}
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>Train New Model</Typography>
      <TrainPanel />

      {/* ── Section 4: Advanced ML Signals (Phase 6) ──────────────────────── */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <SignalIcon sx={{ color: 'primary.main', fontSize: 22 }} />
          <Typography variant="h6" fontWeight={700}>Advanced ML Signals</Typography>
          <Chip label="Phase 6" size="small" color="primary" sx={{ fontSize: '0.65rem' }} />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          SHAP explainability · RSI+MA sentiment · Composite BUY/HOLD/SELL signal for{' '}
          <strong>{selectedSymbol}</strong> (symbol selector above applies)
        </Typography>

        <Grid container spacing={2.5}>
          {/* SHAP Waterfall */}
          <Grid item xs={12} lg={5}>
            <SHAPPanel symbol={selectedSymbol} />
          </Grid>

          {/* Sentiment Gauge */}
          <Grid item xs={12} sm={6} lg={3}>
            <SentimentPanel symbol={selectedSymbol} />
          </Grid>

          {/* Composite Signal */}
          <Grid item xs={12} sm={6} lg={4}>
            <SignalPanel symbol={selectedSymbol} />
          </Grid>
        </Grid>
      </Box>

      {/* ── Section 5: XGBoost vs LSTM Comparison (Phase 15) ─────────────── */}
      {models.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <Chip label="Phase 15" size="small" color="secondary" sx={{ fontSize: '0.65rem' }} />
            <Typography variant="h6" fontWeight={700}>XGBoost vs LSTM Comparison</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Side-by-side performance metrics for all trained models. Train both model types on the
            same symbol to compare accuracy, F1-score, and AUC-ROC.
          </Typography>
          <ModelComparisonTable models={models} />
        </Box>
      )}

      {/* ── Section 6: Regime Detection (Phase 35) ──────────────────────── */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <RegimeIcon sx={{ color: 'primary.main', fontSize: 22 }} />
          <Typography variant="h6" fontWeight={700}>Market Regime Detection</Typography>
          <Chip label="Phase 35" size="small" color="warning" sx={{ fontSize: '0.65rem' }} />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Rule-based regime classifier using 20-day rolling return thresholds.
          Background colors show Bull / Bear / Sideways periods on the price chart.
        </Typography>
        <RegimePanel symbol={selectedSymbol} />
      </Box>

      {/* Phase indicator */}
      <Box sx={{ mt: 4, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.disabled">
          Phase 35 — Regime Detection | Phase 15 — LSTM Comparison | Phase 6 — Advanced ML
        </Typography>
      </Box>
    </Box>
  )
}
