/**
 * Paper Trading page — self-contained paper trading simulator.
 *
 * Layout:
 *   Account bar  — Equity | Cash | Day P&L | Total Return | Reset button
 *   Main grid    — Positions table (left) + Order entry form (right)
 *   History      — equity curve (Recharts)
 *   Orders table — Recent orders with cancel button for open orders
 *
 * Data flow (Phase 7 hybrid):
 *   - REST polls GET /api/paper/state every 10s for account, orders, and history
 *   - WebSocket /ws/prices delivers live prices every ~1s for the positions table
 *   - Positions table shows live unrealized P&L derived from WebSocket prices
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
import { useLivePrices } from '@/hooks/useLivePrices'

// ── Constants ──────────────────────────────────────────────────────────────────

// REST poll slowed to 10s — WebSocket handles real-time price updates
const POLL_INTERVAL_MS = 10_000
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
  if (n > 0) return '#00C896'
  if (n < 0) return '#FF6B6B'
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
            <Typography variant="h5" fontWeight={700} fontFamily="IBM Plex Mono, monospace">
              {fmt$(account.equity, 2)}
            </Typography>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Cash */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">CASH</Typography>
            <Typography variant="h6" fontWeight={600} fontFamily="IBM Plex Mono, monospace">
              {fmt$(account.cash, 2)}
            </Typography>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Day P&L */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">DAY P&L</Typography>
            <Typography variant="h6" fontWeight={600} fontFamily="IBM Plex Mono, monospace"
              sx={{ color: pnlColor(account.day_pnl) }}>
              {fmt$(account.day_pnl)} ({fmtPct(account.day_pnl_pct)})
            </Typography>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Total return */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">TOTAL RETURN</Typography>
            <Typography variant="h6" fontWeight={600} fontFamily="IBM Plex Mono, monospace"
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

