/**
 * Intro / Landing page — Phase 9.
 *
 * Full-screen showcase of the platform's capabilities.
 * Rendered outside the sidebar+topbar layout (no chrome).
 * "Enter Platform" navigates to /dashboard.
 */

import {
  Box,
  Button,
  Chip,
  Grid,
  Typography,
} from '@mui/material'
import {
  Assessment as BacktestIcon,
  AutoGraph as AutoGraphIcon,
  AutoMode as AutoTradeIcon,
  CandlestickChart as TradingIcon,
  Dashboard as DashboardIcon,
  Insights as AnalyticsIcon,
  NotificationsOutlined as AlertsIcon,
  Psychology as MLIcon,
  QueryStats as RiskIcon,
  Science as SHAPIcon,
  Search as ScannerIcon,
  ShowChart as LogoIcon,
  Tune as OptimizeIcon,
  TrendingUp as StrategiesIcon,
  AccountBalance as PortfolioIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

// ── Feature card data ─────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon:        <DashboardIcon sx={{ fontSize: 28 }} />,
    title:       'Live Market Dashboard',
    phase:       'Phase 1',
    color:       '#4A9EFF',
    description: 'Real-time OHLCV candlestick charts for SPY, QQQ, AAPL and more. Powered by TimescaleDB with 5 years of historical data and sub-second query performance.',
    tags:        ['TimescaleDB', 'yfinance', 'Recharts'],
  },
  {
    icon:        <MLIcon sx={{ fontSize: 28 }} />,
    title:       'ML Price Prediction',
    phase:       'Phase 2',
    color:       '#8B5CF6',
    description: 'XGBoost binary classifier trained on 42 technical features predicts next-day price direction. Walk-forward backtesting eliminates lookahead bias.',
    tags:        ['XGBoost', '42 Features', 'Walk-Forward CV'],
  },
  {
    icon:        <StrategiesIcon sx={{ fontSize: 28 }} />,
    title:       'Quant Strategies',
    phase:       'Phase 3',
    color:       '#F59E0B',
    description: 'Three institutional-grade strategies: pairs trading (cointegration), momentum (12-1 cross-sectional), and mean reversion (Bollinger Bands).',
    tags:        ['Pairs Trading', 'Momentum', 'Mean Reversion'],
  },
  {
    icon:        <BacktestIcon sx={{ fontSize: 28 }} />,
    title:       'Backtest Engine',
    phase:       'Phase 3',
    color:       '#10B981',
    description: 'Full-fidelity backtesting with equity curve, drawdown chart, and trade log. Metrics: Sharpe, Sortino, CAGR, Calmar, max drawdown, win rate.',
    tags:        ['vectorbt', 'Sharpe', 'Trade Log'],
  },
  {
    icon:        <RiskIcon sx={{ fontSize: 28 }} />,
    title:       'Portfolio Risk',
    phase:       'Phase 4',
    color:       '#EF4444',
    description: 'VaR/CVaR at 95% & 99%, correlation heatmap, Markowitz efficient frontier with 10,000-portfolio Monte Carlo cloud. Interactive weight controls.',
    tags:        ['VaR/CVaR', 'Markowitz', 'Efficient Frontier'],
  },
  {
    icon:        <TradingIcon sx={{ fontSize: 28 }} />,
    title:       'Paper Trading',
    phase:       'Phase 5',
    color:       '#00C896',
    description: 'Zero-risk paper trading simulator backed by a live DB. Place market and limit orders, track positions with live P&L, view portfolio equity history.',
    tags:        ['Market Orders', 'Limit Orders', 'Live P&L'],
  },
  {
    icon:        <SHAPIcon sx={{ fontSize: 28 }} />,
    title:       'Advanced ML Signals',
    phase:       'Phase 6',
    color:       '#A78BFA',
    description: 'SHAP waterfall charts explain every prediction. RSI + moving average sentiment gauge. Composite BUY/HOLD/SELL signal aggregator with confidence score.',
    tags:        ['SHAP', 'Sentiment', 'Composite Signal'],
  },
  {
    icon:        <AutoGraphIcon sx={{ fontSize: 28 }} />,
    title:       'Real-time WebSocket',
    phase:       'Phase 7',
    color:       '#06B6D4',
    description: 'Live price ticker in the top bar and watchlist on the dashboard. Gaussian random walk price simulator running at 1Hz with exponential back-off reconnect.',
    tags:        ['WebSocket', '1Hz Ticks', 'Auto-Reconnect'],
  },
  {
    icon:        <AlertsIcon sx={{ fontSize: 28 }} />,
    title:       'Alerts & Notifications',
    phase:       'Phase 8',
    color:       '#F97316',
    description: 'Create price threshold and momentum alerts that fire in real-time via WebSocket. Bell icon with unread count, full event history, and per-rule cooldown.',
    tags:        ['Price Alerts', 'WS Push', 'Event History'],
  },
  {
    icon:        <AnalyticsIcon sx={{ fontSize: 28 }} />,
    title:       'Portfolio Analytics',
    phase:       'Phase 9',
    color:       '#EC4899',
    description: 'Deep-dive performance reporting: rolling Sharpe, annualized vol, P&L attribution by symbol, FIFO trade-level analytics, and one-click CSV export.',
    tags:        ['Rolling Sharpe', 'P&L Attribution', 'CSV Export'],
  },
  {
    icon:        <OptimizeIcon sx={{ fontSize: 28 }} />,
    title:       'Strategy Optimization',
    phase:       'Phase 10',
    color:       '#34D399',
    description: 'Hyperparameter grid search for all quant strategies. Define param ranges, pick an objective (Sharpe/Return/Calmar/Sortino), and run up to 50 in-memory trials ranked in a scatter chart.',
    tags:        ['Grid Search', 'Max 50 Trials', 'Ranked Results'],
  },
  {
    icon:        <ScannerIcon sx={{ fontSize: 28 }} />,
    title:       'Market Scanner',
    phase:       'Phase 11',
    color:       '#FBBF24',
    description: 'Technical screener for every symbol in the database. Filter by RSI, SMA relationship, volume spikes, 52-week proximity, and daily change — with 7 one-click presets.',
    tags:        ['RSI Filter', 'SMA Cross', 'Volume Spike'],
  },
  {
    icon:        <AutoTradeIcon sx={{ fontSize: 28 }} />,
    title:       'Auto Paper Trading',
    phase:       'Phase 12',
    color:       '#A78BFA',
    description: 'Signal-based automation that evaluates composite ML + sentiment signals on a configurable interval and places paper orders when confidence meets the threshold.',
    tags:        ['Signal-Based', 'Auto Orders', 'Activity Log'],
  },
]

