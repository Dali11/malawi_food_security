"""Private APIs used by Node-RED and the server-side dashboard proxy."""

import asyncio
import json
import os
import time
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.automation_auth import require_automation_token
from api.automation_schemas import (
    DeliveryAttemptRequest,
    FieldObservationRequest,
    HeartbeatRequest,
    PipelineRunRequest,
    WeeklyReportRequest,
    WorkflowFailureRequest,
)
from api.database import get_pool
from api.notification_policy import retry_delay_seconds, sanitize_delivery_error

router = APIRouter(
    prefix="/api/automation",
    tags=["Automation"],
    dependencies=[Depends(require_automation_token)],
)
_LOCK_NAMESPACE = 43816
_LOCK_KEY = 1


def _cron_values(field: str, minimum: int, maximum: int, weekday: bool = False) -> tuple[set[int], bool]:
    wildcard = field == "*"
    values: set[int] = set()
    for entry in field.split(","):
        base, separator, step_text = entry.partition("/")
        step = int(step_text) if separator else 1
        if step < 1:
            raise ValueError("cron step must be positive")
        if base == "*":
            start, stop = minimum, maximum
        elif "-" in base:
            start_text, stop_text = base.split("-", 1)
            start, stop = int(start_text), int(stop_text)
        else:
            start = stop = int(base)
        if start < minimum or stop > maximum or start > stop:
            raise ValueError("cron field out of range")
        values.update(range(start, stop + 1, step))
    if weekday and 7 in values:
        values.remove(7)
        values.add(0)
    return values, wildcard


def _next_cron_at(expression: str, after: datetime) -> datetime:
    fields = expression.split()
    if len(fields) != 5:
        raise ValueError("cron expression must have five fields")
    minutes, _ = _cron_values(fields[0], 0, 59)
    hours, _ = _cron_values(fields[1], 0, 23)
    monthdays, dom_wildcard = _cron_values(fields[2], 1, 31)
    months, _ = _cron_values(fields[3], 1, 12)
    weekdays, dow_wildcard = _cron_values(fields[4], 0, 7, weekday=True)
    if not minutes or not hours or not months or not weekdays:
        raise ValueError("cron fields cannot resolve to an empty schedule")
    for day_offset in range(366 * 8):
        candidate_date = after.date() + timedelta(days=day_offset)
        weekday = candidate_date.weekday() + 1
        weekday = 0 if weekday == 7 else weekday
        dom_match = candidate_date.day in monthdays
        dow_match = weekday in weekdays
        if dom_wildcard and dow_wildcard:
            day_match = True
        elif dom_wildcard:
            day_match = dow_match
        elif dow_wildcard:
            day_match = dom_match
        else:
            day_match = dom_match or dow_match
        if candidate_date.month not in months or not day_match:
            continue
        for hour in sorted(hours):
            for minute in sorted(minutes):
                candidate = datetime.combine(candidate_date, datetime.min.time()).replace(
                    hour=hour, minute=minute, tzinfo=after.tzinfo
                )
                if candidate > after:
                    return candidate
    raise ValueError("no cron occurrence found within eight years")


def _next_pipeline_run() -> str | None:
    expression = os.getenv("AUTOMATION_PIPELINE_CRON", "0 6 * * 1")
    timezone = ZoneInfo(os.getenv("AUTOMATION_TIMEZONE", "Europe/Berlin"))
    now = datetime.now(timezone)
    try:
        return _next_cron_at(expression, now).isoformat()
    except (ValueError, KeyError, TypeError):
        return None


def _run_response(row) -> dict:
    return {
        "run_id": str(row["id"]),
        "workflow": row["workflow_name"],
        "trigger": row["trigger"],
        "status": row["status"],
        "started_at": row["started_at"].isoformat() if row["started_at"] else None,
        "finished_at": row["finished_at"].isoformat() if row["finished_at"] else None,
        "duration_ms": row["duration_ms"],
        "new_records": row["new_records"],
        "new_spikes": row["new_spikes"],
        "new_critical": row["new_critical"],
        "latest_data_date": row["latest_data_date"].isoformat() if row["latest_data_date"] else None,
        "error": row["error_message"],
    }


