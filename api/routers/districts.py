"""
routers/districts.py
Endpoints that return district-level data.
"""

from fastapi import APIRouter, HTTPException
from api.database import get_pool
import json

router = APIRouter(prefix="/api/districts", tags=["Districts"])


@router.get("/")
async def get_all_districts():
    """
    Return all 28 districts as GeoJSON FeatureCollection.
    Includes risk score, spike counts, and district polygon geometry.
    Used by Leaflet to render the choropleth layer.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                name_1                          AS district,
                region,
                ROUND(risk_score::numeric, 0)   AS risk_score,
                critical_count,
                severe_count,
                moderate_count,
                ROUND(spike_rate_pct::numeric, 2) AS spike_rate_pct,
                ST_AsGeoJSON(wkb_geometry)      AS geometry
            FROM districts_risk
            ORDER BY risk_score DESC
        """)

    # Build GeoJSON FeatureCollection
    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "properties": {
                "district"      : row["district"],
                "region"        : row["region"],
                "risk_score"    : float(row["risk_score"]),
                "critical_count": row["critical_count"],
                "severe_count"  : row["severe_count"],
                "moderate_count": row["moderate_count"],
                "spike_rate_pct": float(row["spike_rate_pct"]),
            },
            "geometry": json.loads(row["geometry"])
        })

    return {
        "type"    : "FeatureCollection",
        "count"   : len(features),
        "features": features
    }


@router.get("/{district_name}")
async def get_district(district_name: str):
    """
    Return one district's full detail.
    Used by the popup panel when user clicks a district on the map.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        # District stats
        row = await conn.fetchrow("""
            SELECT
                name_1                              AS district,
                region,
                ROUND(risk_score::numeric, 0)       AS risk_score,
                critical_count,
                severe_count,
                moderate_count,
                ROUND(avg_price::numeric, 0)        AS avg_price,
                ROUND(spike_rate_pct::numeric, 2)   AS spike_rate_pct,
                ST_AsGeoJSON(wkb_geometry)          AS geometry
            FROM districts_risk
            WHERE LOWER(name_1) = LOWER($1)
        """, district_name)

        if not row:
            raise HTTPException(
                status_code=404,
                detail=f"District '{district_name}' not found"
            )

        # Markets in this district
        markets = await conn.fetch("""
            SELECT m.market, m.total_spikes, m.spike_rate_pct
            FROM markets m
            JOIN districts_risk d
                ON ST_Within(m.wkb_geometry, d.wkb_geometry)
            WHERE LOWER(d.name_1) = LOWER($1)
            ORDER BY m.total_spikes DESC
        """, district_name)

        # Recent critical spikes in this district
        spikes = await conn.fetch("""
            SELECT
                s.commodity,
                s.market,
                ROUND(s.pct_change::numeric, 1) AS pct_change,
                s.spike_severity,
                s.date::text AS date
            FROM spikes s
            JOIN districts_risk d
                ON ST_Within(s.wkb_geometry, d.wkb_geometry)
            WHERE LOWER(d.name_1) = LOWER($1)
              AND s.spike_severity = 'Critical'
            ORDER BY s.date DESC
            LIMIT 10
        """, district_name)

    return {
        "district"      : row["district"],
        "region"        : row["region"],
        "risk_score"    : float(row["risk_score"]),
        "critical_count": row["critical_count"],
        "severe_count"  : row["severe_count"],
        "moderate_count": row["moderate_count"],
        "avg_price_mwk" : float(row["avg_price"]),
        "spike_rate_pct": float(row["spike_rate_pct"]),
        "geometry"      : json.loads(row["geometry"]),
        "markets"       : [dict(m) for m in markets],
        "recent_critical_spikes": [dict(s) for s in spikes]
    }
