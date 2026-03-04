-- ─── Trading Platform — Database Initialization ──────────────────────────────
-- This script runs automatically when the PostgreSQL container first starts
-- (mounted to /docker-entrypoint-initdb.d/).
--
-- It does three things:
--   1. Enables the TimescaleDB extension
--   2. Creates the market_data table
--   3. Converts market_data to a TimescaleDB hypertable
--
-- TimescaleDB hypertables automatically partition rows into time-based "chunks".
-- This makes queries like "give me all SPY data in the last 30 days" orders of
-- magnitude faster than a plain Postgres table at scale.

-- ── 1. Enable TimescaleDB ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ── 2. Market data table (OHLCV daily bars) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS market_data (
    symbol      VARCHAR(20)              NOT NULL,
    timestamp   TIMESTAMPTZ              NOT NULL,   -- Always UTC
    open        DOUBLE PRECISION         NOT NULL,
    high        DOUBLE PRECISION         NOT NULL,
    low         DOUBLE PRECISION         NOT NULL,
    close       DOUBLE PRECISION         NOT NULL,
    volume      BIGINT                   NOT NULL,
    PRIMARY KEY (symbol, timestamp)                   -- Composite PK prevents duplicates
);

-- ── 3. Convert to TimescaleDB hypertable ──────────────────────────────────────
-- Partitioned by 'timestamp' with 7-day chunks (good for daily data).
-- if_not_exists=TRUE makes this idempotent (safe to run multiple times).
SELECT create_hypertable(
    'market_data',
    'timestamp',
    chunk_time_interval => INTERVAL '1 month',        -- Monthly chunks for daily data
    if_not_exists       => TRUE,
    migrate_data        => TRUE
);

-- ── 4. Indexes ────────────────────────────────────────────────────────────────
-- TimescaleDB creates a btree index on timestamp automatically.
-- We add a covering index for symbol-first queries (our most common pattern).
CREATE INDEX IF NOT EXISTS ix_market_data_symbol_ts
    ON market_data (symbol, timestamp DESC);

-- ── Future tables (will be added via Alembic in later phases) ─────────────────
-- strategies, backtest_results, positions, orders, portfolio_snapshots, etc.
