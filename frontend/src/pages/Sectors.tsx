/**
 * Sector Rotation Heatmap — Phase 56.
 *
 * Color-coded performance grid for the 11 GICS sector ETFs across
 * 1D / 5D / 1M / 3M / YTD time horizons.
 *
 * Green = positive, Red = negative.
 * Colour intensity scales with the magnitude of return.
 */

import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
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
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type SectorRow } from '@/services/api'

// ── Colour scale ──────────────────────────────────────────────────────────────

function heatColor(ret: number | null): string {
  if (ret === null || ret === undefined) return 'rgba(255,255,255,0.04)'
  const intensity = Math.min(Math.abs(ret) / 5, 1)   // clamp at ±5%
  if (ret > 0) return `rgba(0,200,150,${0.12 + intensity * 0.5})`
  return `rgba(255,107,107,${0.12 + intensity * 0.5})`
}

function textColor(ret: number | null): string {
  if (ret === null) return 'text.secondary'
  return ret > 0 ? '#00C896' : ret < 0 ? '#FF6B6B' : 'text.secondary'
}

function fmtRet(ret: number | null): string {
  if (ret === null || ret === undefined) return '—'
  return `${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%`
}

function fmtPrice(p: number | null): string {
  if (p === null) return '—'
  return `$${p.toFixed(2)}`
}

// ── Heatmap view ──────────────────────────────────────────────────────────────

type Period = '1D' | '5D' | '1M' | '3M' | 'YTD'

const PERIOD_KEY: Record<Period, keyof SectorRow> = {
  '1D':  'ret_1d',
  '5D':  'ret_5d',
  '1M':  'ret_1mo',
  '3M':  'ret_3mo',
  'YTD': 'ret_ytd',
}

function HeatGrid({ sectors, period }: { sectors: SectorRow[]; period: Period }) {
  const key = PERIOD_KEY[period]
  const sorted = [...sectors].sort((a, b) => {
    const va = (a[key] as number | null) ?? -999
    const vb = (b[key] as number | null) ?? -999
    return vb - va
  })

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1.5 }}>
      {sorted.map((s) => {
        const ret = s[key] as number | null
        return (
          <Box
            key={s.symbol}
            sx={{
              bgcolor: heatColor(ret),
              borderRadius: 1.5,
              p: 1.5,
              border: '1px solid rgba(255,255,255,0.06)',
              transition: 'transform 0.12s',
              '&:hover': { transform: 'scale(1.02)' },
            }}
          >
            <Typography
              variant="caption"
              fontFamily="IBM Plex Mono, monospace"
              fontWeight={700}
              color="text.secondary"
              display="block"
            >
              {s.symbol}
            </Typography>
            <Typography variant="body2" fontWeight={500} noWrap sx={{ mb: 0.5 }}>
              {s.name}
            </Typography>
            <Typography
              variant="h6"
              fontFamily="IBM Plex Mono, monospace"
              fontWeight={700}
              sx={{ color: textColor(ret), lineHeight: 1 }}
            >
              {fmtRet(ret)}
            </Typography>
            <Typography variant="caption" color="text.disabled">{fmtPrice(s.price)}</Typography>
          </Box>
        )
      })}
    </Box>
  )
}

// ── Table view ────────────────────────────────────────────────────────────────

function SectorTable({ sectors }: { sectors: SectorRow[] }) {
  const sorted = [...sectors].sort((a, b) => {
    const va = a.ret_1d ?? -999
    const vb = b.ret_1d ?? -999
    return vb - va
  })

  const periods: { label: string; key: keyof SectorRow }[] = [
    { label: '1D',  key: 'ret_1d'  },
    { label: '5D',  key: 'ret_5d'  },
    { label: '1M',  key: 'ret_1mo' },
    { label: '3M',  key: 'ret_3mo' },
    { label: 'YTD', key: 'ret_ytd' },
  ]

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>Sector</TableCell>
            <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>ETF</TableCell>
            <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>Price</TableCell>
            {periods.map((p) => (
              <TableCell key={p.label} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                {p.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((s) => (
            <TableRow key={s.symbol} hover>
              <TableCell sx={{ fontWeight: 600 }}>{s.name}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main', fontSize: '0.8rem' }}>
                {s.symbol}
              </TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                {fmtPrice(s.price)}
              </TableCell>
              {periods.map((p) => {
                const ret = s[p.key] as number | null
                return (
                  <TableCell
                    key={p.label}
                    sx={{
                      fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem',
                      fontWeight: 700,
                      color:   textColor(ret),
                      bgcolor: heatColor(ret),
                    }}
                  >
                    {fmtRet(ret)}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SectorsPage() {
  const [view, setView]     = useState<'grid' | 'table'>('grid')
  const [period, setPeriod] = useState<Period>('1D')

  const { data = [], isLoading, error } = useQuery({
    queryKey:  ['sectors'],
    queryFn:   () => api.sectors.getHeatmap(),
    staleTime: 30 * 60 * 1000,   // 30 min — matches backend cache
    retry:     2,
  })

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Sector Rotation</Typography>
        <Typography variant="body2" color="text.secondary">
          Performance heatmap for all 11 GICS sector ETFs. Data via yfinance (15-min delayed, cached 30 min).
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          value={period} exclusive size="small"
          onChange={(_, v) => v && setPeriod(v)}
          sx={{ '& .MuiToggleButton-root': { py: 0.5, px: 1.75, textTransform: 'none', fontSize: '0.8rem' } }}
        >
          {(['1D', '5D', '1M', '3M', 'YTD'] as Period[]).map((p) => (
            <ToggleButton key={p} value={p}>{p}</ToggleButton>
          ))}
        </ToggleButtonGroup>

        <ToggleButtonGroup
          value={view} exclusive size="small"
          onChange={(_, v) => v && setView(v)}
          sx={{ '& .MuiToggleButton-root': { py: 0.5, px: 1.75, textTransform: 'none', fontSize: '0.8rem' } }}
        >
          <ToggleButton value="grid">Grid</ToggleButton>
          <ToggleButton value="table">Table</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load sector data.</Alert>}

      {data.length > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            {view === 'grid'
              ? <HeatGrid  sectors={data} period={period} />
              : <SectorTable sectors={data} />
            }
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
