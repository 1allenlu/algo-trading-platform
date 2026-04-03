/**
 * Compare page — Strategy Comparison (Phase 43).
 *
 * Lets users configure up to 4 backtest "slots", run them all in parallel,
 * then visualise the results side-by-side:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  Slot cards  (strategy dropdown · symbols input · remove btn)   │
 *   │  + "Add Strategy" button · "Run All" button                     │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │  Overlaid equity-curve LineChart (% return, 0 % normalised)     │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │  Metrics comparison table (best value highlighted per row)      │
 *   └─────────────────────────────────────────────────────────────────┘
 */

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
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
  Add as AddIcon,
  Close as CloseIcon,
  CompareArrows as CompareIcon,
  PlayArrow as RunIcon,
} from '@mui/icons-material'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useRef, useState } from 'react'
import { api } from '@/services/api'
import type { BacktestRunResponse } from '@/services/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const SLOT_COLORS = ['#4A9EFF', '#00C896', '#F59E0B', '#EC4899'] as const

const STRATEGIES = [
  { value: 'pairs_trading',   label: 'Pairs Trading' },
  { value: 'momentum',        label: 'Momentum' },
  { value: 'mean_reversion',  label: 'Mean Reversion' },
] as const

const POLL_INTERVAL_MS = 2_000
const MAX_POLL_ATTEMPTS = 90   // 3 minutes max

// ── Types ─────────────────────────────────────────────────────────────────────

interface Slot {
  id:       string   // stable key for React lists
  strategy: string
  symbols:  string   // comma-separated raw input
}

type SlotStatus = 'idle' | 'running' | 'done' | 'failed'

interface SlotResult {
  id:     string
  status: SlotStatus
  run:    BacktestRunResponse | null
  error:  string | null
}