async def _persist_pipeline_alerts(conn, events: list[dict]) -> list[dict]:
    saved = []
    for event in events:
        row = await conn.fetchrow(
            """
            INSERT INTO food_price_alerts
                (event_date, district, market, commodity, unit, previous_price,
                 current_price, pct_change, zscore, severity, source)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'WFP')
            ON CONFLICT (event_date, district, market, commodity, unit)
            DO UPDATE SET
                previous_price = EXCLUDED.previous_price,
                current_price = EXCLUDED.current_price,
                pct_change = EXCLUDED.pct_change,
                zscore = EXCLUDED.zscore,
                severity = EXCLUDED.severity,
                updated_at = NOW()
            RETURNING id, severity
            """,
            date.fromisoformat(event["event_date"]),
            event["district"], event["market"], event["commodity"], event["unit"],
            Decimal(str(event["previous_price"])) if event.get("previous_price") is not None else None,
            Decimal(str(event["current_price"])),
            Decimal(str(event["pct_change"])),
            Decimal(str(event["zscore"])),
            event["severity"],
        )
        await conn.execute(
            """
            INSERT INTO notification_deliveries
                (alert_id, channel, severity, status, attempt_count, last_attempt_at, delivered_at)
            VALUES ($1, 'dashboard', $2, 'delivered', 1, NOW(), NOW())
            ON CONFLICT (alert_id, channel, severity) DO NOTHING
            """,
            row["id"], row["severity"],
        )
        saved.append({"id": row["id"], "severity": row["severity"], **event})
    return saved


