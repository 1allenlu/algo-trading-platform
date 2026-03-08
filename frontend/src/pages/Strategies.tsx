/**
 * Strategies page — browse and launch available quant strategies.
 *
 * Fetches strategy metadata from GET /api/strategies (live from quant_engine).
 * Each card shows:
 *   - Strategy name + method badge
 *   - Description
 *   - Default symbols and tags
 *   - "Run Backtest →" button that navigates to /backtest pre-configured
 */

import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  ArrowForward as ArrowIcon,
  CompareArrows as PairsIcon,
  Psychology as MLIcon,
  ShowChart as MeanRevIcon,
  TrendingUp as MomentumIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type StrategyInfo } from '@/services/api'

// ── Icon map ──────────────────────────────────────────────────────────────────
const STRATEGY_ICONS: Record<string, React.ReactNode> = {
  pairs_trading:  <PairsIcon sx={{ fontSize: 32 }} />,
  momentum:       <MomentumIcon sx={{ fontSize: 32 }} />,
  mean_reversion: <MeanRevIcon sx={{ fontSize: 32 }} />,
}

// ── Tag colors ────────────────────────────────────────────────────────────────
const TAG_COLORS: Record<string, string> = {
  'market-neutral':  '#06d6a0',
  'mean-reverting':  '#4cc9f0',
  'stat-arb':        '#9d4edd',
  'long-only':       '#00b4d8',
  'trend-following': '#f77f00',
  'factor':          '#f77f00',
  'contrarian':      '#9d4edd',
  'volatility':      '#ff6b6b',
}

// ── Strategy card ─────────────────────────────────────────────────────────────
function StrategyCard({ strategy }: { strategy: StrategyInfo }) {
  const navigate = useNavigate()
  const icon = STRATEGY_ICONS[strategy.name] ?? <MomentumIcon sx={{ fontSize: 32 }} />

  const handleRun = () => {
    // Navigate to backtest page with strategy pre-selected via query string
    const params = new URLSearchParams({
      strategy: strategy.name,
      symbols:  strategy.default_symbols.join(','),
    })
    navigate(`/backtest?${params.toString()}`)
  }

  return (
    <Card
      sx={{
        transition: 'border-color 0.2s',
        border: '1px solid',
        borderColor: 'divider',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          <Box sx={{ color: 'primary.main', mt: 0.25 }}>{icon}</Box>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>
              {strategy.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color:    'text.disabled',
                bgcolor:  'rgba(255,255,255,0.05)',
                px: 1, py: 0.3,
                borderRadius: 1,
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.68rem',
              }}
            >
              {strategy.method}
            </Typography>
          </Box>
        </Box>

        {/* Description */}
        <Typography variant="body2" color="text.secondary" mb={2} sx={{ lineHeight: 1.6 }}>
          {strategy.description}
        </Typography>

        {/* Default symbols */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.disabled" display="block" mb={0.5}>
            Default symbols
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {strategy.default_symbols.map((sym) => (
              <Chip
                key={sym}
                label={sym}
                size="small"
                sx={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.72rem',
                  bgcolor: 'rgba(0,180,216,0.08)',
                  color: 'primary.main',
                  border: '1px solid rgba(0,180,216,0.2)',
                }}
              />
            ))}
          </Stack>
        </Box>

        {/* Tags */}
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mb={2.5}>
          {strategy.tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              sx={{
                fontSize: '0.65rem',
                color: TAG_COLORS[tag] ?? '#94a3b8',
                bgcolor: 'transparent',
                border: `1px solid ${TAG_COLORS[tag] ?? '#475569'}44`,
              }}
            />
          ))}
        </Stack>

        {/* CTA */}
        <Button
          variant="contained"
          endIcon={<ArrowIcon />}
          onClick={handleRun}
          size="small"
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Run Backtest
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Coming soon card ──────────────────────────────────────────────────────────
function ComingSoonCard({
  icon, name, desc, phase,
}: { icon: React.ReactNode; name: string; desc: string; phase: string }) {
  return (
    <Card sx={{ opacity: 0.45, border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
          <Box sx={{ color: 'text.disabled' }}>{icon}</Box>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3, fontSize: '1rem' }}>
              {name}
            </Typography>
            <Chip
              label={phase}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.62rem', color: 'text.disabled', borderColor: 'divider' }}
            />
          </Box>
        </Box>
        <Typography variant="body2" color="text.disabled">
          {desc}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Strategies() {
  const { data, isLoading } = useQuery({
    queryKey: ['strategies'],
    queryFn:  () => api.strategies.list(),
  })

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Strategies
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4}>
        Quantitative trading strategies. Click &ldquo;Run Backtest&rdquo; to evaluate on historical data.
      </Typography>

      {/* Live strategies */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Grid container spacing={2} mb={4}>
          {(data?.strategies ?? []).map((s) => (
            <Grid item xs={12} md={6} lg={4} key={s.name}>
              <StrategyCard strategy={s} />
            </Grid>
          ))}
          {(data?.strategies ?? []).length === 0 && (
            <Grid item xs={12}>
              <Typography color="text.secondary" textAlign="center" py={4}>
                No strategies available. Ensure the backend is running.
              </Typography>
            </Grid>
          )}
        </Grid>
      )}

      {/* Coming soon */}
      <Typography variant="overline" color="text.disabled" display="block" mb={1.5}>
        Coming in Phase 4+
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <ComingSoonCard
            icon={<MLIcon />}
            name="ML-Signal Enhanced"
            desc="XGBoost + LSTM signals used as position-sizing overlays on quant strategies."
            phase="Phase 4"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <ComingSoonCard
            icon={<MomentumIcon />}
            name="Multi-Factor Portfolio"
            desc="Combines momentum, value, and quality factors with risk-parity weighting."
            phase="Phase 4"
          />
        </Grid>
      </Grid>
    </Box>
  )
}
