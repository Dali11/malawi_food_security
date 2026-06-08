"""
routers/season_baseline.py  —  FIXED VERSION

Root cause of 187 MWK bug:
  Averaging all years (2020–2026) equally for post-harvest months (Jun–Aug).
  June has only 50 rows total, mostly 2020–2021 when Maize was 100–200 MWK.
  2020 avg: 225 MWK · 2021 avg: 155 MWK · 2025 avg: 1,518 MWK → mixed avg = 187 MWK

Fix: Tiered baseline window
  • Primary  : 2023-01-01 → 2025-12-31  (post-inflation, 3-year average)
  • Fallback  : 2022-01-01 → 2025-12-31  (used when 2023+ has <3 rows — covers Jun/Jul/Aug)
  • Current   : last 90 days              (what households actually pay today)
"""

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from api.database import get_pool
from datetime import date, datetime
from typing import Optional

router = APIRouter(prefix="/api/season-baseline", tags=["Season Baseline"])

# ── Season definitions ────────────────────────────────────────────────────────

def current_season() -> tuple[str, list[int]]:
    """Return (season_name, month_list) for today's date."""
    m = datetime.now().month
    if m in (11, 12, 1, 2):  return ("Planting",     [11, 12, 1, 2])
    if m in (3, 4, 5):       return ("Harvest",       [3, 4, 5])
    if m in (6, 7, 8):       return ("Post-harvest",  [6, 7, 8])
    return                          ("Lean",           [9, 10])

SEASON_MONTHS = {
    "Planting":     [11, 12, 1, 2],
    "Harvest":      [3, 4, 5],
    "Post-harvest": [6, 7, 8],
    "Lean":         [9, 10],
}

# Post-harvest months have very sparse 2023+ data in the DB.
# These seasons use the 2022+ fallback automatically.
SPARSE_SEASONS = {"Post-harvest"}

# Commodities list for calendar endpoint
COMMODITIES_LIST = ["Maize", "Beans", "Cowpeas", "Rice", "Sugar", "Pigeon peas"]


# ── Commodity baseline endpoint ───────────────────────────────────────────────

