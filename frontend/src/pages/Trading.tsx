/**
 * Paper Trading page — self-contained paper trading simulator.
 *
 * Layout:
 *   Account bar  — Equity | Cash | Day P&L | Total Return | Reset button
 *   Main grid    — Positions table (left) + Order entry form (right)
 *   History      — equity curve (Recharts)
 *   Orders table — Recent orders with cancel button for open orders
 *
 * Data flow:
 *   - Polls GET /api/paper/state every 2 seconds (same pattern as Backtest page)
 *   - Orders fill immediately (market) or queue (limit) using latest DB close price
 *   - Order submissions call POST /api/paper/orders, then immediately re-fetches state
 *   - Reset button calls POST /api/paper/reset to wipe all state back to $100k
 */

import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
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
  Cancel as CancelIcon,
  RestartAlt as ResetIcon,
} from '@mui/icons-material'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AccountInfo, PaperOrder, PaperPosition, PaperTradingState, SubmitOrderRequest } from '@/services/api'
import { api } from '@/services/api'

// ── Constants ──────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000
const QUICK_SYMBOLS    = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'TSLA', 'META', 'JPM']

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n: number, decimals = 2): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${n < 0 ? '-' : ''}$${abs}`
}

function fmtPct(n: number, decimals = 2): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(decimals)}%`
}

function pnlColor(n: number): string {
  if (n > 0) return '#06d6a0'
  if (n < 0) return '#ff6b6b'
  return 'text.primary'
}

function statusColor(s: string): 'default' | 'success' | 'warning' | 'error' {
  if (s === 'filled')            return 'success'
  if (s === 'new' || s === 'partially_filled') return 'warning'
  if (s === 'canceled' || s === 'expired')     return 'error'
  return 'default'
}

// ── Account bar ────────────────────────────────────────────────────────────────

