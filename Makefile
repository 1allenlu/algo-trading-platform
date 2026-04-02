.PHONY: help up down logs shell-backend shell-db ingest ingest-intraday migrate train predict train-all backtest fmt lint test prod-build prod-up prod-down auth-hash

# ─── Colors ───────────────────────────────────────────────────────────────────
CYAN  := \033[0;36m
RESET := \033[0m

# ─── Defaults ─────────────────────────────────────────────────────────────────
symbol    ?= SPY
model     ?= xgboost
timeframe ?= 5m

help:
	@echo ""
	@echo "$(CYAN)Trading Platform — Developer Commands$(RESET)"
	@echo ""
	@echo "  Infrastructure:"
	@echo "    make up          Start all Docker services (build if needed)"
	@echo "    make down        Stop all services"
	@echo "    make logs        Tail logs from all services"
	@echo "    make restart     Restart a service: make restart svc=backend"
	@echo ""
	@echo "  Data:"
	@echo "    make ingest      Download 5yr OHLCV data (SPY, QQQ, top stocks)"
	@echo "    make migrate     Run Alembic database migrations"
	@echo ""
	@echo "  ML (Phase 2):"
	@echo "    make train           Train XGBoost model:  make train symbol=SPY"
	@echo "    make train model=lstm  Train LSTM model:   make train symbol=SPY model=lstm"
	@echo "    make predict         Recent predictions:   make predict symbol=SPY"
	@echo "    make train-all       Train XGBoost for SPY, QQQ, AAPL, MSFT, NVDA"
	@echo ""
	@echo "  Quant (Phase 3):"
	@echo "    make backtest                     Pairs backtest (SPY/QQQ)"
	@echo "    make backtest strategy=momentum symbols='SPY QQQ AAPL MSFT NVDA'"
	@echo "    make backtest strategy=mean_reversion symbols=SPY"
	@echo ""
	@echo "  Development:"
	@echo "    make shell-backend  Bash shell inside backend container"
	@echo "    make shell-db       psql shell inside postgres container"
	@echo "    make fmt            Format Python (black) + TypeScript (prettier)"
	@echo "    make lint           Lint Python (ruff) + TypeScript (eslint)"
	@echo "    make test           Run backend tests (pytest)"
	@echo ""
	@echo "  Production (Phase 18):"
	@echo "    make prod-build     Build React production bundle"
	@echo "    make prod-up        Start nginx + gunicorn production stack"
	@echo "    make prod-down      Stop production stack"
	@echo "    make auth-hash password=mypass   Generate bcrypt password hash"
	@echo ""

# ── Infrastructure ────────────────────────────────────────────────────────────
up:
	docker compose up -d --build
	@echo "$(CYAN)Services starting... check status with: docker compose ps$(RESET)"

down:
	docker compose down

logs:
	docker compose logs -f

restart:
	docker compose restart $(svc)

# ── Data ──────────────────────────────────────────────────────────────────────
ingest:
	@echo "$(CYAN)Downloading historical market data (this takes ~2 min)...$(RESET)"
	docker compose exec backend \
		python /data/ingestion/yfinance_loader.py \
		--database-url postgresql://trading:trading@postgres:5432/trading_db

ingest-intraday:
	@echo "$(CYAN)Downloading intraday data for $(symbol) @ $(timeframe)...$(RESET)"
	docker compose exec backend \
		python /data/ingestion/intraday_loader.py \
		--symbol $(symbol) \
		--timeframe $(timeframe) \
		--database-url postgresql://trading:trading@postgres:5432/trading_db

migrate:
	docker compose exec backend alembic upgrade head

# ── ML (Phase 2) ──────────────────────────────────────────────────────────────
train:
	@echo "$(CYAN)Training $(model) for $(symbol)...$(RESET)"
	docker compose exec -e PYTHONPATH=/ backend \
		python /ml_engine/train.py \
		--symbol $(symbol) \
		--model $(model) \
		--database-url postgresql://trading:trading@postgres:5432/trading_db \
		--output-dir /data/models

predict:
	@echo "$(CYAN)Generating predictions for $(symbol)...$(RESET)"
	docker compose exec -e PYTHONPATH=/ backend \
		python /ml_engine/predict.py \
		--symbol $(symbol) \
		--model-type $(model) \
		--database-url postgresql://trading:trading@postgres:5432/trading_db

train-all:
	@echo "$(CYAN)Training XGBoost for all default symbols...$(RESET)"
	$(MAKE) train symbol=SPY   model=xgboost
	$(MAKE) train symbol=QQQ   model=xgboost
	$(MAKE) train symbol=AAPL  model=xgboost
	$(MAKE) train symbol=MSFT  model=xgboost
	$(MAKE) train symbol=NVDA  model=xgboost

# ── Quant / Backtesting (Phase 3) ─────────────────────────────────────────────
# Run a strategy backtest directly (bypasses the API).
# Usage: make backtest strategy=pairs_trading symbols="SPY QQQ"
#        make backtest strategy=momentum symbols="SPY QQQ AAPL MSFT NVDA"
strategy ?= pairs_trading
symbols  ?= SPY QQQ

backtest:
	@echo "$(CYAN)Running backtest: $(strategy) on $(symbols)...$(RESET)"
	docker compose exec -e PYTHONPATH=/ backend \
		python /quant_engine/backtest/runner.py \
		--run-id 0 \
		--strategy $(strategy) \
		--symbols $(symbols) \
		--database-url postgresql://trading:trading@postgres:5432/trading_db

# ── Dev shells ────────────────────────────────────────────────────────────────
shell-backend:
	docker compose exec backend bash

shell-db:
	docker compose exec postgres psql -U trading -d trading_db

# ── Code quality ──────────────────────────────────────────────────────────────
fmt:
	docker compose exec backend black app/
	cd frontend && npx prettier --write "src/**/*.{ts,tsx}"

lint:
	docker compose exec backend ruff check app/
	cd frontend && npx eslint src --ext .ts,.tsx

test:
	docker compose exec backend pytest tests/ -v

# ── Production (Phase 18) ──────────────────────────────────────────────────────
# Build React production bundle and start production stack (nginx + gunicorn)
prod-build:
	@echo "$(CYAN)Building React production bundle...$(RESET)"
	docker compose -f docker-compose.prod.yml --profile build run --rm frontend-build

prod-up:
	@echo "$(CYAN)Starting production stack...$(RESET)"
	docker compose -f docker-compose.prod.yml up -d
	@echo "$(CYAN)Production services running at http://localhost$(RESET)"

prod-down:
	docker compose -f docker-compose.prod.yml down

# ── Auth (Phase 17) ───────────────────────────────────────────────────────────
# Generate a bcrypt hash for the admin password.
# Usage: make auth-hash password=mysecretpassword
password ?= changeme
auth-hash:
	@echo "$(CYAN)Generating bcrypt hash for '$(password)'...$(RESET)"
	docker compose exec backend python -c \
		"import bcrypt; print(bcrypt.hashpw(b'$(password)', bcrypt.gensalt()).decode())"