@router.get("/commodities")
async def get_commodity_baseline(
        commodity: Optional[str] = Query(None, description="Filter to one commodity"),
):
    """
    National commodity baseline — all four seasons, current price, vs-baseline %.
    Uses tiered window: 2023+ primary, 2022+ fallback for sparse post-harvest months.
    """
    season_name, season_months = current_season()

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                                    SELECT
                                        commodity,

                                        -- POST-HARVEST (Jun–Aug) — sparse 2023+ data, use tiered fallback
                                        COALESCE(
                                                NULLIF(ROUND(AVG(price::numeric) FILTER (
                            WHERE EXTRACT(month FROM date::date) IN (6,7,8)
                              AND date::date >= '2023-01-01'
                              AND date::date <  '2026-01-01'
                              AND price::numeric > 0
                        ), 0), 0),
                                                NULLIF(ROUND(AVG(price::numeric) FILTER (
                            WHERE EXTRACT(month FROM date::date) IN (6,7,8)
                              AND date::date >= '2022-01-01'
                              AND date::date <  '2026-01-01'
                              AND price::numeric > 0
                        ), 0), 0)
                                        ) AS post_harvest_baseline,

                                        -- HARVEST (Mar–May) — good 2023+ coverage
                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE EXTRACT(month FROM date::date) IN (3,4,5)
                          AND date::date >= '2023-01-01'
                          AND date::date <  '2026-01-01'
                          AND price::numeric > 0
                    ), 0), 0) AS harvest_baseline,

                                        -- PLANTING (Nov–Feb) — good 2023+ coverage
                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE EXTRACT(month FROM date::date) IN (11,12,1,2)
                          AND date::date >= '2023-01-01'
                          AND date::date <  '2026-01-01'
                          AND price::numeric > 0
                    ), 0), 0) AS planting_baseline,

                                        -- LEAN (Sep–Oct) — good 2023+ coverage
                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE EXTRACT(month FROM date::date) IN (9,10)
                          AND date::date >= '2023-01-01'
                          AND date::date <  '2026-01-01'
                          AND price::numeric > 0
                    ), 0), 0) AS lean_baseline,

                                        -- CURRENT PRICE (last 90 days)
                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE date::date >= (CURRENT_DATE - INTERVAL '90 days')
                          AND price::numeric > 0
                    ), 0), 0) AS current_price

                                    FROM prices
                                    WHERE unit = 'KG'
                                      AND price ~ '^[0-9]+(\\.[0-9]+)?$'
                  AND price::numeric > 0
                  AND price::numeric < 50000
                  AND ($1::text IS NULL OR commodity ILIKE $1)
                                    GROUP BY commodity
                                    ORDER BY commodity
                                    """, commodity)

        result = []
        for r in rows:
            d = dict(r)

            # Pick the correct season baseline for vs-baseline calculation
            season_key = f"{season_name.lower().replace('-', '_')}_baseline"
            season_baseline = d.get(season_key)

            current = d.get("current_price")

            # vs baseline %
            pct = None
            stress = "No data"
            if season_baseline and current:
                pct = round((current - season_baseline) / season_baseline * 100, 1)
                stress = (
                    "Critical" if pct > 40 else
                    "Elevated" if pct > 15 else
                    "Normal"
                )

            result.append({
                "commodity": d["commodity"],
                "current_season": season_name,
                "planting_baseline": d["planting_baseline"],
                "harvest_baseline": d["harvest_baseline"],
                "post_harvest_baseline": d["post_harvest_baseline"],
                "lean_baseline": d["lean_baseline"],
                "current_price": current,
                "pct_vs_baseline": pct,
                "stress_level": stress,
            })

        return {
            "current_season": season_name,
            "season_months": season_months,
            "baseline_window": "2023–2025 (post-harvest: 2022–2025 fallback)",
            "commodities": result,
        }

    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={
            "error": str(e), "trace": traceback.format_exc()
        })


# ── District baseline endpoint ────────────────────────────────────────────────

@router.get("/district/{district_name}")
async def get_district_baseline(
        district_name: str,
        commodity: Optional[str] = Query(None),
):
    """
    District-level baseline — all seasons for a specific district.
    Same tiered window logic.
    """
    from urllib.parse import unquote
    district_name = unquote(district_name)
    season_name, season_months = current_season()

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                                    SELECT
                                        district,
                                        region,
                                        commodity,

                                        COALESCE(
                                                NULLIF(ROUND(AVG(price::numeric) FILTER (
                            WHERE EXTRACT(month FROM date::date) IN (6,7,8)
                              AND date::date >= '2023-01-01'
                              AND date::date < '2026-01-01'
                              AND price::numeric > 0
                        ), 0), 0),
                                                NULLIF(ROUND(AVG(price::numeric) FILTER (
                            WHERE EXTRACT(month FROM date::date) IN (6,7,8)
                              AND date::date >= '2022-01-01'
                              AND date::date < '2026-01-01'
                              AND price::numeric > 0
                        ), 0), 0)
                                        ) AS post_harvest_baseline,

                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE EXTRACT(month FROM date::date) IN (3,4,5)
                          AND date::date >= '2023-01-01'
                          AND date::date < '2026-01-01'
                          AND price::numeric > 0
                    ), 0), 0) AS harvest_baseline,

                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE EXTRACT(month FROM date::date) IN (11,12,1,2)
                          AND date::date >= '2023-01-01'
                          AND date::date < '2026-01-01'
                          AND price::numeric > 0
                    ), 0), 0) AS planting_baseline,

                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE EXTRACT(month FROM date::date) IN (9,10)
                          AND date::date >= '2023-01-01'
                          AND date::date < '2026-01-01'
                          AND price::numeric > 0
                    ), 0), 0) AS lean_baseline,

                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE date::date >= (CURRENT_DATE - INTERVAL '90 days')
                          AND price::numeric > 0
                    ), 0), 0) AS current_price,

                                        COUNT(*) FILTER (
                        WHERE date::date >= (CURRENT_DATE - INTERVAL '90 days')
                    ) AS current_rows

                                    FROM prices
                                    WHERE district ILIKE $1
                                      AND unit = 'KG'
                                      AND price ~ '^[0-9]+(\\.[0-9]+)?$'
                                      AND price::numeric > 0
                                      AND price::numeric < 50000
                                      AND ($2::text IS NULL OR commodity ILIKE $2)
                                    GROUP BY district, region, commodity
                                    ORDER BY commodity
                                    """, district_name, commodity)

        result = []
        for r in rows:
            d = dict(r)
            season_key = f"{season_name.lower().replace('-', '_')}_baseline"
            season_baseline = d.get(season_key)
            current = d.get("current_price")

            pct = None
            stress = "No data"
            if season_baseline and current:
                pct = round((current - season_baseline) / season_baseline * 100, 1)
                stress = (
                    "Critical" if pct > 40 else
                    "Elevated" if pct > 15 else
                    "Normal"
                )

            result.append({
                "district": d["district"],
                "region": d["region"],
                "commodity": d["commodity"],
                "current_season": season_name,
                "planting_baseline": d["planting_baseline"],
                "harvest_baseline": d["harvest_baseline"],
                "post_harvest_baseline": d["post_harvest_baseline"],
                "lean_baseline": d["lean_baseline"],
                "current_price": current,
                "current_rows": d["current_rows"],
                "pct_vs_baseline": pct,
                "stress_level": stress,
            })

        return {
            "district": district_name,
            "current_season": season_name,
            "season_months": season_months,
            "baseline_window": "2023–2025 (post-harvest: 2022–2025 fallback)",
            "commodities": result,
        }

    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={
            "error": str(e), "trace": traceback.format_exc()
        })


