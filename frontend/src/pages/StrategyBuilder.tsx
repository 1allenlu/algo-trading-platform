/**
 * Custom Strategy Builder — Phase 48.
 *
 * No-code UI for composing indicator-based buy/sell rules.
 * Rules are saved to the backend and can be evaluated against any symbol.
 *
 * Layout:
 *   Rule builder (add buy/sell conditions, set logic AND/OR)
 *   Saved strategies list
 *   Signal output panel (date, signal, close)
 */

import { useState } from 'react'
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
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  PlayArrow as RunIcon,
  Save as SaveIcon,
  TrendingDown,
  TrendingUp,
} from '@mui/icons-material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type CustomStrategy, type StrategyRule } from '@/services/api'

// ── Constants ──────────────────────────────────────────────────────────────────

const INDICATORS = [
  { value: 'rsi',          label: 'RSI',          hasValue: true,  hasPeriod: true,  hasFastSlow: false },
  { value: 'sma',          label: 'SMA (price vs)', hasValue: false, hasPeriod: true,  hasFastSlow: false },
  { value: 'ema',          label: 'EMA (price vs)', hasValue: false, hasPeriod: true,  hasFastSlow: false },
  { value: 'sma_cross',    label: 'SMA Cross',    hasValue: false, hasPeriod: false, hasFastSlow: true  },
  { value: 'volume_ratio', label: 'Volume Ratio', hasValue: true,  hasPeriod: true,  hasFastSlow: false },
  { value: 'change_pct',   label: 'Daily % Change', hasValue: true, hasPeriod: false, hasFastSlow: false },
]

const OPS_BASIC  = [{ value: 'gt', label: '>' }, { value: 'lt', label: '<' }, { value: 'gte', label: '≥' }, { value: 'lte', label: '≤' }]
const OPS_CROSS  = [{ value: 'cross_above', label: 'Crosses Above' }, { value: 'cross_below', label: 'Crosses Below' }]
const QUICK_SYMS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA']

// ── Rule row editor ────────────────────────────────────────────────────────────

function RuleRow({
  rule, onChange, onDelete,
}: {
  rule: StrategyRule
  onChange: (r: StrategyRule) => void
  onDelete: () => void
}) {
  const meta = INDICATORS.find((i) => i.value === rule.indicator) ?? INDICATORS[0]

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
      {/* Indicator */}
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>Indicator</InputLabel>
        <Select
          value={rule.indicator}
          label="Indicator"
          onChange={(e) => onChange({ ...rule, indicator: e.target.value as StrategyRule['indicator'] })}
        >
          {INDICATORS.map((i) => <MenuItem key={i.value} value={i.value}>{i.label}</MenuItem>)}
        </Select>
      </FormControl>

      {/* Period */}
      {meta.hasPeriod && (
        <TextField
          size="small" type="number" label="Period"
          value={rule.period ?? 14}
          onChange={(e) => onChange({ ...rule, period: parseInt(e.target.value) || 14 })}
          sx={{ width: 80 }}
          inputProps={{ min: 2, max: 200 }}
        />
      )}

      {/* Fast / Slow for SMA cross */}
      {meta.hasFastSlow && (
        <>
          <TextField
            size="small" type="number" label="Fast"
            value={rule.fast ?? 10}
            onChange={(e) => onChange({ ...rule, fast: parseInt(e.target.value) || 10 })}
            sx={{ width: 75 }}
          />
          <TextField
            size="small" type="number" label="Slow"
            value={rule.slow ?? 50}
            onChange={(e) => onChange({ ...rule, slow: parseInt(e.target.value) || 50 })}
            sx={{ width: 75 }}
          />
        </>
      )}

      {/* Operator */}
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>Operator</InputLabel>
        <Select
          value={rule.op}
          label="Operator"
          onChange={(e) => onChange({ ...rule, op: e.target.value as StrategyRule['op'] })}
        >
          {(meta.hasFastSlow ? OPS_CROSS : OPS_BASIC).map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Value */}
      {meta.hasValue && (
        <TextField
          size="small" type="number" label="Value"
          value={rule.value ?? 0}
          onChange={(e) => onChange({ ...rule, value: parseFloat(e.target.value) })}
          sx={{ width: 90 }}
        />
      )}

      <IconButton size="small" onClick={onDelete} sx={{ color: '#FF6B6B' }}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}

