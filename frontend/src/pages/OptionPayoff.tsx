/**
 * Options Payoff Diagram — Phase 59.
 *
 * Visualises P&L at expiry for common single-leg and multi-leg strategies:
 *   Long Call, Long Put, Covered Call, Cash-Secured Put,
 *   Straddle, Strangle, Bull Call Spread, Bear Put Spread, Iron Condor.
 *
 * Pure frontend math — no backend API calls needed.
 */

import { useMemo, useState } from 'react'
import {
  Box, Card, CardContent, Chip, Grid, InputAdornment,
  MenuItem, Select, Slider, TextField, Typography,
} from '@mui/material'
import {
  Area, AreaChart, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

// ── Strategy definitions ──────────────────────────────────────────────────────

type Strategy =
  | 'long_call' | 'long_put' | 'short_call' | 'short_put'
  | 'covered_call' | 'csp'
  | 'straddle' | 'strangle'
  | 'bull_call_spread' | 'bear_put_spread'
  | 'iron_condor'

const STRATEGIES: { value: Strategy; label: string; category: string }[] = [
  { value: 'long_call',       label: 'Long Call',          category: 'Single Leg' },
  { value: 'long_put',        label: 'Long Put',           category: 'Single Leg' },
  { value: 'short_call',      label: 'Short Call',         category: 'Single Leg' },
  { value: 'short_put',       label: 'Short Put (CSP)',    category: 'Single Leg' },
  { value: 'covered_call',    label: 'Covered Call',       category: 'Income' },
  { value: 'csp',             label: 'Cash-Secured Put',   category: 'Income' },
  { value: 'straddle',        label: 'Long Straddle',      category: 'Volatility' },
  { value: 'strangle',        label: 'Long Strangle',      category: 'Volatility' },
  { value: 'bull_call_spread',label: 'Bull Call Spread',   category: 'Spread' },
  { value: 'bear_put_spread', label: 'Bear Put Spread',    category: 'Spread' },
  { value: 'iron_condor',     label: 'Iron Condor',        category: 'Spread' },
]

// ── P&L calculators ───────────────────────────────────────────────────────────

function pnl(strategy: Strategy, S: number, params: Record<string, number>): number {
  const { K, premium, K2, premium2, kLow, kHigh, kLongPut, kLongCall, stock } = params
  switch (strategy) {
    case 'long_call':   return Math.max(S - K, 0) - premium
    case 'long_put':    return Math.max(K - S, 0) - premium
    case 'short_call':  return premium - Math.max(S - K, 0)
    case 'short_put':   return premium - Math.max(K - S, 0)
    case 'covered_call':
      return (S - stock) + premium - Math.max(S - K, 0)
    case 'csp':
      return premium - Math.max(K - S, 0)
    case 'straddle':
      return Math.max(S - K, 0) + Math.max(K - S, 0) - premium
    case 'strangle':
      return Math.max(S - K2, 0) + Math.max(K - S, 0) - premium
    case 'bull_call_spread':
      return Math.max(S - K, 0) - Math.max(S - K2, 0) - premium
    case 'bear_put_spread':
      return Math.max(K - S, 0) - Math.max(K2 - S, 0) - premium
    case 'iron_condor': {
      const shortPut  = (kLow    || K)  - 3
      const longPut   = kLongPut  || shortPut  - 5
      const shortCall = (kHigh   || K2) + 3
      const longCall  = kLongCall || shortCall + 5
      return (
        premium
        - Math.max(shortPut - S, 0) + Math.max(longPut - S, 0)
        - Math.max(S - shortCall, 0) + Math.max(S - longCall, 0)
      )
    }
    default: return 0
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OptionPayoffPage() {
  const [strategy, setStrategy] = useState<Strategy>('long_call')
  const [underlying, setUnderlying] = useState(450)
  const [strike, setStrike]     = useState(450)
  const [strike2, setStrike2]   = useState(460)
  const [premium, setPremium]   = useState(8)
  const [premium2, setPremium2] = useState(5)
  const [stockCost, setStockCost] = useState(445)

  const params = {
    K: strike, K2: strike2, premium: premium + premium2,
    kLow: strike, kHigh: strike2,
    kLongPut: strike - 5, kLongCall: strike2 + 5,
    stock: stockCost,
  }

  const chartData = useMemo(() => {
    const range = underlying * 0.3
    const lo = Math.max(1, underlying - range)
    const hi = underlying + range
    const step = (hi - lo) / 120
    const data = []
    for (let s = lo; s <= hi; s += step) {
      const p = pnl(strategy, s, params)
      data.push({ price: +s.toFixed(2), pnl: +p.toFixed(2) })
    }
    return data
  }, [strategy, underlying, strike, strike2, premium, premium2, stockCost])

  const maxLoss = Math.min(...chartData.map(d => d.pnl))
  const maxGain = Math.max(...chartData.map(d => d.pnl))
  const breakevens = chartData
    .filter((d, i) => i > 0 && chartData[i-1].pnl * d.pnl <= 0)
    .map(d => d.price)

  const needsStrike2 = ['strangle','bull_call_spread','bear_put_spread','iron_condor','straddle'].includes(strategy)
  const needsPremium2 = ['strangle','bull_call_spread','bear_put_spread'].includes(strategy)
  const needsStock = strategy === 'covered_call'

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Options Payoff Diagram</Typography>
        <Typography variant="body2" color="text.secondary">
          Visualise P&L at expiry for options strategies. Adjust parameters to see breakeven points and max profit/loss.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>Strategy Parameters</Typography>

              <Box mb={2}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Strategy</Typography>
                <Select fullWidth size="small" value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
                  {STRATEGIES.map((s) => (
                    <MenuItem key={s.value} value={s.value} sx={{ fontSize: '0.85rem' }}>
                      <Chip size="small" label={s.category} sx={{ mr: 1, fontSize: '0.6rem', height: 16 }} />
                      {s.label}
                    </MenuItem>
                  ))}
                </Select>
              </Box>

              {[
                { label: 'Underlying Price', value: underlying, set: setUnderlying },
                { label: needsStock ? 'Stock Purchase Cost' : 'Strike Price (K1)', value: needsStock ? stockCost : strike, set: needsStock ? setStockCost : setStrike },
                ...(needsStrike2 && strategy !== 'straddle' ? [{ label: 'Strike Price (K2)', value: strike2, set: setStrike2 }] : []),
                { label: 'Premium Paid / Received', value: premium, set: setPremium },
                ...(needsPremium2 ? [{ label: 'Premium (K2)', value: premium2, set: setPremium2 }] : []),
              ].map(({ label, value, set }) => (
                <Box key={label} mb={2}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="caption" fontFamily="IBM Plex Mono, monospace" fontWeight={700}>${value}</Typography>
                  </Box>
                  <Slider
                    value={value}
                    min={value > 100 ? Math.max(1, value - 100) : 1}
                    max={value > 100 ? value + 100 : 50}
                    step={0.5}
                    onChange={(_, v) => set(v as number)}
                    size="small"
                  />
                </Box>
              ))}

              <Box sx={{ mt: 2, p: 1.5, bgcolor: 'background.default', borderRadius: 1.5 }}>
                <Typography variant="caption" color="text.secondary" display="block">Max Profit</Typography>
                <Typography variant="h6" fontWeight={700} sx={{ color: maxGain > 0 ? '#00C896' : 'text.primary' }}>
                  {maxGain > 9998 ? 'Unlimited' : `$${maxGain.toFixed(2)}`}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" mt={1}>Max Loss</Typography>
                <Typography variant="h6" fontWeight={700} sx={{ color: '#FF6B6B' }}>
                  {maxLoss < -9998 ? 'Unlimited' : `$${maxLoss.toFixed(2)}`}
                </Typography>
                {breakevens.length > 0 && (
                  <>
                    <Typography variant="caption" color="text.secondary" display="block" mt={1}>Breakeven(s)</Typography>
                    <Typography variant="body2" fontFamily="IBM Plex Mono, monospace" fontWeight={700}>
                      {breakevens.map(b => `$${b.toFixed(2)}`).join(' / ')}
                    </Typography>
                  </>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>
                P&L at Expiry — {STRATEGIES.find(s => s.value === strategy)?.label}
              </Typography>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="gainGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#00C896" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00C896" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="lossGrad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="5%"  stopColor="#FF6B6B" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FF6B6B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="price" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={60} />
                  <ReferenceLine y={0} stroke="#4A9EFF" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Breakeven', position: 'right', fontSize: 10, fill: '#4A9EFF' }} />
                  <ReferenceLine x={underlying} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: 'Current', position: 'top', fontSize: 10, fill: '#F59E0B' }} />
                  <Tooltip
                    formatter={(v: number) => [`$${v.toFixed(2)}`, 'P&L']}
                    labelFormatter={(l) => `Price: $${l}`}
                    contentStyle={{ background: '#12161F', border: '1px solid #2D3548', fontSize: 12 }}
                  />
                  <Area
                    type="monotone" dataKey="pnl" stroke="#4A9EFF" strokeWidth={2}
                    fill="url(#gainGrad)" dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
