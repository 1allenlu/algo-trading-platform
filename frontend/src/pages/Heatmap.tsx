/**
 * Portfolio Position Heatmap — Phase 78.
 *
 * Treemap visualization of open paper positions.
 * Tile size = market value, tile color = unrealized P&L %.
 * Groups positions by sector (TICKER_SECTOR mapping mirrors backend).
 *
 * No new backend endpoint needed — uses existing GET /api/paper/state.
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import { Refresh as RefreshIcon, GridView as HeatmapIcon } from '@mui/icons-material'
import { Treemap, ResponsiveContainer, Tooltip as RTooltip } from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { PaperPosition } from '@/services/api'

// ── Sector mapping (mirrors backend stress_service.TICKER_SECTOR) ─────────────

const TICKER_SECTOR: Record<string, string> = {
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology', AMD: 'Technology',
  INTC: 'Technology', ORCL: 'Technology', CRM: 'Technology', AVGO: 'Technology',
  QCOM: 'Technology', TXN: 'Technology', QQQ: 'Technology',
  GOOGL: 'Communication', GOOG: 'Communication', META: 'Communication', NFLX: 'Communication',
  DIS: 'Communication', CMCSA: 'Communication', T: 'Communication', VZ: 'Communication',
  AMZN: 'Cons. Discr.', TSLA: 'Cons. Discr.', MCD: 'Cons. Discr.', SBUX: 'Cons. Discr.',
  HD: 'Cons. Discr.', LOW: 'Cons. Discr.', NKE: 'Cons. Discr.', BKNG: 'Cons. Discr.',
  WMT: 'Cons. Staples', PG: 'Cons. Staples', KO: 'Cons. Staples', PEP: 'Cons. Staples',
  COST: 'Cons. Staples', MDLZ: 'Cons. Staples', PM: 'Cons. Staples',
  JPM: 'Financials', BAC: 'Financials', GS: 'Financials', MS: 'Financials',
  WFC: 'Financials', C: 'Financials', V: 'Financials', MA: 'Financials',
  'BRK-B': 'Financials', AXP: 'Financials',
  JNJ: 'Healthcare', LLY: 'Healthcare', UNH: 'Healthcare', ABBV: 'Healthcare',
  MRK: 'Healthcare', PFE: 'Healthcare', ABT: 'Healthcare', TMO: 'Healthcare',
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy', SLB: 'Energy', EOG: 'Energy',
  GE: 'Industrials', HON: 'Industrials', CAT: 'Industrials', BA: 'Industrials',
  UPS: 'Industrials', RTX: 'Industrials', DE: 'Industrials',
  LIN: 'Materials', FCX: 'Materials', NEM: 'Materials', APD: 'Materials',
  NEE: 'Utilities', DUK: 'Utilities', SO: 'Utilities', D: 'Utilities',
  AMT: 'Real Estate', PLD: 'Real Estate', EQIX: 'Real Estate', SPG: 'Real Estate',
  SPY: 'Index ETF', IWM: 'Index ETF', DIA: 'Index ETF',
  GLD: 'Gold/Silver', SLV: 'Gold/Silver',
  TLT: 'Bonds', IEF: 'Bonds', AGG: 'Bonds',
  'BTC-USD': 'Crypto', 'ETH-USD': 'Crypto', COIN: 'Crypto',
}

// ── Color scale for P&L % ──────────────────────────────────────────────────────

function pnlColor(pct: number): string {
  if (pct >=  5) return '#00875A'
  if (pct >=  2) return '#00C896'
  if (pct >=  0) return '#00C89688'
  if (pct >= -2) return '#FF6B6B88'
  if (pct >= -5) return '#FF6B6B'
  return '#C0392B'
}

// ── Recharts custom content renderer ─────────────────────────────────────────

interface TreeNode {
  name:   string
  size:   number
  pnl:    number
  pnlPct: number
  sector: string
}

function CustomContent(props: Record<string, unknown>) {
  const x      = (props.x      as number) ?? 0
  const y      = (props.y      as number) ?? 0
  const width  = (props.width  as number) ?? 0
  const height = (props.height as number) ?? 0
  const name   = props.name   as string | undefined
  const pnlPct = (props.pnlPct as number) ?? 0

  if (width < 4 || height < 4 || !name) return null

  const color    = pnlColor(pnlPct)
  // Cap font size by both width (per character) and tile height so it never overflows
  const fontSize = name.length > 0
    ? Math.min(14, (width - 8) / name.length * 1.5, height * 0.32)
    : 12
  const clipId = `hm-clip-${Math.round(x)}-${Math.round(y)}`

  const showLabel  = width > 40 && height > 24 && fontSize >= 7
  const showPnl    = showLabel && height > 46 && width > 48

  return (
    <g>
      {/* Clip mask — text is strictly contained within this tile */}
      <clipPath id={clipId}>
        <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2} rx={4} />
      </clipPath>

      <rect
        x={x + 1} y={y + 1}
        width={width - 2} height={height - 2}
        style={{ fill: color, stroke: '#0A0E17', strokeWidth: 2, opacity: 0.92 }}
        rx={4}
      />

      {showLabel && (
        <g clipPath={`url(#${clipId})`}>
          <text
            x={x + width / 2}
            y={y + height / 2 - (showPnl ? 8 : 0)}
            textAnchor="middle" dominantBaseline="middle"
            style={{ fill: '#fff', fontSize, fontWeight: 700, pointerEvents: 'none' }}
          >
            {name}
          </text>
          {showPnl && (
            <text
              x={x + width / 2} y={y + height / 2 + 12}
              textAnchor="middle" dominantBaseline="middle"
              style={{ fill: '#ffffffCC', fontSize: Math.min(11, fontSize * 0.85), pointerEvents: 'none' }}
            >
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
            </text>
          )}
        </g>
      )}
    </g>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HeatmapPage() {
  const [groupBySector, setGroupBySector] = useState(true)

  const { data: paperState, isLoading, refetch } = useQuery({
    queryKey:  ['paper-state'],
    queryFn:   () => api.paper.getState(),
    staleTime: 30_000,
  })

  const positions: PaperPosition[] = paperState?.positions ?? []

  if (!isLoading && positions.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
        <HeatmapIcon sx={{ fontSize: 64, mb: 2, opacity: 0.25 }} />
        <Typography>No open positions. Add positions via the Trading page.</Typography>
      </Box>
    )
  }

  // Build treemap data
  const nodes: TreeNode[] = positions.map((p) => ({
    name:   p.symbol,
    size:   p.market_value,
    pnl:    p.unrealized_pnl,
    pnlPct: p.unrealized_pnl_pct,
    sector: TICKER_SECTOR[p.symbol] ?? 'Other',
  }))

  // Flat or sector-grouped treemap data
  const treemapData = groupBySector
    ? (() => {
        const byGroup: Record<string, TreeNode[]> = {}
        for (const n of nodes) {
          ;(byGroup[n.sector] ??= []).push(n)
        }
        return Object.entries(byGroup).map(([sector, items]) => ({
          name:     sector,
          // recharts Treemap sizes the parent by summing children's `size`
          children: items.map((it) => ({ name: it.name, size: it.size, value: it.size, pnl: it.pnl, pnlPct: it.pnlPct, sector: it.sector })),
        }))
      })()
    : nodes.map((n) => ({ name: n.name, size: n.size, value: n.size, pnl: n.pnl, pnlPct: n.pnlPct, sector: n.sector }))

  // Stats
  const totalValue  = nodes.reduce((s, n) => s + n.size, 0)
  const totalPnl    = nodes.reduce((s, n) => s + n.pnl,  0)
  const totalPnlPct = totalValue > 0 ? (totalPnl / totalValue) * 100 : 0

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HeatmapIcon sx={{ color: 'primary.main' }} />
            Portfolio Heatmap
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Tile size = market value · Color = unrealized P&L %
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label="Flat"
            size="small"
            variant={groupBySector ? 'outlined' : 'filled'}
            onClick={() => setGroupBySector(false)}
            sx={{ fontWeight: 600 }}
          />
          <Chip
            label="By Sector"
            size="small"
            variant={groupBySector ? 'filled' : 'outlined'}
            onClick={() => setGroupBySector(true)}
            sx={{ fontWeight: 600 }}
          />
          <IconButton size="small" onClick={() => refetch()}>
            <RefreshIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </Box>

      {/* Summary strip */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
        {[
          { label: 'Positions', value: positions.length.toString() },
          { label: 'Market Value', value: `$${totalValue.toLocaleString()}` },
          { label: 'Unrealized P&L', value: `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`, color: pnlColor(totalPnlPct) },
          { label: 'P&L $', value: `${totalPnl >= 0 ? '+$' : '-$'}${Math.abs(totalPnl).toLocaleString()}`, color: pnlColor(totalPnlPct) },
        ].map(({ label, value, color }) => (
          <Card key={label} sx={{ border: '1px solid', borderColor: 'divider', flex: 1, minWidth: 120 }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.disabled" display="block" sx={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.25 }}>
                {label}
              </Typography>
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: 'IBM Plex Mono, monospace', color: color ?? 'text.primary' }}>
                {value}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* Treemap */}
      <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 2 }}>
          {isLoading ? (
            <Box sx={{ height: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled' }}>
              Loading portfolio…
            </Box>
          ) : (
            <ResponsiveContainer width="100%" height={520}>
              <Treemap
                data={treemapData}
                dataKey="value"
                aspectRatio={4 / 3}
                content={<CustomContent />}
              >
                <RTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <Box sx={{
                        bgcolor: '#12161F', border: '1px solid #2D3548',
                        p: 1.5, borderRadius: 1, fontSize: 12,
                      }}>
                        <Typography fontWeight={700} sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13 }}>
                          {d.name}
                        </Typography>
                        {d.sector && <Typography variant="caption" color="text.disabled" display="block">{d.sector}</Typography>}
                        {d.size && (
                          <Typography variant="caption" display="block">Value: ${d.size.toLocaleString()}</Typography>
                        )}
                        {d.pnlPct !== undefined && (
                          <Typography variant="caption" display="block" sx={{ color: pnlColor(d.pnlPct) }}>
                            P&L: {d.pnlPct >= 0 ? '+' : ''}{d.pnlPct.toFixed(2)}%
                          </Typography>
                        )}
                      </Box>
                    )
                  }}
                />
              </Treemap>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Color legend */}
      <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'center', flexWrap: 'wrap', gap: 1 }}>
        {[
          { label: '≥+5%', color: '#00875A' },
          { label: '+2–5%', color: '#00C896' },
          { label: '0–2%', color: '#00C89688' },
          { label: '−2–0%', color: '#FF6B6B88' },
          { label: '−5–−2%', color: '#FF6B6B' },
          { label: '≤−5%', color: '#C0392B' },
        ].map(({ label, color }) => (
          <Stack key={label} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: color }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>{label}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}