function PositionsTable({
  positions,
  livePrices,
}: {
  positions:  PaperPosition[]
  livePrices: Record<string, number>
}) {
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
                  {['Symbol', 'Qty', 'Avg Cost', 'Live Price', 'Mkt Value', 'Unrealized P&L'].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {positions.map((pos) => {
                  // Use live WebSocket price if available, otherwise fall back to DB price
                  const livePrice     = livePrices[pos.symbol] ?? pos.current_price
                  const liveValue     = livePrice * pos.qty
                  const liveUnrealized = liveValue - pos.avg_entry_price * pos.qty
                  const liveUnrPct    = pos.avg_entry_price > 0
                    ? liveUnrealized / (pos.avg_entry_price * pos.qty)
                    : 0

                  return (
                    <TableRow key={pos.symbol} hover>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                        {pos.symbol}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                        {pos.qty}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                        {fmt$(pos.avg_entry_price)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: 'primary.main' }}>
                        {fmt$(livePrice)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                        {fmt$(liveValue)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                        <Box sx={{ color: pnlColor(liveUnrealized) }}>
                          {fmt$(liveUnrealized)} ({fmtPct(liveUnrPct)})
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
  type OType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop'

  const [symbol,     setSymbol]     = useState('SPY')
  const [side,       setSide]       = useState<'buy' | 'sell'>('buy')
  const [qty,        setQty]        = useState('10')
  const [orderType,  setOrderType]  = useState<OType>('market')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice,  setStopPrice]  = useState('')
  const [trailPct,   setTrailPct]   = useState('2')  // percent, e.g. "2" = 2%

  const needsLimit  = orderType === 'limit' || orderType === 'stop_limit'
  const needsStop   = orderType === 'stop'  || orderType === 'stop_limit'
  const needsTrail  = orderType === 'trailing_stop'

  const handleSubmit = async () => {
    const qtyNum = parseFloat(qty)
    if (isNaN(qtyNum) || qtyNum <= 0) return
    const req: SubmitOrderRequest = {
      symbol:     symbol.toUpperCase(),
      side,
      qty:        qtyNum,
      order_type: orderType,
      ...(needsLimit && limitPrice ? { limit_price: parseFloat(limitPrice) } : {}),
      ...(needsStop  && stopPrice  ? { stop_price:  parseFloat(stopPrice)  } : {}),
      ...(needsTrail && trailPct   ? { trail_pct:   parseFloat(trailPct) / 100 } : {}),
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
              inputProps={{ style: { fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 } }}
            />
            <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.75}>
              {QUICK_SYMBOLS.map((s) => (
                <Chip
                  key={s} label={s} size="small" clickable
                  onClick={() => setSymbol(s)}
                  sx={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '0.65rem',
                    bgcolor:     symbol === s ? 'rgba(74,158,255,0.15)' : 'transparent',
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
                  '&.Mui-selected': { bgcolor: 'rgba(0,200,150,0.15)', color: '#00C896', borderColor: '#00C896' } }}>
                Buy
              </ToggleButton>
              <ToggleButton value="sell"
                sx={{ textTransform: 'none', fontWeight: 700,
                  '&.Mui-selected': { bgcolor: 'rgba(255,107,107,0.15)', color: '#FF6B6B', borderColor: '#FF6B6B' } }}>
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
              inputProps={{ min: 1, style: { fontFamily: 'IBM Plex Mono, monospace' } }}
            />
          </Box>

          {/* Order type */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>ORDER TYPE</Typography>
            <Select value={orderType} onChange={(e) => setOrderType(e.target.value as OType)}
              size="small" fullWidth>
              <MenuItem value="market">Market</MenuItem>
              <MenuItem value="limit">Limit</MenuItem>
              <MenuItem value="stop">Stop</MenuItem>
              <MenuItem value="stop_limit">Stop Limit</MenuItem>
              <MenuItem value="trailing_stop">Trailing Stop</MenuItem>
            </Select>
          </Box>

          {/* Limit price (limit or stop_limit) */}
          {needsLimit && (
            <Box>
              <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>LIMIT PRICE</Typography>
              <TextField
                value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)}
                type="number" size="small" fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                inputProps={{ style: { fontFamily: 'IBM Plex Mono, monospace' } }}
              />
            </Box>
          )}

          {/* Stop price (stop or stop_limit) */}
          {needsStop && (
            <Box>
              <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>STOP PRICE</Typography>
              <TextField
                value={stopPrice} onChange={(e) => setStopPrice(e.target.value)}
                type="number" size="small" fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                inputProps={{ style: { fontFamily: 'IBM Plex Mono, monospace' } }}
              />
            </Box>
          )}

          {/* Trail % (trailing_stop) */}
          {needsTrail && (
            <Box>
              <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>TRAIL %</Typography>
              <TextField
                value={trailPct} onChange={(e) => setTrailPct(e.target.value)}
                type="number" size="small" fullWidth
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                inputProps={{ min: 0.1, max: 50, step: 0.5, style: { fontFamily: 'IBM Plex Mono, monospace' } }}
                helperText="Order fills when price reverses by this % from its peak/trough"
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
              bgcolor: side === 'buy' ? '#00C896' : '#FF6B6B',
              '&:hover': { bgcolor: side === 'buy' ? '#00b085' : '#e55a5a' },
              color: '#0A0E17',
            }}
          >
            {isSubmitting ? 'Submitting…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${qty || '?'} ${symbol} ${orderType !== 'market' ? `(${orderType.replace('_', ' ')})` : ''}`}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ── Portfolio history chart ────────────────────────────────────────────────────

function HistoryChart({ data }: { data: { timestamp: string; equity: number; pnl_pct: number }[] }) {
  // Toggle between dollar-value and percent-return views
  const [mode, setMode] = useState<'dollar' | 'pct'>('pct')

  if (data.length === 0) return null

  const startEquity = data[0]?.equity ?? 100_000

  // Build chart data for all available history (not just 1 month)
  const formatted = data.map((d) => ({
    date:   new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    equity: d.equity,
    pnl:    ((d.equity - startEquity) / startEquity) * 100,
  }))

  // Compute stats for the summary row
  const currentEquity = data[data.length - 1]?.equity ?? startEquity
  const currentReturn = ((currentEquity - startEquity) / startEquity) * 100

  // Best/worst day: compute daily % changes across the dataset
  const dailyChanges: number[] = []
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1].equity
    if (prev > 0) dailyChanges.push(((data[i].equity - prev) / prev) * 100)
  }
  const bestDay  = dailyChanges.length > 0 ? Math.max(...dailyChanges) : 0
  const worstDay = dailyChanges.length > 0 ? Math.min(...dailyChanges) : 0

  const lastPnl = formatted[formatted.length - 1]?.pnl ?? 0
  const color   = lastPnl >= 0 ? '#00C896' : '#FF6B6B'

  // Y-axis and tooltip change depending on mode
  const dataKey   = mode === 'dollar' ? 'equity' : 'pnl'
  const refLineY  = mode === 'dollar' ? startEquity : 0

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent>
        {/* Header row: title + mode toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Portfolio History (All Time)
          </Typography>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, v) => v && setMode(v)}
            size="small"
            sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1.25, fontSize: '0.72rem', textTransform: 'none' } }}
          >
            <ToggleButton value="pct">% Return</ToggleButton>
            <ToggleButton value="dollar">$ Value</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Stats summary row */}
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 2 }}>
          {/* Starting Value */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">STARTING VALUE</Typography>
            <Typography variant="body2" fontWeight={700} fontFamily="IBM Plex Mono, monospace">
              {fmt$(startEquity, 0)}
            </Typography>
          </Box>

          {/* Current Value */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">CURRENT VALUE</Typography>
            <Typography
              variant="body2" fontWeight={700} fontFamily="IBM Plex Mono, monospace"
              sx={{ color: pnlColor(currentEquity - startEquity) }}
            >
              {fmt$(currentEquity, 0)}
              <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'inherit' }}>
                ({currentReturn >= 0 ? '+' : ''}{currentReturn.toFixed(2)}%)
              </Typography>
            </Typography>
          </Box>

          {/* Best Day */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">BEST DAY</Typography>
            <Typography
              variant="body2" fontWeight={700} fontFamily="IBM Plex Mono, monospace"
              sx={{ color: '#00C896' }}
            >
              +{bestDay.toFixed(2)}%
            </Typography>
          </Box>

          {/* Worst Day */}
          <Box>
            <Typography variant="caption" color="text.disabled" display="block">WORST DAY</Typography>
            <Typography
              variant="body2" fontWeight={700} fontFamily="IBM Plex Mono, monospace"
              sx={{ color: '#FF6B6B' }}
            >
              {worstDay.toFixed(2)}%
            </Typography>
          </Box>
        </Box>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={formatted}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2330" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={false}
              // Thin out ticks when there's a lot of data
              interval={Math.max(0, Math.floor(formatted.length / 8) - 1)}
            />
            <YAxis
              tickFormatter={
                mode === 'dollar'
                  ? (v: number) => `$${(v / 1000).toFixed(0)}k`
                  : (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
              }
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              axisLine={false} tickLine={false}
              domain={['auto', 'auto']}
            />
            <ReferenceLine y={refLineY} stroke="#2D3548" strokeDasharray="4 4" />
            <RechartsTip
              contentStyle={{ background: '#12161F', border: '1px solid #2D3548', borderRadius: 8 }}
              labelStyle={{ color: '#9CA3AF', fontSize: 12 }}
              formatter={
                mode === 'dollar'
                  ? (val: number) => [fmt$(val, 2), 'Equity']
                  : (val: number) => [`${val >= 0 ? '+' : ''}${val.toFixed(2)}%`, 'Return']
              }
            />
            <Area
              type="monotone" dataKey={dataKey}
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
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                      {o.symbol}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem',
                      color: o.side === 'buy' ? '#00C896' : '#FF6B6B', fontWeight: 700 }}>
                      {o.side.toUpperCase()}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {o.order_type}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                      {o.qty}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                      {o.filled_qty}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
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
                            sx={{ color: 'text.disabled', '&:hover': { color: '#FF6B6B' } }}
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

  // Live prices from WebSocket — used to update position P&L in real time
  const { prices } = useLivePrices()
  const livePrices = Object.fromEntries(
    Object.entries(prices).map(([sym, tick]) => [sym, tick.price])
  )

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

          {/* Phase 63: Live portfolio-level P&L banner (WebSocket aggregate) */}
          {state.positions.length > 0 && (() => {
            const liveUnrealized = state.positions.reduce((sum, pos) => {
              const price = livePrices[pos.symbol] ?? pos.current_price
              return sum + (price - pos.avg_entry_price) * pos.qty
            }, 0)
            const liveMktValue = state.positions.reduce((sum, pos) => {
              const price = livePrices[pos.symbol] ?? pos.current_price
              return sum + price * pos.qty
            }, 0)
            const livePnlPct = liveMktValue > 0 ? liveUnrealized / (liveMktValue - liveUnrealized) : 0
            const wsSyms = Object.keys(prices).filter((s) => state.positions.some((p) => p.symbol === s))
            return (
              <Box
                sx={{
                  mb: 2, px: 2, py: 1, borderRadius: 1.5,
                  border: '1px solid', borderColor: 'divider',
                  bgcolor: liveUnrealized >= 0 ? 'rgba(0,200,150,0.06)' : 'rgba(255,107,107,0.06)',
                  display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap',
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.disabled">LIVE UNREALIZED P&L</Typography>
                  <Typography variant="h6" fontWeight={700} fontFamily="IBM Plex Mono, monospace"
                    sx={{ color: liveUnrealized >= 0 ? '#00C896' : '#FF6B6B' }}>
                    {fmt$(liveUnrealized)} ({fmtPct(livePnlPct)})
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.disabled">LIVE MKT VALUE</Typography>
                  <Typography variant="body1" fontWeight={600} fontFamily="IBM Plex Mono, monospace">
                    {fmt$(liveMktValue)}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                  {wsSyms.length}/{state.positions.length} symbols live via WebSocket · updates every ~1s
                </Typography>
              </Box>
            )
          })()}

          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} md={7}>
              <PositionsTable positions={state.positions} livePrices={livePrices} />
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
