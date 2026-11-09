-- Additive schema for Node-RED automation, alert delivery, reports, and field observations.
-- Safe to rerun. Existing WFP/PostGIS tables and records are not modified.

CREATE TABLE IF NOT EXISTS automation_runs (
    id UUID PRIMARY KEY,
    workflow_name TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    trigger TEXT NOT NULL DEFAULT 'scheduler',
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed', 'skipped')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,
    new_records INTEGER NOT NULL DEFAULT 0,
    new_spikes INTEGER NOT NULL DEFAULT 0,
    new_critical INTEGER NOT NULL DEFAULT 0,
    latest_data_date DATE,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS automation_runs_started_at_idx ON automation_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS automation_heartbeats (
    component TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unavailable')),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details TEXT
);

CREATE TABLE IF NOT EXISTS food_price_alerts (
    id BIGSERIAL PRIMARY KEY,
    event_date DATE NOT NULL,
    district TEXT NOT NULL,
    market TEXT NOT NULL,
    commodity TEXT NOT NULL,
    unit TEXT NOT NULL,
    previous_price NUMERIC(14, 4),
    current_price NUMERIC(14, 4) NOT NULL CHECK (current_price >= 0),
    pct_change NUMERIC(10, 4) NOT NULL,
    zscore NUMERIC(10, 4) NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('Moderate', 'Severe', 'Critical')),
    source TEXT NOT NULL DEFAULT 'WFP',
    state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'acknowledged', 'resolved')),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_date, district, market, commodity, unit)
);
CREATE INDEX IF NOT EXISTS food_price_alerts_recent_idx ON food_price_alerts (event_date DESC, severity);

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id BIGSERIAL PRIMARY KEY,
    alert_id BIGINT REFERENCES food_price_alerts(id) ON DELETE CASCADE,
    report_id UUID,
    automation_run_id UUID REFERENCES automation_runs(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('dashboard', 'email', 'whatsapp', 'sms')),
    severity TEXT,
    status TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'delivered', 'failed', 'unsupported')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    external_reference TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (alert_id IS NOT NULL OR report_id IS NOT NULL OR automation_run_id IS NOT NULL),
    UNIQUE (alert_id, channel, severity),
    UNIQUE (report_id, channel),
    UNIQUE (automation_run_id, channel)
);
CREATE INDEX IF NOT EXISTS notification_deliveries_status_idx ON notification_deliveries (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS notification_attempts (
    id UUID PRIMARY KEY,
    delivery_id BIGINT NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
    delivered BOOLEAN NOT NULL,
    external_reference TEXT,
    error TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notification_attempts_delivery_idx ON notification_attempts (delivery_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS intelligence_reports (
    id UUID PRIMARY KEY,
    report_type TEXT NOT NULL DEFAULT 'weekly',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('generated', 'failed')),
    content TEXT NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    model TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_type, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS field_observations (
    id UUID PRIMARY KEY,
    market_name TEXT NOT NULL CHECK (length(trim(market_name)) BETWEEN 1 AND 160),
    district TEXT NOT NULL CHECK (length(trim(district)) BETWEEN 1 AND 120),
    commodity TEXT NOT NULL CHECK (length(trim(commodity)) BETWEEN 1 AND 160),
    unit TEXT NOT NULL CHECK (length(trim(unit)) BETWEEN 1 AND 40),
    price NUMERIC(14, 4) NOT NULL CHECK (price > 0),
    observation_date DATE NOT NULL,
    data_collector TEXT CHECK (data_collector IS NULL OR length(data_collector) <= 160),
    source TEXT NOT NULL DEFAULT 'field' CHECK (length(trim(source)) BETWEEN 1 AND 80),
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'rejected')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS field_observations_review_idx ON field_observations (review_status, observation_date DESC);

GRANT SELECT, INSERT, UPDATE ON automation_runs, automation_heartbeats, food_price_alerts,
    notification_deliveries, notification_attempts, intelligence_reports, field_observations TO malawi_food_app;
GRANT USAGE, SELECT ON SEQUENCE food_price_alerts_id_seq, notification_deliveries_id_seq TO malawi_food_app;
