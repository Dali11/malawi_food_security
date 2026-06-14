"""
routers/indicators.py
Food Security Composite Indicators — Malawi Food Price Intelligence
All queries derived from real schema: prices, spikes, districts_risk, markets.
No foreign keys — tables joined on district / commodity / date string columns.
Note: prices.price, pct_change, zscore, year, month are VARCHAR — cast to numeric.
"""

from fastapi import APIRouter, Query
from typing import Optional
from api.database import get_pool

router = APIRouter(prefix="/api/indicators", tags=["Indicators"])


# ─────────────────────────────────────────────────────────────────────────────
# HELPER — latest year present in prices table (avoids hard-coding 2026)
# ─────────────────────────────────────────────────────────────────────────────
LATEST_YEAR_SQL = """
    SELECT MAX(year::integer) FROM prices WHERE year ~ '^[0-9]+$'
"""


# ─────────────────────────────────────────────────────────────────────────────
# 1.  SUMMARY  —  header metric cards
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/summary")
async def get_indicators_summary():
    """
    Top-level composite metrics:
      - Food Security Index (derived from districts_risk.risk_score, inverted 0-100)
      - Price Stress Index  (% of districts with avg pct_change > 0 in latest year)
      - Avg volatility      (mean pct_change across all commodities, latest year)
      - Critical commodities (distinct commodities with Critical spikes, latest year)
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        latest_year = await conn.fetchval(LATEST_YEAR_SQL)

        # FSI: invert risk_score (confirmed max = 436) to 0-100 scale
        # Using 436 as the fixed max so the scale is consistent across requests
        fsi_row = await conn.fetchrow("""
            SELECT
                ROUND(
                    (1 - AVG(risk_score)::numeric / 436) * 100,
                    1
                )                                        AS avg_fsi,
                COUNT(*) FILTER (WHERE risk_score > 300) AS critical_count,
                COUNT(*) FILTER (WHERE risk_score > 150) AS stressed_count,
                COUNT(*)                                  AS total_districts
            FROM districts_risk
            WHERE district IS NOT NULL
        """)

        # PSI: % of districts whose avg pct_change > 0 this year
        psi_row = await conn.fetchrow("""
            SELECT
                ROUND(
                    COUNT(DISTINCT district) FILTER (
                        WHERE avg_pct > 0
                    )::numeric
                    / NULLIF(COUNT(DISTINCT district), 0) * 100,
                    1
                )                  AS psi_pct,
                ROUND(AVG(avg_pct)::numeric, 1) AS avg_vol
            FROM (
                SELECT
                    district,
                    AVG(pct_change::numeric) AS avg_pct
                FROM prices
                WHERE year  = $1::text
                  AND pct_change ~ '^-?[0-9]+(\.[0-9]+)?$'
                GROUP BY district
            ) sub
        """, str(latest_year))

        # Critical commodities
        crit_comm = await conn.fetchval("""
            SELECT COUNT(DISTINCT commodity)
            FROM spikes
            WHERE spike_severity = 'Critical'
              AND EXTRACT(YEAR FROM date) = $1
        """, latest_year)

        return {
            "fsi": {
                "avg_score":          float(fsi_row["avg_fsi"] or 0),
                "critical_districts": int(fsi_row["critical_count"] or 0),
                "stressed_districts": int(fsi_row["stressed_count"] or 0),
                "total_districts":    int(fsi_row["total_districts"] or 0),
            },
            "price_stress_index":  float(psi_row["psi_pct"] or 0),
            "avg_volatility":      float(psi_row["avg_vol"] or 0),
            "critical_commodities": int(crit_comm or 0),
            "latest_year":          latest_year,
        }


# ─────────────────────────────────────────────────────────────────────────────
# 2.  DISTRICT FSI  —  bar chart + table, filterable by region
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/districts")
async def get_district_fsi(
    region: Optional[str] = Query(
        None,
        description="Filter by region: Central, Southern, Northern"
    )
):
    """
    Per-district composite indicators derived from districts_risk + prices + spikes.
    FSI = inverted risk_score scaled 0-100 (higher = safer).
    Volatility = avg pct_change from prices table for latest year.
    Coverage = spike_rate_pct proxy for monitoring density.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        latest_year = await conn.fetchval(LATEST_YEAR_SQL)

        # Max risk_score for FSI inversion
        max_risk = await conn.fetchval(
            "SELECT MAX(risk_score) FROM districts_risk WHERE district IS NOT NULL"
        )
        max_risk = max_risk or 1

        rows = await conn.fetch("""
            SELECT
                dr.district,
                dr.region,
                dr.risk_score,
                ROUND(
                    (1 - dr.risk_score::numeric / $1) * 100,
                    1
                )                                               AS fsi_score,
                CASE
                    WHEN dr.risk_score > 300 THEN 'Critical'
                    WHEN dr.risk_score > 200 THEN 'High'
                    WHEN dr.risk_score > 100 THEN 'Moderate'
                    ELSE 'Low'
                END                                             AS stress_level,
                COALESCE(p.avg_volatility, 0)                  AS avg_volatility,
                ROUND(dr.spike_rate_pct::numeric, 1)           AS coverage_pct
            FROM districts_risk dr
            LEFT JOIN (
                SELECT
                    district,
                    ROUND(AVG(pct_change::numeric)::numeric, 1) AS avg_volatility
                FROM prices
                WHERE year = $2::text
                  AND pct_change ~ '^-?[0-9]+(\.[0-9]+)?$'
                GROUP BY district
            ) p ON p.district = dr.district
            WHERE dr.district IS NOT NULL
              AND ($3::text IS NULL OR dr.region = $3)
            ORDER BY dr.risk_score DESC
        """, max_risk, str(latest_year), region)

        return [
            {
                "district":   r["district"],
                "region":     r["region"],
                "fsi_score":  float(r["fsi_score"] or 0),
                "risk_score": int(r["risk_score"] or 0),
                "stress":     r["stress_level"],
                "volatility": float(r["avg_volatility"] or 0),
                "coverage":   float(r["coverage_pct"] or 0),
            }
            for r in rows
        ]


