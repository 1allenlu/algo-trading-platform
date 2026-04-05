/**
 * Strategy Paper Tournaments — Phase 52.
 *
 * Create a tournament with N named strategy configurations, each competing
 * over the same historical date window.  A leaderboard ranks participants by
 * Sharpe ratio.  An equity curve overlay lets you visually compare growth paths.
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
  IconButton,
  MenuItem,
  Select,
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
  Add as AddIcon,
  Delete as DeleteIcon,
  EmojiEvents as TrophyIcon,
  PlayArrow as RunIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, type CreateTournamentRequest, type TournamentDetail } from '@/services/api'

// ── Palette for up to 8 participants ──────────────────────────────────────────
const COLORS = ['#4A9EFF', '#00C896', '#FF6B6B', '#F59E0B', '#A78BFA', '#F472B6', '#34D399', '#FB923C']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(v: number | null) {
  if (v === null || v === undefined) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function fmtNum(v: number | null, dp = 3) {
  if (v === null || v === undefined) return '—'
  return v.toFixed(dp)
}

function rankColor(rank: number) {
  if (rank === 1) return '#F59E0B'
  if (rank === 2) return '#94a3b8'
  if (rank === 3) return '#CD7F32'
  return 'text.disabled'
}

// ── Leaderboard table ─────────────────────────────────────────────────────────

function Leaderboard({ participants }: { participants: TournamentDetail['participants'] }) {
  if (!participants.length) return null

  const sorted = [...participants].sort((a, b) => (b.sharpe ?? -99) - (a.sharpe ?? -99))

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Rank', 'Participant', 'Strategy', 'Return', 'Sharpe', 'Max DD', 'Trades', 'Final Equity'].map((h) => (
              <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((p, i) => (
            <TableRow key={p.id} hover>
              <TableCell>
                <Typography
                  fontWeight={700}
                  sx={{ color: rankColor(i + 1), fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  {i === 0 && <TrophyIcon sx={{ fontSize: 14 }} />}
                  #{i + 1}
                </Typography>
              </TableCell>
              <TableCell sx={{ fontWeight: 600, color: COLORS[i % COLORS.length] }}>{p.name}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={(p.config as Record<string, unknown>).strategy as string ?? 'sma_cross'}
                  sx={{ fontSize: '0.65rem', height: 18 }}
                />
              </TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: (p.total_return ?? 0) >= 0 ? '#00C896' : '#FF6B6B', fontWeight: 700 }}>
                {fmtPct(p.total_return)}
              </TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>{fmtNum(p.sharpe)}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem', color: '#FF6B6B' }}>
                {p.max_drawdown !== null ? `-${p.max_drawdown?.toFixed(2)}%` : '—'}
              </TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>{p.num_trades ?? '—'}</TableCell>
              <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                ${(p.final_equity ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ── Equity overlay chart ──────────────────────────────────────────────────────

function EquityOverlay({ participants }: { participants: TournamentDetail['participants'] }) {
  if (!participants.length || !participants[0].equity_curve?.length) return null

  // Merge all curves on the same date index
  const allDates = participants[0].equity_curve.map((p) => p.date)
  const data = allDates.map((date, i) => {
    const row: Record<string, unknown> = { date }
    participants.forEach((p) => {
      row[p.name] = p.equity_curve[i]?.equity ?? null
    })
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <defs>
          {participants.map((p, i) => (
            <linearGradient key={p.id} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={COLORS[i % COLORS.length]} stopOpacity={0.18} />
              <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          width={56}
        />
        <ReTooltip
          formatter={(v: number, name: string) => [`$${v.toLocaleString()}`, name]}
          labelStyle={{ color: '#aaa', fontSize: 11 }}
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {participants.map((p, i) => (
          <Area
            key={p.id}
            type="monotone"
            dataKey={p.name}
            stroke={COLORS[i % COLORS.length]}
            fill={`url(#grad-${i})`}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Create tournament form ─────────────────────────────────────────────────────

const PRESETS = [
  { name: 'Fast SMA Cross',   config: { strategy: 'sma_cross', fast: 5, slow: 20 } },
  { name: 'Slow SMA Cross',   config: { strategy: 'sma_cross', fast: 10, slow: 50 } },
  { name: 'Golden Cross',     config: { strategy: 'sma_cross', fast: 50, slow: 200 } },
  { name: 'RSI Oversold 30',  config: { strategy: 'rsi_revert', period: 14, oversold: 30, overbought: 70 } },
  { name: 'RSI Oversold 20',  config: { strategy: 'rsi_revert', period: 14, oversold: 20, overbought: 80 } },
]

interface ParticipantRow {
  name:   string
  preset: number   // index into PRESETS
}

function CreatePanel({ onCreated }: { onCreated: (id: number) => void }) {
  const qc = useQueryClient()
  const [name, setName]     = useState('My Tournament')
  const [symbol, setSymbol] = useState('SPY')
  const [startDate, setStart] = useState('2022-01-01')
  const [endDate, setEnd]     = useState('2023-12-31')
  const [rows, setRows]       = useState<ParticipantRow[]>([
    { name: 'Fast SMA Cross', preset: 0 },
    { name: 'Golden Cross',   preset: 2 },
    { name: 'RSI Revert',     preset: 3 },
  ])

  const create = useMutation({
    mutationFn: (req: CreateTournamentRequest) => api.tournament.create(req),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tournaments'] })
      onCreated(data.tournament_id)
    },
  })

  const addRow = () => setRows((r) => [...r, { name: PRESETS[0].name, preset: 0 }])
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i))

  const handleSubmit = () => {
    const participants = rows.map((r) => ({
      name:   r.name,
      config: PRESETS[r.preset].config as Record<string, unknown>,
    }))
    create.mutate({
      name,
      symbols:      [symbol.toUpperCase()],
      start_date:   startDate,
      end_date:     endDate,
      participants,
    })
  }

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>New Tournament</Typography>

        <Grid container spacing={2} mb={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Tournament Name" fullWidth size="small"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              label="Symbol" fullWidth size="small"
              value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              inputProps={{ style: { fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 } }}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              label="Start Date" fullWidth size="small" type="date"
              value={startDate} onChange={(e) => setStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              label="End Date" fullWidth size="small" type="date"
              value={endDate} onChange={(e) => setEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>

        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
          Participants (max 10)
        </Typography>

        {rows.map((row, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <Box
              sx={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                bgcolor: COLORS[i % COLORS.length],
              }}
            />
            <TextField
              size="small" placeholder="Participant name"
              value={row.name}
              onChange={(e) => setRows((r) => r.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
              sx={{ width: 200 }}
            />
            <Select
              size="small" value={row.preset}
              onChange={(e) =>
                setRows((r) => r.map((x, idx) =>
                  idx === i ? { ...x, preset: Number(e.target.value), name: PRESETS[Number(e.target.value)].name } : x
                ))
              }
              sx={{ minWidth: 180, fontSize: '0.8rem' }}
            >
              {PRESETS.map((p, pi) => (
                <MenuItem key={pi} value={pi} sx={{ fontSize: '0.8rem' }}>{p.name}</MenuItem>
              ))}
            </Select>
            <IconButton size="small" onClick={() => removeRow(i)} disabled={rows.length <= 2}>
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        ))}

        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button
            size="small" startIcon={<AddIcon />}
            onClick={addRow} disabled={rows.length >= 10}
            variant="outlined"
          >
            Add Participant
          </Button>
          <Button
            variant="contained" startIcon={create.isPending ? <CircularProgress size={14} color="inherit" /> : <RunIcon />}
            onClick={handleSubmit}
            disabled={create.isPending || rows.length < 2}
          >
            {create.isPending ? 'Running…' : 'Run Tournament'}
          </Button>
        </Box>

        {create.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>Failed to create tournament.</Alert>
        )}
      </CardContent>
    </Card>
  )
}

// ── Tournament detail view ────────────────────────────────────────────────────

function TournamentView({ id, onBack }: { id: number; onBack: () => void }) {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey:  ['tournament', id],
    queryFn:   () => api.tournament.get(id),
    refetchInterval: (query) => query.state.data?.status === 'running' ? 2000 : false,
  })

  const rerun = useMutation({
    mutationFn: () => api.tournament.rerun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournament', id] }),
  })

  const del = useMutation({
    mutationFn: () => api.tournament.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tournaments'] }); onBack() },
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button size="small" variant="outlined" onClick={onBack}>← Back</Button>
        {data && (
          <>
            <Typography variant="h6" fontWeight={700}>{data.name}</Typography>
            <Chip
              size="small"
              label={data.status.toUpperCase()}
              color={data.status === 'done' ? 'success' : data.status === 'failed' ? 'error' : 'default'}
            />
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
              {(data.status === 'done' || data.status === 'failed') && (
                <Tooltip title="Re-run tournament">
                  <IconButton size="small" onClick={() => rerun.mutate()} disabled={rerun.isPending}>
                    <RefreshIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Delete tournament">
                <IconButton size="small" color="error" onClick={() => del.mutate()} disabled={del.isPending}>
                  <DeleteIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </>
        )}
      </Box>

      {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}
      {error    && <Alert severity="error">Failed to load tournament.</Alert>}

      {data?.status === 'running' && (
        <Alert severity="info" icon={<CircularProgress size={16} />} sx={{ mb: 2 }}>
          Tournament is running — results will appear shortly…
        </Alert>
      )}

      {data?.status === 'failed' && (
        <Alert severity="error" sx={{ mb: 2 }}>Tournament failed: {data.error}</Alert>
      )}

      {data && data.participants.length > 0 && (
        <Grid container spacing={3}>
          {/* Leaderboard */}
          <Grid item xs={12}>
            <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <TrophyIcon sx={{ fontSize: 18, color: '#F59E0B' }} />
                  <Typography variant="subtitle2" fontWeight={700}>Leaderboard</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {data.symbols.join(', ')} · {data.start_date} → {data.end_date}
                  </Typography>
                </Box>
                <Leaderboard participants={data.participants} />
              </CardContent>
            </Card>
          </Grid>

          {/* Equity overlay */}
          {data.status === 'done' && (
            <Grid item xs={12}>
              <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={2}>Equity Curve Overlay</Typography>
                  <EquityOverlay participants={data.participants} />
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  )
}

