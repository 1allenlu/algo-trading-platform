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

-- ── Phase 2: ML Models & Predictions ─────────────────────────────────────────

-- Trained model metadata (metrics + feature importance)
CREATE TABLE IF NOT EXISTS ml_models (
    id                 SERIAL PRIMARY KEY,
    name               VARCHAR(100)     NOT NULL,        -- e.g. "SPY_xgboost_v1"
    symbol             VARCHAR(20)      NOT NULL,
    model_type         VARCHAR(50)      NOT NULL,        -- "xgboost" | "lstm"
    version            INTEGER          NOT NULL DEFAULT 1,

    -- Performance on held-out test set
    accuracy           DOUBLE PRECISION,
    f1_score           DOUBLE PRECISION,
    roc_auc            DOUBLE PRECISION,

    -- Dataset size
    train_samples      INTEGER,
    test_samples       INTEGER,
    feature_count      INTEGER,

    -- JSON blobs (TEXT for simplicity; use JSONB in production for indexing)
    params             TEXT,                             -- Model hyperparameters
    feature_importance TEXT,                             -- {feature_name: importance_score}

    model_path         VARCHAR(500),                     -- Path to saved .joblib / .pt file
    created_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ml_models_symbol_type
    ON ml_models (symbol, model_type);

-- Pre-computed predictions (avoids loading the model on every API request)
CREATE TABLE IF NOT EXISTS ml_predictions (
    id             SERIAL PRIMARY KEY,
    symbol         VARCHAR(20)      NOT NULL,
    model_id       INTEGER          NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
    timestamp      TIMESTAMPTZ      NOT NULL,            -- Market date this prediction covers
    predicted_dir  VARCHAR(10)      NOT NULL,            -- "up" | "down"
    confidence     DOUBLE PRECISION NOT NULL,            -- P(predicted class) in [0.5, 1.0]
    actual_return  DOUBLE PRECISION,                     -- Filled in after market close
    created_at     TIMESTAMPTZ      DEFAULT NOW(),

    UNIQUE (symbol, model_id, timestamp)
);

CREATE INDEX IF NOT EXISTS ix_ml_predictions_symbol_model
    ON ml_predictions (symbol, model_id, timestamp DESC);

-- ── Phase 3+ tables (added via Alembic) ───────────────────────────────────────
-- strategies, backtest_results, positions, orders, portfolio_snapshots, etc.
