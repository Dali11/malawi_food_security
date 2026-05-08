"""
routers/markets.py
Endpoints that return market-level data.
"""

from fastapi import APIRouter
from api.database import get_pool
import json

router = APIRouter(prefix="/api/markets", tags=["Markets"])


@router.get("/")
async def get_all_markets():
    """
    Return all 113 markets as GeoJSON FeatureCollection.
    Used by Leaflet to render the market point layer.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                market,
                district,
                region,
                num_commodities,
                total_spikes,
                critical_count,
                ROUND(spike_rate_pct::numeric, 2) AS spike_rate_pct,
                latest_date::text                 AS latest_date,
                ST_AsGeoJSON(wkb_geometry)        AS geometry
            FROM markets
            ORDER BY total_spikes DESC
        """)

    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "properties": {
                "market"          : row["market"],
                "district"        : row["district"],
                "region"          : row["region"],
                "num_commodities" : row["num_commodities"],
                "total_spikes"    : row["total_spikes"],
                "critical_count"  : row["critical_count"],
                "spike_rate_pct"  : float(row["spike_rate_pct"]),
                "latest_date"     : row["latest_date"],
            },
            "geometry": json.loads(row["geometry"])
        })

    return {
        "type"    : "FeatureCollection",
        "count"   : len(features),
        "features": features
    }
