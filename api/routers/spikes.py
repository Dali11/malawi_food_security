"""
routers/spikes.py
Endpoints that return spike event data.
"""

from fastapi import APIRouter, Query
from api.database import get_pool
from typing import Optional
import json

router = APIRouter(prefix="/api/spikes", tags=["Spikes"])


@router.get("/")
async def get_spikes(
        severity : Optional[str] = Query(None, description="Filter by severity: Critical, Severe, Moderate"),
        district : Optional[str] = Query(None, description="Filter by district name"),
        commodity: Optional[str] = Query(None, description="Filter by commodity name"),
        limit    : int           = Query(500,  description="Max records to return")
):
    """
    Return spike events as GeoJSON FeatureCollection.
    Each spike includes the current price/status for that market+commodity
    so the popup can show both the historical spike and the live situation.

    Examples:
        /api/spikes
        /api/spikes?severity=Critical
        /api/spikes?severity=Critical&district=Machinga
        /api/spikes?commodity=Maize
    """
    pool = await get_pool()

    # Build dynamic WHERE clause
    conditions = []
    params     = []
    idx        = 1

    if severity:
        conditions.append(f"s.spike_severity = ${idx}")
        params.append(severity)
        idx += 1

    if district:
        conditions.append(f"LOWER(s.district) = LOWER(${idx})")
        params.append(district)
        idx += 1

    if commodity:
        conditions.append(f"LOWER(s.commodity) LIKE LOWER(${idx})")
        params.append(f"%{commodity}%")
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            WITH latest AS (
                SELECT DISTINCT ON (district, market, commodity)
                    district,
                    market,
                    commodity,
                    unit,
                    ROUND(price::numeric, 0)        AS current_price,
                    date                            AS current_date,
                    spike_severity                  AS current_severity,
                    ROUND(pct_change::numeric, 1)   AS current_pct_change
                FROM prices
                ORDER BY district, market, commodity, date DESC
            )
            SELECT
                s.district,
                s.market,
                s.commodity,
                ROUND(s.price::numeric, 0)              AS spike_price,
                ROUND(s.pct_change::numeric, 1)         AS pct_change,
                ROUND(s.zscore::numeric, 3)             AS zscore,
                s.spike_severity,
                s.date::text                            AS spike_date,
                COALESCE(l.unit, 'KG')                  AS unit,
                ROUND(l.current_price::numeric, 0)      AS current_price,
                l.current_date::text                    AS current_date,
                COALESCE(l.current_severity, 'Normal')  AS current_severity,
                l.current_pct_change                    AS current_pct_change,
                ST_AsGeoJSON(s.wkb_geometry)            AS geometry
            FROM spikes s
            LEFT JOIN latest l
                ON  LOWER(s.district)  = LOWER(l.district)
                AND LOWER(s.market)    = LOWER(l.market)
                AND LOWER(s.commodity) = LOWER(l.commodity)
            {where}
            ORDER BY s.date DESC
            LIMIT ${idx}
        """, *params, limit)

    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "properties": {
                "district"          : row["district"],
                "market"            : row["market"],
                "commodity"         : row["commodity"],
                "price_mwk"         : float(row["spike_price"]),
                "pct_change"        : float(row["pct_change"]),
                "zscore"            : float(row["zscore"]),
                "spike_severity"    : row["spike_severity"],
                "date"              : row["spike_date"],
                "unit"              : row["unit"],
                "current_price_mwk" : float(row["current_price"]) if row["current_price"] else None,
                "current_date"      : row["current_date"],
                "current_severity"  : row["current_severity"],
                "current_pct_change": float(row["current_pct_change"]) if row["current_pct_change"] else None,
            },
            "geometry": json.loads(row["geometry"])
        })

    return {
        "type"    : "FeatureCollection",
        "count"   : len(features),
        "features": features
    }


@router.get("/critical")
async def get_critical_spikes():
    """
    Return only Critical spike events.
    Shortcut endpoint used by the alert panel in the dashboard.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
                                SELECT
                                    district,
                                    market,
                                    commodity,
                                    ROUND(price::numeric, 0)        AS price,
                                    ROUND(pct_change::numeric, 1)   AS pct_change,
                                    spike_severity,
                                    date::text                      AS date,
                ST_AsGeoJSON(wkb_geometry)      AS geometry
                                FROM spikes
                                WHERE spike_severity = 'Critical'
                                ORDER BY date DESC
                                """)

    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "properties": {
                "district"      : row["district"],
                "market"        : row["market"],
                "commodity"     : row["commodity"],
                "price_mwk"     : float(row["price"]),
                "pct_change"    : float(row["pct_change"]),
                "spike_severity": row["spike_severity"],
                "date"          : row["date"],
            },
            "geometry": json.loads(row["geometry"])
        })

    return {
        "type"    : "FeatureCollection",
        "count"   : len(features),
        "features": features
    }