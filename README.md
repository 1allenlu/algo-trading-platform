# QuantStream — Algorithmic Trading Platform

A production-grade algorithmic trading platform built across 42 feature phases. Combines real-time market data, machine learning signal generation, quantitative backtesting, and paper trading execution in a single full-stack application.

---

## Features

- **Live Signal Dashboard** — Composite BUY/HOLD/SELL signals with ML + RSI + sentiment, 30s refresh
- **Multi-Timeframe Analysis** — Daily/weekly/monthly signal alignment with strength labels
- **Kelly Criterion Sizing** — Position sizing from ML accuracy blended with trade journal history
- **ML Models** — XGBoost and PyTorch LSTM with SHAP explainability and live predictions
- **Backtesting** — Pairs trading, momentum, mean reversion with commission/slippage sliders
- **Walk-Forward Optimization** — Out-of-sample strategy validation
- **Risk Management** — VaR/CVaR, component VaR breakdown, Monte Carlo simulation, efficient frontier
- **Paper Trading** — Real-time order execution using Alpaca prices (or DB simulator fallback)
- **Auto Trading** — Asyncio background pipeline that signals, sizes, and submits orders automatically
- **Trade Journal** — Auto-populated from paper fills with notes, tags, and ratings
- **Market Scanner** — RSI/SMA/volume/52-week screener with 7 presets
- **Options Chain** — Calls/puts with IV, OI, ITM highlighting via yfinance (15-min delayed)
- **Crypto** — BTC/ETH/SOL and more using the same ingestion pipeline as equities
- **Earnings Calendar** — Countdown timers and earnings history per symbol
- **Pattern Recognition** — Doji, Hammer, Engulfing, Morning/Evening Star, Three Soldiers/Crows
- **Regime Detection** — Rolling 20-day return rule for bull/bear/neutral regime labeling
- **Factor Attribution** — Beta, alpha, and Brinson-Hood-Beebower P&L attribution
- **RL Agent** — Q-learning agent trained on OHLCV features for Buy/Hold/Sell decisions
- **Fundamental Data** — P/E, EPS, revenue, market cap, analyst targets via yfinance
- **News Sentiment** — VADER sentiment scoring with per-symbol feed
- **Alerts** — Rule-based alert engine with email + Slack notification support
- **JWT Auth** — Multi-user authentication with bcrypt password hashing
- **PWA** — Offline-capable with service worker (production only)
- **PDF Reports** — Backtest report export via reportlab + matplotlib
- **Dark/Light Theme** — Persisted theme toggle

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, MUI v5, Recharts, lightweight-charts v5.1 |
| Backend | FastAPI, SQLAlchemy 2.0 async, Pydantic v2, asyncpg |
| ML | XGBoost 2.0, PyTorch LSTM, SHAP |
| Quant | vectorbt, statsmodels |
| Database | PostgreSQL 15 + TimescaleDB, Redis 7 |
| Auth | JWT — python-jose + passlib[bcrypt] |
| Infra | Docker Compose (dev + prod), nginx 1.25 |
| Broker | Alpaca (paper + live) — optional |

---

## Quick Start

**Prerequisites:** Docker 24+ and Docker Compose v2

```bash
# 1. Clone and configure
git clone <repo-url> algo-trading-platform
cd algo-trading-platform
cp .env.example .env        # fill in optional keys (see Configuration)

# 2. Start all services
make up

# 3. Load 5 years of OHLCV data
make ingest

# 4. Train ML models
make train-all

# 5. Open the app
open http://localhost:5173   # dev
```

---

## Configuration

All config lives in `.env`. Most keys are optional — the platform works without them using simulators/fallbacks.

```env
# Database (auto-configured in Docker)
DATABASE_URL=postgresql+asyncpg://trading:trading@db:5432/trading

# Alpaca — leave empty to use the built-in price simulator
ALPACA_API_KEY=            # Paper key starts with PK...
ALPACA_SECRET_KEY=
ALPACA_PAPER=true
ALPACA_SYMBOLS=SPY,QQQ,AAPL,MSFT,NVDA,AMZN,TSLA

# JWT Auth — leave empty to disable authentication in dev
JWT_SECRET_KEY=
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=       # Generate with: make auth-hash password=mypass

# Notifications — optional
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
NOTIFY_EMAIL=
SLACK_WEBHOOK_URL=
```

---

## Developer Commands

```bash
make up                              # Start dev stack (backend :8000, frontend :5173)
make down                            # Stop all services
make logs                            # Tail all service logs
make shell-backend                   # Bash shell in backend container
make shell-db                        # psql shell

# Data
make ingest                          # Download 5yr OHLCV (SPY, QQQ, top stocks)
make ingest-intraday symbol=SPY timeframe=5m

# ML
make train symbol=SPY                # Train XGBoost for SPY
make train symbol=SPY model=lstm     # Train LSTM for SPY
make train-all                       # Train XGBoost for SPY, QQQ, AAPL, MSFT, NVDA
make predict symbol=SPY

# Backtesting
make backtest                                          # Pairs trading SPY/QQQ
make backtest strategy=momentum symbols="SPY QQQ AAPL MSFT NVDA"
make backtest strategy=mean_reversion symbols=SPY

# Code quality
make fmt                             # Black (Python) + Prettier (TypeScript)
make lint                            # Ruff (Python) + ESLint (TypeScript)
make test                            # Backend pytest suite (147 tests)

cd frontend && npm test              # Frontend Vitest suite (59 tests)

# Auth
make auth-hash password=mypass       # Generate bcrypt hash for .env
```