@router.get("/overview")
async def get_automation_overview():
    """Return redacted operational status for the Automation dashboard."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
        latest_pipeline = await conn.fetchrow(
            """SELECT run_at, new_records, new_spikes, new_critical,
                      latest_date, status, notes
               FROM pipeline_log ORDER BY run_at DESC LIMIT 1"""
        )
        pipeline_history = await conn.fetch(
            """SELECT run_at, new_records, new_spikes, new_critical,
                      latest_date, status, notes
               FROM pipeline_log ORDER BY run_at DESC LIMIT 20"""
        )
        runs = await conn.fetch(
            """SELECT id, workflow_name, trigger, status, started_at, finished_at,
                      duration_ms, new_records, new_spikes, new_critical,
                      latest_data_date, error_message
               FROM automation_runs ORDER BY started_at DESC LIMIT 20"""
        )
        alerts = await conn.fetch(
            """SELECT a.id, a.event_date, a.district, a.market, a.commodity, a.unit,
                      a.previous_price, a.current_price, a.pct_change, a.zscore,
                      a.severity, a.state, a.first_seen_at,
                      COALESCE(d.status, 'unavailable') AS dashboard_delivery
               FROM food_price_alerts a
               LEFT JOIN LATERAL (
                   SELECT status FROM notification_deliveries
                   WHERE alert_id = a.id AND channel = 'dashboard'
                   ORDER BY created_at DESC LIMIT 1
               ) d ON TRUE
               ORDER BY a.event_date DESC, a.id DESC LIMIT 20"""
        )
        deliveries = await conn.fetch(
            """SELECT id, alert_id, report_id, automation_run_id, channel, severity, status,
                      attempt_count, last_attempt_at, delivered_at, last_error
               FROM notification_deliveries ORDER BY created_at DESC LIMIT 20"""
        )
        heartbeat = await conn.fetchrow(
            "SELECT status, last_seen, details FROM automation_heartbeats WHERE component='node-red'"
        )
        pending_observations = await conn.fetchval(
            "SELECT COUNT(*) FROM field_observations WHERE review_status='pending'"
        )
        latest_report = await conn.fetchrow(
            """SELECT id, period_start, period_end, status, content, generated_at, model
               FROM intelligence_reports ORDER BY generated_at DESC LIMIT 1"""
        )

    now = datetime.now(ZoneInfo(os.getenv("AUTOMATION_TIMEZONE", "Europe/Berlin")))
    node_red_seen = heartbeat["last_seen"] if heartbeat else None
    node_red_online = bool(
        node_red_seen
        and (datetime.now(node_red_seen.tzinfo) - node_red_seen).total_seconds() <= 180
    )
    report_cron = os.getenv("AUTOMATION_REPORT_CRON", "0 7 * * 1")
    try:
        next_report = _next_cron_at(report_cron, now).isoformat()
    except (ValueError, KeyError, TypeError):
        next_report = None
    try:
        next_pipeline = _next_pipeline_run()
    except (ValueError, KeyError, TypeError):
        next_pipeline = None
    return {
        "health": {
            "api": "healthy",
            "database": "healthy",
            "node_red": "healthy" if node_red_online else "unavailable",
            "node_red_last_seen": node_red_seen.isoformat() if node_red_seen else None,
            "server_time": now.isoformat(),
        },
        "schedule": {
            "pipeline_cron": os.getenv("AUTOMATION_PIPELINE_CRON", "0 6 * * 1"),
            "report_cron": os.getenv("AUTOMATION_REPORT_CRON", "0 7 * * 1"),
            "timezone": os.getenv("AUTOMATION_TIMEZONE", "Europe/Berlin"),
            "next_pipeline_run": next_pipeline,
            "next_report_run": next_report,
        },
        "latest_pipeline": {
            "run_at": latest_pipeline["run_at"].isoformat() if latest_pipeline else None,
            "status": latest_pipeline["status"] if latest_pipeline else "unknown",
            "new_records": latest_pipeline["new_records"] if latest_pipeline else 0,
            "new_spikes": latest_pipeline["new_spikes"] if latest_pipeline else 0,
            "new_critical": latest_pipeline["new_critical"] if latest_pipeline else 0,
            "latest_data_date": latest_pipeline["latest_date"] if latest_pipeline else None,
            "notes": latest_pipeline["notes"] if latest_pipeline else None,
        },
        "pipeline_history": [
            {
                "run_at": row["run_at"].isoformat(),
                "status": row["status"] or "unknown",
                "new_records": row["new_records"] or 0,
                "new_spikes": row["new_spikes"] or 0,
                "new_critical": row["new_critical"] or 0,
                "latest_data_date": row["latest_date"] or None,
                "notes": row["notes"] or "",
            }
            for row in pipeline_history
        ],
        "runs": [_run_response(row) for row in runs],
        "alerts": [dict(row) for row in alerts],
        "notification_deliveries": [dict(row) for row in deliveries],
        "pending_field_observations": pending_observations,
        "latest_report": dict(latest_report) if latest_report else None,
    }


@router.get("/notifications/pending")
async def get_pending_notifications(limit: int = Query(default=50, ge=1, le=200)):
    """Return due non-dashboard deliveries for configured notification adapters."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT d.id, d.alert_id, d.report_id, d.automation_run_id, d.channel, d.severity,
                      d.attempt_count, d.next_attempt_at,
                      a.event_date, a.district, a.market, a.commodity, a.unit,
                      a.previous_price, a.current_price, a.pct_change, a.zscore,
                      r.period_start, r.period_end, r.content AS report_content,
                      w.workflow_name, w.error_message AS workflow_error
               FROM notification_deliveries d
               LEFT JOIN food_price_alerts a ON a.id=d.alert_id
               LEFT JOIN intelligence_reports r ON r.id=d.report_id
               LEFT JOIN automation_runs w ON w.id=d.automation_run_id
               WHERE d.status='queued' AND d.channel <> 'dashboard'
                 AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW())
               ORDER BY d.created_at LIMIT $1""",
            limit,
        )
    return {"deliveries": [dict(row) for row in rows]}


@router.post("/notifications/{delivery_id}/attempt")
async def record_notification_attempt(delivery_id: int, request: DeliveryAttemptRequest):
    """Record an idempotent delivery result and schedule bounded retries."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """SELECT id, status, attempt_count FROM notification_deliveries
                   WHERE id=$1 FOR UPDATE""",
                delivery_id,
            )
            if not row:
                raise HTTPException(status_code=404, detail="Notification delivery not found")
            prior = await conn.fetchrow(
                "SELECT delivery_id FROM notification_attempts WHERE id=$1",
                request.attempt_id,
            )
            if prior:
                if prior["delivery_id"] != delivery_id:
                    raise HTTPException(status_code=409, detail="Attempt ID already belongs to another delivery")
                return {"delivery_id": delivery_id, "status": row["status"], "duplicate_attempt": True}
            if row["status"] in ("delivered", "unsupported"):
                return {"delivery_id": delivery_id, "status": row["status"], "duplicate_attempt": False}

            attempt_number = row["attempt_count"] + 1
            delay = None if request.delivered else retry_delay_seconds(attempt_number)
            next_status = "delivered" if request.delivered else ("failed" if delay is None else "queued")
            error = None if request.delivered else sanitize_delivery_error(request.error or "Delivery failed")
            inserted = await conn.fetchval(
                """INSERT INTO notification_attempts
                       (id, delivery_id, delivered, external_reference, error)
                   VALUES ($1,$2,$3,$4,$5)
                   ON CONFLICT (id) DO NOTHING RETURNING id""",
                request.attempt_id, delivery_id, request.delivered,
                request.external_reference, error,
            )
            if not inserted:
                prior = await conn.fetchrow(
                    "SELECT delivery_id FROM notification_attempts WHERE id=$1",
                    request.attempt_id,
                )
                if prior and prior["delivery_id"] != delivery_id:
                    raise HTTPException(status_code=409, detail="Attempt ID already belongs to another delivery")
                return {"delivery_id": delivery_id, "status": row["status"], "duplicate_attempt": True}

            await conn.execute(
                """UPDATE notification_deliveries
                   SET status=$2, attempt_count=$3, last_attempt_at=NOW(),
                       delivered_at=CASE WHEN $4 THEN NOW() ELSE NULL END,
                       next_attempt_at=CASE WHEN $5::integer IS NULL THEN NULL
                                            ELSE NOW() + ($5 * INTERVAL '1 second') END,
                       external_reference=CASE WHEN $4 THEN $6 ELSE external_reference END,
                       last_error=$7
                   WHERE id=$1""",
                delivery_id, next_status, attempt_number, request.delivered,
                delay, request.external_reference, error,
            )
    return {
        "delivery_id": delivery_id,
        "status": next_status,
        "attempt_count": attempt_number,
        "retry_after_seconds": delay,
        "duplicate_attempt": False,
    }


@router.post("/heartbeat", status_code=status.HTTP_200_OK)
async def record_heartbeat(request: HeartbeatRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO automation_heartbeats (component, status, details, last_seen)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (component) DO UPDATE
               SET status=EXCLUDED.status, details=EXCLUDED.details, last_seen=NOW()""",
            request.component, request.status, request.details,
        )
    return {"component": request.component, "status": request.status, "recorded": True}


