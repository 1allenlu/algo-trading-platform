/**
 * Multi-Benchmark Comparison — Phase 61.
 *
 * Overlays the paper portfolio equity curve against SPY, QQQ, IWM,
 * BTC and other benchmarks, all normalised to 100 at a common start.
 */

import { useState } from 'react'
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  Grid, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, type BenchmarkCurves } from '@/services/api'

const DAYS_OPTIONS = [30, 90, 252, 504] as const
const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'GLD']
const COLORS: Record<string, string> = {
  SPY: '#4A9EFF', QQQ: '#A78BFA', IWM: '#F59E0B',
  'BTC-USD': '#F97316', GLD: '#EAB308', TLT: '#34D399',
}

export default function BenchmarksPage() {
  const [days, setDays]       = useState<30 | 90 | 252 | 504>(252)
  const [selected, setSelected] = useState<string[]>(DEFAULT_SYMBOLS)

  const { data, isLoading, error } = useQuery({
    queryKey:  ['benchmarks', selected, days],
    queryFn:   () => api.benchmarks.getCurves(selected, days),
    staleTime: 30 * 60 * 1000,
    retry: 2,
  })

  // Merge all curves on a shared date index
  const chartData = (() => {
    if (!data?.benchmarks) return []
    const byDate: Record<string, Record<string, number>> = {}
    for (const [sym, curve] of Object.entries(data.benchmarks)) {
      for (const { date, value } of curve as { date: string; value: number }[]) {
        if (!byDate[date]) byDate[date] = {}
        byDate[date][sym] = value
      }
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }))
  })()

  const SYMBOLS = data?.meta?.map((m: any) => m.symbol) ?? DEFAULT_SYMBOLS

  const toggleSym = (sym: string) =>
    setSelected((prev) =>
      prev.includes(sym)
        ? prev.filter((s) => s !== sym)
        : [...prev, sym]
    )

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Multi-Benchmark Comparison</Typography>
        <Typography variant="body2" color="text.secondary">
          Normalised return curves (base = 100) — compare any combination of benchmarks over time.
          Data via yfinance (15-min delayed).
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
        <ToggleButtonGroup
          value={days} exclusive size="small"
          onChange={(_, v) => v && setDays(v)}
          sx={{ '& .MuiToggleButton-root': { py: 0.5, px: 1.75, textTransform: 'none', fontSize: '0.8rem' } }}
        >
          <ToggleButton value={30}>1M</ToggleButton>
          <ToggleButton value={90}>3M</ToggleButton>
          <ToggleButton value={252}>1Y</ToggleButton>
          <ToggleButton value={504}>2Y</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {SYMBOLS.map((sym: string) => (
            <Chip
              key={sym} label={sym} size="small" clickable
              onClick={() => toggleSym(sym)}
              sx={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontWeight: selected.includes(sym) ? 700 : 400,
                bgcolor: selected.includes(sym) ? (COLORS[sym] ?? '#94a3b8') + '22' : 'transparent',
                color:   selected.includes(sym) ? (COLORS[sym] ?? '#94a3b8') : 'text.secondary',
                border: '1px solid',
                borderColor: selected.includes(sym) ? (COLORS[sym] ?? '#94a3b8') : 'divider',
              }}
            />
          ))}
        </Box>
      </Box>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">Failed to load benchmark data.</Alert>}

      {chartData.length > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <ResponsiveContainer width="100%" height={420}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${v.toFixed(0)}`}
                  domain={['auto', 'auto']}
                  width={44}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [`${v.toFixed(2)}`, name]}
                  contentStyle={{ background: '#12161F', border: '1px solid #2D3548', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {selected.map((sym) => (
                  <Line
                    key={sym} type="monotone" dataKey={sym}
                    stroke={COLORS[sym] ?? '#94a3b8'}
                    strokeWidth={2} dot={false} connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <Typography variant="caption" color="text.disabled" display="block" mt={1} textAlign="right">
              All series normalised to 100 at start of selected period
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
