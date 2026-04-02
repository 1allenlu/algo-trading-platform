/**
 * Trade Journal page — Phase 36.
 *
 * Auto-populated from paper trading fills (buy → open entry, sell → close + P&L).
 * Users can enrich entries with notes, tags, and a star rating.
 *
 * Layout:
 *   Stats row   — Total trades, win rate, total P&L, avg win/loss, avg rating
 *   Journal table — symbol, side, qty, entry/exit price, P&L, date, notes editor, rating
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Stack,
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
  BookOutlined as JournalIcon,
  CheckCircleOutline as SaveIcon,
  DeleteOutline as DeleteIcon,
  Star as StarFilledIcon,
  StarBorder as StarEmptyIcon,
} from '@mui/icons-material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type JournalEntry } from '@/services/api'

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, color,
}: { label: string; value: string; color?: string }) {
  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="caption" color="text.disabled" display="block" mb={0.5}>
          {label}
        </Typography>
        <Typography
          variant="h5"
          fontWeight={700}
          fontFamily="IBM Plex Mono, monospace"
          sx={{ color: color ?? 'text.primary', lineHeight: 1.2 }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── Star rating ───────────────────────────────────────────────────────────────
function StarRating({
  value, onChange,
}: { value: number | null; onChange: (v: number) => void }) {
  return (
    <Stack direction="row" spacing={0}>
      {[1, 2, 3, 4, 5].map((star) => (
        <IconButton
          key={star}
          size="small"
          onClick={() => onChange(star)}
          sx={{ p: 0.25 }}
        >
          {star <= (value ?? 0)
            ? <StarFilledIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
            : <StarEmptyIcon  sx={{ fontSize: 16, color: '#4B5563' }} />
          }
        </IconButton>
      ))}
    </Stack>
  )
}

// ── Inline note editor ────────────────────────────────────────────────────────
function NoteEditor({ entry }: { entry: JournalEntry }) {
  const [notes,  setNotes]  = useState(entry.notes ?? '')
  const [tags,   setTags]   = useState(entry.tags  ?? '')
  const [rating, setRating] = useState<number | null>(entry.rating ?? null)
  const [saved,  setSaved]  = useState(false)

  const qc = useQueryClient()

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => api.journal.update(entry.id, notes || null, tags || null, rating),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['journal'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 280 }}>
      <TextField
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Trade notes…"
        multiline
        maxRows={3}
        size="small"
        sx={{ '& .MuiInputBase-root': { fontSize: '0.75rem' } }}
      />
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags (comma-sep)"
          size="small"
          sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: '0.7rem' } }}
        />
        <StarRating value={rating} onChange={setRating} />
        <Tooltip title={saved ? 'Saved!' : 'Save'}>
          <span>
            <IconButton
              size="small"
              onClick={() => save()}
              disabled={isPending}
              sx={{ color: saved ? '#06d6a0' : 'primary.main' }}
            >
              {isPending ? <CircularProgress size={14} /> : <SaveIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JournalPage() {
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey:         ['journal'],
    queryFn:          () => api.journal.list(200),
    refetchInterval:  10_000,
  })

  const { mutate: deleteEntry } = useMutation({
    mutationFn: (id: number) => api.journal.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['journal'] }),
  })

  const entries = data?.entries ?? []
  const stats   = data?.stats

  const fmtPnl = (pnl: number | null) => {
    if (pnl == null) return '—'
    return `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`
  }

  const pnlColor = (pnl: number | null) => {
    if (pnl == null) return 'text.secondary'
    return pnl > 0 ? '#06d6a0' : pnl < 0 ? '#ff6b6b' : 'text.primary'
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <JournalIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        <Typography variant="h4">Trade Journal</Typography>
        <Chip label="Phase 36" size="small" color="primary" sx={{ fontSize: '0.65rem' }} />
      </Box>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Auto-populated from paper trading fills. Add notes, tags, and ratings to review your trades.
      </Typography>

      {/* Stats row */}
      {stats && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard label="Total Trades" value={String(stats.total_trades)} />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard
              label="Win Rate"
              value={`${(stats.win_rate * 100).toFixed(1)}%`}
              color={stats.win_rate >= 0.5 ? '#06d6a0' : '#ff6b6b'}
            />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard
              label="Total P&L"
              value={fmtPnl(stats.total_pnl)}
              color={pnlColor(stats.total_pnl)}
            />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard
              label="Avg Win"
              value={fmtPnl(stats.avg_win)}
              color="#06d6a0"
            />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard
              label="Avg Loss"
              value={fmtPnl(stats.avg_loss)}
              color="#ff6b6b"
            />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <StatCard
              label="Avg Rating"
              value={stats.avg_rating != null ? `${stats.avg_rating.toFixed(1)} ★` : '—'}
              color="#f59e0b"
            />
          </Grid>
        </Grid>
      )}

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {isError && (
        <Alert severity="error">Failed to load journal entries.</Alert>
      )}

      {!isLoading && !isError && entries.length === 0 && (
        <Box sx={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: 240, border: '1px dashed', borderColor: 'divider',
          borderRadius: 2, color: 'text.disabled',
        }}>
          <JournalIcon sx={{ fontSize: 44, mb: 1.5, opacity: 0.35 }} />
          <Typography>No trades yet — make some paper trades on the Trading page</Typography>
        </Box>
      )}

      {entries.length > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'P&L', 'Date', 'Notes / Tags / Rating', ''].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'primary.main' }}>
                      {entry.symbol}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={entry.side.toUpperCase()}
                        size="small"
                        sx={{
                          bgcolor: entry.side === 'buy' ? 'rgba(6,214,160,0.15)' : 'rgba(255,107,107,0.15)',
                          color:   entry.side === 'buy' ? '#06d6a0' : '#ff6b6b',
                          fontWeight: 700,
                          fontSize: '0.65rem',
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                      {entry.qty}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                      ${entry.entry_price.toFixed(2)}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                      {entry.exit_price != null ? `$${entry.exit_price.toFixed(2)}` : (
                        <Chip label="OPEN" size="small" sx={{ fontSize: '0.6rem', color: '#f59e0b', bgcolor: 'rgba(245,158,11,0.12)' }} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontFamily="IBM Plex Mono, monospace"
                        fontSize="0.8rem"
                        sx={{ color: pnlColor(entry.pnl) }}
                      >
                        {fmtPnl(entry.pnl)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {new Date(entry.entry_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <NoteEditor entry={entry} />
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Tooltip title="Delete entry">
                        <IconButton size="small" onClick={() => deleteEntry(entry.id)} sx={{ color: 'text.disabled' }}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <Box sx={{ mt: 3, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.disabled">
          Phase 36 — Trade Journal · Entries auto-created from paper trading fills · Refreshes every 10 s
        </Typography>
      </Box>
    </Box>
  )
}
