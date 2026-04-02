/**
 * Reinforcement Learning Agent Page — Phase 42.
 *
 * Q-learning agent that learns Buy / Hold / Sell decisions from discretized
 * market state (RSI bucket × momentum bucket × position).
 *
 * UI sections:
 *   1. Train panel — symbol input, # episodes slider, Train button + status
 *   2. Predict panel — current action recommendation + Q-value bar chart
 *   3. State explanation — what each state dimension means
 */

import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  Paper,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  Psychology as RLIcon,
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  CheckCircleOutline as TrainedIcon,
  RadioButtonUnchecked as UntrainedIcon,
} from '@mui/icons-material'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type RLPrediction } from '@/services/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const RSI_LABELS    = ['Oversold (< 30)', 'Neutral (30–70)', 'Overbought (> 70)']
const MOM_LABELS    = ['Negative (< −1%)', 'Flat (±1%)', 'Positive (> +1%)']
const ACTION_COLOR  = { buy: '#06d6a0', hold: '#94a3b8', sell: '#ff6b6b' } as const
const ACTION_ICON   = {
  buy:  <TrendingUp  sx={{ fontSize: 28, color: '#06d6a0' }} />,
  hold: <TrendingFlat sx={{ fontSize: 28, color: '#94a3b8' }} />,
  sell: <TrendingDown sx={{ fontSize: 28, color: '#ff6b6b' }} />,
}

// ── Q-value bar chart ─────────────────────────────────────────────────────────

function QValueChart({ qValues }: { qValues: [number, number, number] }) {
  const data = [
    { name: 'Hold', q: qValues[0], color: '#94a3b8' },
    { name: 'Buy',  q: qValues[1], color: '#06d6a0' },
    { name: 'Sell', q: qValues[2], color: '#ff6b6b' },
  ]
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }} />
        <YAxis tick={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }} width={52} />
        <RechartTooltip
          contentStyle={{ background: '#12161F', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6 }}
          formatter={(v: number) => [v.toFixed(6), 'Q-value']}
        />
        <Bar dataKey="q" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Prediction card ───────────────────────────────────────────────────────────

