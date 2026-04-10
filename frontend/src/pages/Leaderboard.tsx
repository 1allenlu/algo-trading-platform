/**
 * Anonymous Public Leaderboard — Phase 68.
 *
 * Shows all publicly shared portfolio snapshots ranked by total return.
 * Users opt in by sharing their snapshot with the "public" flag.
 */

import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  IconButton, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material'
import { Refresh as RefreshIcon, EmojiEvents as TrophyIcon } from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, type LeaderboardEntry } from '@/services/api'

const MEDAL = ['🥇', '🥈', '🥉']

function pct(n: number | null) {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(2)}%`
}

function color(n: number | null) {
  if (n == null) return 'text.secondary'
  return n >= 0 ? '#00C896' : '#FF6B6B'
}

export default function LeaderboardPage() {
  const { data = [], isLoading, error, refetch } = useQuery<LeaderboardEntry[]>({
    queryKey:  ['leaderboard'],
    queryFn:   () => api.share.getLeaderboard(),
    staleTime: 5 * 60_000,
  })

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <TrophyIcon sx={{ color: '#F59E0B' }} />
            <Typography variant="h5" fontWeight={700}>Public Leaderboard</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Anonymously shared paper portfolio snapshots, ranked by total return.
            Share your portfolio via Analytics → Share to appear here.
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={() => refetch()} size="small">
            <RefreshIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error">Failed to load leaderboard.</Alert>}

      {data.length > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Rank', 'Portfolio', 'Total Return', 'Sharpe', 'Max Drawdown', 'Shared'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((entry, i) => (
                    <TableRow key={entry.token} hover>
                      <TableCell sx={{ fontWeight: 700, fontSize: '1rem' }}>
                        {i < 3 ? MEDAL[i] : `#${i + 1}`}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {entry.title ?? `Portfolio #${i + 1}`}
                        </Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'IBM Plex Mono, monospace' }}>
                          {entry.token.slice(0, 8)}…
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontFamily="IBM Plex Mono, monospace"
                          fontWeight={700}
                          sx={{ color: color(entry.total_return) }}
                        >
                          {pct(entry.total_return)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                        {entry.sharpe != null ? entry.sharpe.toFixed(2) : '—'}
                      </TableCell>
                      <TableCell>
                        {entry.max_drawdown != null ? (
                          <Chip
                            size="small"
                            label={`${(entry.max_drawdown * 100).toFixed(1)}%`}
                            sx={{
                              height: 18, fontSize: '0.65rem', fontWeight: 700,
                              bgcolor: Math.abs(entry.max_drawdown) < 0.1 ? '#00C89622' : '#FF6B6B22',
                              color:   Math.abs(entry.max_drawdown) < 0.1 ? '#00C896'   : '#FF6B6B',
                            }}
                          />
                        ) : '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {!isLoading && data.length === 0 && !error && (
        <Alert severity="info">
          No public portfolios yet. Be the first — go to Analytics and click "Share" to submit yours.
        </Alert>
      )}
    </Box>
  )
}
