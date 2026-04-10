/**
 * Economic Calendar — Phase 55.
 *
 * Displays upcoming macro events (FOMC, CPI, NFP, PPI, GDP) with:
 *   • Countdown timers ("in 3 days")
 *   • Importance badges (HIGH / MEDIUM)
 *   • Category colour-coding (fed / inflation / employment / growth / treasury)
 *   • Day-range filter (30 / 60 / 90 days)
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import {
  AccountBalance as FedIcon,
  LocalAtm as TreasuryIcon,
  QueryStats as GrowthIcon,
  ShowChart as InflationIcon,
  Work as EmploymentIcon,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, type MacroEvent } from '@/services/api'

// ── Colour / icon helpers ─────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { color: string; bgColor: string; label: string; icon: React.ReactNode }> = {
  fed:        { color: '#4A9EFF', bgColor: '#4A9EFF22', label: 'Fed',        icon: <FedIcon        sx={{ fontSize: 15 }} /> },
  inflation:  { color: '#F59E0B', bgColor: '#F59E0B22', label: 'Inflation',  icon: <InflationIcon  sx={{ fontSize: 15 }} /> },
  employment: { color: '#00C896', bgColor: '#00C89622', label: 'Employment', icon: <EmploymentIcon sx={{ fontSize: 15 }} /> },
  growth:     { color: '#A78BFA', bgColor: '#A78BFA22', label: 'Growth',     icon: <GrowthIcon     sx={{ fontSize: 15 }} /> },
  treasury:   { color: '#F472B6', bgColor: '#F472B622', label: 'Treasury',   icon: <TreasuryIcon   sx={{ fontSize: 15 }} /> },
}

function categoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? { color: '#94a3b8', bgColor: '#94a3b822', label: cat, icon: null }
}

function urgencyColor(daysUntil: number) {
  if (daysUntil === 0) return '#FF6B6B'
  if (daysUntil <= 3)  return '#F59E0B'
  if (daysUntil <= 7)  return '#00C896'
  return 'text.disabled'
}

function countdown(d: number) {
  if (d === 0) return 'TODAY'
  if (d === 1) return 'Tomorrow'
  return `in ${d} days`
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ ev }: { ev: MacroEvent }) {
  const meta = categoryMeta(ev.category)

  return (
    <Card
      sx={{
        border: '1px solid',
        borderColor: ev.is_today ? meta.color : 'divider',
        mb: 1.5,
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: meta.color },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          {/* Countdown badge */}
          <Box
            sx={{
              minWidth: 70, textAlign: 'center', flexShrink: 0,
              pt: 0.25,
            }}
          >
            <Typography
              variant="h6"
              fontFamily="IBM Plex Mono, monospace"
              fontWeight={700}
              sx={{ color: urgencyColor(ev.days_until), lineHeight: 1 }}
            >
              {ev.days_until === 0 ? '!' : ev.days_until}
            </Typography>
            <Typography variant="caption" sx={{ color: urgencyColor(ev.days_until) }}>
              {countdown(ev.days_until)}
            </Typography>
          </Box>

          {/* Event details */}
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography variant="body2" fontWeight={700}>{ev.name}</Typography>
              <Chip
                size="small"
                icon={meta.icon as any}
                label={meta.label}
                sx={{
                  bgcolor: meta.bgColor, color: meta.color,
                  fontWeight: 600, fontSize: '0.65rem', height: 18,
                  '& .MuiChip-icon': { color: meta.color, fontSize: 12, ml: 0.5 },
                }}
              />
              {ev.importance === 'high' && (
                <Chip
                  size="small" label="HIGH"
                  sx={{ bgcolor: '#FF6B6B22', color: '#FF6B6B', fontWeight: 700, fontSize: '0.6rem', height: 16 }}
                />
              )}
            </Box>
            <Typography variant="caption" color="text.disabled">{fmtDate(ev.date)}</Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DAYS_OPTIONS = [30, 60, 90] as const

export default function EconomicsPage() {
  const [days, setDays] = useState<30 | 60 | 90>(60)
  const [catFilter, setCatFilter] = useState<string>('all')

  const { data = [], isLoading, error } = useQuery({
    queryKey:  ['economics', days],
    queryFn:   () => api.economics.getCalendar(days),
    staleTime: 60 * 60 * 1000,   // 1 hour — dates don't change
  })

  const categories = ['all', 'fed', 'inflation', 'employment', 'growth', 'treasury']
  const filtered = catFilter === 'all' ? data : data.filter((e) => e.category === catFilter)
  const today    = filtered.filter((e) => e.is_today)
  const thisWeek = filtered.filter((e) => e.is_this_week && !e.is_today)
  const later    = filtered.filter((e) => !e.is_this_week)

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Economic Calendar</Typography>
        <Typography variant="body2" color="text.secondary">
          Upcoming macro events — FOMC rate decisions, CPI, NFP, PPI, GDP, and Fed speeches.
        </Typography>
      </Box>

      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 3 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Horizon</Typography>
          <ToggleButtonGroup
            value={days} exclusive size="small"
            onChange={(_, v) => v && setDays(v)}
            sx={{ '& .MuiToggleButton-root': { py: 0.5, px: 2, textTransform: 'none', fontSize: '0.8rem' } }}
          >
            {DAYS_OPTIONS.map((d) => (
              <ToggleButton key={d} value={d}>{d}d</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Category</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {categories.map((cat) => {
              const meta = cat === 'all' ? null : categoryMeta(cat)
              return (
                <Chip
                  key={cat}
                  label={cat === 'all' ? 'All' : meta!.label}
                  size="small" clickable
                  onClick={() => setCatFilter(cat)}
                  sx={{
                    fontWeight: catFilter === cat ? 700 : 400,
                    bgcolor: catFilter === cat ? (meta?.bgColor ?? 'rgba(74,158,255,0.12)') : 'transparent',
                    color:   catFilter === cat ? (meta?.color ?? 'primary.main') : 'text.secondary',
                    border:  '1px solid',
                    borderColor: catFilter === cat ? (meta?.color ?? 'primary.main') : 'divider',
                    fontSize: '0.7rem',
                  }}
                />
              )
            })}
          </Box>
        </Box>
      </Box>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load economic calendar.</Alert>}

      {!isLoading && filtered.length === 0 && (
        <Alert severity="info">No events in the next {days} days for the selected category.</Alert>
      )}

      {today.length > 0 && (
        <Box mb={3}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#FF6B6B', mb: 1 }}>
            Today
          </Typography>
          {today.map((ev, i) => <EventCard key={i} ev={ev} />)}
        </Box>
      )}

      {thisWeek.length > 0 && (
        <Box mb={3}>
          <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={1}>
            This Week
          </Typography>
          {thisWeek.map((ev, i) => <EventCard key={i} ev={ev} />)}
        </Box>
      )}

      {later.length > 0 && (
        <Box>
          <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={1}>
            Upcoming
          </Typography>
          {later.map((ev, i) => <EventCard key={i} ev={ev} />)}
        </Box>
      )}
    </Box>
  )
}