---

## Project Structure

```
algo-trading-platform/
├── backend/
│   ├── app/
│   │   ├── api/routes/          # FastAPI route handlers (one file per domain)
│   │   ├── core/config.py       # pydantic-settings — all env vars
│   │   ├── models/
│   │   │   ├── database.py      # SQLAlchemy ORM models
│   │   │   └── schemas.py       # Pydantic request/response schemas
│   │   ├── services/            # Business logic (signal, risk, ML, trading…)
│   │   └── main.py              # FastAPI app — all routers mounted
│   └── tests/                   # pytest suite (unit + ASGI integration)
├── frontend/
│   └── src/
│       ├── pages/               # One component per route
│       ├── components/          # Shared UI (layout, charts, widgets)
│       ├── services/api.ts      # Axios API client + TypeScript interfaces
│       ├── contexts/            # AuthContext, ThemeContext
│       └── __tests__/           # Vitest test suite
├── ml-engine/                   # XGBoost + LSTM training/inference scripts
├── quant-engine/                # Backtest engine, walk-forward, RL agent
├── data/ingestion/              # yfinance loaders (daily + intraday)
├── nginx/nginx.conf             # Production reverse proxy config
├── docker-compose.yml           # Dev stack
├── docker-compose.prod.yml      # Production stack (nginx + 4 gunicorn workers)
├── Makefile                     # All developer commands
└── DEPLOY.md                    # Production deployment guide
```

---

## Frontend Pages

| Route | Page |
|---|---|
| `/` | Landing page — feature overview |
| `/dashboard` | Market overview with candlestick/area charts |
| `/signals` | Live BUY/HOLD/SELL signal matrix (30s refresh) |
| `/ml` | ML models — XGBoost vs LSTM, SHAP, regime detection |
| `/backtest` | Backtesting with commission/slippage sliders |
| `/risk` | VaR/CVaR, component VaR, Monte Carlo, efficient frontier |
| `/trading` | Paper trading — orders, positions, portfolio history |
| `/autotrade` | Auto paper trading config + activity log |
| `/journal` | Trade journal — fills, notes, tags, ratings |
| `/analytics` | KPI cards, rolling Sharpe, factor attribution |
| `/optimize` | Strategy hyperparameter optimization + walk-forward |
| `/scanner` | Market scanner with 7 presets + custom filters |
| `/alerts` | Alert rules + fired event history |
| `/news` | VADER news sentiment feed |
| `/options` | Options chain — calls/puts, IV, OI |
| `/crypto` | Crypto prices with sparklines |
| `/earnings` | Earnings calendar with countdown |
| `/patterns` | Candlestick pattern recognition |
| `/fundamentals` | P/E, EPS, revenue, analyst targets |
| `/rl` | Q-learning RL agent — train/predict |
| `/settings` | Notifications, scheduler, user management |

---

## API

The backend exposes a REST API at `http://localhost:8000/api/v1/`.

Interactive docs are available at:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

Key endpoint groups: `/signals`, `/risk`, `/ml`, `/paper`, `/backtest`, `/scanner`, `/journal`, `/patterns`, `/crypto`, `/fundamentals`, `/rl`, `/options`, `/news`, `/alerts`, `/analytics`, `/optimize`, `/auth`

---

## Testing

```bash
# Backend — 147 tests (unit + integration)
make test
# or with verbose output:
docker compose exec backend pytest tests/ -v

# Frontend — 59 tests (logic + type guards)
cd frontend && npm test
```

Backend tests cover all major API endpoints using ASGI transport (no running server required), plus pure-function unit tests for signal math, Kelly criterion, VaR decomposition, and pattern detection.

Frontend tests cover signal color helpers, Kelly formula, localStorage persistence, symbol validation, and TypeScript interface shape validation for all API response types.

---

## Production Deployment

See [DEPLOY.md](DEPLOY.md) for the full guide. Quick summary:

```bash
# Build React bundle and start nginx + gunicorn
make prod-build
make prod-up
# App available at http://localhost:80
```

Production stack: nginx → 4 gunicorn workers → PostgreSQL + Redis

---

## Notes

- **Alpaca keys are optional.** Without them, prices come from the built-in DB price simulator. Paper trading works fully in simulator mode.
- **Options data** is 15-minute delayed via yfinance. Some tickers may have no options data.
- **lightweight-charts v5** requires strictly ascending timestamps with no duplicates — the `CandlestickChart` component deduplicates and sorts before calling `setData()`.
- **Service Worker** is only registered in production (`import.meta.env.PROD` guard). Never active in dev to prevent stale Vite HMR caches.
- **Env var changes** require container recreation to take effect: `docker compose up -d --force-recreate <service>`
