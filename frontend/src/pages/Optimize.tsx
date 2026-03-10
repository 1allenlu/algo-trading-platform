/**
 * Strategy Optimization — Phase 10.
 *
 * Hyperparameter grid search for quant strategies.
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Config panel: strategy, symbols, param grid, objective   │
 *   │ [Run Optimization]                                        │
 *   ├─────────────────────────┬────────────────────────────────┤
 *   │ Progress bar + status   │ Best params display            │
 *   ├─────────────────────────┴────────────────────────────────┤
 *   │ Scatter chart: Return vs Sharpe (each dot = one trial)   │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Results table: ranked trial list with all metrics        │
 *   └──────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  PlayArrow as RunIcon,
  EmojiEvents as TrophyIcon,
  Tune as TuneIcon,
} from '@mui/icons-material'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'

import {
  api,
  OptimizationRunDetail,
  OptimizationRunSummary,
  TrialResult,
  WFOResult,
} from '@/services/api'

// ── Constants ──────────────────────────────────────────────────────────────────

const STRATEGY_OPTIONS = [
  { value: 'pairs_trading',  label: 'Pairs Trading' },
  { value: 'momentum',       label: 'Momentum' },
  { value: 'mean_reversion', label: 'Mean Reversion' },
]

const OBJECTIVE_OPTIONS = [
  { value: 'sharpe',       label: 'Sharpe Ratio' },
  { value: 'total_return', label: 'Total Return' },
  { value: 'calmar',       label: 'Calmar Ratio' },
  { value: 'sortino',      label: 'Sortino Ratio' },
]

const DEFAULT_SYMBOLS: Record<string, string> = {
  pairs_trading:  'SPY,QQQ',
  momentum:       'SPY,QQQ,AAPL,MSFT,NVDA',
  mean_reversion: 'SPY',
}

const POLL_INTERVAL_MS = 2_000

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return `${(v * 100).toFixed(2)}%`
}

function num(v: number | null, decimals = 2): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(decimals)
}

/** Convert default param space dict to editable JSON string for a textarea */
function gridToJson(grid: Record<string, unknown[]>): string {
  return JSON.stringify(grid, null, 2)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ParamsDisplay({ params }: { params: Record<string, unknown> }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mt: 0.5 }}>
      {Object.entries(params).map(([k, v]) => (
        <Chip
          key={k}
          label={`${k}: ${v}`}
          size="small"
          sx={{ fontSize: '0.7rem', height: 20, bgcolor: 'rgba(74,158,255,0.12)', color: 'primary.main' }}
        />
      ))}
    </Box>
  )
}