# ─────────────────────────────────────────────────────────────────────────────
# 3.  PSI TREND  —  monthly Price Stress Index, last 6 months
#     Optional filters: commodity (name or "all"), district (name or None)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/psi-trend")
async def get_psi_trend(
    commodity: Optional[str] = Query(
        None,
        description="Commodity name e.g. 'Maize'. Omit or pass 'all' for all commodities."
    ),
    district: Optional[str] = Query(
        None,
        description="District name to scope the trend. Omit for all districts."
    ),
):
    """
    Monthly PSI with optional commodity + district filters.

    - commodity=all  (or omitted)  → avg pct_change across all commodities per district/month
    - commodity=Maize              → only maize prices used
    - district=Machinga            → only that district's prices (PSI = 0 or 100 each month)
    - Both combined                → single district + single commodity monthly trend
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        # Normalise "all" → None so SQL filter is skipped
        comm_filter     = None if (not commodity or commodity.lower() == "all") else commodity
        district_filter = None if (not district  or district.lower()  == "all") else district

        rows = await conn.fetch("""
            WITH monthly AS (
                SELECT
                    year::integer            AS yr,
                    month::integer           AS mo,
                    district,
                    AVG(pct_change::numeric) AS avg_pct
                FROM prices
                WHERE pct_change ~ '^-?[0-9]+(\.[0-9]+)?$'
                  AND month      ~ '^[0-9]+$'
                  AND year       ~ '^[0-9]+$'
                  AND ($1::text IS NULL OR commodity ILIKE $1)
                  AND ($2::text IS NULL OR district  ILIKE $2)
                GROUP BY year::integer, month::integer, district
            ),
            psi AS (
                SELECT
                    yr, mo,
                    ROUND(
                        COUNT(*) FILTER (WHERE avg_pct > 0)::numeric
                        / NULLIF(COUNT(*), 0) * 100,
                        1
                    ) AS psi_pct
                FROM monthly
                GROUP BY yr, mo
                ORDER BY yr DESC, mo DESC
                LIMIT 6
            )
            SELECT
                yr, mo, psi_pct,
                TO_CHAR(MAKE_DATE(yr, mo, 1), 'Mon') AS month_label
            FROM psi
            ORDER BY yr ASC, mo ASC
        """, comm_filter, district_filter)

        return {
            "commodity": commodity or "all",
            "district":  district  or "all",
            "series": [
                {
                    "month": r["month_label"],
                    "year" : r["yr"],
                    "mo"   : r["mo"],
                    "psi"  : float(r["psi_pct"] or 0),
                }
                for r in rows
            ]
        }


# ─────────────────────────────────────────────────────────────────────────────
# 4.  COMMODITY STRESS  —  horizontal bar chart
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/commodity-stress")
async def get_commodity_stress():
    """
    Per-commodity avg pct_change vs baseline (first year in data).
    Stress level: Critical > 40%, Elevated > 15%, Normal otherwise.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        latest_year = await conn.fetchval(LATEST_YEAR_SQL)

        prev_year = latest_year - 1

        rows = await conn.fetch("""
            WITH latest AS (
                SELECT
                    commodity,
                    AVG(price::numeric) AS avg_price_now
                FROM prices
                WHERE year  = $1::text
                  AND price ~ '^[0-9]+(\.[0-9]+)?$'
                GROUP BY commodity
            ),
            baseline AS (
                SELECT
                    commodity,
                    AVG(price::numeric) AS avg_price_base
                FROM prices
                WHERE year  = $2::text
                  AND price ~ '^[0-9]+(\.[0-9]+)?$'
                GROUP BY commodity
            ),
            combined AS (
                SELECT
                    l.commodity,
                    ROUND(
                        (l.avg_price_now - b.avg_price_base)
                        / NULLIF(b.avg_price_base, 0) * 100
                        ::numeric, 1
                    ) AS deviation_pct
                FROM latest l
                JOIN baseline b USING (commodity)
            )
            SELECT
                commodity,
                deviation_pct,
                CASE
                    WHEN deviation_pct > 40 THEN 'critical'
                    WHEN deviation_pct > 15 THEN 'elevated'
                    ELSE 'normal'
                END AS stress_level
            FROM combined
            ORDER BY deviation_pct DESC NULLS LAST
        """, str(latest_year), str(prev_year))

        return [
            {
                "commodity":    r["commodity"],
                "deviation":    float(r["deviation_pct"] or 0),
                "stress_level": r["stress_level"],
            }
            for r in rows
        ]