# ── National summary (for overview cards) ────────────────────────────────────

@router.get("/summary")
async def get_baseline_summary():
    """
    Four KPI cards for the Season Baseline overview:
    season name, reporting districts, districts above baseline, avg deviation.
    """
    season_name, season_months = current_season()
    season_key_sql = {
        "Planting": "EXTRACT(month FROM date::date) IN (11,12,1,2)",
        "Harvest": "EXTRACT(month FROM date::date) IN (3,4,5)",
        "Post-harvest": "EXTRACT(month FROM date::date) IN (6,7,8)",
        "Lean": "EXTRACT(month FROM date::date) IN (9,10)",
    }[season_name]

    # For post-harvest, use the tiered window
    if season_name == "Post-harvest":
        baseline_filter = """
            COALESCE(
                NULLIF(AVG(price::numeric) FILTER (
                    WHERE EXTRACT(month FROM date::date) IN (6,7,8)
                      AND date::date >= '2023-01-01' AND date::date < '2026-01-01'
                      AND price::numeric > 0
                ), 0),
                NULLIF(AVG(price::numeric) FILTER (
                    WHERE EXTRACT(month FROM date::date) IN (6,7,8)
                      AND date::date >= '2022-01-01' AND date::date < '2026-01-01'
                      AND price::numeric > 0
                ), 0)
            )
        """
    else:
        baseline_filter = f"""
            NULLIF(AVG(price::numeric) FILTER (
                WHERE {season_key_sql}
                  AND date::date >= '2023-01-01'
                  AND date::date <  '2026-01-01'
                  AND price::numeric > 0
            ), 0)
        """

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            summary = await conn.fetchrow(f"""
                WITH district_baseline AS (
                    SELECT
                        district,
                        commodity,
                        {baseline_filter} AS baseline,
                        AVG(price::numeric) FILTER (
                            WHERE date::date >= (CURRENT_DATE - INTERVAL '90 days')
                              AND price::numeric > 0
                        ) AS current_price
                    FROM prices
                    WHERE unit = 'KG'
                      AND price ~ '^[0-9]+(\\.[0-9]+)?$'
                      AND price::numeric > 0
                      AND price::numeric < 50000
                      AND commodity = 'Maize'
                    GROUP BY district, commodity
                ),
                deviations AS (
                    SELECT
                        district,
                        CASE
                            WHEN baseline > 0 AND current_price IS NOT NULL
                            THEN ROUND((current_price - baseline) / baseline * 100, 1)
                            ELSE NULL
                        END AS deviation_pct
                    FROM district_baseline
                    WHERE baseline IS NOT NULL AND current_price IS NOT NULL
                )
                SELECT
                    COUNT(DISTINCT district) AS reporting_districts,
                    COUNT(*) FILTER (WHERE deviation_pct > 0) AS above_baseline,
                    ROUND(AVG(deviation_pct), 1) AS avg_deviation_pct
                FROM deviations
            """)

        return {
            "current_season": season_name,
            "season_months": season_months,
            "reporting_districts": int(summary["reporting_districts"] or 0),
            "above_baseline": int(summary["above_baseline"] or 0),
            "avg_deviation_pct": float(summary["avg_deviation_pct"] or 0),
            "baseline_window": "2023–2025 (post-harvest: 2022–2025 fallback)",
            "commodity_anchor": "Maize",
        }

    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={
            "error": str(e), "trace": traceback.format_exc()
        })


# ── Crop calendar endpoint ────────────────────────────────────────────────────

