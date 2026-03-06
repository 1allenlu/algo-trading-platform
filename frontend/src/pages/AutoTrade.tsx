/**
 * Auto Paper Trading — Phase 12.
 *
 * Signal-based automated paper order placement.
 * The backend evaluates composite BUY/HOLD/SELL signals on a configurable
 * interval and places market orders when confidence >= threshold.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Status card — enabled/disabled toggle + last-check info  │
 *   ├─────────────────────────┬────────────────────────────────┤
 *   │ Config panel            │ How it works info card         │
 *   │  • Symbols to monitor   │                                │
 *   │  • Confidence threshold │                                │
 *   │  • Position size %      │                                │
 *   │  • Check interval (s)   │                                │
 *   ├─────────────────────────┴────────────────────────────────┤
 *   │ Auto-trade log table (newest first, limit 100)           │
 *   └──────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Slider,
  Switch,
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
  AutoMode as AutoIcon,
  CheckCircleOutline as BoughtIcon,
  InfoOutlined as InfoIcon,
  RemoveCircleOutline as SoldIcon,
  PauseCircleOutline as SkipIcon,
  Warning as WarnIcon,
} from '@mui/icons-material'

import { api, AutoTradeConfig, AutoTradeLogEntry } from '@/services/api'

// ── Action chip ───────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { color: string; label: string; Icon: typeof BoughtIcon }> = {
  bought:               { color: '#10B981', label: 'Bought',         Icon: BoughtIcon },
  sold:                 { color: '#EF4444', label: 'Sold',           Icon: SoldIcon   },
  hold_signal:          { color: '#888',    label: 'Hold',           Icon: SkipIcon   },
  already_positioned:   { color: '#F59E0B', label: 'Already in',     Icon: SkipIcon   },
  no_position_to_sell:  { color: '#F59E0B', label: 'No position',    Icon: SkipIcon   },
  low_confidence:       { color: '#888',    label: 'Low conf.',      Icon: SkipIcon   },
  insufficient_data:    { color: '#888',    label: 'No data',        Icon: WarnIcon   },
  error:                { color: '#EF4444', label: 'Error',          Icon: WarnIcon   },
}

function ActionChip({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { color: '#888', label: action, Icon: SkipIcon }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
      <meta.Icon sx={{ fontSize: 13, color: meta.color }} />
      <Typography variant="caption" sx={{ color: meta.color, fontWeight: 600 }}>
        {meta.label}
      </Typography>
    </Box>
  )
}

function SignalChip({ signal }: { signal: string }) {
  const color =
    signal === 'buy'  ? '#10B981' :
    signal === 'sell' ? '#EF4444' :
    '#888'
  return (
    <Chip
      label={signal.toUpperCase()}
      size="small"
      sx={{
        height: 18,
        fontSize: '0.6rem',
        fontWeight: 700,
        bgcolor: `${color}22`,
        color,
        border: `1px solid ${color}55`,
      }}
    />
  )
}

// ── Status card ───────────────────────────────────────────────────────────────

function StatusCard({
  config,
  onToggle,
  toggling,
}: {
  config: AutoTradeConfig
  onToggle: () => void
  toggling: boolean
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        mb: 2.5,
        border: '1px solid',
        borderColor: config.enabled ? 'success.main' : 'divider',
        bgcolor: config.enabled ? 'rgba(16,185,129,0.04)' : undefined,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AutoIcon
            sx={{
              fontSize: 32,
              color: config.enabled ? 'success.main' : 'text.disabled',
            }}
          />
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Auto Paper Trading
            </Typography>
            <Typography
              variant="caption"
              fontWeight={700}
              sx={{ color: config.enabled ? 'success.main' : 'text.disabled', textTransform: 'uppercase' }}
            >
              {config.enabled ? '● ACTIVE' : '○ PAUSED'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Monitoring: {config.symbols.join(', ')}
          </Typography>
          <Tooltip title={config.enabled ? 'Pause auto-trading' : 'Start auto-trading'}>
            <Switch
              checked={config.enabled}
              onChange={onToggle}
              disabled={toggling}
              color="success"
            />
          </Tooltip>
          {toggling && <CircularProgress size={16} />}
        </Box>
      </Box>

      {config.enabled && (
        <Alert severity="info" sx={{ mt: 1.5, py: 0.5 }}>
          Signals checked every {config.check_interval_sec}s · threshold {(config.signal_threshold * 100).toFixed(0)}% confidence ·
          {' '}{(config.position_size_pct * 100).toFixed(0)}% of equity per trade
        </Alert>
      )}
    </Paper>
  )
}

// ── Config panel ──────────────────────────────────────────────────────────────

function ConfigPanel({
  config,
  onSave,
  saving,
}: {
  config: AutoTradeConfig
  onSave: (symbols: string, threshold: number, posSize: number, interval: number) => void
  saving: boolean
}) {
  const [symbols,   setSymbols]   = useState(config.symbols.join(','))
  const [threshold, setThreshold] = useState(config.signal_threshold)
  const [posSize,   setPosSize]   = useState(config.position_size_pct)
  const [interval,  setInterval]  = useState(config.check_interval_sec)

  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
      <Typography variant="subtitle2" fontWeight={700} mb={2}>
        Configuration
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <TextField
          label="Symbols to monitor"
          value={symbols}
          onChange={(e) => setSymbols(e.target.value)}
          size="small"
          fullWidth
          placeholder="SPY,QQQ,AAPL"
          helperText="Comma-separated. Must have a trained ML model for full signal."
        />

        <Box>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Confidence threshold: {(threshold * 100).toFixed(0)}%
          </Typography>
          <Slider
            value={threshold}
            onChange={(_, v) => setThreshold(v as number)}
            min={0.1}
            max={0.99}
            step={0.05}
            marks={[
              { value: 0.3, label: '30%' },
              { value: 0.5, label: '50%' },
              { value: 0.7, label: '70%' },
            ]}
            size="small"
            sx={{ color: 'primary.main' }}
          />
          <Typography variant="caption" color="text.disabled">
            Min composite signal confidence required to place an order
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Position size: {(posSize * 100).toFixed(0)}% of equity
          </Typography>
          <Slider
            value={posSize}
            onChange={(_, v) => setPosSize(v as number)}
            min={0.01}
            max={0.5}
            step={0.01}
            marks={[
              { value: 0.05, label: '5%' },
              { value: 0.1,  label: '10%' },
              { value: 0.25, label: '25%' },
            ]}
            size="small"
            sx={{ color: 'warning.main' }}
          />
          <Typography variant="caption" color="text.disabled">
            Dollar value of each new position as a fraction of current equity
          </Typography>
        </Box>

        <TextField
          label="Check interval (seconds)"
          value={interval}
          onChange={(e) => setInterval(Number(e.target.value))}
          size="small"
          type="number"
          inputProps={{ min: 10, max: 3600 }}
          helperText="How often signals are re-evaluated (min 10s, max 1h)"
        />

        <Button
          variant="contained"
          onClick={() => onSave(symbols, threshold, posSize, interval)}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ fontWeight: 700, alignSelf: 'flex-start' }}
        >
          {saving ? 'Saving…' : 'Save Configuration'}
        </Button>
      </Box>
    </Paper>
  )
}

// ── How-it-works card ─────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.5 }}>
        <InfoIcon sx={{ color: 'primary.main', fontSize: 18 }} />
        <Typography variant="subtitle2" fontWeight={700}>How it works</Typography>
      </Box>
      {[
        ['Signal evaluation', 'Every N seconds, the backend computes a composite BUY/HOLD/SELL signal for each monitored symbol using XGBoost predictions + RSI/MA sentiment + MACD.'],
        ['BUY logic', 'If signal = BUY and confidence ≥ threshold and no open position → places a market buy for position_size_pct × equity / price shares.'],
        ['SELL logic', 'If signal = SELL and confidence ≥ threshold and a position exists → sells the entire position at market.'],
        ['ML model required', 'Symbols need a trained XGBoost model for the full signal. Without one, the system uses a sentiment-only fallback (lower confidence).'],
        ['Paper trading only', 'All orders are placed in the paper trading account. No real money is ever used.'],
      ].map(([title, desc]) => (
        <Box key={title as string} sx={{ mb: 1.5 }}>
          <Typography variant="caption" fontWeight={700} color="primary.main" display="block">
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
            {desc}
          </Typography>
        </Box>
      ))}
    </Paper>
  )
}

// ── Log table ─────────────────────────────────────────────────────────────────

function LogTable({ entries }: { entries: AutoTradeLogEntry[] }) {
  if (!entries.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No log entries yet — enable auto-trading to start.
      </Typography>
    )
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Time', 'Symbol', 'Signal', 'Confidence', 'Action', 'Qty', 'Price', 'Reason'].map((h) => (
              <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem' }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
              <TableCell>
                <Typography variant="caption" color="text.disabled" noWrap>
                  {new Date(e.created_at).toLocaleString()}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="caption" fontWeight={700} color="primary.main">
                  {e.symbol}
                </Typography>
              </TableCell>
              <TableCell><SignalChip signal={e.signal} /></TableCell>
              <TableCell>
                <Typography variant="caption" fontFamily="Roboto Mono, monospace">
                  {(e.confidence * 100).toFixed(1)}%
                </Typography>
              </TableCell>
              <TableCell><ActionChip action={e.action} /></TableCell>
              <TableCell>
                <Typography variant="caption">
                  {e.qty !== null ? e.qty.toFixed(4) : '—'}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="caption" fontFamily="Roboto Mono, monospace">
                  {e.price !== null ? `$${e.price.toFixed(2)}` : '—'}
                </Typography>
              </TableCell>
              <TableCell sx={{ maxWidth: 240 }}>
                <Tooltip title={e.reason}>
                  <Typography variant="caption" color="text.secondary" noWrap display="block">
                    {e.reason}
                  </Typography>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AutoTradePage() {
  const [config,   setConfig]   = useState<AutoTradeConfig | null>(null)
  const [log,      setLog]      = useState<AutoTradeLogEntry[]>([])
  const [toggling, setToggling] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saveErr,  setSaveErr]  = useState<string | null>(null)
  const [loadErr,  setLoadErr]  = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const [cfg, entries] = await Promise.all([
        api.autotrade.getConfig(),
        api.autotrade.getLog(100),
      ])
      setConfig(cfg)
      setLog(entries)
    } catch (err: unknown) {
      setLoadErr(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to load auto-trade data'
      )
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleToggle() {
    if (!config) return
    setToggling(true)
    try {
      const updated = config.enabled
        ? await api.autotrade.disable()
        : await api.autotrade.enable()
      setConfig(updated)
    } finally {
      setToggling(false)
    }
  }

  async function handleSave(
    symbols: string,
    threshold: number,
    posSize: number,
    interval: number,
  ) {
    setSaving(true)
    setSaveErr(null)
    try {
      const updated = await api.autotrade.updateConfig({
        symbols,
        signal_threshold:   threshold,
        position_size_pct:  posSize,
        check_interval_sec: interval,
      })
      setConfig(updated)
    } catch (err: unknown) {
      setSaveErr(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to save configuration'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loadErr) {
    return <Alert severity="error">{loadErr}</Alert>
  }

  if (!config) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <AutoIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        <Box>
          <Typography variant="h5" fontWeight={700} lineHeight={1.2}>
            Auto Paper Trading
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Signal-based automated order placement · paper account only
          </Typography>
        </Box>
        <Box sx={{ ml: 'auto' }}>
          <Button variant="outlined" size="small" onClick={loadAll}>
            Refresh Log
          </Button>
        </Box>
      </Box>

      {/* ── Status card ─────────────────────────────────────────────────── */}
      <StatusCard config={config} onToggle={handleToggle} toggling={toggling} />

      {saveErr && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveErr(null)}>
          {saveErr}
        </Alert>
      )}

      {/* ── Config + how-it-works ────────────────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} md={7}>
          <ConfigPanel config={config} onSave={handleSave} saving={saving} />
        </Grid>
        <Grid item xs={12} md={5}>
          <HowItWorks />
        </Grid>
      </Grid>

      {/* ── Log ─────────────────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Activity Log
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {log.length} entries (last 100)
          </Typography>
        </Box>
        <Divider sx={{ mb: 1.5 }} />
        <LogTable entries={log} />
      </Paper>
    </Box>
  )
}