# ─────────────────────────────────────────────────────────────────────────────
# 5.  LEAN SEASON RISK  —  donut chart
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/lean-season-risk")
async def get_lean_season_risk():
    """
    Projects lean season risk per district based on current spike counts
    and risk_score from districts_risk. Bucketed into 4 tiers.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        rows = await conn.fetch("""
            SELECT
                risk_tier,
                COUNT(*) AS district_count
            FROM (
                SELECT
                    district,
                    CASE
                        WHEN risk_score > 300 THEN 'Critical'
                        WHEN risk_score > 200 THEN 'High'
                        WHEN risk_score > 100 THEN 'Moderate'
                        ELSE 'Low'
                    END AS risk_tier
                FROM districts_risk
                WHERE district IS NOT NULL
            ) sub
            GROUP BY risk_tier
            ORDER BY CASE risk_tier
                WHEN 'Critical' THEN 1
                WHEN 'High'     THEN 2
                WHEN 'Moderate' THEN 3
                ELSE 4
            END
        """)

        return [
            {
                "tier":  r["risk_tier"],
                "count": int(r["district_count"]),
            }
            for r in rows
        ]


# ─────────────────────────────────────────────────────────────────────────────
# 6.  COMMODITY VS BASELINE  —  grouped bar chart, any commodity, prev-year baseline
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/commodity-vs-baseline")
async def get_commodity_vs_baseline(
    commodity: str = Query("Maize", description="Commodity name e.g. Maize, Beans, Rice")
):
    """
    Annual avg price per year for the chosen commodity.
    Each year's baseline = the previous year's avg price.
    Returns series so the frontend can plot actual vs baseline grouped bars.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        rows = await conn.fetch("""
            SELECT
                year::integer                          AS yr,
                ROUND(AVG(price::numeric)::numeric, 0) AS avg_price
            FROM prices
            WHERE commodity ILIKE $1
              AND year  ~ '^[0-9]+$'
              AND price ~ '^[0-9]+(\.[0-9]+)?$'
            GROUP BY year::integer
            ORDER BY year::integer ASC
        """, f"%{commodity}%")

        if not rows:
            return {"commodity": commodity, "baseline": 0, "series": []}

        # pair each year with the previous year as its baseline
        series = []
        for i, r in enumerate(rows):
            prev_price = float(rows[i - 1]["avg_price"]) if i > 0 else float(r["avg_price"])
            series.append({
                "year"    : r["yr"],
                "actual"  : float(r["avg_price"] or 0),
                "baseline": round(prev_price, 0),
            })

        return {
            "commodity": commodity,
            "baseline" : float(rows[0]["avg_price"] or 0),
            "series"   : series,
        }


# ─────────────────────────────────────────────────────────────────────────────
# 7.  SPIKE DISTRIBUTION  —  bonus: breakdown by severity across districts
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/spike-distribution")
async def get_spike_distribution():
    """
    Count of spikes by severity (Critical / Severe / Moderate) per region.
    Useful for stacked bar or summary callouts.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        rows = await conn.fetch("""
            SELECT
                region,
                spike_severity,
                COUNT(*) AS spike_count
            FROM spikes
            WHERE region IS NOT NULL
              AND spike_severity IS NOT NULL
            GROUP BY region, spike_severity
            ORDER BY region, spike_severity
        """)

        return [
            {
                "region":   r["region"],
                "severity": r["spike_severity"],
                "count":    int(r["spike_count"]),
            }
            for r in rows
        ]

# ─────────────────────────────────────────────────────────────────────────────
# 8.  DATA STATUS  —  staleness check for banner
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/status")
async def get_data_status():
    """
    Returns latest data date and staleness info for the frontend banner.
    Stale threshold: 45 days.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        latest_date = await conn.fetchval("""
                                          SELECT MAX(date)::text FROM prices
                                          """)

    from datetime import date, datetime
    today        = date.today()
    latest       = datetime.strptime(latest_date, "%Y-%m-%d").date()
    days_stale   = (today - latest).days
    threshold    = 45

    return {
        "latest_date" : latest_date,
        "days_stale"  : days_stale,
        "is_stale"    : days_stale > threshold,
        "threshold"   : threshold,
    }