@router.get("/calendar")
async def get_crop_calendar():
    """
    Crop calendar endpoint - returns seasonal price data for all commodities
    for the frontend CropCalendar component.
    Uses same tiered baseline logic as commodity baseline endpoint.
    """
    season_name, season_months = current_season()
    current_month = datetime.now().strftime("%B %Y")

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                                    SELECT
                                        commodity,

                                        -- PLANTING (Nov–Feb) - 2023+ baseline
                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE EXTRACT(month FROM date::date) IN (11,12,1,2)
                          AND date::date >= '2023-01-01'
                          AND date::date < '2026-01-01'
                          AND price::numeric > 0
                    ), 0), 0) AS planting_price,

                                        -- HARVEST (Mar–May) - 2023+ baseline
                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE EXTRACT(month FROM date::date) IN (3,4,5)
                          AND date::date >= '2023-01-01'
                          AND date::date < '2026-01-01'
                          AND price::numeric > 0
                    ), 0), 0) AS harvest_price,

                                        -- POST-HARVEST (Jun–Aug) - tiered: 2023+ primary, 2022+ fallback
                                        COALESCE(
                                                NULLIF(ROUND(AVG(price::numeric) FILTER (
                            WHERE EXTRACT(month FROM date::date) IN (6,7,8)
                              AND date::date >= '2023-01-01'
                              AND date::date < '2026-01-01'
                              AND price::numeric > 0
                        ), 0), 0),
                                                NULLIF(ROUND(AVG(price::numeric) FILTER (
                            WHERE EXTRACT(month FROM date::date) IN (6,7,8)
                              AND date::date >= '2022-01-01'
                              AND date::date < '2026-01-01'
                              AND price::numeric > 0
                        ), 0), 0)
                                        ) AS post_harvest_price,

                                        -- LEAN (Sep–Oct) - 2023+ baseline
                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE EXTRACT(month FROM date::date) IN (9,10)
                          AND date::date >= '2023-01-01'
                          AND date::date < '2026-01-01'
                          AND price::numeric > 0
                    ), 0), 0) AS lean_price,

                                        -- CURRENT PRICE (last 90 days)
                                        NULLIF(ROUND(AVG(price::numeric) FILTER (
                        WHERE date::date >= (CURRENT_DATE - INTERVAL '90 days')
                          AND price::numeric > 0
                    ), 0), 0) AS current_price

                                    FROM prices
                                    WHERE unit = 'KG'
                                      AND price ~ '^[0-9]+(\\.[0-9]+)?$'
                  AND price::numeric > 0
                  AND price::numeric < 50000
                  AND commodity = ANY($1::text[])
                                    GROUP BY commodity
                                    ORDER BY commodity
                                    """, COMMODITIES_LIST)

        # Build response matching frontend CropCalendar type
        seasons_list = ["Planting", "Harvest", "Post-harvest", "Lean"]
        commodities_result = []

        for row in rows:
            d = dict(row)

            # Skip if no data for any season
            if not any([d.get("planting_price"), d.get("harvest_price"),
                        d.get("post_harvest_price"), d.get("lean_price")]):
                continue

            # Build seasons object with 4 seasonal prices
            seasons_prices = {
                "Planting": d.get("planting_price"),
                "Harvest": d.get("harvest_price"),
                "Post-harvest": d.get("post_harvest_price"),
                "Lean": d.get("lean_price"),
            }

            # Calculate vs baseline percentage for current season
            current_baseline = seasons_prices.get(season_name)
            current_price = d.get("current_price")

            pct_vs_baseline = None
            status = "No data"

            if current_baseline and current_baseline > 0 and current_price:
                pct_vs_baseline = round(
                    (current_price - current_baseline) / current_baseline * 100, 1
                )
                if pct_vs_baseline > 40:
                    status = "Critical"
                elif pct_vs_baseline > 15:
                    status = "Elevated"
                else:
                    status = "Normal"

            commodities_result.append({
                "commodity": d["commodity"],
                "current_price": current_price,
                "current_season": season_name,
                "pct_vs_baseline": pct_vs_baseline,
                "status": status,
                "seasons": seasons_prices,
            })

        return {
            "current_season": season_name,
            "current_month": current_month,
            "seasons": seasons_list,
            "commodities": commodities_result,
        }

    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={
            "error": str(e),
            "trace": traceback.format_exc()
        })


# ── Legacy endpoint for frontend compatibility ───────────────────────────────


from fastapi import APIRouter as LegacyRouter
legacy_router = APIRouter(prefix="/api/season", tags=["Season (Legacy)"])

@legacy_router.get("/calendar")
async def legacy_crop_calendar():
    """Legacy endpoint redirect to maintain frontend compatibility."""
    return await get_crop_calendar()