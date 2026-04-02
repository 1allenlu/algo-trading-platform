# QuantStream — Production Deployment Guide

## Architecture

```
Internet → nginx:80 → FastAPI backend (4 workers)
                   → React SPA (static files)
                   → /ws/* (WebSocket passthrough)
         postgres:5432 (TimescaleDB)
         redis:6379
```

## Prerequisites

- Docker 24+ and Docker Compose v2
- 2 GB RAM minimum (4 GB recommended for ML training)
- A Linux server (Ubuntu 22.04 LTS recommended)

---

## Step 1 — Clone and Configure

```bash
git clone <your-repo-url> trading-platform
cd trading-platform
cp .env.example .env
```

Edit `.env` with your values:

| Variable            | Required | Description |
|---------------------|----------|-------------|
| `POSTGRES_PASSWORD` | ✅       | DB password — change from default |
| `JWT_SECRET_KEY`    | ✅ prod  | Random 64-char hex (run command below) |
| `ADMIN_PASSWORD_HASH` | ✅ prod | bcrypt hash (run `make auth-hash`) |
| `ALPACA_API_KEY`    | Optional | For real-time prices (Phase 13) |
| `ALPACA_SECRET_KEY` | Optional | Alpaca secret |

Generate a JWT secret:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

## Step 2 — Set Admin Password

```bash
make auth-hash password=yourpassword
```

Copy the output hash into `ADMIN_PASSWORD_HASH` in your `.env`.

## Step 3 — Build React Frontend

```bash
make prod-build
```

This builds the Vite production bundle into a Docker volume that nginx serves.

## Step 4 — Start Services

```bash
make prod-up
```

Services start in this order: postgres → redis → backend → nginx.

Verify everything is running:
```bash
docker compose -f docker-compose.prod.yml ps
```

## Step 5 — Ingest Market Data

```bash
make ingest
```

Downloads ~5 years of OHLCV data for SPY, QQQ, and major stocks (~2 min).

## Step 6 — Train ML Models (optional)

```bash
make train-all      # XGBoost for SPY, QQQ, AAPL, MSFT, NVDA
make train symbol=SPY model=lstm   # LSTM for SPY
```

---

## Updating the Application

```bash
git pull
make prod-build    # Only needed if frontend changed
make prod-down && make prod-up
```

---

## Enabling HTTPS (TLS)

1. Place your certificate at `nginx/ssl/cert.pem` and key at `nginx/ssl/key.pem`.
2. Uncomment the HTTPS server block in `nginx/nginx.conf`.
3. Add a redirect from HTTP → HTTPS (standard 301 redirect block).
4. Restart nginx: `docker compose -f docker-compose.prod.yml restart nginx`

For free TLS with Let's Encrypt, use [certbot](https://certbot.eff.org/) or
the [nginx-proxy + acme-companion](https://github.com/nginx-proxy/acme-companion) Docker setup.

---

## Monitoring

View logs:
```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx
```

Backend health endpoint:
```bash
curl http://localhost/api/health
```

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Port 80 in use | Change `"80:80"` to `"8080:80"` in docker-compose.prod.yml |
| DB migration errors | Run `make migrate` (Alembic) or let the app auto-create tables |
| Auth not working | Check JWT_SECRET_KEY and ADMIN_PASSWORD_HASH are set in .env |
| Alpaca prices not showing | Verify ALPACA_API_KEY and ALPACA_SECRET_KEY; check logs |
| ML training fails | Ensure market data is ingested first: `make ingest` |
