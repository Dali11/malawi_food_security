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
    Supports optional filters by severity, district, commodity.
    Used by Leaflet to render the spike alert layer.

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
        conditions.append(f"spike_severity = ${idx}")
        params.append(severity)
        idx += 1

    if district:
        conditions.append(f"LOWER(district) = LOWER(${idx})")
        params.append(district)
        idx += 1

    if commodity:
        conditions.append(f"LOWER(commodity) LIKE LOWER(${idx})")
        params.append(f"%{commodity}%")
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            SELECT
                district,
                market,
                commodity,
                ROUND(price::numeric, 0)        AS price,
                ROUND(pct_change::numeric, 1)   AS pct_change,
                ROUND(zscore::numeric, 3)        AS zscore,
                spike_severity,
                date::text                      AS date,
                ST_AsGeoJSON(wkb_geometry)      AS geometry
            FROM spikes
            {where}
            ORDER BY date DESC
            LIMIT ${idx}
        """, *params, limit)

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
                "zscore"        : float(row["zscore"]),
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