const TECH_STACK = [
  { label: 'FastAPI',       color: '#00C896' },
  { label: 'React 18',      color: '#4A9EFF' },
  { label: 'PostgreSQL 15', color: '#336791' },
  { label: 'TimescaleDB',   color: '#F59E0B' },
  { label: 'Redis 7',       color: '#EF4444' },
  { label: 'XGBoost 2',     color: '#8B5CF6' },
  { label: 'SQLAlchemy 2',  color: '#A78BFA' },
  { label: 'Recharts 2',    color: '#06B6D4' },
  { label: 'MUI 5',         color: '#007FFF' },
  { label: 'Docker',        color: '#2496ED' },
  { label: 'WebSocket',     color: '#10B981' },
  { label: 'Pydantic v2',   color: '#E8316D' },
]

const STATS = [
  { value: '12',   label: 'Phases Built' },
  { value: '42',   label: 'ML Features' },
  { value: '3',    label: 'Quant Strategies' },
  { value: '1Hz',  label: 'Live Price Feed' },
]

// ── Feature Card ──────────────────────────────────────────────────────────────

function FeatureCard({
  icon, title, phase, color, description, tags,
}: typeof FEATURES[0]) {
  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        '&:hover': {
          borderColor: color,
          boxShadow: `0 0 0 1px ${color}33`,
        },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ color }}>{icon}</Box>
        <Chip
          label={phase}
          size="small"
          sx={{
            fontSize: '0.6rem',
            height: 18,
            bgcolor: `${color}22`,
            color,
            fontWeight: 700,
          }}
        />
      </Box>

      {/* Title */}
      <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
        {title}
      </Typography>

      {/* Description */}
      <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, fontSize: '0.82rem', lineHeight: 1.55 }}>
        {description}
      </Typography>

      {/* Tags */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
        {tags.map((t) => (
          <Chip
            key={t}
            label={t}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18, borderColor: 'divider', color: 'text.secondary' }}
          />
        ))}
      </Box>
    </Box>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntroPage() {
  const navigate = useNavigate()

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        overflowY: 'auto',
      }}
    >
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          textAlign: 'center',
          pt: { xs: 8, md: 12 },
          pb: { xs: 6, md: 8 },
          px: 3,
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(74,158,255,0.12) 0%, transparent 70%)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 2 }}>
          <LogoIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography
            variant="h3"
            fontWeight={800}
            sx={{ letterSpacing: '-1px', lineHeight: 1.1 }}
          >
            TradingOS
          </Typography>
        </Box>

        <Typography
          variant="h6"
          color="text.secondary"
          sx={{ maxWidth: 600, mx: 'auto', mb: 1.5, fontWeight: 400, lineHeight: 1.5 }}
        >
          A production-grade algorithmic trading platform — Quant strategies,
          ML predictions, real-time data, and portfolio analytics in one place.
        </Typography>

        <Typography variant="body2" color="text.disabled" mb={4}>
          12 phases · Full-stack · TypeScript + Python · Docker
        </Typography>

        {/* Stats row */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: { xs: 3, md: 6 },
            flexWrap: 'wrap',
            mb: 5,
          }}
        >
          {STATS.map(({ value, label }) => (
            <Box key={label} textAlign="center">
              <Typography
                variant="h4"
                fontWeight={800}
                color="primary.main"
                sx={{ fontFamily: 'Roboto Mono, monospace', lineHeight: 1.1 }}
              >
                {value}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {label}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/dashboard')}
            sx={{ px: 4, py: 1.25, fontWeight: 700, fontSize: '1rem', borderRadius: 2 }}
          >
            Launch Platform
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => navigate('/analytics')}
            sx={{ px: 4, py: 1.25, fontWeight: 700, fontSize: '1rem', borderRadius: 2 }}
          >
            View Analytics
          </Button>
        </Box>
      </Box>

      {/* ── Feature Grid ─────────────────────────────────────────────────── */}
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 }, pb: 8 }}>
        <Typography
          variant="h5"
          fontWeight={700}
          textAlign="center"
          mb={4}
          sx={{ letterSpacing: '-0.3px' }}
        >
          Every feature, shipped
        </Typography>

        <Grid container spacing={2.5}>
          {FEATURES.map((f) => (
            <Grid item xs={12} sm={6} md={4} key={f.title}>
              <FeatureCard {...f} />
            </Grid>
          ))}
        </Grid>

        {/* ── Tech Stack ─────────────────────────────────────────────────── */}
        <Box sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant="overline" color="text.disabled" letterSpacing={2}>
            Built with
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 1,
              mt: 2,
            }}
          >
            {TECH_STACK.map(({ label, color }) => (
              <Chip
                key={label}
                label={label}
                size="small"
                sx={{
                  bgcolor: `${color}18`,
                  color,
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  border: `1px solid ${color}44`,
                }}
              />
            ))}
          </Box>
        </Box>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <Box sx={{ mt: 8, textAlign: 'center', pb: 4 }}>
          <Typography variant="caption" color="text.disabled">
            TradingOS v0.12.0 — Phase 12: Auto Paper Trading
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