function ProgressPanel({
  run,
  onRefresh,
}: {
  run: OptimizationRunDetail | OptimizationRunSummary | null
  onRefresh: () => void
}) {
  if (!run) return null
  const pctDone = run.total_trials > 0
    ? Math.round((run.completed_trials / run.total_trials) * 100)
    : 0

  const statusColor =
    run.status === 'done'   ? 'success.main' :
    run.status === 'failed' ? 'error.main'   :
    'primary.main'

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>
            Run #{run.id} — {run.strategy} ({run.symbols.join(', ')})
          </Typography>
          <Typography variant="caption" color={statusColor} fontWeight={600} textTransform="uppercase">
            {run.status}
          </Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={onRefresh}>Refresh</Button>
      </Box>

      <LinearProgress
        variant="determinate"
        value={pctDone}
        sx={{ height: 6, borderRadius: 1, mb: 0.5 }}
        color={run.status === 'failed' ? 'error' : 'primary'}
      />
      <Typography variant="caption" color="text.secondary">
        {run.completed_trials} / {run.total_trials} trials ({pctDone}%)
      </Typography>

      {'error' in run && run.error && (
        <Alert severity="error" sx={{ mt: 1.5, py: 0 }}>{run.error}</Alert>
      )}

      {run.best_params && (
        <Box sx={{ mt: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <TrophyIcon sx={{ fontSize: 14, color: '#F59E0B' }} />
            <Typography variant="caption" fontWeight={700} color="text.secondary">
              Best params (Sharpe {num(run.best_sharpe)} | Return {pct(run.best_return)})
            </Typography>
          </Box>
          <ParamsDisplay params={run.best_params} />
        </Box>
      )}
    </Paper>
  )
}

function ScatterPlot({ results }: { results: TrialResult[] }) {
  if (!results.length) return null

  const data = results.map((r, i) => ({
    x:    (r.total_return ?? 0) * 100,  // % return on X axis
    y:    r.sharpe_ratio ?? 0,          // Sharpe on Y axis
    z:    1,
    rank: i + 1,
    params: r.params,
  }))

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
        Trial Results — Return vs Sharpe ({results.length} trials)
      </Typography>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 10, right: 30, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
          <XAxis
            dataKey="x"
            name="Total Return"
            unit="%"
            label={{ value: 'Total Return (%)', position: 'insideBottom', offset: -10, fill: '#888', fontSize: 11 }}
            tick={{ fill: '#888', fontSize: 11 }}
          />
          <YAxis
            dataKey="y"
            name="Sharpe"
            label={{ value: 'Sharpe', angle: -90, position: 'insideLeft', offset: 10, fill: '#888', fontSize: 11 }}
            tick={{ fill: '#888', fontSize: 11 }}
          />
          <ZAxis dataKey="z" range={[40, 40]} />
          <RechartsTooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload
              return (
                <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', p: 1.5, borderRadius: 1, fontSize: '0.75rem' }}>
                  <Typography variant="caption" display="block" fontWeight={700}>Rank #{d.rank}</Typography>
                  <Typography variant="caption" display="block">Return: {d.x.toFixed(2)}%</Typography>
                  <Typography variant="caption" display="block">Sharpe: {d.y.toFixed(3)}</Typography>
                  {Object.entries(d.params).map(([k, v]) => (
                    <Typography key={k} variant="caption" display="block" color="text.secondary">
                      {k}: {String(v)}
                    </Typography>
                  ))}
                </Box>
              )
            }}
          />
          <Scatter
            data={data}
            fill="#4A9EFF"
            opacity={0.75}
            stroke="#2563EB"
            strokeWidth={1}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </Paper>
  )
}