@router.post("/pipeline/run", status_code=status.HTTP_200_OK)
async def run_pipeline(request: PipelineRunRequest):
    """Run the existing Python pipeline with an advisory lock and idempotency key."""
    pool = await get_pool()
    async with pool.acquire() as lock_conn:
        existing = await lock_conn.fetchrow(
            """SELECT id, workflow_name, trigger, status, started_at, finished_at,
                      duration_ms, new_records, new_spikes, new_critical,
                      latest_data_date, error_message
               FROM automation_runs WHERE idempotency_key=$1""",
            str(request.request_id),
        )
        if existing:
            return {**_run_response(existing), "duplicate_request": True, "alerts": []}

        locked = await lock_conn.fetchval("SELECT pg_try_advisory_lock($1, $2)", _LOCK_NAMESPACE, _LOCK_KEY)
        if not locked:
            raise HTTPException(status_code=409, detail="A pipeline run is already in progress")
        started = time.monotonic()
        try:
            await lock_conn.execute(
                """INSERT INTO automation_runs
                   (id, workflow_name, idempotency_key, trigger, status, started_at)
                   VALUES ($1, 'wfp-price-update', $1::text, $2, 'running', NOW())""",
                request.request_id, request.trigger,
            )
            try:
                from scripts.update_pipeline import run_pipeline as run_existing_pipeline
                stats = await asyncio.to_thread(run_existing_pipeline)
                events = stats.get("events", [])
                async with pool.acquire() as write_conn:
                    async with write_conn.transaction():
                        alerts = await _persist_pipeline_alerts(write_conn, events)
                        latest_date = stats.get("latest_date")
                        parsed_latest_date = date.fromisoformat(str(latest_date)[:10]) if latest_date else None
                        await write_conn.execute(
                            """UPDATE automation_runs SET status='success', finished_at=NOW(),
                                      duration_ms=$2, new_records=$3, new_spikes=$4,
                                      new_critical=$5, latest_data_date=$6
                               WHERE id=$1""",
                            request.request_id, int((time.monotonic() - started) * 1000),
                            int(stats.get("new_records", 0)), int(stats.get("new_spikes", 0)),
                            int(stats.get("new_critical", 0)), parsed_latest_date,
                        )
                row = await lock_conn.fetchrow(
                    """SELECT id, workflow_name, trigger, status, started_at, finished_at,
                              duration_ms, new_records, new_spikes, new_critical,
                              latest_data_date, error_message
                       FROM automation_runs WHERE id=$1""",
                    request.request_id,
                )
                return {**_run_response(row), "duplicate_request": False, "alerts": alerts}
            except Exception as exc:
                await lock_conn.execute(
                    """UPDATE automation_runs SET status='failed', finished_at=NOW(),
                              duration_ms=$2, error_message=$3 WHERE id=$1""",
                    request.request_id, int((time.monotonic() - started) * 1000),
                    f"Pipeline automation failed ({type(exc).__name__})",
                )
                await lock_conn.execute(
                    """INSERT INTO notification_deliveries
                           (automation_run_id, channel, status, attempt_count, last_attempt_at, delivered_at, last_error)
                       VALUES ($1,'dashboard','delivered',1,NOW(),NOW(),$2)
                       ON CONFLICT (automation_run_id, channel) DO NOTHING""",
                    request.request_id, f"Pipeline automation failed ({type(exc).__name__})",
                )
                raise HTTPException(status_code=502, detail="Pipeline automation failed; see run history") from exc
        finally:
            await lock_conn.fetchval("SELECT pg_advisory_unlock($1, $2)", _LOCK_NAMESPACE, _LOCK_KEY)