// ── Builder panel ──────────────────────────────────────────────────────────────

const DEFAULT_RULE = (): StrategyRule => ({ indicator: 'rsi', op: 'lt', value: 30, period: 14 })

function BuilderPanel({ onSaved }: { onSaved: () => void }) {
  const [name,       setName]       = useState('')
  const [desc,       setDesc]       = useState('')
  const [logic,      setLogic]      = useState<'AND' | 'OR'>('OR')
  const [buyRules,   setBuyRules]   = useState<StrategyRule[]>([DEFAULT_RULE()])
  const [sellRules,  setSellRules]  = useState<StrategyRule[]>([{ indicator: 'rsi', op: 'gt', value: 70, period: 14 }])
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) { setError('Strategy name is required'); return }
    setSaving(true); setError(null)
    try {
      await api.strategyBuilder.create(name, desc || null, { buy_rules: buyRules, sell_rules: sellRules, logic })
      setName(''); setDesc('')
      onSaved()
    } catch { setError('Failed to save strategy') }
    finally { setSaving(false) }
  }

  const updateBuy  = (i: number, r: StrategyRule) => setBuyRules((prev) => prev.map((x, j) => j === i ? r : x))
  const updateSell = (i: number, r: StrategyRule) => setSellRules((prev) => prev.map((x, j) => j === i ? r : x))

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>Build Strategy</Typography>

        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField size="small" label="Strategy Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ flex: 1 }} />
            <TextField size="small" label="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} sx={{ flex: 2 }} />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="caption" color="text.secondary">Logic:</Typography>
            <ToggleButtonGroup value={logic} exclusive onChange={(_, v) => v && setLogic(v)} size="small"
              sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1.5, textTransform: 'none', fontSize: '0.75rem' } }}>
              <ToggleButton value="OR">ANY rule (OR)</ToggleButton>
              <ToggleButton value="AND">ALL rules (AND)</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider />

          {/* Buy rules */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TrendingUp sx={{ fontSize: 16, color: '#00C896' }} />
              <Typography variant="caption" fontWeight={700} color="#00C896">BUY CONDITIONS</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setBuyRules((p) => [...p, DEFAULT_RULE()])} sx={{ ml: 'auto', fontSize: '0.7rem' }}>
                Add rule
              </Button>
            </Box>
            {buyRules.map((r, i) => (
              <RuleRow key={i} rule={r} onChange={(nr) => updateBuy(i, nr)} onDelete={() => setBuyRules((p) => p.filter((_, j) => j !== i))} />
            ))}
          </Box>

          <Divider />

          {/* Sell rules */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TrendingDown sx={{ fontSize: 16, color: '#FF6B6B' }} />
              <Typography variant="caption" fontWeight={700} color="#FF6B6B">SELL CONDITIONS</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setSellRules((p) => [...p, DEFAULT_RULE()])} sx={{ ml: 'auto', fontSize: '0.7rem' }}>
                Add rule
              </Button>
            </Box>
            {sellRules.map((r, i) => (
              <RuleRow key={i} rule={r} onChange={(nr) => updateSell(i, nr)} onDelete={() => setSellRules((p) => p.filter((_, j) => j !== i))} />
            ))}
          </Box>

          {error && <Alert severity="error" onClose={() => setError(null)} sx={{ fontSize: '0.78rem' }}>{error}</Alert>}

          <Button variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
            onClick={handleSave} disabled={saving || !name.trim()} sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
            Save Strategy
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ── Saved strategies + evaluate panel ─────────────────────────────────────────