function ResultsTable({ results, objective }: { results: TrialResult[]; objective: string }) {
  if (!results.length) return null

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
        Ranked Results (by {objective})
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Params</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Sharpe</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Return</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Max DD</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Calmar</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Trades</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {results.slice(0, 20).map((r, i) => (
              <TableRow
                key={i}
                sx={{
                  bgcolor: i === 0 ? 'rgba(74,158,255,0.07)' : undefined,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                }}
              >
                <TableCell>
                  {i === 0
                    ? <TrophyIcon sx={{ fontSize: 14, color: '#F59E0B', verticalAlign: 'middle' }} />
                    : <Typography variant="caption" color="text.disabled">{i + 1}</Typography>
                  }
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4 }}>
                    {Object.entries(r.params).map(([k, v]) => (
                      <Chip
                        key={k}
                        label={`${k}=${v}`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.6rem', height: 16, borderColor: 'divider', color: 'text.secondary' }}
                      />
                    ))}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    color={(r.sharpe_ratio ?? 0) > 0 ? 'success.main' : 'error.main'}
                  >
                    {num(r.sharpe_ratio, 3)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="caption"
                    color={(r.total_return ?? 0) >= 0 ? 'success.main' : 'error.main'}
                  >
                    {pct(r.total_return)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption" color="error.main">
                    {pct(r.max_drawdown)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption">{num(r.calmar_ratio, 2)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption">{r.num_trades ?? '—'}</Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  )
}

// ── Walk-Forward Panel — Phase 28 ─────────────────────────────────────────────

interface WFOPanelProps {
  strategy:  string
  symbols:   string
  gridJson:  string
  objective: string
}

function WFOPanel({ strategy, symbols, gridJson, objective }: WFOPanelProps) {
  const [nWindows,   setNWindows]   = useState(5)
  const [trainRatio, setTrainRatio] = useState(0.7)
  const [running,    setRunning]    = useState(false)
  const [result,     setResult]     = useState<WFOResult | null>(null)
  const [err,        setErr]        = useState<string | null>(null)

  async function handleRun() {
    let paramGrid: Record<string, unknown[]>
    try {
      paramGrid = JSON.parse(gridJson)
    } catch {
      setErr('Fix the param grid JSON first')
      return
    }
    const symList = symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    if (!symList.length) { setErr('Enter at least one symbol'); return }

    setRunning(true)
    setErr(null)
    setResult(null)
    try {
      const res = await api.wfo.run({
        strategy, symbols: symList, param_grid: paramGrid,
        objective, n_windows: nWindows, train_ratio: trainRatio,
      })
      setResult(res)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'WFO failed'
      setErr(msg)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Divider sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.disabled">Walk-Forward Optimization</Typography>
      </Divider>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="subtitle2" fontWeight={700} mb={1}>
          Walk-Forward Optimization — Phase 28
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Splits data into rolling windows. Grid-searches on train, evaluates OOS on test.
          Measures parameter stability across market regimes.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <TextField
            label="Windows"
            type="number"
            value={nWindows}
            size="small"
            sx={{ width: 110 }}
            onChange={(e) => setNWindows(Math.max(2, Math.min(10, +e.target.value)))}
            inputProps={{ min: 2, max: 10 }}
          />
          <TextField
            label="Train ratio"
            type="number"
            value={trainRatio}
            size="small"
            sx={{ width: 120 }}
            onChange={(e) => setTrainRatio(Math.max(0.5, Math.min(0.9, +e.target.value)))}
            inputProps={{ step: 0.05, min: 0.5, max: 0.9 }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={running ? <CircularProgress size={14} color="inherit" /> : <RunIcon />}
            onClick={handleRun}
            disabled={running}
          >
            {running ? 'Running…' : 'Run WFO'}
          </Button>
          {running && (
            <Typography variant="caption" color="text.secondary">
              This may take a moment — runs {nWindows} windows in-process…
            </Typography>
          )}
        </Box>
        {err && <Alert severity="error" sx={{ mb: 1.5 }}>{err}</Alert>}

        {result && (
          <>
            {/* Summary row */}
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 2, p: 1.5, bgcolor: 'rgba(74,158,255,0.06)', borderRadius: 1 }}>
              {[
                { label: 'Avg OOS Sharpe', value: result.summary.avg_oos_sharpe.toFixed(3) },
                { label: 'Avg OOS Return', value: `${(result.summary.avg_oos_return * 100).toFixed(2)}%` },
                { label: 'Stability',      value: `${(result.summary.stability_score * 100).toFixed(0)}%` },
              ].map(({ label, value }) => (
                <Box key={label}>
                  <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                  <Typography variant="body1" fontFamily="IBM Plex Mono, monospace" fontWeight={700}>{value}</Typography>
                </Box>
              ))}
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">Recommended Params</Typography>
                <Typography variant="caption" fontFamily="IBM Plex Mono, monospace">
                  {JSON.stringify(result.summary.recommended_params)}
                </Typography>
              </Box>
            </Box>

            {/* Per-window table */}
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Window', 'Test Period', 'OOS Sharpe', 'OOS Return', 'OOS MaxDD', 'Best Params'].map((h) => (
                    <TableCell key={h} align="right" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {result.windows.map((w) => (
                  <TableRow key={w.window_idx}>
                    <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem' }}>#{w.window_idx + 1}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {w.test_start?.slice(0, 7)} → {w.test_end?.slice(0, 7)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', color: w.oos_sharpe >= 0 ? '#00C896' : '#FF6B6B' }}>
                      {w.oos_sharpe.toFixed(3)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', color: w.oos_return >= 0 ? '#00C896' : '#FF6B6B' }}>
                      {w.oos_return >= 0 ? '+' : ''}{(w.oos_return * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', color: '#FF6B6B' }}>
                      -{(Math.abs(w.oos_max_dd) * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.68rem', color: 'text.secondary' }}>
                      {JSON.stringify(w.best_params)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Paper>
    </Box>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OptimizePage() {
  // Config state
  const [strategy,   setStrategy]   = useState('mean_reversion')
  const [symbols,    setSymbols]    = useState('SPY')
  const [objective,  setObjective]  = useState('sharpe')
  const [gridJson,   setGridJson]   = useState('')
  const [gridError,  setGridError]  = useState<string | null>(null)

  // Run state
  const [submitting, setSubmitting] = useState(false)
  const [submitErr,  setSubmitErr]  = useState<string | null>(null)
  const [currentRun, setCurrentRun] = useState<OptimizationRunDetail | null>(null)
  const [recentRuns, setRecentRuns] = useState<OptimizationRunSummary[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load default param grids from backend on mount
  useEffect(() => {
    api.optimize.getDefaultParams().then((spaces) => {
      if (spaces[strategy]) {
        setGridJson(gridToJson(spaces[strategy]))
      }
    }).catch(() => {/* ignore, keep blank */})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When strategy changes, load its default grid
  useEffect(() => {
    setSymbols(DEFAULT_SYMBOLS[strategy] ?? 'SPY')
    api.optimize.getDefaultParams().then((spaces) => {
      if (spaces[strategy]) setGridJson(gridToJson(spaces[strategy]))
    }).catch(() => {})
  }, [strategy])

  // Load recent runs on mount
  useEffect(() => {
    api.optimize.list().then(setRecentRuns).catch(() => {})
  }, [])

  // Poll active run for progress
  const pollRun = useCallback((runId: number) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const detail = await api.optimize.get(runId)
        setCurrentRun(detail)
        if (detail.status === 'done' || detail.status === 'failed') {
          clearInterval(pollRef.current!)
          pollRef.current = null
          api.optimize.list().then(setRecentRuns).catch(() => {})
        }
      } catch { /* ignore network errors */ }
    }, POLL_INTERVAL_MS)
  }, [])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  function handleManualRefresh() {
    if (currentRun) api.optimize.get(currentRun.id).then(setCurrentRun).catch(() => {})
  }

  function parseGrid(): Record<string, unknown[]> | null {
    try {
      const parsed = JSON.parse(gridJson)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setGridError('Must be a JSON object: {"param": [v1, v2, ...]}')
        return null
      }
      for (const [k, v] of Object.entries(parsed)) {
        if (!Array.isArray(v)) {
          setGridError(`"${k}" must be an array of values`)
          return null
        }
      }
      setGridError(null)
      return parsed as Record<string, unknown[]>
    } catch (e) {
      setGridError(`Invalid JSON: ${(e as Error).message}`)
      return null
    }
  }

  async function handleRun() {
    const paramGrid = parseGrid()
    if (!paramGrid) return

    const symList = symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    if (!symList.length) {
      setSubmitErr('Enter at least one symbol')
      return
    }

    setSubmitting(true)
    setSubmitErr(null)
    setCurrentRun(null)

    try {
      const res = await api.optimize.start({
        strategy,
        symbols:    symList,
        param_grid: paramGrid,
        objective:  objective as 'sharpe' | 'total_return' | 'calmar' | 'sortino',
      })
      // Fetch initial state then start polling
      const detail = await api.optimize.get(res.opt_id)
      setCurrentRun(detail)
      if (detail.status !== 'done' && detail.status !== 'failed') {
        pollRun(res.opt_id)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? 'Failed to start optimization'
      setSubmitErr(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <TuneIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        <Box>
          <Typography variant="h5" fontWeight={700} lineHeight={1.2}>
            Strategy Optimization
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Grid-search hyperparameters · ranked by objective metric
          </Typography>
        </Box>
      </Box>

      {/* ── Config panel ───────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>
          Configuration
        </Typography>
        <Grid container spacing={2}>
          {/* Strategy */}
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Strategy</InputLabel>
              <Select
                label="Strategy"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
              >
                {STRATEGY_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Objective */}
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Objective</InputLabel>
              <Select
                label="Objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
              >
                {OBJECTIVE_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Symbols */}
          <Grid item xs={12} sm={4}>
            <TextField
              label="Symbols (comma-separated)"
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              size="small"
              fullWidth
              placeholder="SPY,QQQ"
            />
          </Grid>

          {/* Param grid JSON editor */}
          <Grid item xs={12}>
            <TextField
              label='Param grid (JSON) — e.g. {"window": [10, 20, 30]}'
              value={gridJson}
              onChange={(e) => setGridJson(e.target.value)}
              multiline
              minRows={4}
              maxRows={10}
              fullWidth
              size="small"
              error={!!gridError}
              helperText={gridError ?? 'Each key maps to an array of values to try. Max 50 combinations.'}
              inputProps={{ style: { fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' } }}
            />
          </Grid>

          {/* Run button */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Button
                variant="contained"
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <RunIcon />}
                onClick={handleRun}
                disabled={submitting}
                sx={{ fontWeight: 700 }}
              >
                {submitting ? 'Launching…' : 'Run Optimization'}
              </Button>
              <Typography variant="caption" color="text.disabled">
                Trials run in-memory · results appear live as they complete
              </Typography>
            </Box>
            {submitErr && (
              <Alert severity="error" sx={{ mt: 1.5, py: 0.5 }}>{submitErr}</Alert>
            )}
          </Grid>
        </Grid>
      </Paper>

      {/* ── Active run progress ─────────────────────────────────────────── */}
      {currentRun && (
        <>
          <ProgressPanel run={currentRun} onRefresh={handleManualRefresh} />
          {currentRun.status === 'running' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 1.5 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">Polling every 2s…</Typography>
            </Box>
          )}
        </>
      )}

      {/* ── Charts + results ────────────────────────────────────────────── */}
      {currentRun?.results?.length ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2.5 }}>
          <ScatterPlot results={currentRun.results} />
          <ResultsTable results={currentRun.results} objective={objective} />
        </Box>
      ) : null}

      {/* ── Walk-Forward Optimization — Phase 28 ───────────────────────── */}
      <WFOPanel strategy={strategy} symbols={symbols} gridJson={gridJson} objective={objective} />

      {/* ── Recent runs history ─────────────────────────────────────────── */}
      {recentRuns.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Divider sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.disabled">Recent Runs</Typography>
          </Divider>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {recentRuns.slice(0, 8).map((r) => (
              <Paper
                key={r.id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  cursor: 'pointer',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(74,158,255,0.04)' },
                }}
                onClick={async () => {
                  const detail = await api.optimize.get(r.id)
                  setCurrentRun(detail)
                }}
              >
                <Tooltip title={r.status}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor:
                        r.status === 'done'    ? 'success.main' :
                        r.status === 'failed'  ? 'error.main'   :
                        r.status === 'running' ? 'warning.main' :
                        'text.disabled',
                      flexShrink: 0,
                    }}
                  />
                </Tooltip>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="caption" fontWeight={600} noWrap>
                    #{r.id} — {r.strategy} ({r.symbols.join(', ')})
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" noWrap>
                    {r.completed_trials}/{r.total_trials} trials · obj: {r.objective}
                    {r.best_sharpe !== null ? ` · Sharpe ${r.best_sharpe.toFixed(2)}` : ''}
                    {r.best_return !== null ? ` · Return ${pct(r.best_return)}` : ''}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                  {new Date(r.created_at).toLocaleString()}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}