function PredictionCard({ pred }: { pred: RLPrediction }) {
  const action = pred.action as 'buy' | 'hold' | 'sell'
  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Recommended Action
      </Typography>
      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 2 }}>
        {ACTION_ICON[action]}
        <Typography
          variant="h4"
          fontWeight={800}
          sx={{ color: ACTION_COLOR[action], fontFamily: 'IBM Plex Mono, monospace' }}
        >
          {action.toUpperCase()}
        </Typography>
        <Chip
          label={`Confidence: ${(pred.confidence * 100).toFixed(3)}%`}
          size="small"
          variant="outlined"
          sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}
        />
      </Stack>

      <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
        Q-VALUES (Hold / Buy / Sell)
      </Typography>
      <QValueChart qValues={pred.q_values} />

      <Divider sx={{ my: 2 }} />

      <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
        CURRENT STATE
      </Typography>
      <Stack direction="row" gap={1} sx={{ mt: 1 }} flexWrap="wrap">
        <Chip
          label={`RSI: ${RSI_LABELS[pred.state.rsi_bucket]}`}
          size="small"
          variant="outlined"
          sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.68rem' }}
        />
        <Chip
          label={`Momentum: ${MOM_LABELS[pred.state.momentum_bucket]}`}
          size="small"
          variant="outlined"
          sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.68rem' }}
        />
        <Chip
          label={pred.state.position === 1 ? 'Position: Long' : 'Position: Flat'}
          size="small"
          variant="outlined"
          sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.68rem' }}
        />
      </Stack>

      {pred.note && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5 }}>
          ⚠ {pred.note}
        </Typography>
      )}
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
        Based on {pred.bars_used} bars of history.
      </Typography>
    </Paper>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RLAgentPage() {
  const qc = useQueryClient()
  const [input,      setInput]      = useState('SPY')
  const [symbol,     setSymbol]     = useState('SPY')
  const [nEpisodes,  setNEpisodes]  = useState(50)
  const [trainMsg,   setTrainMsg]   = useState<string | null>(null)

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey:  ['rl-status', symbol],
    queryFn:   () => api.rl.status(symbol),
    staleTime: 30_000,
    enabled:   !!symbol,
  })

  const { data: pred, isFetching: predFetching, error: predError } = useQuery({
    queryKey:  ['rl-predict', symbol],
    queryFn:   () => api.rl.predict(symbol),
    staleTime: 60_000,
    enabled:   !!symbol && status?.trained === true,
  })

  const trainMutation = useMutation({
    mutationFn: () => api.rl.train(symbol, nEpisodes),
    onSuccess: (data) => {
      setTrainMsg(data.message)
      // Poll status every 3s for up to 90s waiting for training to finish
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        await refetchStatus()
        if (attempts >= 30) clearInterval(poll)
      }, 3000)
    },
    onError: (err: Error) => {
      setTrainMsg(`Error: ${err.message}`)
    },
  })

  const handleSearch = () => {
    const s = input.trim().toUpperCase()
    if (s) {
      setSymbol(s)
      setTrainMsg(null)
      qc.invalidateQueries({ queryKey: ['rl-predict', s] })
    }
  }

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <RLIcon sx={{ color: '#4A9EFF', fontSize: 22 }} />
        <Typography variant="h6" fontWeight={700}>
          RL Trading Agent
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          Tabular Q-learning · Buy / Hold / Sell
        </Typography>
      </Stack>

      {/* Search */}
      <Stack direction="row" gap={1} sx={{ mb: 3, maxWidth: 400 }} alignItems="center">
        <TextField
          size="small"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Ticker…"
          sx={{ width: 160 }}
          InputProps={{
            sx: { fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.85rem' },
          }}
        />
        <Button variant="outlined" size="small" onClick={handleSearch}>
          Load
        </Button>

        {status && (
          <Tooltip title={status.trained ? `Q-table exists (${status.size_kb} KB)` : 'Not trained yet'}>
            <Chip
              icon={status.trained ? <TrainedIcon sx={{ fontSize: '16px !important' }} /> : <UntrainedIcon sx={{ fontSize: '16px !important' }} />}
              label={status.trained ? 'Trained' : 'Not trained'}
              size="small"
              color={status.trained ? 'success' : 'default'}
              variant="outlined"
              sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem' }}
            />
          </Tooltip>
        )}
      </Stack>

      {/* Train panel */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3, maxWidth: 500 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Train Q-Table
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Runs Q-learning on {symbol}'s full price history in the background.
          More episodes = better convergence but slower.
        </Typography>

        <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ width: 90, fontFamily: 'IBM Plex Mono, monospace' }}>
            Episodes: {nEpisodes}
          </Typography>
          <Slider
            value={nEpisodes}
            onChange={(_, v) => setNEpisodes(v as number)}
            min={10}
            max={200}
            step={10}
            sx={{ flex: 1, maxWidth: 300 }}
          />
        </Stack>

        <Button
          variant="contained"
          size="small"
          disableElevation
          onClick={() => { setTrainMsg(null); trainMutation.mutate() }}
          disabled={trainMutation.isPending}
          startIcon={trainMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {trainMutation.isPending ? 'Queuing…' : `Train (${nEpisodes} episodes)`}
        </Button>

        {trainMsg && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            {trainMsg}
          </Typography>
        )}
      </Paper>

      {/* Prediction */}
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
        Current Prediction — {symbol}
      </Typography>

      {!status?.trained && (
        <Typography color="text.secondary" variant="body2">
          No trained Q-table for {symbol}. Click "Train" above to build one.
        </Typography>
      )}

      {predFetching && status?.trained && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
          <CircularProgress size={18} />
          <Typography color="text.secondary">Loading prediction…</Typography>
        </Box>
      )}

      {predError && status?.trained && (
        <Typography color="error.main" variant="body2">
          Failed to load prediction — Q-table may still be training. Wait a moment and refresh.
        </Typography>
      )}

      {pred && !predFetching && <PredictionCard pred={pred} />}

      {/* Explanation */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mt: 3, maxWidth: 600 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          How It Works
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
          The agent uses <b>tabular Q-learning</b> (a foundational RL algorithm) to learn
          a Buy/Hold/Sell policy directly from daily price data.
          <br /><br />
          <b>State space</b> (3 × 3 × 2 = 18 states):<br />
          • RSI bucket — oversold / neutral / overbought<br />
          • 5-day momentum — negative / flat / positive<br />
          • Position — flat / long<br />
          <br />
          <b>Reward</b>: daily return while long; 0 while flat; −0.02 penalty for invalid actions.
          <br />
          <b>Limitation</b>: Tabular RL with 18 states is exploratory / educational.
          For production, use a deep RL framework (PPO, DQN with neural Q-function).
        </Typography>
      </Paper>
    </Box>
  )
}
