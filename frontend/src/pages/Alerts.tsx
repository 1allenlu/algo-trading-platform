/**
 * Alerts page — Phase 8.
 *
 * Two panels:
 *   Left  — Alert Rules: create, toggle, delete rules
 *   Right — Alert History: recent fired events, acknowledge all
 *
 * Rule form lets users pick:
 *   Symbol, Condition (price_above / price_below / change_pct_above / change_pct_below),
 *   Threshold, and Cooldown (seconds between repeat firings).
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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  NotificationsOutlined as BellIcon,
  CheckCircleOutline as AckIcon,
} from '@mui/icons-material'
import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { AlertCondition, AlertEvent, AlertRule } from '@/services/api'

const SYMBOLS = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'TSLA']

const CONDITION_LABELS: Record<AlertCondition, string> = {
  price_above:      'Price ≥',
  price_below:      'Price ≤',
  change_pct_above: 'Daily % ≥',
  change_pct_below: 'Daily % ≤',
}

const CONDITION_UNITS: Record<AlertCondition, string> = {
  price_above:      '$',
  price_below:      '$',
  change_pct_above: '%',
  change_pct_below: '%',
}

function conditionChipColor(condition: AlertCondition): 'success' | 'error' | 'default' {
  if (condition === 'price_above' || condition === 'change_pct_above') return 'success'
  if (condition === 'price_below' || condition === 'change_pct_below') return 'error'
  return 'default'
}

// ── Alert Rules panel ─────────────────────────────────────────────────────────

function AlertRulesPanel() {
  const [rules, setRules]   = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [symbol,    setSymbol]    = useState('SPY')
  const [condition, setCondition] = useState<AlertCondition>('price_above')
  const [threshold, setThreshold] = useState('')
  const [cooldown,  setCooldown]  = useState('60')

  const load = async () => {
    try {
      setLoading(true)
      const res = await api.alerts.listRules()
      setRules(res.rules)
      setError(null)
    } catch {
      setError('Failed to load alert rules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    const thr = parseFloat(threshold)
    if (isNaN(thr)) return
    setSubmitting(true)
    try {
      await api.alerts.createRule({
        symbol,
        condition,
        threshold: thr,
        cooldown_seconds: parseInt(cooldown, 10) || 60,
      })
      setThreshold('')
      await load()
    } catch {
      setError('Failed to create rule')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggle = async (ruleId: number) => {
    try {
      const updated = await api.alerts.toggleRule(ruleId)
      setRules((prev) => prev.map((r) => r.id === ruleId ? updated : r))
    } catch {
      setError('Failed to toggle rule')
    }
  }

  const handleDelete = async (ruleId: number) => {
    try {
      await api.alerts.deleteRule(ruleId)
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
    } catch {
      setError('Failed to delete rule')
    }
  }

  const unitLabel = CONDITION_UNITS[condition]
  const isChangeCondition = condition.startsWith('change_pct')

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} mb={2}>
          Alert Rules
        </Typography>

        {/* ── Create form ────────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 90 }}>
              <InputLabel>Symbol</InputLabel>
              <Select value={symbol} label="Symbol" onChange={(e) => setSymbol(e.target.value)}>
                {SYMBOLS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 155 }}>
              <InputLabel>Condition</InputLabel>
              <Select
                value={condition}
                label="Condition"
                onChange={(e) => setCondition(e.target.value as AlertCondition)}
              >
                {(Object.keys(CONDITION_LABELS) as AlertCondition[]).map((c) => (
                  <MenuItem key={c} value={c}>{CONDITION_LABELS[c]}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              label={isChangeCondition ? 'Threshold (%)' : 'Threshold ($)'}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              type="number"
              sx={{ width: 130 }}
              inputProps={{ step: isChangeCondition ? 0.5 : 1 }}
            />

            <TextField
              size="small"
              label="Cooldown (s)"
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              type="number"
              sx={{ width: 110 }}
              inputProps={{ min: 10 }}
            />

            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleCreate}
              disabled={submitting || !threshold}
              sx={{ whiteSpace: 'nowrap', alignSelf: 'center' }}
            >
              Add
            </Button>
          </Box>

          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* ── Rules table ────────────────────────────────────────────────── */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : rules.length === 0 ? (
          <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
            No alert rules yet. Create one above.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Symbol', 'Condition', 'Threshold', 'Cooldown', 'Active', ''].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} hover>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                      {rule.symbol}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={CONDITION_LABELS[rule.condition]}
                        size="small"
                        color={conditionChipColor(rule.condition)}
                        variant="outlined"
                        sx={{ fontSize: '0.65rem', height: 20 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                      {CONDITION_UNITS[rule.condition]}{rule.threshold.toFixed(2)}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                      {rule.cooldown_seconds}s
                    </TableCell>
                    <TableCell padding="none">
                      <Switch
                        size="small"
                        checked={rule.is_active}
                        onChange={() => handleToggle(rule.id)}
                        color="success"
                      />
                    </TableCell>
                    <TableCell padding="none">
                      <Tooltip title="Delete rule">
                        <IconButton size="small" onClick={() => handleDelete(rule.id)} color="error">
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ── Alert History panel ───────────────────────────────────────────────────────

function AlertHistoryPanel() {
  const [events, setEvents]   = useState<AlertEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [acking, setAcking]   = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const res = await api.alerts.listEvents(100)
      setEvents(res.events)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAckAll = async () => {
    setAcking(true)
    try {
      await api.alerts.acknowledgeAll()
      setEvents((prev) => prev.map((e) => ({ ...e, acknowledged: true })))
    } finally {
      setAcking(false)
    }
  }

  const unread = events.filter((e) => !e.acknowledged).length

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>Alert History</Typography>
            {unread > 0 && (
              <Chip label={`${unread} unread`} size="small" color="warning" sx={{ fontSize: '0.65rem', height: 20 }} />
            )}
          </Box>
          <Button
            size="small"
            startIcon={<AckIcon />}
            onClick={handleAckAll}
            disabled={acking || unread === 0}
          >
            Mark all read
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : events.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <BellIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No alerts have fired yet.
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Create alert rules above and they'll appear here when triggered.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Time', 'Symbol', 'Condition', 'Value', 'Message', 'Read'].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((ev) => (
                  <TableRow
                    key={ev.id}
                    hover
                    sx={{ opacity: ev.acknowledged ? 0.55 : 1 }}
                  >
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {new Date(ev.triggered_at).toLocaleTimeString()}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                      {ev.symbol}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={CONDITION_LABELS[ev.condition]}
                        size="small"
                        color={conditionChipColor(ev.condition)}
                        variant="outlined"
                        sx={{ fontSize: '0.62rem', height: 18 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                      {CONDITION_UNITS[ev.condition]}{ev.current_value.toFixed(2)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', maxWidth: 240 }}>
                      {ev.message}
                    </TableCell>
                    <TableCell>
                      {ev.acknowledged
                        ? <AckIcon sx={{ fontSize: 14, color: 'success.main' }} />
                        : <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: 'warning.main' }} />
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Alerts & Notifications</Typography>
        <Typography variant="body2" color="text.secondary">
          Create price and momentum alert rules. Alerts fire in real-time via WebSocket.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <AlertRulesPanel />
        </Grid>
        <Grid item xs={12}>
          <AlertHistoryPanel />
        </Grid>
      </Grid>
    </Box>
  )
}