@router.post("/field-observations", status_code=status.HTTP_201_CREATED)
async def submit_field_observation(request: FieldObservationRequest):
    """Store a monitor observation as pending review; never writes into WFP tables."""
    observation_id = uuid4()
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO field_observations
                   (id, market_name, district, commodity, unit, price, observation_date,
                    data_collector, source, review_status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')""",
            observation_id, request.market_name, request.district, request.commodity,
            request.unit, request.price, request.observation_date,
            request.data_collector, request.source,
        )
    return {"id": str(observation_id), "review_status": "pending", "integrated_into_wfp": False}


@router.get("/weekly-report/data")
async def get_weekly_report_data():
    """Return observed values for an evidence-grounded weekly report."""
    pool = await get_pool()
    end = date.today()
    start = end - timedelta(days=6)
    previous_start = start - timedelta(days=7)
    async with pool.acquire() as conn:
        unstable = await conn.fetch(
            """SELECT district, COUNT(*) AS observations,
                      ROUND(AVG(ABS(NULLIF(pct_change,'')::numeric)), 2) AS mean_abs_pct_change,
                      MAX(date::date)::text AS latest_date
               FROM prices WHERE date::date BETWEEN $1 AND $2
                 AND NULLIF(pct_change,'') IS NOT NULL
               GROUP BY district ORDER BY mean_abs_pct_change DESC NULLS LAST LIMIT 10""",
            start, end,
        )
        commodities = await conn.fetch(
            """SELECT commodity, COUNT(*) AS observations,
                      ROUND(AVG(NULLIF(pct_change,'')::numeric), 2) AS mean_pct_change,
                      MAX(date::date)::text AS latest_date
               FROM prices WHERE date::date BETWEEN $1 AND $2
                 AND NULLIF(pct_change,'') IS NOT NULL
               GROUP BY commodity ORDER BY mean_pct_change DESC NULLS LAST LIMIT 10""",
            start, end,
        )
        spikes = await conn.fetch(
            """SELECT date::text AS event_date, district, market, commodity,
                      price, pct_change, zscore, spike_severity AS severity
               FROM spikes WHERE date BETWEEN $1 AND $2
                 AND spike_severity IN ('Severe','Critical')
               ORDER BY CASE spike_severity WHEN 'Critical' THEN 0 ELSE 1 END, date DESC LIMIT 100""",
            start, end,
        )
        spike_counts = await conn.fetch(
            """SELECT spike_severity AS severity, COUNT(*) AS event_count
               FROM spikes WHERE date BETWEEN $1 AND $2
                 AND spike_severity IN ('Severe','Critical')
               GROUP BY spike_severity""",
            start, end,
        )
        risk = await conn.fetch(
            """SELECT name_1 AS district, region, risk_score, critical_count,
                      severe_count, moderate_count, total_records
               FROM districts_risk ORDER BY risk_score DESC, name_1 LIMIT 28"""
        )
        historical = await conn.fetch(
            """SELECT commodity,
                      ROUND(AVG(NULLIF(price,'')::numeric) FILTER (WHERE date::date BETWEEN $1 AND $2),2) AS current_week_avg,
                      ROUND(AVG(NULLIF(price,'')::numeric) FILTER (WHERE date::date BETWEEN $3 AND $4),2) AS prior_week_avg
               FROM prices WHERE date::date BETWEEN $3 AND $2
               GROUP BY commodity HAVING COUNT(*) FILTER (WHERE date::date BETWEEN $1 AND $2) > 0
               ORDER BY commodity""",
            start, end, previous_start, start - timedelta(days=1),
        )
        previous_report = await conn.fetchrow(
            """SELECT evidence FROM intelligence_reports
               WHERE report_type='weekly' AND period_end < $1
               ORDER BY period_end DESC LIMIT 1""",
            start,
        )
        latest_data_date = await conn.fetchval("SELECT MAX(date::date)::text FROM prices")
    previous_scores = {}
    if previous_report:
        evidence = previous_report["evidence"] or {}
        if isinstance(evidence, str):
            evidence = json.loads(evidence)
        previous_scores = {
            row.get("district"): row.get("risk_score")
            for row in evidence.get("district_risk", [])
        }
    current_risk = [dict(row) for row in risk]
    high_instability = {row["district"] for row in unstable[:5]}
    high_risk = {row["district"] for row in current_risk[:10]}
    emerging_hotspots = sorted(high_instability & high_risk)
    risk_changes = [
        {**row, "previous_risk_score": previous_scores.get(row["district"]),
         "risk_score_change": (row["risk_score"] - previous_scores[row["district"]])
         if row["district"] in previous_scores else None}
        for row in current_risk
    ]
    return {
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "data_through": latest_data_date,
        "district_instability": [dict(row) for row in unstable],
        "commodity_increases": [dict(row) for row in commodities],
        "severe_critical_spikes": [dict(row) for row in spikes],
        "severe_critical_spike_counts": [dict(row) for row in spike_counts],
        "district_risk": current_risk,
        "district_risk_changes": risk_changes,
        "emerging_hotspots": emerging_hotspots,
        "historical_price_comparison": [dict(row) for row in historical],
        "evidence_notes": [
            "All values are computed from the existing WFP prices, spikes, and district-risk tables.",
            "Hotspot names are districts in both the top five mean absolute price changes and top ten risk scores; this is a descriptive overlap only.",
            "Risk-score changes are unavailable until a prior weekly report snapshot exists.",
            "Price instability is descriptive and does not establish causation.",
        ],
    }