// Normalised equity-curve row merged from all slots so Recharts can render them
interface ChartPoint {
  date:                  string
  [slotKey: string]: number | string   // e.g. slot_abc: 4.2  (% return)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a short random id for slot keys */
function uid(): string {
  return Math.random().toString(36).slice(2, 8)
}

/** Parse a raw symbols string → trimmed array, deduped */
function parseSymbols(raw: string): string[] {
  return [...new Set(
    raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
  )]
}

/**
 * Normalise all equity curves to % return so they share the same Y-axis.
 * Missing dates for a given slot are left undefined (Recharts skips them).
 */
function buildChartData(
  results: SlotResult[],
  slots: Slot[],
): ChartPoint[] {
  // Collect all dates in ascending order across all curves
  const dateSet = new Set<string>()
  for (const r of results) {
    if (r.status !== 'done' || !r.run?.equity_curve) continue
    for (const pt of r.run.equity_curve) dateSet.add(pt.date)
  }
  const dates = [...dateSet].sort()
  if (dates.length === 0) return []

  // Pre-compute starting value for each slot (first equity_curve entry)
  const startBySlot: Record<string, number> = {}
  for (const r of results) {
    if (r.status !== 'done' || !r.run?.equity_curve?.length) continue
    startBySlot[r.id] = r.run.equity_curve[0].value
  }

  // Build indexed lookup date → equity value per slot
  const valueBySlotDate: Record<string, Record<string, number>> = {}
  for (const r of results) {
    if (r.status !== 'done' || !r.run?.equity_curve) continue
    valueBySlotDate[r.id] = {}
    for (const pt of r.run.equity_curve) {
      valueBySlotDate[r.id][pt.date] = pt.value
    }
  }

  return dates.map((date) => {
    const point: ChartPoint = { date }
    for (const slot of slots) {
      const result = results.find((r) => r.id === slot.id)
      if (!result || result.status !== 'done') continue
      const raw   = valueBySlotDate[slot.id]?.[date]
      const start = startBySlot[slot.id]
      if (raw !== undefined && start && start !== 0) {
        // Store as percentage return (2 decimal places)
        point[`slot_${slot.id}`] = parseFloat(((raw / start - 1) * 100).toFixed(2))
      }
    }
    return point
  })
}

/** Format a decimal (e.g. 0.234) as "23.4 %" */
function pct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(decimals)} %`
}

/** Format a plain number */
function num(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return v.toFixed(decimals)
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SlotCardProps {
  slot:       Slot
  index:      number
  result:     SlotResult | null
  onChange:   (updated: Slot) => void
  onRemove:   () => void
  removable:  boolean
}

function SlotCard({ slot, index, result, onChange, onRemove, removable }: SlotCardProps) {
  const color   = SLOT_COLORS[index % SLOT_COLORS.length]
  const status  = result?.status ?? 'idle'

  return (
    <Card
      sx={{
        border: `1px solid`,
        borderColor: status === 'done'
          ? `${color}44`
          : status === 'failed'
            ? '#FF6B6B44'
            : '#1E2330',
        bgcolor: '#12161F',
        borderRadius: 2,
        position: 'relative',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Colour accent strip on left edge */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: color,
          borderRadius: '2px 0 0 2px',
        }}
      />

      <CardContent sx={{ pl: 2.5 }}>
        {/* Header row: slot number + status chip + remove */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
          <Typography
            sx={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.7rem',
              fontWeight: 600,
              color,
              letterSpacing: '0.06em',
              flexGrow: 1,
            }}
          >
            SLOT {index + 1}
          </Typography>

          {status === 'running' && (
            <CircularProgress size={14} sx={{ color }} />
          )}
          {status === 'done' && (
            <Chip label="Done" size="small" sx={{ bgcolor: '#00C89622', color: '#00C896', height: 18, fontSize: '0.65rem' }} />
          )}
          {status === 'failed' && (
            <Chip label="Failed" size="small" sx={{ bgcolor: '#FF6B6B22', color: '#FF6B6B', height: 18, fontSize: '0.65rem' }} />
          )}

          {removable && (
            <Tooltip title="Remove slot">
              <IconButton size="small" onClick={onRemove} sx={{ color: 'text.disabled', '&:hover': { color: '#FF6B6B' } }}>
                <CloseIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Strategy select */}
        <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
          <InputLabel sx={{ fontSize: '0.8rem' }}>Strategy</InputLabel>
          <Select
            label="Strategy"
            value={slot.strategy}
            onChange={(e) => onChange({ ...slot, strategy: e.target.value })}
            sx={{ fontSize: '0.85rem' }}
          >
            {STRATEGIES.map((s) => (
              <MenuItem key={s.value} value={s.value} sx={{ fontSize: '0.85rem' }}>
                {s.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Symbols input */}
        <TextField
          fullWidth
          size="small"
          label="Symbols (comma-separated)"
          placeholder="SPY,QQQ"
          value={slot.symbols}
          onChange={(e) => onChange({ ...slot, symbols: e.target.value })}
          inputProps={{ style: { fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.82rem' } }}
        />

        {/* Quick error preview */}
        {status === 'failed' && result?.error && (
          <Typography sx={{ mt: 1, fontSize: '0.72rem', color: '#FF6B6B' }}>
            {result.error}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

// ── Metrics table ─────────────────────────────────────────────────────────────

interface MetricRow {
  label:       string
  key:         keyof BacktestRunResponse
  format:      (v: number | null | undefined) => string
  /** true = higher is better; false = lower is better */
  higherBetter: boolean
}

const METRIC_ROWS: MetricRow[] = [
  { label: 'Total Return',     key: 'total_return', format: pct,              higherBetter: true  },
  { label: 'CAGR',             key: 'cagr',         format: pct,              higherBetter: true  },
  { label: 'Sharpe Ratio',     key: 'sharpe_ratio', format: (v) => num(v, 2), higherBetter: true  },
  { label: 'Max Drawdown',     key: 'max_drawdown', format: pct,              higherBetter: false },
  { label: 'Win Rate',         key: 'win_rate',     format: pct,              higherBetter: true  },
  { label: '# Trades',         key: 'num_trades',   format: (v) => num(v, 0), higherBetter: true  },
]

interface MetricsTableProps {
  slots:   Slot[]
  results: SlotResult[]
}

function MetricsTable({ slots, results }: MetricsTableProps) {
  const doneSlots = slots.filter((s) => {
    const r = results.find((r) => r.id === s.id)
    return r?.status === 'done' && r.run != null
  })

  if (doneSlots.length === 0) return null

  return (
    <Card sx={{ border: '1px solid #1E2330', bgcolor: '#12161F', borderRadius: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'text.primary' }}>
          Metrics Comparison
        </Typography>

        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '0.7rem',
                    color: 'text.disabled',
                    letterSpacing: '0.08em',
                    borderColor: '#1E2330',
                    whiteSpace: 'nowrap',
                  }}
                >
                  METRIC
                </TableCell>
                {doneSlots.map((slot, i) => {
                  const color = SLOT_COLORS[slots.indexOf(slot) % SLOT_COLORS.length]
                  const strategyLabel = STRATEGIES.find((s) => s.value === slot.strategy)?.label ?? slot.strategy
                  return (
                    <TableCell
                      key={slot.id}
                      align="right"
                      sx={{ borderColor: '#1E2330', whiteSpace: 'nowrap' }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.primary' }}>
                            {strategyLabel}
                          </Typography>
                        </Box>
                        <Typography
                          sx={{
                            fontFamily: '"IBM Plex Mono", monospace',
                            fontSize: '0.65rem',
                            color: 'text.disabled',
                          }}
                        >
                          {parseSymbols(slot.symbols).join(', ')}
                        </Typography>
                      </Box>
                    </TableCell>
                  )
                })}
              </TableRow>
            </TableHead>

            <TableBody>
              {METRIC_ROWS.map((row) => {
                // Find best value index among done slots
                const rawValues = doneSlots.map((slot) => {
                  const run = results.find((r) => r.id === slot.id)?.run
                  return run ? (run[row.key] as number | null) : null
                })

                const numericValues = rawValues.filter((v): v is number => v != null)
                const bestValue = numericValues.length > 0
                  ? (row.higherBetter ? Math.max(...numericValues) : Math.min(...numericValues))
                  : null

                return (
                  <TableRow key={row.key}>
                    <TableCell
                      sx={{
                        fontSize: '0.8rem',
                        color: 'text.secondary',
                        borderColor: '#1E2330',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.label}
                    </TableCell>

                    {doneSlots.map((slot) => {
                      const run   = results.find((r) => r.id === slot.id)?.run
                      const raw   = run ? (run[row.key] as number | null) : null
                      const isBest = raw != null && raw === bestValue && numericValues.length > 1

                      return (
                        <TableCell
                          key={slot.id}
                          align="right"
                          sx={{
                            fontFamily: '"IBM Plex Mono", monospace',
                            fontSize: '0.82rem',
                            borderColor: '#1E2330',
                            color: isBest ? '#00C896' : 'text.primary',
                            fontWeight: isBest ? 600 : 400,
                            bgcolor: isBest ? 'rgba(0,200,150,0.06)' : 'transparent',
                          }}
                        >
                          {row.format(raw)}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Custom Recharts tooltip ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?:  boolean
  payload?: { name: string; value: number; color: string }[]
  label?:   string
}) {
  if (!active || !payload?.length) return null
  return (
    <Box
      sx={{
        bgcolor: '#1A1F2E',
        border: '1px solid #1E2330',
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        minWidth: 160,
      }}
    >
      <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.68rem', color: 'text.disabled', mb: 0.5 }}>
        {label}
      </Typography>
      {payload.map((entry) => (
        <Box key={entry.name} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: '2px' }}>
          <Typography sx={{ fontSize: '0.75rem', color: entry.color }}>{entry.name}</Typography>
          <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'text.primary' }}>
            {entry.value != null ? `${entry.value >= 0 ? '+' : ''}${entry.value.toFixed(2)} %` : '—'}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

// ── Main page component ───────────────────────────────────────────────────────

export default function ComparePage() {
  // Slot configuration state
  const [slots, setSlots] = useState<Slot[]>([
    { id: uid(), strategy: 'momentum',       symbols: 'SPY,QQQ' },
    { id: uid(), strategy: 'mean_reversion', symbols: 'SPY,QQQ' },
  ])

  // Per-slot result state
  const [results, setResults] = useState<SlotResult[]>([])

  // Global running/error state
  const [isRunning, setIsRunning] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Ref to cancel polling loops if unmounted
  const abortRef = useRef(false)

  // ── Slot management ─────────────────────────────────────────────────────────

  function addSlot() {
    if (slots.length >= 4) return
    setSlots((prev) => [...prev, { id: uid(), strategy: 'momentum', symbols: 'SPY,QQQ' }])
  }

  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id))
    setResults((prev) => prev.filter((r) => r.id !== id))
  }

  function updateSlot(updated: Slot) {
    setSlots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  // ── Polling helper ──────────────────────────────────────────────────────────

  async function pollUntilDone(runId: number, slotId: string): Promise<BacktestRunResponse> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (abortRef.current) throw new Error('Aborted')
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      const run = await api.backtest.get(runId)
      if (run.status === 'done') return run
      if (run.status === 'failed') throw new Error(run.error ?? 'Backtest failed')
    }
    throw new Error('Timed out waiting for backtest result')
  }

  // ── Run all ─────────────────────────────────────────────────────────────────

  async function handleRunAll() {
    setGlobalError(null)
    abortRef.current = false
    setIsRunning(true)

    // Mark all slots as running
    setResults(slots.map((s) => ({ id: s.id, status: 'running', run: null, error: null })))

    // Fire all backtests in parallel and poll each independently
    const tasks = slots.map(async (slot): Promise<SlotResult> => {
      const symbols = parseSymbols(slot.symbols)
      if (symbols.length === 0) {
        return { id: slot.id, status: 'failed', run: null, error: 'No valid symbols entered.' }
      }
      try {
        const initial = await api.backtest.run(slot.strategy, symbols, {}, 0.001, 0.0005)
        const final   = await pollUntilDone(initial.id, slot.id)
        return { id: slot.id, status: 'done', run: final, error: null }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return { id: slot.id, status: 'failed', run: null, error: msg }
      }
    })

    // Update results as each task settles — using Promise.allSettled so one
    // failure doesn't cancel the others.
    const settled = await Promise.allSettled(tasks)
    const finalResults: SlotResult[] = settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : { id: slots[i].id, status: 'failed' as SlotStatus, run: null, error: 'Unexpected error' },
    )

    setResults(finalResults)
    setIsRunning(false)

    if (finalResults.every((r) => r.status === 'failed')) {
      setGlobalError('All backtests failed. Check your inputs and try again.')
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const chartData = buildChartData(results, slots)
  const anyDone   = results.some((r) => r.status === 'done')

  // Build line series config: one entry per done slot
  const lineSeries = slots
    .map((slot, i) => {
      const result = results.find((r) => r.id === slot.id)
      if (result?.status !== 'done') return null
      const strategyLabel = STRATEGIES.find((s) => s.value === slot.strategy)?.label ?? slot.strategy
      const syms = parseSymbols(slot.symbols).join(', ')
      return {
        dataKey: `slot_${slot.id}`,
        color:   SLOT_COLORS[i % SLOT_COLORS.length],
        name:    `${strategyLabel} (${syms})`,
      }
    })
    .filter(Boolean) as { dataKey: string; color: string; name: string }[]

  // Tick formatter: show every ~10th date label to avoid crowding
  function formatXTick(date: string): string {
    // Show as MMM 'YY, e.g. "Jan '24"
    try {
      const d = new Date(date)
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    } catch {
      return date
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>

      {/* ── Page header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '8px',
            bgcolor: 'rgba(74,158,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <CompareIcon sx={{ fontSize: 20, color: '#4A9EFF' }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            Strategy Comparison
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Run up to 4 backtests side-by-side and compare their equity curves
          </Typography>
        </Box>
      </Box>

      {/* ── Global error ── */}
      {globalError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setGlobalError(null)}>
          {globalError}
        </Alert>
      )}

      {/* ── Slot configuration cards ── */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {slots.map((slot, i) => (
          <Grid item xs={12} sm={6} md={3} key={slot.id}>
            <SlotCard
              slot={slot}
              index={i}
              result={results.find((r) => r.id === slot.id) ?? null}
              onChange={updateSlot}
              onRemove={() => removeSlot(slot.id)}
              removable={slots.length > 1}
            />
          </Grid>
        ))}
      </Grid>

      {/* ── Action buttons ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={addSlot}
          disabled={slots.length >= 4 || isRunning}
          sx={{
            borderColor: '#1E2330',
            color: 'text.secondary',
            '&:hover': { borderColor: '#4A9EFF', color: '#4A9EFF' },
          }}
        >
          Add Strategy
        </Button>

        <Button
          variant="contained"
          size="small"
          startIcon={isRunning ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <RunIcon />}
          onClick={handleRunAll}
          disabled={isRunning || slots.length === 0}
          sx={{ bgcolor: '#4A9EFF', '&:hover': { bgcolor: '#3a8eef' }, ml: 'auto' }}
        >
          {isRunning ? 'Running…' : 'Run All'}
        </Button>
      </Box>

      <Divider sx={{ borderColor: '#1E2330', mb: 3 }} />

      {/* ── Equity curve chart ── */}
      {anyDone && chartData.length > 0 && (
        <Card sx={{ border: '1px solid #1E2330', bgcolor: '#12161F', borderRadius: 2, mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'text.primary' }}>
              Equity Curves — % Return (normalised to 0 %)
            </Typography>

            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2330" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXTick}
                  tick={{ fill: '#6B7280', fontSize: 11, fontFamily: '"IBM Plex Mono", monospace' }}
                  axisLine={{ stroke: '#1E2330' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={60}
                />
                <YAxis
                  tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} %`}
                  tick={{ fill: '#6B7280', fontSize: 11, fontFamily: '"IBM Plex Mono", monospace' }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <RTooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{
                    fontSize: '0.75rem',
                    paddingTop: 12,
                    fontFamily: '"IBM Plex Mono", monospace',
                  }}
                />
                {lineSeries.map((series) => (
                  <Line
                    key={series.dataKey}
                    type="monotone"
                    dataKey={series.dataKey}
                    name={series.name}
                    stroke={series.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Empty state while nothing is done yet */}
      {!anyDone && !isRunning && (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            color: 'text.disabled',
          }}
        >
          <CompareIcon sx={{ fontSize: 48, opacity: 0.25, mb: 1.5 }} />
          <Typography variant="body2">
            Configure your strategies above and click <strong>Run All</strong> to compare their equity curves.
          </Typography>
        </Box>
      )}

      {/* Loading skeleton while running */}
      {isRunning && !anyDone && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={36} sx={{ color: '#4A9EFF' }} />
        </Box>
      )}

      {/* ── Metrics table ── */}
      <MetricsTable slots={slots} results={results} />
    </Box>
  )
}