// ── Tournaments list ──────────────────────────────────────────────────────────

function TournamentList({ onSelect }: { onSelect: (id: number) => void }) {
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn:  () => api.tournament.list(),
    staleTime: 10_000,
  })

  const del = useMutation({
    mutationFn: (id: number) => api.tournament.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournaments'] }),
  })

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>

  if (!data.length) return (
    <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
      No tournaments yet. Create one above to get started.
    </Typography>
  )

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Name', 'Symbol', 'Period', 'Participants', 'Status', ''].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((t) => (
              <TableRow
                key={t.id} hover
                sx={{ cursor: 'pointer' }}
                onClick={() => onSelect(t.id)}
              >
                <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                  {t.symbols.join(', ')}
                </TableCell>
                <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {t.start_date} → {t.end_date}
                </TableCell>
                <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                  {t.participant_count}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={t.status.toUpperCase()}
                    color={t.status === 'done' ? 'success' : t.status === 'failed' ? 'error' : 'default'}
                    sx={{ fontSize: '0.62rem', height: 18 }}
                  />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <IconButton size="small" color="error" onClick={() => del.mutate(t.id)}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TournamentPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  if (selectedId !== null) {
    return <TournamentView id={selectedId} onBack={() => setSelectedId(null)} />
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Strategy Tournaments</Typography>
        <Typography variant="body2" color="text.secondary">
          Run multiple strategy configurations head-to-head over the same historical window.
          Compare performance on Sharpe ratio, drawdown, and total return.
        </Typography>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <CreatePanel onCreated={(id) => setSelectedId(id)} />

      <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Past Tournaments</Typography>
      <TournamentList onSelect={setSelectedId} />
    </Box>
  )
}
