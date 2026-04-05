/**
 * News Sentiment page — Phase 14.
 *
 * Fetches recent news articles via yfinance and scores them with VADER
 * (Valence Aware Dictionary and sEntiment Reasoner). Shows per-article
 * sentiment scores and an aggregate bullish/bearish/neutral summary.
 *
 * Layout:
 *   Symbol selector bar
 *   Aggregate sentiment card (gauge + counts)
 *   Article list with compound score badges
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
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  Article as ArticleIcon,
  AutoAwesome as LLMIcon,
  OpenInNew as OpenIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  TrendingDown,
  TrendingFlat,
  TrendingUp,
} from '@mui/icons-material'
import { useQuery } from '@tanstack/react-query'
import { api, type NewsAggregateSentiment } from '@/services/api'

// ── Colour helpers ─────────────────────────────────────────────────────────────

function sentimentColor(label: string) {
  if (label === 'bullish') return '#06d6a0'
  if (label === 'bearish') return '#ff6b6b'
  return '#94a3b8'
}

function compoundColor(v: number) {
  if (v >= 0.05)  return '#06d6a0'
  if (v <= -0.05) return '#ff6b6b'
  return '#94a3b8'
}

function SentimentIcon({ label }: { label: string }) {
  if (label === 'bullish') return <TrendingUp sx={{ color: '#06d6a0', fontSize: 20 }} />
  if (label === 'bearish') return <TrendingDown sx={{ color: '#ff6b6b', fontSize: 20 }} />
  return <TrendingFlat sx={{ color: '#94a3b8', fontSize: 20 }} />
}

// ── Aggregate card ─────────────────────────────────────────────────────────────

function AggregateCard({ data }: { data: NewsAggregateSentiment }) {
  const total = data.article_count || 1
  const bullPct = (data.bullish_count / total) * 100
  const bearPct = (data.bearish_count / total) * 100
  const neuPct  = (data.neutral_count / total) * 100

  return (
    <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <SentimentIcon label={data.label} />
          <Typography variant="h6" fontWeight={700}>
            {data.symbol} — News Sentiment
          </Typography>
          <Chip
            size="small"
            label={data.label.toUpperCase()}
            sx={{
              bgcolor: sentimentColor(data.label) + '22',
              color:   sentimentColor(data.label),
              fontWeight: 700,
              ml: 1,
            }}
          />
        </Box>

        <Grid container spacing={2} mb={2}>
          {[
            { label: 'Articles Analysed', value: data.article_count, color: 'text.primary' },
            { label: 'Avg VADER Score',   value: data.avg_compound.toFixed(3), color: compoundColor(data.avg_compound) },
            { label: 'Bullish',           value: data.bullish_count, color: '#06d6a0' },
            { label: 'Bearish',           value: data.bearish_count, color: '#ff6b6b' },
            { label: 'Neutral',           value: data.neutral_count, color: '#94a3b8' },
          ].map(({ label, value, color }) => (
            <Grid item xs={6} sm key={label}>
              <Typography variant="caption" color="text.disabled" display="block">{label}</Typography>
              <Typography variant="h6" fontWeight={700} sx={{ color }}>
                {value}
              </Typography>
            </Grid>
          ))}
        </Grid>

        {/* Stacked bar */}
        <Box sx={{ display: 'flex', height: 8, borderRadius: 1, overflow: 'hidden', gap: 0.25 }}>
          <Box sx={{ flex: bullPct, bgcolor: '#06d6a0', transition: 'flex 0.3s' }} />
          <Box sx={{ flex: neuPct,  bgcolor: '#94a3b8', transition: 'flex 0.3s' }} />
          <Box sx={{ flex: bearPct, bgcolor: '#ff6b6b', transition: 'flex 0.3s' }} />
        </Box>
        <Stack direction="row" justifyContent="space-between" mt={0.5}>
          {[
            { label: `Bullish ${bullPct.toFixed(0)}%`, color: '#06d6a0' },
            { label: `Neutral ${neuPct.toFixed(0)}%`,  color: '#94a3b8' },
            { label: `Bearish ${bearPct.toFixed(0)}%`, color: '#ff6b6b' },
          ].map(({ label, color }) => (
            <Typography key={label} variant="caption" sx={{ color }}>{label}</Typography>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}

// ── Article row ────────────────────────────────────────────────────────────────

function ArticleRow({ article, idx }: { article: NewsAggregateSentiment['articles'][0]; idx: number }) {
  const compound = article.compound
  const barWidth = Math.abs(compound) * 100   // 0-100%
  const barLeft  = compound < 0               // bar grows left from centre

  return (
    <Card
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        mb: 1.5,
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: sentimentColor(article.label) },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          {/* Article number */}
          <Typography
            variant="caption"
            sx={{
              width: 22, height: 22, borderRadius: '50%',
              bgcolor: 'action.selected',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, flexShrink: 0, color: 'text.disabled', mt: 0.2,
            }}
          >
            {idx + 1}
          </Typography>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 200 }}>
                {article.title}
              </Typography>
              <Chip
                size="small"
                label={compound >= 0 ? `+${compound.toFixed(3)}` : compound.toFixed(3)}
                sx={{
                  bgcolor: compoundColor(compound) + '22',
                  color:   compoundColor(compound),
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                }}
              />
              <Tooltip title="Open article">
                <IconButton
                  size="small"
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  component="a"
                  sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                >
                  <OpenIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Box>

            <Stack direction="row" spacing={1} mb={1}>
              <Typography variant="caption" color="text.disabled">{article.publisher}</Typography>
              <Typography variant="caption" color="text.disabled">·</Typography>
              <Typography variant="caption" color="text.disabled">
                {article.published ? new Date(article.published).toLocaleDateString() : ''}
              </Typography>
              <SentimentIcon label={article.label} />
            </Stack>

            {/* VADER compound bar centred at 0 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.disabled" sx={{ width: 28, textAlign: 'right' }}>
                -1
              </Typography>
              <Box
                sx={{
                  flex: 1, height: 4, bgcolor: 'action.hover', borderRadius: 1,
                  position: 'relative', overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    height: '100%',
                    width: `${barWidth / 2}%`,
                    bgcolor: compoundColor(compound),
                    borderRadius: 1,
                    left:  barLeft ? `${50 - barWidth / 2}%` : '50%',
                    right: barLeft ? undefined : undefined,
                    transition: 'width 0.3s',
                  }}
                />
                {/* Centre line */}
                <Box
                  sx={{
                    position: 'absolute', left: '50%', top: 0, bottom: 0,
                    width: 1, bgcolor: 'divider', transform: 'translateX(-50%)',
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.disabled" sx={{ width: 28 }}>+1</Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const QUICK_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA']

export default function NewsPage() {
  const [symbol, setSymbol]   = useState('SPY')
  const [input, setInput]     = useState('SPY')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey:  ['news', symbol],
    queryFn:   () => api.news.getSentiment(symbol, 20),
    staleTime: 5 * 60 * 1000,   // 5 min — matches backend cache TTL
    retry:     1,
  })

  const handleSearch = () => {
    const sym = input.trim().toUpperCase()
    if (sym) setSymbol(sym)
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        News Sentiment
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        VADER-scored financial news headlines. Scores range from -1 (very bearish) to +1 (very bullish).
        Data cached for 5 minutes per symbol.
      </Typography>

      {/* Symbol search bar */}
      <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <CardContent sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={1}>
            <TextField
              size="small"
              placeholder="Ticker symbol…"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                  </InputAdornment>
                ),
                sx: { fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 },
              }}
              sx={{ width: 180 }}
            />
            <IconButton onClick={handleSearch} size="small" color="primary">
              <SearchIcon />
            </IconButton>
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            {QUICK_SYMBOLS.map((s) => (
              <Chip
                key={s}
                label={s}
                size="small"
                clickable
                onClick={() => { setInput(s); setSymbol(s) }}
                sx={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontWeight: symbol === s ? 700 : 400,
                  bgcolor:    symbol === s ? 'rgba(0,180,216,0.15)' : 'transparent',
                  color:      symbol === s ? 'primary.main' : 'text.secondary',
                  border: '1px solid',
                  borderColor: symbol === s ? 'primary.main' : 'divider',
                }}
              />
            ))}
            <IconButton size="small" onClick={() => refetch()} sx={{ ml: 'auto' }}>
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Stack>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && <LinearProgress sx={{ borderRadius: 1, mb: 2 }} />}

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to fetch news for {symbol}. yfinance may not have data for this ticker.
        </Alert>
      )}

      {/* No data */}
      {data && data.article_count === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No recent news articles found for {symbol}.
        </Alert>
      )}

      {/* Aggregate card */}
      {data && data.article_count > 0 && <AggregateCard data={data} />}

      {/* Phase 53: LLM summary card */}
      {data?.llm_summary && (
        <Card sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <LLMIcon sx={{ fontSize: 18, color: '#A78BFA' }} />
              <Typography variant="subtitle2" fontWeight={700}>AI Summary</Typography>
              <Typography variant="caption" color="text.disabled">· powered by Claude</Typography>
            </Box>
            <Typography variant="body2" sx={{ lineHeight: 1.8, color: 'text.secondary' }}>
              {data.llm_summary}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Article list */}
      {data && data.articles.length > 0 && (
        <Box>
          <Typography variant="subtitle2" fontWeight={700} mb={1.5} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ArticleIcon sx={{ fontSize: 18 }} />
            Recent Articles ({data.articles.length})
          </Typography>
          {data.articles.map((article, i) => (
            <ArticleRow key={i} article={article} idx={i} />
          ))}
        </Box>
      )}

      {/* Initial empty state */}
      {!data && !isLoading && (
        <Box
          sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: 300, border: '1px dashed',
            borderColor: 'divider', borderRadius: 2, color: 'text.disabled',
          }}
        >
          <CircularProgress size={32} sx={{ mb: 2, opacity: 0.4 }} />
          <Typography>Select a symbol to load news</Typography>
        </Box>
      )}
    </Box>
  )
}
