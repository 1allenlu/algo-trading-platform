/**
 * ML Models page — Phase 2.
 *
 * Sections:
 *   1. Model Cards          — Trained models with accuracy / F1 / AUC metrics
 *   2. Prediction Timeline  — Recent up/down predictions with confidence bars
 *   3. Feature Importance   — Horizontal bar chart for selected model
 *   4. Train Panel          — Trigger training from UI (async + polling)
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
} from '@mui/icons-material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type MLModelInfo } from '@/services/api'
import FeatureImportanceChart from '@/components/charts/FeatureImportanceChart'

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
      <Typography variant="h6" fontFamily="Roboto Mono, monospace" sx={{ color }}>
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
            <Typography variant="subtitle1" fontWeight={700} fontFamily="Roboto Mono, monospace">
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
          <MetricBadge label="Accuracy" value={model.accuracy}  colorize />
          <MetricBadge label="F1"       value={model.f1_score}  colorize />
          <MetricBadge label="ROC AUC"  value={model.roc_auc}   colorize />
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* Dataset info */}
        <Box sx={{ display: 'flex', gap: 3 }}>
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">Train samples</Typography>
            <Typography variant="body2" fontFamily="Roboto Mono, monospace">
              {model.train_samples?.toLocaleString() ?? '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">Test samples</Typography>
            <Typography variant="body2" fontFamily="Roboto Mono, monospace">
              {model.test_samples?.toLocaleString() ?? '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">Features</Typography>
            <Typography variant="body2" fontFamily="Roboto Mono, monospace">
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
                <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.8rem' }}>
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
                      fontFamily="Roboto Mono, monospace"
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
              // Refresh models list + predictions
              queryClient.invalidateQueries({ queryKey: ['ml', 'models'] })
              queryClient.invalidateQueries({ queryKey: ['ml', 'predict', symbol] })
              queryClient.invalidateQueries({ queryKey: ['ml', 'features', symbol] })
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
          XGBoost direction classifiers trained on 42 technical features · Walk-forward validation
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

      {/* Phase indicator */}
      <Box sx={{ mt: 4, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.disabled">
          Phase 2 — ML Pipeline ·
          Next: Quant Strategies (Phase 3) · Risk Management (Phase 4)
        </Typography>
      </Box>
    </Box>
  )
}