@router.post("/weekly-report", status_code=status.HTTP_201_CREATED)
async def store_weekly_report(request: WeeklyReportRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO intelligence_reports
                   (id, report_type, period_start, period_end, status, content, evidence, model)
               VALUES ($1,'weekly',$2,$3,'generated',$4,$5::jsonb,$6)
               ON CONFLICT (report_type, period_start, period_end) DO UPDATE
               SET content=EXCLUDED.content, evidence=EXCLUDED.evidence,
                   model=EXCLUDED.model, status='generated', generated_at=NOW()
               RETURNING id, period_start, period_end, generated_at""",
            request.report_id, request.period_start, request.period_end, request.content,
            json.dumps(request.evidence, default=str), request.model,
        )
        await conn.execute(
            """INSERT INTO notification_deliveries
                   (report_id, channel, status, attempt_count, last_attempt_at, delivered_at)
               VALUES ($1,'dashboard','delivered',1,NOW(),NOW())
               ON CONFLICT (report_id, channel) DO NOTHING""",
            row["id"],
        )
        await conn.execute(
            """INSERT INTO automation_runs
                   (id, workflow_name, idempotency_key, trigger, status, started_at, finished_at)
               VALUES ($1,'weekly-situation-report',$2,'node-red','success',NOW(),NOW())
               ON CONFLICT (idempotency_key) DO UPDATE
               SET status='success', started_at=EXCLUDED.started_at,
                   finished_at=EXCLUDED.finished_at, error_message=NULL""",
            row["id"], f"weekly-report:{request.period_start.isoformat()}",
        )
    return {
        "id": str(row["id"]), "period_start": row["period_start"].isoformat(),
        "period_end": row["period_end"].isoformat(), "generated_at": row["generated_at"].isoformat(),
    }


@router.post("/workflow-failure", status_code=status.HTTP_201_CREATED)
async def record_workflow_failure(request: WorkflowFailureRequest):
    """Record a Node-RED Catch-node error without echoing details to public APIs."""
    run_id = uuid4()
    pool = await get_pool()
    safe_error = sanitize_delivery_error(request.message)
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO automation_runs
                   (id, workflow_name, idempotency_key, trigger, status, finished_at, error_message)
               VALUES ($1,$2,$3,'node-red-catch','failed',NOW(),$4)""",
            run_id, request.workflow_name, str(run_id), safe_error,
        )
        await conn.execute(
            """INSERT INTO notification_deliveries
                   (automation_run_id, channel, status, attempt_count, last_attempt_at, delivered_at, last_error)
               VALUES ($1,'dashboard','delivered',1,NOW(),NOW(),$2)
               ON CONFLICT (automation_run_id, channel) DO NOTHING""",
            run_id, safe_error,
        )
    return {"run_id": str(run_id), "recorded": True}
