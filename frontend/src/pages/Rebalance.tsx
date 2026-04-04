/**
 * Rebalance page — compare current portfolio allocation vs your target,
 * then execute the suggested BUY / SELL orders in one click.
 *
 * Target allocations are stored in localStorage under 'qs_targets'.
 * Users can edit target % for each held position, and the page computes
 * how many shares to buy or sell to hit those targets.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Snackbar,
  Stack,
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
  AccountBalance as RebalanceIcon,
  Check as CheckIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, PaperPosition } from '@/services/api'
import EmptyState from '@/components/common/EmptyState'

const TARGETS_KEY = 'qs_targets'

function loadTargets(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TARGETS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveTargets(t: Record<string, number>) {
  localStorage.setItem(TARGETS_KEY, JSON.stringify(t))
}

interface RebalanceRow {
  symbol:        string
  qty:           number
  currentPrice:  number
  marketValue:   number
  currentPct:    number    // % of total portfolio
  targetPct:     number    // user-defined target %
  diffPct:       number    // targetPct - currentPct
  suggestedQty:  number    // positive = buy, negative = sell
  suggestedValue: number
}

export default function RebalancePage() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const [targets,    setTargets]    = useState<Record<string, number>>(loadTargets)
  const [editSym,    setEditSym]    = useState<string | null>(null)
  const [editVal,    setEditVal]    = useState('')
  const [executing,  setExecuting]  = useState<string | null>(null)
  const [toast,      setToast]      = useState('')
  const [toastSev,   setToastSev]   = useState<'success' | 'error'>('success')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingOrders, setPendingOrders] = useState<RebalanceRow[]>([])

  const { data: state, isLoading, refetch } = useQuery({
    queryKey:  ['paper-state'],
    queryFn:   api.paper.getState,
    staleTime: 10_000,
  })

  // Persist target changes
  useEffect(() => { saveTargets(targets) }, [targets])

  const positions: PaperPosition[] = state?.positions ?? []
  const totalValue = positions.reduce((sum, p) => sum + p.market_value, 0)

  // Build rows — for each position, compute current %, target %, and suggested trade
  const rows: RebalanceRow[] = positions.map((p) => {
    const currentPct = totalValue > 0 ? (p.market_value / totalValue) * 100 : 0
    const targetPct  = targets[p.symbol] ?? currentPct   // default: no change
    const diffPct    = targetPct - currentPct
    const targetValue = (targetPct / 100) * totalValue
    const valueDiff   = targetValue - p.market_value
    const suggestedQty = p.current_price > 0 ? Math.round(valueDiff / p.current_price) : 0

    return {
      symbol:         p.symbol,
      qty:            p.qty,
      currentPrice:   p.current_price,
      marketValue:    p.market_value,
      currentPct,
      targetPct,
      diffPct,
      suggestedQty,
      suggestedValue: suggestedQty * p.current_price,
    }
  })

  const totalTargetPct = rows.reduce((sum, r) => sum + r.targetPct, 0)
  const hasChanges     = rows.some((r) => r.suggestedQty !== 0)

  const handleEditOpen  = (sym: string, current: number) => {
    setEditSym(sym)
    setEditVal(current.toFixed(1))
  }
  const handleEditSave  = () => {
    if (!editSym) return
    const val = parseFloat(editVal)
    if (!isNaN(val) && val >= 0 && val <= 100) {
      setTargets((prev) => ({ ...prev, [editSym]: val }))
    }
    setEditSym(null)
  }

  const handleRebalanceAll = () => {
    const orders = rows.filter((r) => r.suggestedQty !== 0)
    setPendingOrders(orders)
    setConfirmOpen(true)
  }

  const executeOrders = async () => {
    setConfirmOpen(false)
    for (const row of pendingOrders) {
      if (row.suggestedQty === 0) continue
      setExecuting(row.symbol)
      try {
        const side = row.suggestedQty > 0 ? 'buy' : 'sell'
        const qty  = Math.abs(row.suggestedQty)
        await api.paper.submitOrder({ symbol: row.symbol, side, qty, order_type: 'market' })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Order failed'
        setToast(`${row.symbol}: ${msg}`)
        setToastSev('error')
        setExecuting(null)
        return
      }
    }
    setExecuting(null)
    queryClient.invalidateQueries({ queryKey: ['paper-state'] })
    setToast('Rebalance orders submitted!')
    setToastSev('success')
  }

  const handleSingleOrder = async (row: RebalanceRow) => {
    if (row.suggestedQty === 0) return
    setExecuting(row.symbol)
    try {
      const side = row.suggestedQty > 0 ? 'buy' : 'sell'
      const qty  = Math.abs(row.suggestedQty)
      await api.paper.submitOrder({ symbol: row.symbol, side, qty, order_type: 'market' })
      queryClient.invalidateQueries({ queryKey: ['paper-state'] })
      setToast(`${row.symbol} order submitted`)
      setToastSev('success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Order failed'
      setToast(`Failed: ${msg}`)
      setToastSev('error')
    } finally {
      setExecuting(null)
    }
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Portfolio Rebalance</Typography>
          <Typography variant="body2" color="text.secondary">
            Set target allocations for each position — the platform calculates what to buy or sell
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title="Refresh positions">
            <IconButton size="small" onClick={() => refetch()}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {hasChanges && (
            <Button
              variant="contained"
              size="small"
              startIcon={<RebalanceIcon />}
              onClick={handleRebalanceAll}
              disabled={!!executing}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Rebalance All
            </Button>
          )}
        </Box>
      </Box>

      {/* Summary bar */}
      {positions.length > 0 && (
        <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Card sx={{ px: 2, py: 1, border: '1px solid', borderColor: 'divider', minWidth: 160 }}>
            <Typography variant="caption" color="text.secondary">Portfolio Value</Typography>
            <Typography variant="h6" fontWeight={700}>${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Typography>
          </Card>
          <Card sx={{ px: 2, py: 1, border: '1px solid', borderColor: 'divider', minWidth: 160 }}>
            <Typography variant="caption" color="text.secondary">Positions</Typography>
            <Typography variant="h6" fontWeight={700}>{positions.length}</Typography>
          </Card>
          <Card sx={{
            px: 2, py: 1,
            border: '1px solid',
            borderColor: Math.abs(totalTargetPct - 100) > 1 ? 'warning.main' : 'divider',
            minWidth: 160,
          }}>
            <Typography variant="caption" color="text.secondary">Total Target %</Typography>
            <Typography variant="h6" fontWeight={700}
              sx={{ color: Math.abs(totalTargetPct - 100) > 1 ? 'warning.main' : 'text.primary' }}>
              {totalTargetPct.toFixed(1)}%
            </Typography>
          </Card>
          {Math.abs(totalTargetPct - 100) > 1 && (
            <Alert severity="warning" sx={{ alignSelf: 'center', py: 0 }}>
              Target allocations add up to {totalTargetPct.toFixed(1)}% — adjust to sum to 100%
            </Alert>
          )}
        </Stack>
      )}

      {/* Table */}
      {positions.length === 0 ? (
        <EmptyState
          icon={<RebalanceIcon sx={{ fontSize: 56 }} />}
          title="No open positions"
          description="Open some paper trades on the Trading page, then come back to rebalance your portfolio."
          actionLabel="Go to Trading"
          onAction={() => navigate('/trading')}
        />
      ) : (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 700 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                    {['Symbol', 'Price', 'Market Value', 'Current %', 'Target %', 'Allocation Bar', 'Suggested Trade', 'Action'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const isExec   = executing === row.symbol
                    const isBuy    = row.suggestedQty > 0
                    const isSell   = row.suggestedQty < 0
                    const noChange = row.suggestedQty === 0

                    return (
                      <TableRow key={row.symbol} hover>
                        <TableCell sx={{ fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: 'primary.main' }}>
                          {row.symbol}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem' }}>
                          ${row.currentPrice.toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem' }}>
                          ${row.marketValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem' }}>
                          {row.currentPct.toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.82rem', minWidth: 40 }}>
                              {row.targetPct.toFixed(1)}%
                            </Typography>
                            <IconButton size="small" onClick={() => handleEditOpen(row.symbol, row.targetPct)}
                              sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' }, p: 0.25 }}>
                              <EditIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ minWidth: 120 }}>
                          <Box sx={{ position: 'relative' }}>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(row.currentPct, 100)}
                              sx={{
                                height: 6, borderRadius: 3,
                                bgcolor: 'rgba(255,255,255,0.06)',
                                '& .MuiLinearProgress-bar': { bgcolor: '#4A9EFF', borderRadius: 3 },
                              }}
                            />
                            {/* Target marker */}
                            <Box sx={{
                              position: 'absolute',
                              top: -2, bottom: -2,
                              left: `${Math.min(row.targetPct, 100)}%`,
                              width: 2,
                              bgcolor: row.diffPct > 1 ? '#00C896' : row.diffPct < -1 ? '#FF6B6B' : '#F59E0B',
                              borderRadius: 1,
                            }} />
                          </Box>
                          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block' }}>
                            {row.diffPct > 0 ? '+' : ''}{row.diffPct.toFixed(1)}% to target
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {noChange ? (
                            <Chip size="small" label="On target" icon={<CheckIcon />}
                              sx={{ fontSize: '0.7rem', bgcolor: 'rgba(0,200,150,0.12)', color: '#00C896' }} />
                          ) : (
                            <Box>
                              <Chip
                                size="small"
                                label={`${isBuy ? 'BUY' : 'SELL'} ${Math.abs(row.suggestedQty)} shares`}
                                sx={{
                                  fontSize: '0.7rem', fontWeight: 700,
                                  bgcolor: isBuy ? 'rgba(0,200,150,0.12)' : 'rgba(255,107,107,0.12)',
                                  color:   isBuy ? '#00C896' : '#FF6B6B',
                                }}
                              />
                              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
                                ≈ ${Math.abs(row.suggestedValue).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                              </Typography>
                            </Box>
                          )}
                        </TableCell>
                        <TableCell>
                          {!noChange && (
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleSingleOrder(row)}
                              disabled={!!executing}
                              sx={{
                                textTransform: 'none',
                                fontSize: '0.72rem',
                                color:        isBuy ? '#00C896' : '#FF6B6B',
                                borderColor:  isBuy ? '#00C89644' : '#FF6B6B44',
                                '&:hover': {
                                  borderColor: isBuy ? '#00C896' : '#FF6B6B',
                                  bgcolor:     isBuy ? 'rgba(0,200,150,0.08)' : 'rgba(255,107,107,0.08)',
                                },
                              }}
                            >
                              {isExec ? <CircularProgress size={14} /> : (isBuy ? 'Buy' : 'Sell')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Edit target dialog */}
      <Dialog open={!!editSym} onClose={() => setEditSym(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Set Target for {editSym}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Target allocation (%)"
            type="number"
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
            inputProps={{ min: 0, max: 100, step: 0.5 }}
            sx={{ mt: 1 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Enter the % of total portfolio you want in {editSym}. All targets should sum to 100%.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditSym(null)}>Cancel</Button>
          <Button onClick={handleEditSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm rebalance dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Rebalance</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The following market orders will be submitted:
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Symbol</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Qty</TableCell>
                <TableCell>Est. Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pendingOrders.map((row) => (
                <TableRow key={row.symbol}>
                  <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>{row.symbol}</TableCell>
                  <TableCell sx={{ color: row.suggestedQty > 0 ? '#00C896' : '#FF6B6B', fontWeight: 700 }}>
                    {row.suggestedQty > 0 ? 'BUY' : 'SELL'}
                  </TableCell>
                  <TableCell>{Math.abs(row.suggestedQty)}</TableCell>
                  <TableCell>${Math.abs(row.suggestedValue).toLocaleString('en-US', { maximumFractionDigits: 0 })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={executeOrders} variant="contained" color="primary">Execute All</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toastSev} onClose={() => setToast('')} sx={{ width: '100%' }}>
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  )
}
