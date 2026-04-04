/**
 * Risk Management page — portfolio risk analysis and optimization.
 *
 * Layout:
 *   Config bar — Symbol selector (chips) + weight toggle + Analyze button
 *   Metric row — Portfolio VaR, Volatility, Sharpe, Max Drawdown
 *   Charts row — Correlation heatmap | Efficient frontier
 *   Table      — Per-asset risk breakdown
 *
 * Two API calls on "Analyze":
 *   1. GET /api/risk/analysis  → metrics + correlation matrix
 *   2. GET /api/risk/frontier  → efficient frontier + random portfolios
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
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { BarChart as RiskIcon, Search as AnalyzeIcon } from '@mui/icons-material'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EfficientFrontierResponse, MonteCarloResponse, PortfolioRiskResponse } from '@/services/api'
import { api } from '@/services/api'
import CorrelationHeatmap from '@/components/charts/CorrelationHeatmap'
import EfficientFrontierChart from '@/components/charts/EfficientFrontierChart'
import InfoTooltip from '@/components/common/InfoTooltip'
import LastUpdated from '@/components/common/LastUpdated'

// ── Constants ─────────────────────────────────────────────────────────────────

const AVAILABLE_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'JPM', 'XOM', 'GLD']

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({
  label, value, subtitle, tooltip, good,
}: { label: string; value: string; subtitle?: string; tooltip?: string; good?: boolean }) {
  const color = good === undefined ? 'text.primary' : good ? '#06d6a0' : '#ff6b6b'
  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="caption" color="text.disabled">
            {label}
          </Typography>
          {tooltip && <InfoTooltip text={tooltip} />}
        </Box>
        <Typography variant="h4" fontWeight={700} fontFamily="IBM Plex Mono, monospace"
          sx={{ color, lineHeight: 1.2 }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

// ── Per-asset table ───────────────────────────────────────────────────────────
function AssetTable({ data }: { data: PortfolioRiskResponse }) {
  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
          Risk Breakdown by Stock
        </Typography>
        <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <TableContainer>
            <Table size="small" sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>Symbol</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>Weight</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>Yearly Return</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>Yearly Swings</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>Risk-Adj. Return</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>Biggest Drop</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>Market Sensitivity</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>Max 1-Day Loss</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.assets.map((asset, i) => {
                  const w = data.weights[i] ?? 0
                  return (
                    <TableRow key={asset.symbol} hover>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                        {asset.symbol}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                        {(w * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell sx={{
                        fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem',
                        color: asset.annual_return >= 0 ? '#06d6a0' : '#ff6b6b',
                      }}>
                        {asset.annual_return >= 0 ? '+' : ''}{(asset.annual_return * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', display: { xs: 'none', sm: 'table-cell' } }}>
                        {(asset.annual_vol * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell sx={{
                        fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem',
                        color: asset.sharpe >= 1 ? '#06d6a0' : asset.sharpe >= 0 ? 'text.primary' : '#ff6b6b',
                        display: { xs: 'none', sm: 'table-cell' },
                      }}>
                        {asset.sharpe.toFixed(2)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: '#ff6b6b' }}>
                        {(asset.max_drawdown * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', display: { xs: 'none', sm: 'table-cell' } }}>
                        {asset.beta.toFixed(2)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: '#f77f00' }}>
                        {(asset.var_95 * 100).toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Monte Carlo fan chart ─────────────────────────────────────────────────────
function MonteCarloChart({ data }: { data: MonteCarloResponse }) {
  const { paths, stats } = data

  // Show every 5th day to keep chart responsive
  const chartData = paths.filter((_, i) => i % 5 === 0 || i === paths.length - 1)

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', mt: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>
              Future Return Simulator — {data.n_sims.toLocaleString()} Scenarios · {data.horizon_days}-Day Outlook
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Simulates thousands of possible futures based on past price behavior · Shaded bands show likely range of outcomes
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} flexWrap="wrap" justifyContent="flex-end">
            {[
              { label: 'Chance of Profit',  value: pct(stats.prob_profit),          good: stats.prob_profit > 0.5 },
              { label: 'Expected Return',   value: pct(stats.median_return),        good: stats.median_return > 0 },
              { label: 'Worst-Case Return', value: pct(stats.p5_return),            good: stats.p5_return > -0.1 },
              { label: 'Typical Max Drop',  value: pct(stats.median_max_drawdown),  good: stats.median_max_drawdown < 0.15 },
            ].map(({ label, value, good }) => (
              <Box key={label} sx={{ textAlign: 'right' }}>
                <Typography variant="caption" color="text.disabled" display="block">{label}</Typography>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  fontFamily="IBM Plex Mono, monospace"
                  sx={{ color: good ? '#06d6a0' : '#ff6b6b' }}
                >
                  {value}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="day"
              tickFormatter={(v) => `${v}d`}
              tick={{ fontSize: 10, fill: '#6B7280' }}
            />
            <YAxis
              tickFormatter={(v) => `${((v - 1) * 100).toFixed(0)}%`}
              tick={{ fontSize: 10, fill: '#6B7280' }}
              width={52}
            />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: '0.75rem' }}
              formatter={(v: number, name: string) => [
                `${((v - 1) * 100).toFixed(1)}%`,
                name.toUpperCase(),
              ]}
            />
            {/* P5–P95 outer band */}
            <Area dataKey="p5"  stroke="transparent" fill="transparent" />
            <Area dataKey="p95" stroke="transparent" fill="rgba(74,158,255,0.08)" />
            {/* P25–P75 inner band */}
            <Area dataKey="p25" stroke="transparent" fill="transparent" />
            <Area dataKey="p75" stroke="transparent" fill="rgba(74,158,255,0.14)" />
            {/* Median line */}
            <Area
              dataKey="p50"
              stroke="#4A9EFF"
              strokeWidth={2}
              fill="transparent"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Risk() {
  const [selectedSymbols, setSelectedSymbols] = useState(['SPY', 'QQQ', 'AAPL', 'MSFT'])
  const [weightMode, setWeightMode]     = useState<'equal' | 'market'>('equal')
  const [isLoading, setIsLoading]       = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [riskData, setRiskData]         = useState<PortfolioRiskResponse | null>(null)
  const [frontierData, setFrontierData] = useState<EfficientFrontierResponse | null>(null)
  const [mcData, setMcData]             = useState<MonteCarloResponse | null>(null)
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null)

  const toggleSymbol = (sym: string) =>
    setSelectedSymbols((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym],
    )

  const handleAnalyze = async () => {
    if (selectedSymbols.length < 2) {
      setError('Select at least 2 symbols.')
      return
    }
    setIsLoading(true)
    setError(null)
    setRiskData(null)
    setFrontierData(null)

    try {
      const n = selectedSymbols.length
      const weights = Array(n).fill(1 / n)
      const [risk, frontier, mc] = await Promise.all([
        api.risk.getAnalysis(selectedSymbols, weights),
        api.risk.getFrontier(selectedSymbols),
        api.risk.getMonteCarlo(selectedSymbols, weights),
      ])
      setRiskData(risk)
      setFrontierData(frontier)
      setMcData(mc)
      setLastUpdated(new Date())
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Analysis failed. Check that data has been ingested.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Risk Management</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Understand how risky your portfolio is — how much you could lose, how your stocks move together, and which combinations give the best return for the risk.
        </Typography>
        <LastUpdated timestamp={lastUpdated} loading={isLoading} />
      </Box>

      {/* Config bar */}
      <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="caption" color="text.disabled" display="block" mb={1}>
                SYMBOLS (select 2–10)
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.75}>
                {AVAILABLE_SYMBOLS.map((sym) => {
                  const selected = selectedSymbols.includes(sym)
                  return (
                    <Chip
                      key={sym} label={sym} size="small" clickable
                      onClick={() => toggleSymbol(sym)}
                      sx={{
                        fontFamily:  'IBM Plex Mono, monospace',
                        fontWeight:  selected ? 700 : 400,
                        bgcolor:     selected ? 'rgba(0,180,216,0.15)' : 'transparent',
                        color:       selected ? 'primary.main' : 'text.secondary',
                        border:      '1px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                      }}
                    />
                  )
                })}
              </Stack>
            </Box>

            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />

            <Box sx={{ flexShrink: 0 }}>
              <Typography variant="caption" color="text.disabled" display="block" mb={1}>
                WEIGHTING
              </Typography>
              <ToggleButtonGroup value={weightMode} exclusive
                onChange={(_, v) => v && setWeightMode(v)} size="small">
                <ToggleButton value="equal" sx={{ textTransform: 'none', fontSize: '0.8rem' }}>
                  Equal Weight
                </ToggleButton>
                <ToggleButton value="market" sx={{ textTransform: 'none', fontSize: '0.8rem' }} disabled>
                  Custom ⁺
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />

            <Button
              variant="contained"
              startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <AnalyzeIcon />}
              onClick={handleAnalyze}
              disabled={isLoading || selectedSymbols.length < 2}
              sx={{ flexShrink: 0, py: 1.25, px: 3, fontWeight: 700, textTransform: 'none' }}
            >
              {isLoading ? 'Analyzing…' : 'Analyze Portfolio'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Empty state */}
      {!riskData && !isLoading && !error && (
        <Box sx={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: 300, border: '1px dashed', borderColor: 'divider',
          borderRadius: 2, color: 'text.disabled',
        }}>
          <RiskIcon sx={{ fontSize: 44, mb: 1.5, opacity: 0.35 }} />
          <Typography>Select symbols and click Analyze Portfolio</Typography>
        </Box>
      )}

      {/* Results */}
      {riskData && (
        <>
          {/* Metric cards */}
          <Grid container spacing={2} mb={3}>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Max Expected 1-Day Loss"
                value={`-${(riskData.portfolio_var_95 * 100).toFixed(2)}%`}
                subtitle={`Worst-case: -${(riskData.portfolio_cvar_95 * 100).toFixed(2)}% · 95% confidence`}
                tooltip="On a typical bad day (95% confidence), your portfolio won't lose more than this. The worst-case number is what you'd expect in the worst 5% of days."
                good={riskData.portfolio_var_95 < 0.025}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Yearly Price Swings"
                value={`${(riskData.portfolio_vol * 100).toFixed(1)}%`}
                subtitle={`Based on ${riskData.n_days} trading days`}
                tooltip="How much your portfolio value bounces around in a typical year. Lower is steadier — under 15% is considered low risk, over 25% is high risk."
                good={riskData.portfolio_vol < 0.18}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Risk-Adjusted Return"
                value={riskData.portfolio_sharpe.toFixed(2)}
                subtitle="Return earned per unit of risk"
                tooltip="How much return you're getting for the risk you're taking. Above 1.0 is good, above 2.0 is excellent. A higher number means a more efficient portfolio."
                good={riskData.portfolio_sharpe > 0.8}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MetricCard
                label="Biggest Drop"
                value={`${(riskData.portfolio_max_drawdown * 100).toFixed(1)}%`}
                subtitle={`Yearly return: ${(riskData.portfolio_return * 100).toFixed(1)}%`}
                tooltip="The largest peak-to-trough loss your portfolio experienced. This is the worst-case loss you would have seen if you bought at the top and sold at the bottom."
                good={riskData.portfolio_max_drawdown > -0.2}
              />
            </Grid>
          </Grid>

          {/* Charts */}
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} md={5}>
              <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={2}>
                    How Stocks Move Together
                  </Typography>
                  <Typography variant="caption" color="text.disabled" display="block" mb={1}>
                    Dark blue = move together · Dark red = move opposite · Diversified portfolios avoid high correlation
                  </Typography>
                  <CorrelationHeatmap
                    symbols={riskData.symbols}
                    correlation={riskData.correlation}
                  />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={7}>
              <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      Best Portfolio Combinations
                    </Typography>
                    <Typography variant="caption" color="text.disabled" display="block" mb={1}>
                      Each dot is a different portfolio mix. The gold star = best return for the risk taken.
                    </Typography>
                    {frontierData?.max_sharpe?.weights && (
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" color="text.disabled" display="block">
                          Recommended allocation
                        </Typography>
                        <Typography variant="caption" fontFamily="IBM Plex Mono, monospace" color="#fbbf24" fontSize="0.68rem">
                          {frontierData.max_sharpe.weights
                            .map((w, i) => `${frontierData.symbols[i]}: ${(w * 100).toFixed(0)}%`)
                            .join('  ')}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {frontierData ? (
                    <EfficientFrontierChart
                      random={frontierData.random}
                      frontier={frontierData.frontier}
                      maxSharpe={frontierData.max_sharpe}
                      minVol={frontierData.min_vol}
                      height={300}
                    />
                  ) : (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                      <CircularProgress size={28} />
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <AssetTable data={riskData} />

          {/* Monte Carlo fan chart */}
          {mcData && <MonteCarloChart data={mcData} />}
        </>
      )}
    </Box>
  )
}
