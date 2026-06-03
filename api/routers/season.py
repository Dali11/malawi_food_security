"""
routers/season.py
Seasonal baseline endpoints.
GET /api/season/baseline?commodity=Maize
GET /api/season/calendar
"""

from fastapi import APIRouter, Query
from api.database import get_pool
from datetime import datetime

router = APIRouter(prefix="/api/season", tags=["Season"])

COMMODITIES = [
    "Maize", "Beans", "Rice", "Cowpeas",
    "Sugar", "Pigeon peas", "Groundnuts (shelled)", "Oil (vegetable)",
]

def _season_name(month: int) -> str:
    if month in [11, 12, 1, 2]: return "Planting"
    if month in [3, 4, 5]:      return "Harvest"
    if month in [6, 7, 8]:      return "Post-harvest"
    return "Lean"

def _current_season() -> str:
    return _season_name(datetime.now().month)


@router.get("/baseline")
async def get_seasonal_baseline(
    commodity: str = Query(default="Maize"),
):
    """
    Returns historical average price per season per district
    for a given commodity, plus current price for comparison.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        # Historical seasonal averages (all years)
        # historical avg: only last 4 years to avoid stale low prices
        historical = await conn.fetch("""
            SELECT
                district,
                CASE EXTRACT(MONTH FROM date::date)
                    WHEN 11 THEN 'Planting' WHEN 12 THEN 'Planting'
                    WHEN 1  THEN 'Planting' WHEN 2  THEN 'Planting'
                    WHEN 3  THEN 'Harvest'  WHEN 4  THEN 'Harvest'
                    WHEN 5  THEN 'Harvest'
                    WHEN 6  THEN 'Post-harvest' WHEN 7 THEN 'Post-harvest'
                    WHEN 8  THEN 'Post-harvest'
                    ELSE 'Lean'
                END AS season,
                ROUND(AVG(price::numeric), 0) AS avg_price,
                COUNT(*)                       AS observations
            FROM prices
            WHERE LOWER(commodity) = LOWER($1)
              AND unit = 'KG'
              AND price IS NOT NULL
              AND price::numeric > 50
              AND date::date >= NOW() - INTERVAL '4 years'
            GROUP BY district, season
            ORDER BY district, season
        """, commodity)

        # Fix 2 — current price: widen window to 90 days
        current = await conn.fetch("""
            SELECT
                district,
                ROUND(AVG(price::numeric), 0) AS current_price,
                MAX(date::date)               AS latest_date
            FROM prices
            WHERE LOWER(commodity) = LOWER($1)
              AND unit = 'KG'
              AND price IS NOT NULL
              AND date::date >= NOW() - INTERVAL '90 days'
            GROUP BY district
        """, commodity)

        # District risk scores
        risk = await conn.fetch("""
            SELECT name_1 AS district, region, risk_score
            FROM districts_risk
        """)

    # Build lookup maps
    current_map = {r["district"].lower(): r for r in current}
    risk_map    = {r["district"].lower(): r for r in risk}

    # Group historical by district
    district_data: dict = {}
    for row in historical:
        name = row["district"]
        key  = name.lower()
        if key not in district_data:
            risk_row   = risk_map.get(key, {})
            curr_row   = current_map.get(key, {})
            curr_price = float(curr_row["current_price"]) if curr_row and curr_row["current_price"] else None
            district_data[key] = {
                "district"     : name,
                "region"       : risk_row.get("region", ""),
                "risk_score"   : float(risk_row.get("risk_score") or 0),
                "current_price": curr_price,
                "latest_date"  : str(curr_row["latest_date"]) if curr_row and curr_row.get("latest_date") else None,
                "seasons"      : {},
            }
        avg = float(row["avg_price"]) if row["avg_price"] else None
        district_data[key]["seasons"][row["season"]] = {
            "avg_price"   : avg,
            "observations": int(row["observations"]),
        }

    # Add pct vs current season baseline
    current_season = _current_season()
    for d in district_data.values():
        baseline = d["seasons"].get(current_season, {}).get("avg_price")
        curr     = d["current_price"]
        if baseline and curr:
            d["pct_vs_baseline"] = round((curr - baseline) / baseline * 100, 1)
        else:
            d["pct_vs_baseline"] = None

    return {
        "commodity"      : commodity,
        "current_season" : current_season,
        "districts"      : sorted(
            district_data.values(),
            key=lambda x: abs(x["pct_vs_baseline"] or 0),
            reverse=True,
        ),
    }


@router.get("/calendar")
async def get_crop_calendar():
    """
    Returns seasonal price summary for all commodities
    in the current season vs historical average.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        rows = await conn.fetch("""
            WITH seasonal AS (
                SELECT
                    commodity,
                    CASE EXTRACT(MONTH FROM date::date)
                        WHEN 11 THEN 'Planting' WHEN 12 THEN 'Planting'
                        WHEN 1  THEN 'Planting' WHEN 2  THEN 'Planting'
                        WHEN 3  THEN 'Harvest'  WHEN 4  THEN 'Harvest'
                        WHEN 5  THEN 'Harvest'
                        WHEN 6  THEN 'Post-harvest' WHEN 7 THEN 'Post-harvest'
                        WHEN 8  THEN 'Post-harvest'
                        ELSE 'Lean'
                    END AS season,
                    ROUND(AVG(price::numeric), 0) AS avg_price
                FROM prices
                WHERE commodity = ANY($1::text[])
                  AND unit = 'KG'
                  AND price IS NOT NULL
                  AND price::numeric > 50
                GROUP BY commodity, season
            ),
            current AS (
                SELECT
                    commodity,
                    ROUND(AVG(price::numeric), 0) AS current_price
                FROM prices
                WHERE commodity = ANY($1::text[])
                  AND unit = 'KG'
                  AND price IS NOT NULL
                  AND date::date >= NOW() - INTERVAL '60 days'
                GROUP BY commodity
            )
            SELECT
                s.commodity,
                s.season,
                s.avg_price     AS historical_avg,
                c.current_price AS current_price
            FROM seasonal s
            LEFT JOIN current c ON s.commodity = c.commodity
            ORDER BY s.commodity, s.season
        """, COMMODITIES)

    # Group by commodity
    cal: dict = {}
    for r in rows:
        name = r["commodity"]
        if name not in cal:
            cal[name] = {"commodity": name, "seasons": {}, "current_price": None}
        cal[name]["seasons"][r["season"]] = float(r["historical_avg"]) if r["historical_avg"] else None
        if r["current_price"]:
            cal[name]["current_price"] = float(r["current_price"])

    current_season = _current_season()
    result = []
    for item in cal.values():
        baseline = item["seasons"].get(current_season)
        curr     = item["current_price"]
        pct      = round((curr - baseline) / baseline * 100, 1) if baseline and curr else None
        result.append({
            **item,
            "current_season": current_season,
            "pct_vs_baseline": pct,
            "status": (
                "Critical" if pct and pct > 40 else
                "Severe"   if pct and pct > 20 else
                "Elevated" if pct and pct > 0  else
                "Normal"   if pct is not None  else
                "No data"
            ),
        })

    return {
        "current_season": current_season,
        "current_month" : datetime.now().strftime("%B %Y"),
        "commodities"   : sorted(result, key=lambda x: x["pct_vs_baseline"] or 0, reverse=True),
        "seasons"       : ["Planting", "Harvest", "Post-harvest", "Lean"],
    }