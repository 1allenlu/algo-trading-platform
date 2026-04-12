/**
 * Scenario Stress Test — Phase 79.
 *
 * Applies historical-crisis shocks to the current paper portfolio and shows
 * estimated P&L impact per position and in aggregate.
 *
 * Scenarios: GFC 2008 | COVID 2020 | Rate Shock 2022 | Dot-Com 2000 | Custom
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  InputAdornment,
  LinearProgress,
  Slider,
  Stack,
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
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Psychology as StressIcon } from '@mui/icons-material'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { StressScenario, StressTestResult } from '@/services/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDollar(v: number): string {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function impactColor(v: number): string {
  return v >= 0 ? '#00C896' : '#FF6B6B'
}

// ── Scenario selector ─────────────────────────────────────────────────────────

const SCENARIO_COLORS: Record<string, string> = {
  gfc2008:    '#FF6B6B',
  covid2020:  '#F59E0B',
  rate2022:   '#A78BFA',
  dotcom2000: '#FB923C',
  custom:     '#4A9EFF',
}

function ScenarioCard({
  scenario,
  selected,
  onClick,
}: {
  scenario: StressScenario
  selected: boolean
  onClick: () => void
}) {
  const color = SCENARIO_COLORS[scenario.id] ?? '#4A9EFF'
  return (
    <Card
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        border: '1px solid',
        borderColor: selected ? color : 'divider',
        bgcolor: selected ? `${color}14` : 'background.paper',
        transition: 'all 0.15s',
        '&:hover': { borderColor: color, bgcolor: `${color}0A` },
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" fontWeight={700} sx={{ color }}>
          {scenario.name}
        </Typography>
        <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.25, fontSize: '0.65rem' }}>
          {scenario.description}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── Summary KPIs ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', flex: 1 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="caption" color="text.disabled" display="block" sx={{ mb: 0.5, letterSpacing: '0.07em', textTransform: 'uppercase', fontSize: '0.65rem' }}>
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={700} sx={{ color: color ?? 'text.primary', fontFamily: 'IBM Plex Mono, monospace' }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StressTestPage() {
  const [selectedId, setSelectedId]   = useState<string>('gfc2008')
  const [customShock, setCustomShock] = useState<number>(-20)
  const [result, setResult]           = useState<StressTestResult | null>(null)

  // Fetch available scenarios
  const { data: scenarios = [], isLoading: loadingScenarios } = useQuery<StressScenario[]>({
    queryKey:  ['stress-scenarios'],
    queryFn:   () => api.stress.listScenarios(),
    staleTime: Infinity,
  })

  // Fetch current portfolio positions
  const { data: paperState, isLoading: loadingPortfolio } = useQuery({
    queryKey:  ['paper-state'],
    queryFn:   () => api.paper.getState(),
    staleTime: 30_000,
  })

  const positions = paperState?.positions ?? []

  // Stress test mutation
  const { mutate: runStress, isPending: running } = useMutation({
    mutationFn: () => {
      const posPayload = positions.map((p) => ({
        symbol:        p.symbol,
        qty:           p.qty,
        current_price: p.current_price,
        market_value:  p.market_value,
      }))
      return api.stress.run(
        selectedId,
        posPayload,
        selectedId === 'custom' ? customShock / 100 : undefined,
      )
    },
    onSuccess: (data) => setResult(data),
  })

  const allScenarios: StressScenario[] = [
    ...scenarios,
    { id: 'custom', name: 'Custom Shock', description: 'User-defined uniform market shock.', market_shock_pct: customShock },
  ]

  const hasPositions = positions.length > 0

  // Chart data: per-position impact
  const chartData = (result?.positions ?? []).map((p) => ({
    symbol: p.symbol,
    impact: p.impact_dollar,
  }))

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StressIcon sx={{ color: 'primary.main' }} />
          Scenario Stress Test
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          Apply historical crisis shocks to your paper portfolio — sector-adjusted P&L impact.
        </Typography>
      </Box>

      {!hasPositions && !loadingPortfolio && (
        <Alert severity="info" sx={{ mb: 3 }}>
          No open positions in the paper portfolio. Add positions via the Trading page first.
        </Alert>
      )}

      {/* Scenario picker */}
      {loadingScenarios ? (
        <LinearProgress sx={{ borderRadius: 1, mb: 3 }} />
      ) : (
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {allScenarios.map((s) => (
            <Grid item xs={12} sm={6} md={4} lg={2.4} key={s.id}>
              <ScenarioCard
                scenario={s}
                selected={selectedId === s.id}
                onClick={() => setSelectedId(s.id)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Custom shock slider */}
      {selectedId === 'custom' && (
        <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="caption" color="text.disabled" fontWeight={600} letterSpacing="0.08em">
              CUSTOM MARKET SHOCK
            </Typography>
            <Stack direction="row" spacing={3} alignItems="center" sx={{ mt: 1.5 }}>
              <Slider
                value={customShock}
                onChange={(_, v) => setCustomShock(v as number)}
                min={-80}
                max={0}
                step={1}
                sx={{ color: '#4A9EFF', flex: 1 }}
              />
              <TextField
                size="small"
                type="number"
                value={customShock}
                onChange={(e) => setCustomShock(Number(e.target.value))}
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  sx: { fontFamily: 'IBM Plex Mono, monospace', width: 110 },
                }}
                inputProps={{ min: -100, max: 0 }}
              />
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Run button */}
      <Box sx={{ mb: 3 }}>
        <Chip
          label={running ? 'Running…' : `Run ${allScenarios.find(s => s.id === selectedId)?.name ?? ''} Stress Test`}
          onClick={() => !running && hasPositions && runStress()}
          disabled={running || !hasPositions}
          color="primary"
          sx={{ fontWeight: 700, fontSize: '0.85rem', px: 2, py: 2.5, cursor: hasPositions ? 'pointer' : 'not-allowed' }}
        />
        {running && <CircularProgress size={16} sx={{ ml: 2 }} />}
      </Box>

      {/* Results */}
      {result && (
        <>
          {/* Scenario info */}
          <Typography variant="caption" color="text.disabled" sx={{ mb: 1.5, display: 'block', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {result.scenario_name} — {result.scenario_description}
          </Typography>

          {/* KPI row */}
          <Stack direction="row" spacing={1.5} sx={{ mb: 3, flexWrap: 'wrap', gap: 1.5 }}>
            <KpiCard
              label="Portfolio Value"
              value={`$${result.total_portfolio_value.toLocaleString()}`}
            />
            <KpiCard
              label="Total Impact"
              value={fmtDollar(result.total_impact_dollar)}
              color={impactColor(result.total_impact_dollar)}
            />
            <KpiCard
              label="Impact %"
              value={`${result.total_impact_pct > 0 ? '+' : ''}${result.total_impact_pct.toFixed(2)}%`}
              color={impactColor(result.total_impact_pct)}
            />
            <KpiCard
              label="Stressed Value"
              value={`$${result.stressed_portfolio_value.toLocaleString()}`}
              color={impactColor(result.total_impact_dollar)}
            />
            <KpiCard
              label="Market Shock"
              value={`${result.market_shock_pct > 0 ? '+' : ''}${result.market_shock_pct}%`}
              color="#FF6B6B"
            />
          </Stack>

          {/* Impact bar chart */}
          <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.disabled" fontWeight={600} letterSpacing="0.08em">
                P&L IMPACT BY POSITION
              </Typography>
              <ResponsiveContainer width="100%" height={220} style={{ marginTop: 12 }}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="symbol" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} width={70} tickFormatter={(v) => fmtDollar(v)} />
                  <RTooltip
                    formatter={(v: number) => [fmtDollar(v), 'Impact']}
                    contentStyle={{ background: '#12161F', border: '1px solid #2D3548', fontSize: 11 }}
                  />
                  <Bar dataKey="impact" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.impact >= 0 ? '#00C896' : '#FF6B6B'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Position table */}
          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                  {['Symbol', 'Sector', 'Market Value', 'Shock Applied', 'Impact $', 'Impact %', 'Stressed Value'].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {result.positions.map((pos) => (
                  <TableRow key={pos.symbol} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                    <TableCell>
                      <Typography variant="caption" fontWeight={700} color="primary.main" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                        {pos.symbol}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{pos.sector}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                        ${pos.market_value.toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={`${pos.applied_shock > 0 ? '+' : ''}${pos.applied_shock.toFixed(1)}%`}
                        sx={{
                          bgcolor: pos.applied_shock >= 0 ? '#00C89614' : '#FF6B6B14',
                          color:   pos.applied_shock >= 0 ? '#00C896'   : '#FF6B6B',
                          fontWeight: 700, fontSize: '0.68rem',
                          border: '1px solid', borderColor: pos.applied_shock >= 0 ? '#00C89644' : '#FF6B6B44',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontWeight={700} sx={{ fontFamily: 'IBM Plex Mono, monospace', color: impactColor(pos.impact_dollar) }}>
                        {fmtDollar(pos.impact_dollar)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'IBM Plex Mono, monospace', color: impactColor(pos.impact_pct) }}>
                        {pos.impact_pct > 0 ? '+' : ''}{pos.impact_pct.toFixed(1)}%
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                        ${pos.stressed_value.toLocaleString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </Box>
  )
}
