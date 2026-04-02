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
  BookOutlined as JournalIcon,
  CandlestickChart as TradingIcon,
  CurrencyBitcoin as CryptoIcon,
  Dashboard as DashboardIcon,
  EventNote as EarningsIcon,
  Insights as AnalyticsIcon,
  Layers as OptionsIcon,
  NotificationsOutlined as AlertsIcon,
  Psychology as MLIcon,
  QueryStats as RiskIcon,
  Science as SHAPIcon,
  Search as ScannerIcon,
  ShowChart as LogoIcon,
  Tune as OptimizeIcon,
  TrendingUp as StrategiesIcon,
  AccountBalance as PortfolioIcon,
  Lock as LockIcon,
  Newspaper as NewsIcon,
  SignalCellularAlt as SignalsIcon,
  Email as NotifyIcon,
  Schedule as SchedulerIcon,
  PictureAsPdf as PdfIcon,
  ManageAccounts as UsersIcon,
  Waves as RegimeIcon,
  WifiTethering as LivePriceIcon,
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
  {
    icon:        <TradingIcon sx={{ fontSize: 28 }} />,
    title:       'Alpaca Real-Time Prices',
    phase:       'Phase 13',
    color:       '#EF4444',
    description: 'Optional Alpaca REST API integration provides real-time trade prices for paper trading positions. Falls back to DB close prices when keys are not configured.',
    tags:        ['Alpaca API', 'Real-Time', 'Price Feed'],
  },
  {
    icon:        <NewsIcon sx={{ fontSize: 28 }} />,
    title:       'News Sentiment Feed',
    phase:       'Phase 14',
    color:       '#F97316',
    description: 'VADER-scored financial news headlines via yfinance. Bullish/bearish/neutral labelling per article with aggregate compound score and stacked bar chart.',
    tags:        ['VADER NLP', 'yfinance News', 'Sentiment'],
  },
  {
    icon:        <SHAPIcon sx={{ fontSize: 28 }} />,
    title:       'XGBoost vs LSTM',
    phase:       'Phase 15',
    color:       '#06B6D4',
    description: 'Side-by-side comparison table of all trained models (XGBoost and LSTM) for each symbol — accuracy, F1, AUC-ROC, sample counts, and training date.',
    tags:        ['Model Comparison', 'LSTM', 'XGBoost'],
  },
  {
    icon:        <BacktestIcon sx={{ fontSize: 28 }} />,
    title:       'Commission & Slippage',
    phase:       'Phase 16',
    color:       '#84CC16',
    description: 'Configurable transaction cost model for backtests. Adjust commission (0–1%) and slippage (0–0.5%) via UI sliders — passed directly into the BacktestEngine.',
    tags:        ['Transaction Costs', 'Slippage', 'Realistic Backtest'],
  },
  {
    icon:        <LockIcon sx={{ fontSize: 28 }} />,
    title:       'JWT Authentication',
    phase:       'Phase 17',
    color:       '#EC4899',
    description: 'Optional single-user JWT auth. Set JWT_SECRET_KEY + ADMIN_PASSWORD_HASH in .env to protect all routes. Fully transparent — all routes are public when disabled.',
    tags:        ['JWT', 'bcrypt', 'Single-User'],
  },
  {
    icon:        <AnalyticsIcon sx={{ fontSize: 28 }} />,
    title:       'Production Deployment',
    phase:       'Phase 18',
    color:       '#64748B',
    description: 'nginx reverse proxy, Vite production build, 4-worker Gunicorn, docker-compose.prod.yml. Complete DEPLOY.md guide with HTTPS/TLS instructions.',
    tags:        ['nginx', 'Docker', 'Production-Ready'],
  },
  {
    icon:        <LivePriceIcon sx={{ fontSize: 28 }} />,
    title:       'Real-Time Alpaca Prices',
    phase:       'Phase 19',
    color:       '#10B981',
    description: 'Live WebSocket price stream via Alpaca StockDataStream. Automatically falls back to the built-in random-walk simulator when Alpaca keys are absent — zero config.',
    tags:        ['Alpaca', 'WebSocket', 'Live Prices'],
  },
  {
    icon:        <NotifyIcon sx={{ fontSize: 28 }} />,
    title:       'Alert Notifications',
    phase:       'Phase 20',
    color:       '#F59E0B',
    description: 'Email (SMTP/TLS via aiosmtplib) and Slack (incoming webhook) notifications when price alert rules fire. Fire-and-forget via asyncio.create_task — never blocks.',
    tags:        ['Email', 'Slack', 'aiosmtplib'],
  },
  {
    icon:        <SchedulerIcon sx={{ fontSize: 28 }} />,
    title:       'Scheduled Data Pipeline',
    phase:       'Phase 21',
    color:       '#8B5CF6',
    description: 'APScheduler cron jobs for daily OHLCV ingestion (18:10 ET after market close) and 90-day alert event cleanup. Trigger any job instantly from the Settings page.',
    tags:        ['APScheduler', 'yfinance', 'Cron'],
  },
  {
    icon:        <SignalsIcon sx={{ fontSize: 28 }} />,
    title:       'Live Signals Dashboard',
    phase:       'Phase 22',
    color:       '#06B6D4',
    description: 'Composite BUY/HOLD/SELL signal matrix for all tracked symbols. Combines ML prediction, RSI, and sentiment. Auto-refreshes every 30s with color-coded confidence.',
    tags:        ['XGBoost', 'RSI', 'Composite Signal'],
  },
  {
    icon:        <UsersIcon sx={{ fontSize: 28 }} />,
    title:       'Multi-User Auth',
    phase:       'Phase 23',
    color:       '#EC4899',
    description: 'PostgreSQL-backed user table with admin/viewer roles. Backwards-compatible: falls back to env-var ADMIN_PASSWORD_HASH when no DB users exist. CRUD via Settings.',
    tags:        ['PostgreSQL', 'Roles', 'CRUD'],
  },
  {
    icon:        <PdfIcon sx={{ fontSize: 28 }} />,
    title:       'Backtest PDF Export',
    phase:       'Phase 24',
    color:       '#F97316',
    description: 'One-click PDF report from any completed backtest: header, metrics table (Sharpe, CAGR, max drawdown), dark-themed equity curve chart, and top-20 trades table.',
    tags:        ['reportlab', 'matplotlib', 'PDF'],
  },
  {
    icon:        <TradingIcon sx={{ fontSize: 28 }} />,
    title:       'Advanced Charting',
    phase:       'Phase 26',
    color:       '#4A9EFF',
    description: 'lightweight-charts v5 candlestick chart on the dashboard with OHLCV tooltip, area/candle toggle, and intraday timeframe chips (5m, 15m, 1H).',
    tags:        ['lightweight-charts', 'OHLCV', 'Intraday'],
  },
  {
    icon:        <OptionsIcon sx={{ fontSize: 28 }} />,
    title:       'Options Chain',
    phase:       'Phase 27',
    color:       '#10B981',
    description: 'Live options chain via yfinance: calls & puts table with strike, bid/ask, IV, open interest, ITM highlighting, and expiration date picker.',
    tags:        ['yfinance', 'IV', 'Options'],
  },
  {
    icon:        <OptimizeIcon sx={{ fontSize: 28 }} />,
    title:       'Walk-Forward Optimization',
    phase:       'Phase 28',
    color:       '#8B5CF6',
    description: 'Walk-forward backtesting with configurable train/test windows. OOS Sharpe, return, and drawdown per window. Stability score + recommended params.',
    tags:        ['Walk-Forward', 'OOS', 'Optimization'],
  },
  {
    icon:        <AnalyticsIcon sx={{ fontSize: 28 }} />,
    title:       'Factor Attribution',
    phase:       'Phase 29',
    color:       '#EC4899',
    description: 'CAPM beta/alpha, R², tracking error, information ratio + rolling 252-day window chart. Brinson BHB allocation vs selection effects per asset.',
    tags:        ['CAPM', 'Brinson BHB', 'Attribution'],
  },
  {
    icon:        <DashboardIcon sx={{ fontSize: 28 }} />,
    title:       'Intraday Data',
    phase:       'Phase 31',
    color:       '#06B6D4',
    description: 'Sub-daily OHLCV bars (1m/5m/15m/1h) via yfinance stored in TimescaleDB. Dashboard chip toggles switch between daily and intraday candlestick views.',
    tags:        ['TimescaleDB', 'Intraday', 'yfinance'],
  },
  {
    icon:        <CryptoIcon sx={{ fontSize: 28 }} />,
    title:       'Crypto Integration',
    phase:       'Phase 32',
    color:       '#F59E0B',
    description: 'Crypto overview for BTC, ETH, SOL, and 7 more. Price table with 7-day sparklines, 24h change, and volume — stored alongside equities in market_data.',
    tags:        ['BTC', 'ETH', 'Crypto'],
  },
  {
    icon:        <EarningsIcon sx={{ fontSize: 28 }} />,
    title:       'Earnings Calendar',
    phase:       'Phase 33',
    color:       '#84CC16',
    description: 'Earnings countdown calendar sorted by next report date. Expandable rows show quarterly EPS history with analyst estimate vs actual + surprise %.',
    tags:        ['Earnings', 'EPS', 'Calendar'],
  },
  {
    icon:        <RiskIcon sx={{ fontSize: 28 }} />,
    title:       'Monte Carlo Simulation',
    phase:       'Phase 34',
    color:       '#EF4444',
    description: 'GBM portfolio simulation with 1,000 paths. Fan chart shows P5/P25/P50/P75/P95 bands. Stats: probability of profit, median return, max drawdown distribution.',
    tags:        ['GBM', 'Monte Carlo', 'Risk'],
  },
  {
    icon:        <RegimeIcon sx={{ fontSize: 28 }} />,
    title:       'Regime Detection',
    phase:       'Phase 35',
    color:       '#A78BFA',
    description: 'Rule-based market regime classifier: Bull / Bear / Sideways using rolling 20-day return thresholds. Color-coded regime spans overlay the price chart.',
    tags:        ['Regime', 'Bull/Bear', 'Classification'],
  },
  {
    icon:        <JournalIcon sx={{ fontSize: 28 }} />,
    title:       'Trade Journal',
    phase:       'Phase 36',
    color:       '#06D6A0',
    description: 'Auto-populated from paper trading fills. FIFO buy/sell matching with realised P&L. Add notes, comma-separated tags, and 1–5 star ratings to review your trades.',
    tags:        ['Journal', 'P&L', 'Trade Review'],
  },
]