function SavedStrategies() {
  const qc = useQueryClient()
  const [evalSymbol,   setEvalSymbol]   = useState('SPY')
  const [evalId,       setEvalId]       = useState<number | null>(null)
  const [evalResult,   setEvalResult]   = useState<Awaited<ReturnType<typeof api.strategyBuilder.evaluate>> | null>(null)
  const [evaluating,   setEvaluating]   = useState(false)
  const [deleting,     setDeleting]     = useState<number | null>(null)

  const { data: strategies = [], isLoading } = useQuery({
    queryKey: ['custom-strategies'],
    queryFn:  api.strategyBuilder.list,
  })

  const handleEval = async (id: number) => {
    setEvalId(id); setEvaluating(true); setEvalResult(null)
    try {
      const r = await api.strategyBuilder.evaluate(id, evalSymbol)
      setEvalResult(r)
    } finally { setEvaluating(false) }
  }

  const handleDelete = async (id: number) => {
    setDeleting(id)
    await api.strategyBuilder.delete(id)
    qc.invalidateQueries({ queryKey: ['custom-strategies'] })
    setDeleting(null)
  }

  if (isLoading) return <CircularProgress size={24} />

  if (!strategies.length) return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
          No saved strategies. Build one above and click Save.
        </Typography>
      </CardContent>
    </Card>
  )

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>Saved Strategies ({strategies.length})</Typography>

        {/* Symbol picker for evaluation */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small" label="Symbol to evaluate" value={evalSymbol}
            onChange={(e) => setEvalSymbol(e.target.value.toUpperCase())}
            sx={{ width: 160 }}
            inputProps={{ style: { fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 } }}
          />
          {QUICK_SYMS.map((s) => (
            <Chip key={s} label={s} size="small" clickable onClick={() => setEvalSymbol(s)}
              sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.65rem',
                bgcolor: evalSymbol === s ? 'rgba(74,158,255,0.15)' : 'transparent',
                color:   evalSymbol === s ? 'primary.main' : 'text.secondary',
                border: '1px solid', borderColor: evalSymbol === s ? 'primary.main' : 'divider' }} />
          ))}
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Name', 'Description', 'Buy Rules', 'Sell Rules', 'Logic', 'Saved', ''].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {strategies.map((s: CustomStrategy) => (
                <TableRow key={s.id} hover selected={evalId === s.id}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.82rem' }}>{s.name}</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', maxWidth: 200 }}>{s.description ?? '—'}</TableCell>
                  <TableCell><Chip label={s.conditions.buy_rules.length} size="small" color="success" sx={{ fontSize: '0.65rem', height: 18 }} /></TableCell>
                  <TableCell><Chip label={s.conditions.sell_rules.length} size="small" color="error"   sx={{ fontSize: '0.65rem', height: 18 }} /></TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{s.conditions.logic}</TableCell>
                  <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                    {new Date(s.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title={`Run on ${evalSymbol}`}>
                        <IconButton size="small" onClick={() => handleEval(s.id)}
                          disabled={evaluating && evalId === s.id} color="primary">
                          {evaluating && evalId === s.id ? <CircularProgress size={14} /> : <RunIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete strategy">
                        <IconButton size="small" onClick={() => handleDelete(s.id)}
                          disabled={deleting === s.id} color="error">
                          {deleting === s.id ? <CircularProgress size={14} /> : <DeleteIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Eval results */}
        {evalResult && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              Signals: {evalResult.strategy_name} on {evalResult.symbol}
              <Chip label={`${evalResult.n_signals} signals / ${evalResult.n_bars} bars`}
                size="small" sx={{ ml: 1, fontSize: '0.65rem' }} />
            </Typography>
            {evalResult.signals.length === 0 ? (
              <Alert severity="info" sx={{ fontSize: '0.78rem' }}>No signals fired on this symbol with these conditions.</Alert>
            ) : (
              <TableContainer sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Date', 'Signal', 'Close Price'].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {evalResult.signals.slice(-50).map((sig, i) => (
                      <TableRow key={i} hover>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>{sig.date}</TableCell>
                        <TableCell>
                          <Chip
                            label={sig.signal.toUpperCase()}
                            size="small"
                            color={sig.signal === 'buy' ? 'success' : 'error'}
                            sx={{ fontSize: '0.65rem', height: 18 }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                          ${sig.close.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StrategyBuilderPage() {
  const qc = useQueryClient()

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Strategy Builder</Typography>
        <Typography variant="body2" color="text.secondary">
          Compose indicator-based buy/sell rules without writing code.
          Evaluate against any symbol's historical data to see when signals would have fired.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <BuilderPanel onSaved={() => qc.invalidateQueries({ queryKey: ['custom-strategies'] })} />
        </Grid>
        <Grid item xs={12}>
          <SavedStrategies />
        </Grid>
      </Grid>
    </Box>
  )
}
