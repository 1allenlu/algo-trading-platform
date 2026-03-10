/**
 * Live Trading Page — Phase 25.
 *
 * Submits real orders to Alpaca (paper or live account depending on ALPACA_PAPER flag).
 *
 * Layout:
 *   - Mode banner (ALPACA PAPER / ALPACA LIVE / NOT CONFIGURED)
 *   - Account summary row (equity, cash, buying power, day P&L)
 *   - Order entry panel + Open positions table (side by side)
 *   - Order history table with cancel button
 */

import { useState, useCallback } from 'react'
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
  IconButton,
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
  Bolt as LiveIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  Sync as SyncIcon,
} from '@mui/icons-material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, LiveOrder, LiveTradingState } from '@/services/api'

// ── Mode banner ────────────────────────────────────────────────────────────────

function ModeBanner({ state }: { state: LiveTradingState | undefined }) {
  if (!state) return null

  if (!state.alpaca_enabled) {
    return (
      <Alert
        severity="warning"
        icon={<LiveIcon />}
        sx={{ mb: 2, fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8rem' }}
      >
        Alpaca API keys not configured — set{' '}
        <strong>ALPACA_API_KEY</strong> and <strong>ALPACA_SECRET_KEY</strong>{' '}
        in your <code>.env</code> file to enable live order execution.
      </Alert>
    )
  }

  const mode = state.account?.trading_mode ?? 'paper'
  const isPaper = mode === 'paper'

  return (
    <Box
      sx={{
        mb: 2,
        px: 2,
        py: 1,
        borderRadius: 1,
        border: '1px solid',
        borderColor: isPaper ? 'success.main' : 'warning.main',
        bgcolor: isPaper ? 'rgba(0,200,150,0.06)' : 'rgba(245,158,11,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      <LiveIcon sx={{ color: isPaper ? 'success.main' : 'warning.main', fontSize: 18 }} />
      <Typography
        sx={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: isPaper ? 'success.main' : 'warning.main',
        }}
      >
        ALPACA {mode.toUpperCase()} MODE
      </Typography>
      {!isPaper && (
        <Chip
          label="REAL MONEY"
          size="small"
          color="warning"
          sx={{ fontSize: '0.65rem', fontFamily: '"IBM Plex Mono", monospace' }}
        />
      )}
    </Box>
  )
}

// ── Account summary row ────────────────────────────────────────────────────────

function AccountRow({ state }: { state: LiveTradingState }) {
  const acc = state.account
  if (!acc) return null

  const pnlColor = acc.day_pnl >= 0 ? 'secondary.main' : 'error.main'

  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 2 }}>
      {[
        { label: 'Equity',        value: `$${acc.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { label: 'Cash',          value: `$${acc.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { label: 'Buying Power',  value: `$${acc.buying_power.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
      ].map(({ label, value }) => (
        <Card key={label} variant="outlined" sx={{ flex: '1 1 160px', minWidth: 140 }}>
          <CardContent sx={{ py: '10px !important', px: 2 }}>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {label}
            </Typography>
            <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '1rem', fontWeight: 600, mt: 0.25 }}>
              {value}
            </Typography>
          </CardContent>
        </Card>
      ))}
      <Card variant="outlined" sx={{ flex: '1 1 160px', minWidth: 140 }}>
        <CardContent sx={{ py: '10px !important', px: 2 }}>
          <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Day P&L
          </Typography>
          <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '1rem', fontWeight: 600, mt: 0.25, color: pnlColor }}>
            {acc.day_pnl >= 0 ? '+' : ''}${acc.day_pnl.toFixed(2)}
            <Typography component="span" sx={{ fontSize: '0.72rem', ml: 0.5, color: pnlColor }}>
              ({acc.day_pnl_pct >= 0 ? '+' : ''}{acc.day_pnl_pct.toFixed(2)}%)
            </Typography>
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  )
}

// ── Order entry panel ──────────────────────────────────────────────────────────

function OrderEntry({ enabled, onSubmitted }: { enabled: boolean; onSubmitted: () => void }) {
  const [symbol,     setSymbol]     = useState('SPY')
  const [qty,        setQty]        = useState('1')
  const [side,       setSide]       = useState<'buy' | 'sell'>('buy')
  const [orderType,  setOrderType]  = useState<'market' | 'limit'>('market')
  const [limitPrice, setLimitPrice] = useState('')
  const [error,      setError]      = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      api.live.submitOrder({
        symbol:      symbol.toUpperCase().trim(),
        side,
        qty:         parseFloat(qty),
        order_type:  orderType,
        limit_price: orderType === 'limit' ? parseFloat(limitPrice) : undefined,
      }),
    onSuccess: () => {
      setError(null)
      onSubmitted()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? 'Order failed'
      setError(msg)
    },
  })

  const handleSubmit = () => {
    setError(null)
    if (!symbol.trim()) { setError('Symbol is required'); return }
    const qtyNum = parseFloat(qty)
    if (isNaN(qtyNum) || qtyNum <= 0) { setError('Quantity must be > 0'); return }
    if (orderType === 'limit') {
      const lp = parseFloat(limitPrice)
      if (isNaN(lp) || lp <= 0) { setError('Limit price must be > 0'); return }
    }
    mutation.mutate()
  }

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardHeader
        title="Place Order"
        titleTypographyProps={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.04em' }}
      />
      <Divider />
      <CardContent>
        <Stack spacing={1.5}>
          {error && <Alert severity="error" onClose={() => setError(null)} sx={{ fontSize: '0.78rem' }}>{error}</Alert>}
          {mutation.isSuccess && (
            <Alert severity="success" onClose={() => mutation.reset()} sx={{ fontSize: '0.78rem' }}>
              Order submitted successfully
            </Alert>
          )}

          <TextField
            label="Symbol"
            size="small"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            disabled={!enabled || mutation.isPending}
            inputProps={{ style: { fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, letterSpacing: '0.08em' } }}
          />

          <TextField
            label="Quantity"
            size="small"
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            disabled={!enabled || mutation.isPending}
            inputProps={{ min: 0.0001, step: 1, style: { fontFamily: '"IBM Plex Mono", monospace' } }}
          />

          {/* Buy / Sell toggle */}
          <ToggleButtonGroup
            value={side}
            exclusive
            onChange={(_, v) => { if (v) setSide(v) }}
            size="small"
            fullWidth
            disabled={!enabled || mutation.isPending}
          >
            <ToggleButton
              value="buy"
              sx={{
                '&.Mui-selected': { bgcolor: 'rgba(0,200,150,0.15)', color: 'secondary.main', borderColor: 'secondary.main' },
                fontFamily: '"IBM Plex Mono", monospace',
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            >
              BUY
            </ToggleButton>
            <ToggleButton
              value="sell"
              sx={{
                '&.Mui-selected': { bgcolor: 'rgba(239,68,68,0.15)', color: 'error.main', borderColor: 'error.main' },
                fontFamily: '"IBM Plex Mono", monospace',
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            >
              SELL
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Market / Limit toggle */}
          <ToggleButtonGroup
            value={orderType}
            exclusive
            onChange={(_, v) => { if (v) setOrderType(v) }}
            size="small"
            fullWidth
            disabled={!enabled || mutation.isPending}
          >
            {(['market', 'limit'] as const).map((t) => (
              <ToggleButton
                key={t}
                value={t}
                sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.72rem' }}
              >
                {t.toUpperCase()}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {orderType === 'limit' && (
            <TextField
              label="Limit Price"
              size="small"
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              disabled={!enabled || mutation.isPending}
              inputProps={{ min: 0.01, step: 0.01, style: { fontFamily: '"IBM Plex Mono", monospace' } }}
            />
          )}

          <Button
            variant="contained"
            size="small"
            fullWidth
            onClick={handleSubmit}
            disabled={!enabled || mutation.isPending}
            color={side === 'buy' ? 'secondary' : 'error'}
            startIcon={mutation.isPending ? <CircularProgress size={14} /> : undefined}
            sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700, letterSpacing: '0.06em' }}
          >
            {mutation.isPending ? 'Submitting…' : `${side.toUpperCase()} ${symbol || '—'}`}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ── Positions table ────────────────────────────────────────────────────────────

function PositionsTable({ state }: { state: LiveTradingState }) {
  if (!state.alpaca_enabled) return null

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardHeader
        title="Open Positions"
        titleTypographyProps={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.04em' }}
      />
      <Divider />
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Symbol', 'Qty', 'Avg Entry', 'Price', 'Mkt Value', 'P&L', 'P&L %'].map((h) => (
                <TableCell key={h} sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.72rem', py: 0.75 }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {state.positions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', color: 'text.disabled', py: 3, fontSize: '0.8rem' }}>
                  No open positions
                </TableCell>
              </TableRow>
            ) : state.positions.map((p) => {
              const pnlColor = p.unrealized_pnl >= 0 ? 'secondary.main' : 'error.main'
              return (
                <TableRow key={p.symbol} hover>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700, color: 'primary.main', fontSize: '0.8rem' }}>
                    {p.symbol}
                  </TableCell>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.78rem' }}>{p.qty}</TableCell>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.78rem' }}>${p.avg_entry.toFixed(2)}</TableCell>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.78rem' }}>${p.current_price.toFixed(2)}</TableCell>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.78rem' }}>${p.market_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</TableCell>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.78rem', color: pnlColor }}>
                    {p.unrealized_pnl >= 0 ? '+' : ''}${p.unrealized_pnl.toFixed(2)}
                  </TableCell>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.78rem', color: pnlColor }}>
                    {p.unrealized_pnl_pct >= 0 ? '+' : ''}{p.unrealized_pnl_pct.toFixed(2)}%
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  )
}

// ── Status chip helper ─────────────────────────────────────────────────────────

function StatusChip({ status }: { status: LiveOrder['status'] }) {
  const colorMap: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    filled:   'success',
    accepted: 'warning',
    pending:  'default',
    canceled: 'default',
    rejected: 'error',
  }
  return (
    <Chip
      label={status}
      size="small"
      color={colorMap[status] ?? 'default'}
      variant="outlined"
      sx={{ fontSize: '0.65rem', fontFamily: '"IBM Plex Mono", monospace' }}
    />
  )
}

// ── Order history table ────────────────────────────────────────────────────────

function OrderHistory({
  orders,
  onCancel,
  onSync,
}: {
  orders:   LiveOrder[]
  onCancel: (id: number) => void
  onSync:   (id: number) => void
}) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Symbol', 'Side', 'Type', 'Qty', 'Filled', 'Status', 'Avg Price', 'Time', 'Actions'].map((h) => (
              <TableCell key={h} sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.72rem', py: 0.75 }}>
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} sx={{ textAlign: 'center', color: 'text.disabled', py: 3, fontSize: '0.8rem' }}>
                No orders yet
              </TableCell>
            </TableRow>
          ) : orders.map((o) => {
            const sideColor = o.side === 'buy' ? 'secondary.main' : 'error.main'
            const canCancel = o.status === 'accepted' || o.status === 'pending'
            return (
              <TableRow key={o.id} hover>
                <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700, color: 'primary.main', fontSize: '0.78rem' }}>
                  {o.symbol}
                </TableCell>
                <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, fontSize: '0.78rem', color: sideColor }}>
                  {o.side.toUpperCase()}
                </TableCell>
                <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.72rem', color: 'text.secondary' }}>
                  {o.order_type}
                </TableCell>
                <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.78rem' }}>
                  {o.qty}
                </TableCell>
                <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.78rem', color: 'text.secondary' }}>
                  {o.filled_qty}/{o.qty}
                </TableCell>
                <TableCell><StatusChip status={o.status} /></TableCell>
                <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.78rem' }}>
                  {o.filled_avg_price ? `$${o.filled_avg_price.toFixed(2)}` : '—'}
                </TableCell>
                <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.7rem', color: 'text.secondary' }}>
                  {new Date(o.submitted_at).toLocaleTimeString()}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Sync status from Alpaca">
                      <IconButton size="small" onClick={() => onSync(o.id)} sx={{ color: 'text.secondary' }}>
                        <SyncIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                    {canCancel && (
                      <Tooltip title="Cancel order">
                        <IconButton size="small" color="error" onClick={() => onCancel(o.id)}>
                          <CancelIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LiveTrading() {
  const queryClient = useQueryClient()
  const [cancelError, setCancelError] = useState<string | null>(null)

  const { data: state, isLoading, refetch, isFetching } = useQuery({
    queryKey:       ['live-state'],
    queryFn:        api.live.getState,
    refetchInterval: 5_000,
    retry:           1,
  })

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['live-state'] })
  }, [queryClient])

  const handleCancel = useCallback(async (orderId: number) => {
    setCancelError(null)
    try {
      await api.live.cancelOrder(orderId)
      invalidate()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? 'Cancel failed'
      setCancelError(msg)
    }
  }, [invalidate])

  const handleSync = useCallback(async (orderId: number) => {
    try {
      await api.live.syncOrder(orderId)
      invalidate()
    } catch {
      // silently ignore — stale data is acceptable
    }
  }, [invalidate])

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={600}>
          Live Trading
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => refetch()} disabled={isFetching}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {cancelError && (
        <Alert severity="error" onClose={() => setCancelError(null)} sx={{ mb: 2 }}>
          {cancelError}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Mode banner */}
          <ModeBanner state={state} />

          {/* Account summary */}
          {state && <AccountRow state={state} />}

          {/* Order entry + Positions (side by side) */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <Box sx={{ width: { xs: '100%', md: 260 }, flexShrink: 0 }}>
              <OrderEntry enabled={!!state?.alpaca_enabled} onSubmitted={invalidate} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {state && <PositionsTable state={state} />}
            </Box>
          </Stack>

          {/* Order history */}
          <Card>
            <CardHeader
              title="Order History"
              titleTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }}
              action={
                <Tooltip title="Refresh">
                  <IconButton size="small" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
            />
            <Divider />
            <OrderHistory
              orders={state?.orders ?? []}
              onCancel={handleCancel}
              onSync={handleSync}
            />
          </Card>
        </>
      )}
    </Box>
  )
}