const TECH_STACK = [
  { label: 'FastAPI',       color: '#00C896' },
  { label: 'React 18',      color: '#4A9EFF' },
  { label: 'PostgreSQL 15', color: '#336791' },
  { label: 'TimescaleDB',   color: '#F59E0B' },
  { label: 'Redis 7',       color: '#EF4444' },
  { label: 'XGBoost 2',     color: '#8B5CF6' },
  { label: 'LSTM (PyTorch)', color: '#A78BFA' },
  { label: 'SQLAlchemy 2',  color: '#A78BFA' },
  { label: 'Recharts 2',    color: '#06B6D4' },
  { label: 'MUI 5',         color: '#007FFF' },
  { label: 'Docker + nginx',color: '#2496ED' },
  { label: 'WebSocket',     color: '#10B981' },
  { label: 'VADER NLP',     color: '#F97316' },
  { label: 'JWT Auth',      color: '#EC4899' },
  { label: 'Alpaca API',    color: '#EF4444' },
  { label: 'Pydantic v2',   color: '#E8316D' },
]

const STATS = [
  { value: '36',   label: 'Phases Built' },
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
            QuantStream
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
          36 phases · Full-stack · TypeScript + Python · Docker
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
                sx={{ fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1.1 }}
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
            QuantStream v0.42.0 — Phase 42: Full Featured
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
