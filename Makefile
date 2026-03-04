.PHONY: help up down logs shell-backend shell-db ingest migrate fmt lint test

# ─── Colors ───────────────────────────────────────────────────────────────────
CYAN  := \033[0;36m
RESET := \033[0m

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
	@echo "  Development:"
	@echo "    make shell-backend  Bash shell inside backend container"
	@echo "    make shell-db       psql shell inside postgres container"
	@echo "    make fmt            Format Python (black) + TypeScript (prettier)"
	@echo "    make lint           Lint Python (ruff) + TypeScript (eslint)"
	@echo "    make test           Run backend tests (pytest)"
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

migrate:
	docker compose exec backend alembic upgrade head

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
