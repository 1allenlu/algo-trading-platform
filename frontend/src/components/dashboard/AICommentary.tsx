/**
 * AICommentary — Phase 43.
 *
 * Card that fetches a plain-English portfolio summary from the LLM commentary
 * endpoint (GET /api/analytics/commentary) and displays it.
 *
 * States:
 *   loading   → Skeleton placeholder
 *   null      → Muted message prompting the user to set ANTHROPIC_API_KEY
 *   commentary → Text block with generated_at timestamp + model name below
 *
 * The query is cached for 30 minutes. A Refresh icon button manually
 * invalidates the cache so the user can generate a fresh summary on demand.
 */

import {
  Box,
  Card,
  CardContent,
  IconButton,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material'
import { AutoAwesome as AIIcon, Refresh as RefreshIcon } from '@mui/icons-material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'

// ── Query key ─────────────────────────────────────────────────────────────────

const QUERY_KEY = ['analytics', 'commentary'] as const

// ── Component ─────────────────────────────────────────────────────────────────

export default function AICommentary() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey:  QUERY_KEY,
    queryFn:   () => api.commentary.get(),
    // Cache for 30 minutes — LLM calls are expensive; user can refresh manually
    staleTime: 30 * 60_000,
    retry:     1,
  })

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  }

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AIIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography variant="subtitle2" fontWeight={700}>
              Daily AI Summary
            </Typography>
          </Box>
          <Tooltip title="Generate a fresh summary">
            <IconButton size="small" onClick={handleRefresh} disabled={isLoading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Loading state */}
        {isLoading && (
          <Box>
            <Skeleton variant="text" width="100%" height={20} />
            <Skeleton variant="text" width="90%" height={20} />
            <Skeleton variant="text" width="75%" height={20} />
          </Box>
        )}

        {/* No API key configured */}
        {!isLoading && (!data || data.commentary === null) && (
          <Typography variant="body2" color="text.disabled" fontStyle="italic">
            Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> to enable AI summaries.
          </Typography>
        )}

        {/* Commentary available */}
        {!isLoading && data?.commentary && (
          <Box>
            <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.7 }}>
              {data.commentary}
            </Typography>
            <Box sx={{ mt: 1.5, display: 'flex', gap: 2 }}>
              {data.generated_at && (
                <Typography variant="caption" color="text.disabled">
                  Generated {new Date(data.generated_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Typography>
              )}
              {data.model && (
                <Typography variant="caption" color="text.disabled">
                  {data.model}
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
