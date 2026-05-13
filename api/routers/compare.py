"""
routers/compare.py
District comparison endpoint.
GET /api/compare?district_a=Machinga&district_b=Zomba
"""

from fastapi import APIRouter, Query
from api.database import get_pool

router = APIRouter(prefix="/api/compare", tags=["Compare"])


@router.get("/")
async def compare_districts(
    district_a: str = Query(..., description="First district name"),
    district_b: str = Query(..., description="Second district name"),
):
    pool = await get_pool()
    async with pool.acquire() as conn:

        # Risk profile for both districts
        districts = await conn.fetch("""
            SELECT name_1, region, risk_score, critical_count,
                   severe_count, moderate_count, spike_rate_pct
            FROM districts_risk
            WHERE name_1 = ANY($1)
        """, [district_a, district_b])

        # Market count per district
        markets = await conn.fetch("""
            SELECT d.name_1, COUNT(m.ogc_fid) AS market_count
            FROM districts_risk d
            LEFT JOIN markets m ON ST_Within(m.wkb_geometry, d.wkb_geometry)
            WHERE d.name_1 = ANY($1)
            GROUP BY d.name_1
        """, [district_a, district_b])

        # Top commodities per district
        commodities = await conn.fetch("""
            SELECT district, commodity,
                   COUNT(*) FILTER (WHERE spike_severity = 'Critical') AS critical_count,
                   COUNT(*) AS total_spikes
            FROM spikes
            WHERE district = ANY($1)
            GROUP BY district, commodity
            ORDER BY district, critical_count DESC
        """, [district_a, district_b])

        # Average price per district
        avg_prices = await conn.fetch("""
            SELECT district, ROUND(AVG(price::numeric), 0) AS avg_price
            FROM prices
            WHERE district = ANY($1)
            GROUP BY district
        """, [district_a, district_b])

    # Build response
    market_map = {r["name_1"]: r["market_count"] for r in markets}
    price_map  = {r["district"]: float(r["avg_price"]) for r in avg_prices}

    def build_district(row):
        name = row["name_1"]
        top_commodities = [
            {
                "commodity": r["commodity"],
                "critical_count": r["critical_count"],
                "total_spikes": r["total_spikes"],
            }
            for r in commodities
            if r["district"] == name
        ][:5]  # top 5 only

        return {
            "name"          : name,
            "region"        : row["region"],
            "risk_score"    : int(row["risk_score"]),
            "critical_count": row["critical_count"],
            "severe_count"  : row["severe_count"],
            "moderate_count": row["moderate_count"],
            "spike_rate_pct": float(row["spike_rate_pct"]),
            "market_count"  : int(market_map.get(name, 0)),
            "avg_price"     : price_map.get(name, 0),
            "top_commodities": top_commodities,
        }

    result = {r["name_1"]: build_district(r) for r in districts}

    return {
        "district_a": result.get(district_a, {}),
        "district_b": result.get(district_b, {}),
    }