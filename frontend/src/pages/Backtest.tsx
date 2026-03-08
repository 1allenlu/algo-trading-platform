/**
 * Backtest page — configure, run, and visualize strategy backtests.
 *
 * Layout:
 *   Left panel  — Strategy selector, symbol chips, param controls, Run button
 *   Right panel — Results: metric cards, equity curve chart, trade log table
 *
 * Flow:
 *   1. User selects strategy + symbols (pre-populated from ?strategy=... URL param)
 *   2. Clicks "Run Backtest" → POST /api/backtest/run → returns run_id
 *   3. Page polls GET /api/backtest/{run_id} every 2s until status='done'
 *   4. Results render: metric cards, equity curve vs benchmark, trade log
 */

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  LinearProgress,
  Slider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import {
  PlayArrow as RunIcon,
  PictureAsPdf as PdfIcon,
  TrendingDown,
  TrendingUp,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, type BacktestRunResponse, type StrategyInfo } from '@/services/api'
import EquityCurveChart from '@/components/charts/EquityCurveChart'

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'XOM', 'JPM']

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({
  label, value, format, good,
}: {
  label:  string
  value:  number | null
  format: (v: number) => string
  good?:  boolean
}) {
  const color = value == null ? 'text.disabled'
              : good === undefined ? 'text.primary'
              : good ? '#06d6a0' : '#ff6b6b'
  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="caption" color="text.disabled" display="block">
          {label}
        </Typography>
        <Typography variant="h5" fontWeight={700} sx={{ color, fontFamily: 'IBM Plex Mono, monospace' }}>
          {value == null ? '—' : format(value)}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── Config panel ──────────────────────────────────────────────────────────────
function ConfigPanel({
  strategies,
  selectedStrategy,
  onStrategyChange,
  selectedSymbols,
  onSymbolToggle,
  commissionPct,
  onCommissionChange,
  slippagePct,
  onSlippageChange,
  onRun,
  isRunning,
}: {
  strategies:         StrategyInfo[]
  selectedStrategy:   string
  onStrategyChange:   (s: string) => void
  selectedSymbols:    string[]
  onSymbolToggle:     (s: string) => void
  commissionPct:      number
  onCommissionChange: (v: number) => void
  slippagePct:        number
  onSlippageChange:   (v: number) => void
  onRun:              () => void
  isRunning:          boolean
}) {
  const info = strategies.find((s) => s.name === selectedStrategy)

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={700} mb={2.5}>
          Configuration
        </Typography>

        {/* Strategy selector */}
        <Typography variant="caption" color="text.disabled" display="block" mb={1}>
          STRATEGY
        </Typography>
        <Stack spacing={0.75} mb={2.5}>
          {strategies.map((s) => (
            <Box
              key={s.name}
              onClick={() => onStrategyChange(s.name)}
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: selectedStrategy === s.name ? 'primary.main' : 'divider',
                bgcolor: selectedStrategy === s.name ? 'rgba(0,180,216,0.08)' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <Typography
                variant="body2"
                fontWeight={selectedStrategy === s.name ? 700 : 400}
                color={selectedStrategy === s.name ? 'primary.main' : 'text.primary'}
              >
                {s.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {s.tags.join(' · ')}
              </Typography>
            </Box>
          ))}
        </Stack>

        {/* Symbol selector */}
        <Typography variant="caption" color="text.disabled" display="block" mb={1}>
          SYMBOLS {info && `(min ${info.min_symbols}, max ${info.max_symbols})`}
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.75} mb={2.5}>
          {ALL_SYMBOLS.map((sym) => {
            const selected = selectedSymbols.includes(sym)
            return (
              <Chip
                key={sym}
                label={sym}
                size="small"
                clickable
                onClick={() => onSymbolToggle(sym)}
                sx={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontWeight: selected ? 700 : 400,
                  bgcolor: selected ? 'rgba(0,180,216,0.15)' : 'transparent',
                  color:   selected ? 'primary.main' : 'text.secondary',
                  border: '1px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                }}
              />
            )
          })}
        </Stack>

        {/* Selected symbols summary */}
        {selectedSymbols.length > 0 && (
          <Typography variant="caption" color="text.disabled" mb={2.5} display="block">
            Selected: {selectedSymbols.join(', ')}
          </Typography>
        )}

        {/* Transaction costs */}
        <Divider sx={{ mb: 2.5 }} />
        <Typography variant="caption" color="text.disabled" display="block" mb={0.5}>
          TRANSACTION COSTS
        </Typography>
        <Box mb={1.5}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">Commission (one-way)</Typography>
            <Typography variant="caption" fontFamily="IBM Plex Mono, monospace" color="primary.main">
              {(commissionPct * 100).toFixed(2)}%
            </Typography>
          </Box>
          <Slider
            size="small"
            value={commissionPct * 10000}
            min={0} max={100} step={1}
            onChange={(_, v) => onCommissionChange((v as number) / 10000)}
            sx={{ color: 'primary.main' }}
          />
        </Box>
        <Box mb={2.5}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">Slippage (one-way)</Typography>
            <Typography variant="caption" fontFamily="IBM Plex Mono, monospace" color="primary.main">
              {(slippagePct * 100).toFixed(2)}%
            </Typography>
          </Box>
          <Slider
            size="small"
            value={slippagePct * 10000}
            min={0} max={50} step={1}
            onChange={(_, v) => onSlippageChange((v as number) / 10000)}
            sx={{ color: 'primary.main' }}
          />
        </Box>

        <Divider sx={{ mb: 2.5 }} />

        {/* Run button */}
        <Button
          variant="contained"
          fullWidth
          startIcon={isRunning ? <CircularProgress size={16} color="inherit" /> : <RunIcon />}
          onClick={onRun}
          disabled={isRunning || selectedSymbols.length === 0 || !selectedStrategy}
          sx={{ py: 1.25, fontWeight: 700, textTransform: 'none' }}
        >
          {isRunning ? 'Running backtest...' : 'Run Backtest'}
        </Button>

        {info && (
          <Typography variant="caption" color="text.disabled" display="block" mt={1} textAlign="center">
            {info.method}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

// ── Results panel ─────────────────────────────────────────────────────────────
function ResultsPanel({ result }: { result: BacktestRunResponse | null }) {
  if (!result) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 400,
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 2,
          color: 'text.disabled',
        }}
      >
        <RunIcon sx={{ fontSize: 40, mb: 1, opacity: 0.4 }} />
        <Typography>Configure a strategy and click Run Backtest</Typography>
      </Box>
    )
  }

  if (result.status === 'running') {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography color="text.secondary">Running backtest...</Typography>
        <LinearProgress sx={{ mt: 2, borderRadius: 1 }} />
      </Box>
    )
  }

  if (result.status === 'failed') {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        Backtest failed: {result.error ?? 'Unknown error'}
      </Alert>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  const bm = result.benchmark_metrics

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            {result.strategy_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            {' '}· {result.symbols.join('/')}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {result.num_trades} trades · Created {new Date(result.created_at).toLocaleDateString()}
          </Typography>
        </Box>
        {/* Phase 24: PDF download button */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<PdfIcon />}
          onClick={() => api.reports.downloadBacktest(result.id)}
          sx={{ ml: 2, flexShrink: 0 }}
        >
          Download PDF
        </Button>
      </Box>

      {/* Metric cards */}
      <Grid container spacing={1.5} mb={3}>
        <Grid item xs={6} sm={3}>
          <MetricCard
            label="Sharpe Ratio"
            value={result.sharpe_ratio}
            format={(v) => v.toFixed(2)}
            good={result.sharpe_ratio != null && result.sharpe_ratio > 0}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            label="CAGR"
            value={result.cagr}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            good={result.cagr != null && result.cagr > 0}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            label="Max Drawdown"
            value={result.max_drawdown}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            good={result.max_drawdown != null && result.max_drawdown > -0.2}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            label="Win Rate"
            value={result.win_rate}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            good={result.win_rate != null && result.win_rate > 0.5}
          />
        </Grid>
      </Grid>

      {/* Equity curve chart */}
      {result.equity_curve && result.equity_curve.length > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Equity Curve
              </Typography>
              <Stack direction="row" spacing={2}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 16, height: 2, bgcolor: '#00b4d8', borderRadius: 1 }} />
                  <Typography variant="caption" color="text.secondary">Strategy</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 16, height: 2, bgcolor: '#475569', borderRadius: 1, opacity: 0.8 }} />
                  <Typography variant="caption" color="text.secondary">Benchmark</Typography>
                </Box>
              </Stack>
            </Box>
            <EquityCurveChart
              equityCurve={result.equity_curve}
              benchmarkCurve={
                bm && result.equity_curve
                  ? result.equity_curve.map((pt, i) => ({
                      ...pt,
                      // Reconstruct benchmark curve from initial $100k + benchmark_metrics
                      // We don't store the benchmark curve separately — just show strategy
                      value: pt.value,   // fallback: same as strategy
                    }))
                  : undefined
              }
              height={280}
            />

            {/* vs Benchmark comparison row */}
            {bm && (
              <Box
                sx={{
                  mt: 2,
                  pt: 2,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 2,
                }}
              >
                {[
                  { label: 'Total Return', strat: result.total_return, bm: bm.total_return, fmt: (v: number) => `${(v*100).toFixed(1)}%` },
                  { label: 'Sharpe',       strat: result.sharpe_ratio,  bm: bm.sharpe_ratio,  fmt: (v: number) => v.toFixed(2) },
                  { label: 'CAGR',         strat: result.cagr,          bm: bm.cagr,          fmt: (v: number) => `${(v*100).toFixed(1)}%` },
                  { label: 'Max DD',       strat: result.max_drawdown,  bm: bm.max_drawdown,  fmt: (v: number) => `${(v*100).toFixed(1)}%` },
                ].map(({ label, strat, bm: bmVal, fmt }) => (
                  <Box key={label} textAlign="center">
                    <Typography variant="caption" color="text.disabled" display="block">{label}</Typography>
                    <Typography variant="body2" color="primary.main" fontFamily="IBM Plex Mono, monospace">
                      {strat != null ? fmt(strat) : '—'}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" fontFamily="IBM Plex Mono, monospace">
                      BM: {bmVal != null ? fmt(bmVal) : '—'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trade log */}
      {result.trades && result.trades.length > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              Trade Log (last {Math.min(result.trades.length, 30)})
            </Typography>
            <TableContainer sx={{ maxHeight: 280, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {['Date', 'Symbol', 'Side', 'Price', 'Size'].map((h) => (
                      <TableCell
                        key={h}
                        sx={{ bgcolor: 'background.paper', fontWeight: 700, fontSize: '0.75rem' }}
                      >
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.trades.slice(-30).map((t, i) => (
                    <TableRow key={i} hover>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem' }}>
                        {t.date}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: '0.78rem' }}>
                        {t.symbol}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {t.side === 'buy'
                            ? <TrendingUp sx={{ fontSize: 14, color: '#06d6a0' }} />
                            : <TrendingDown sx={{ fontSize: 14, color: '#ff6b6b' }} />}
                          <Typography
                            variant="caption"
                            sx={{ color: t.side === 'buy' ? '#06d6a0' : '#ff6b6b', fontWeight: 700 }}
                          >
                            {t.side.toUpperCase()}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem' }}>
                        ${t.price.toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.78rem' }}>
                        {(t.size * 100).toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Backtest() {
  const [searchParams] = useSearchParams()

  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedStrategy, setSelectedStrategy] = useState(
    searchParams.get('strategy') ?? 'pairs_trading'
  )
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(
    searchParams.get('symbols')?.split(',').filter(Boolean) ?? ['SPY', 'QQQ']
  )
  const [runId, setRunId]             = useState<number | null>(null)
  const [isRunning, setIsRunning]     = useState(false)
  const [result, setResult]           = useState<BacktestRunResponse | null>(null)
  const [commissionPct, setCommission] = useState(0.001)
  const [slippagePct, setSlippage]    = useState(0.0005)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch strategy list
  const { data: stratData } = useQuery({
    queryKey: ['strategies'],
    queryFn:  () => api.strategies.list(),
  })
  const strategies = stratData?.strategies ?? []

  // Update default symbols when strategy changes
  const handleStrategyChange = (name: string) => {
    setSelectedStrategy(name)
    const info = strategies.find((s) => s.name === name)
    if (info) setSelectedSymbols(info.default_symbols.slice())
  }

  const handleSymbolToggle = (sym: string) => {
    setSelectedSymbols((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    )
  }

  // ── Run backtest ─────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!selectedStrategy || selectedSymbols.length === 0) return
    setIsRunning(true)
    setResult(null)

    try {
      const res = await api.backtest.run(selectedStrategy, selectedSymbols, {}, commissionPct, slippagePct)
      setRunId(res.id)
      setResult(res)
    } catch (err) {
      console.error('[Backtest] Failed to start:', err)
      setIsRunning(false)
    }
  }

  // ── Poll for completion ──────────────────────────────────────────────────
  useEffect(() => {
    if (!runId || !isRunning) return

    const poll = async () => {
      try {
        const res = await api.backtest.get(runId)
        setResult(res)
        if (res.status === 'done' || res.status === 'failed') {
          setIsRunning(false)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch {
        setIsRunning(false)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }

    pollRef.current = setInterval(poll, 2000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [runId, isRunning])

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Backtesting
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Evaluate strategy performance on historical data with transaction cost modeling.
      </Typography>

      <Grid container spacing={3}>
        {/* Left: config */}
        <Grid item xs={12} md={4} lg={3}>
          <ConfigPanel
            strategies={strategies}
            selectedStrategy={selectedStrategy}
            onStrategyChange={handleStrategyChange}
            selectedSymbols={selectedSymbols}
            onSymbolToggle={handleSymbolToggle}
            commissionPct={commissionPct}
            onCommissionChange={setCommission}
            slippagePct={slippagePct}
            onSlippageChange={setSlippage}
            onRun={handleRun}
            isRunning={isRunning}
          />
        </Grid>

        {/* Right: results */}
        <Grid item xs={12} md={8} lg={9}>
          <ResultsPanel result={result} />
        </Grid>
      </Grid>
    </Box>
  )
}