function AccountBar({
  account, lastUpdated, onReset, isResetting,
}: {
  account: AccountInfo
  lastUpdated: string
  onReset: () => void
  isResetting: boolean
}) {
  const secAgo = Math.round((Date.now() - new Date(lastUpdated).getTime()) / 1000)

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ sm: 'center' }} flexWrap="wrap">
          {/* Equity */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">PORTFOLIO EQUITY</Typography>
            <Typography variant="h5" fontWeight={700} fontFamily="Roboto Mono, monospace">
              {fmt$(account.equity, 2)}
            </Typography>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Cash */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">CASH</Typography>
            <Typography variant="h6" fontWeight={600} fontFamily="Roboto Mono, monospace">
              {fmt$(account.cash, 2)}
            </Typography>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Day P&L */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">DAY P&L</Typography>
            <Typography variant="h6" fontWeight={600} fontFamily="Roboto Mono, monospace"
              sx={{ color: pnlColor(account.day_pnl) }}>
              {fmt$(account.day_pnl)} ({fmtPct(account.day_pnl_pct)})
            </Typography>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Total return */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">TOTAL RETURN</Typography>
            <Typography variant="h6" fontWeight={600} fontFamily="Roboto Mono, monospace"
              sx={{ color: pnlColor(account.total_pnl) }}>
              {fmt$(account.total_pnl)} ({fmtPct(account.total_pnl_pct)})
            </Typography>
          </Box>

          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="caption" color="text.disabled">
              Updated {secAgo}s ago
            </Typography>
            <Tooltip title="Reset account to $100,000">
              <Button
                size="small" variant="outlined" color="error"
                startIcon={isResetting ? <CircularProgress size={14} color="inherit" /> : <ResetIcon />}
                onClick={onReset}
                disabled={isResetting}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                Reset
              </Button>
            </Tooltip>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ── Positions table ────────────────────────────────────────────────────────────

function PositionsTable({ positions }: { positions: PaperPosition[] }) {
  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
          Open Positions ({positions.length})
        </Typography>

        {positions.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center', color: 'text.disabled' }}>
            <Typography variant="body2">No open positions</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Symbol', 'Qty', 'Avg Cost', 'Current', 'Mkt Value', 'Unrealized P&L'].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {positions.map((pos) => (
                  <TableRow key={pos.symbol} hover>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                      {pos.symbol}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.8rem' }}>
                      {pos.qty}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.8rem' }}>
                      {fmt$(pos.avg_entry_price)}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.8rem' }}>
                      {fmt$(pos.current_price)}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.8rem' }}>
                      {fmt$(pos.market_value)}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.8rem' }}>
                      <Box sx={{ color: pnlColor(pos.unrealized_pnl) }}>
                        {fmt$(pos.unrealized_pnl)} ({fmtPct(pos.unrealized_pnl_pct)})
                      </Box>
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

// ── Order entry form ──────────────────────────────────────────────────────────

function OrderForm({
  onSubmit,
  isSubmitting,
  error,
}: {
  onSubmit: (req: SubmitOrderRequest) => Promise<void>
  isSubmitting: boolean
  error: string | null
}) {
  const [symbol,     setSymbol]     = useState('SPY')
  const [side,       setSide]       = useState<'buy' | 'sell'>('buy')
  const [qty,        setQty]        = useState('10')
  const [orderType,  setOrderType]  = useState<'market' | 'limit'>('market')
  const [limitPrice, setLimitPrice] = useState('')

  const handleSubmit = async () => {
    const qtyNum = parseFloat(qty)
    if (isNaN(qtyNum) || qtyNum <= 0) return
    const req: SubmitOrderRequest = {
      symbol:      symbol.toUpperCase(),
      side,
      qty:         qtyNum,
      order_type:  orderType,
      ...(orderType === 'limit' && limitPrice ? { limit_price: parseFloat(limitPrice) } : {}),
    }
    await onSubmit(req)
  }

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>
          Place Order
        </Typography>

        <Stack spacing={2}>
          {/* Symbol with quick-pick chips */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>SYMBOL</Typography>
            <TextField
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              size="small" fullWidth
              inputProps={{ style: { fontFamily: 'Roboto Mono, monospace', fontWeight: 700 } }}
            />
            <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.75}>
              {QUICK_SYMBOLS.map((s) => (
                <Chip
                  key={s} label={s} size="small" clickable
                  onClick={() => setSymbol(s)}
                  sx={{
                    fontFamily: 'Roboto Mono, monospace',
                    fontSize: '0.65rem',
                    bgcolor:     symbol === s ? 'rgba(0,180,216,0.15)' : 'transparent',
                    color:       symbol === s ? 'primary.main' : 'text.secondary',
                    border: '1px solid',
                    borderColor: symbol === s ? 'primary.main' : 'divider',
                  }}
                />
              ))}
            </Stack>
          </Box>

          {/* Buy / Sell toggle */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>SIDE</Typography>
            <ToggleButtonGroup value={side} exclusive onChange={(_, v) => v && setSide(v)} fullWidth size="small">
              <ToggleButton value="buy"
                sx={{ textTransform: 'none', fontWeight: 700,
                  '&.Mui-selected': { bgcolor: 'rgba(6,214,160,0.15)', color: '#06d6a0', borderColor: '#06d6a0' } }}>
                Buy
              </ToggleButton>
              <ToggleButton value="sell"
                sx={{ textTransform: 'none', fontWeight: 700,
                  '&.Mui-selected': { bgcolor: 'rgba(255,107,107,0.15)', color: '#ff6b6b', borderColor: '#ff6b6b' } }}>
                Sell
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Quantity */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>QUANTITY (SHARES)</Typography>
            <TextField
              value={qty} onChange={(e) => setQty(e.target.value)}
              type="number" size="small" fullWidth
              inputProps={{ min: 1, style: { fontFamily: 'Roboto Mono, monospace' } }}
            />
          </Box>

          {/* Order type */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>ORDER TYPE</Typography>
            <Select value={orderType} onChange={(e) => setOrderType(e.target.value as 'market' | 'limit')}
              size="small" fullWidth>
              <MenuItem value="market">Market</MenuItem>
              <MenuItem value="limit">Limit</MenuItem>
            </Select>
          </Box>

          {/* Limit price (conditional) */}
          {orderType === 'limit' && (
            <Box>
              <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>LIMIT PRICE</Typography>
              <TextField
                value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)}
                type="number" size="small" fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                inputProps={{ style: { fontFamily: 'Roboto Mono, monospace' } }}
              />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ fontSize: '0.78rem', py: 0.5 }}>{error}</Alert>
          )}

          <Button
            variant="contained"
            fullWidth
            onClick={handleSubmit}
            disabled={isSubmitting || !symbol || !qty}
            startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{
              py: 1.25,
              fontWeight: 700,
              textTransform: 'none',
              bgcolor: side === 'buy' ? '#06d6a0' : '#ff6b6b',
              '&:hover': { bgcolor: side === 'buy' ? '#05c490' : '#e55a5a' },
              color: '#0f172a',
            }}
          >
            {isSubmitting ? 'Submitting…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${qty || '?'} ${symbol}`}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ── Portfolio history chart ────────────────────────────────────────────────────

function HistoryChart({ data }: { data: { timestamp: string; equity: number; pnl_pct: number }[] }) {
  if (data.length === 0) return null

  const startEquity = data[0]?.equity ?? 100_000
  const formatted   = data.map((d) => ({
    date:   new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    equity: d.equity,
    pnl:    ((d.equity - startEquity) / startEquity) * 100,
  }))
  const lastPnl = formatted[formatted.length - 1]?.pnl ?? 0
  const color   = lastPnl >= 0 ? '#06d6a0' : '#ff6b6b'

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>
          Portfolio History (1 Month)
        </Typography>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={formatted}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
            <YAxis
              tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false} tickLine={false}
              domain={['auto', 'auto']}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
            <RechartsTip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8', fontSize: 12 }}
              formatter={(val: number) => [`${val >= 0 ? '+' : ''}${val.toFixed(2)}%`, 'Return']}
            />
            <Area
              type="monotone" dataKey="pnl"
              stroke={color} strokeWidth={2}
              fill="url(#equityGrad)" dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ── Orders table ──────────────────────────────────────────────────────────────

function OrdersTable({
  orders,
  onCancel,
}: {
  orders: PaperOrder[]
  onCancel: (id: string) => Promise<void>
}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const handleCancel = async (id: string) => {
    setCancellingId(id)
    await onCancel(id)
    setCancellingId(null)
  }

  const canCancel = (status: string) => status === 'new' || status === 'partially_filled'

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
          Recent Orders
        </Typography>
        {orders.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center', color: 'text.disabled' }}>
            <Typography variant="body2">No orders yet</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Symbol', 'Side', 'Type', 'Qty', 'Filled', 'Avg Fill', 'Status', 'Time', ''].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id} hover>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                      {o.symbol}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.8rem',
                      color: o.side === 'buy' ? '#06d6a0' : '#ff6b6b', fontWeight: 700 }}>
                      {o.side.toUpperCase()}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {o.order_type}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.8rem' }}>
                      {o.qty}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.8rem' }}>
                      {o.filled_qty}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'Roboto Mono, monospace', fontSize: '0.8rem' }}>
                      {o.filled_avg_price ? fmt$(o.filled_avg_price) : '—'}
                    </TableCell>
                    <TableCell>
                      <Chip label={o.status} size="small" color={statusColor(o.status)}
                        sx={{ fontSize: '0.65rem', height: 20 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {new Date(o.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      {canCancel(o.status) && (
                        <Tooltip title="Cancel order">
                          <IconButton size="small"
                            onClick={() => handleCancel(o.id)}
                            disabled={cancellingId === o.id}
                            sx={{ color: 'text.disabled', '&:hover': { color: '#ff6b6b' } }}
                          >
                            {cancellingId === o.id
                              ? <CircularProgress size={14} />
                              : <CancelIcon fontSize="small" />
                            }
                          </IconButton>
                        </Tooltip>
                      )}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Trading() {
  const [state,        setState]        = useState<PaperTradingState | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResetting,  setIsResetting]  = useState(false)
  const [orderError,   setOrderError]   = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Poll every 2s ───────────────────────────────────────────────────────────
  const fetchState = async () => {
    try {
      const data = await api.paper.getState()
      setState(data)
      setError(null)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to fetch trading state')
    }
  }

  useEffect(() => {
    fetchState()
    pollRef.current = setInterval(fetchState, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // ── Submit order ───────────────────────────────────────────────────────────
  const handleSubmitOrder = async (req: SubmitOrderRequest) => {
    setIsSubmitting(true)
    setOrderError(null)
    try {
      await api.paper.submitOrder(req)
      await fetchState()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setOrderError(detail ?? 'Order submission failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Cancel order ───────────────────────────────────────────────────────────
  const handleCancelOrder = async (orderId: string) => {
    try {
      await api.paper.cancelOrder(orderId)
      await fetchState()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Cancel failed')
    }
  }

  // ── Reset account ──────────────────────────────────────────────────────────
  const handleReset = async () => {
    setIsResetting(true)
    try {
      await api.paper.reset()
      setState(null)
      await fetchState()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Reset failed')
    } finally {
      setIsResetting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Paper Trading</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Simulated trading using real historical prices from your database.
        Market orders fill at the latest close price — no external account needed.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!state && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {state && (
        <>
          <AccountBar
            account={state.account}
            lastUpdated={state.last_updated}
            onReset={handleReset}
            isResetting={isResetting}
          />

          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} md={7}>
              <PositionsTable positions={state.positions} />
            </Grid>
            <Grid item xs={12} md={5}>
              <OrderForm
                onSubmit={handleSubmitOrder}
                isSubmitting={isSubmitting}
                error={orderError}
              />
            </Grid>
          </Grid>

          {state.portfolio_history.length > 1 && (
            <HistoryChart data={state.portfolio_history} />
          )}

          <OrdersTable orders={state.orders} onCancel={handleCancelOrder} />
        </>
      )}
    </Box>
  )
}
