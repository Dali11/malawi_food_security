"""
routers/summary.py
National summary statistics endpoint.
Used by the dashboard header stats panel.
"""

from fastapi import APIRouter
from api.database import get_pool

router = APIRouter(prefix="/api/summary", tags=["Summary"])


@router.get("/")
async def get_summary():
    """
    Return national summary statistics.
    Powers the key indicators panel at the top of the dashboard.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:

        # Overall spike counts
        spike_counts = await conn.fetchrow("""
            SELECT
                COUNT(*)                                        AS total_spikes,
                SUM(CASE WHEN spike_severity='Critical'
                    THEN 1 ELSE 0 END)                         AS critical,
                SUM(CASE WHEN spike_severity='Severe'
                    THEN 1 ELSE 0 END)                         AS severe,
                SUM(CASE WHEN spike_severity='Moderate'
                    THEN 1 ELSE 0 END)                         AS moderate
            FROM spikes
        """)

        # Highest risk district
        top_district = await conn.fetchrow("""
            SELECT name_1, region, risk_score
            FROM districts_risk
            ORDER BY risk_score DESC
            LIMIT 1
        """)

        # Most spiked commodity
        top_commodity = await conn.fetchrow("""
            SELECT commodity, COUNT(*) AS spike_count
            FROM spikes
            WHERE spike_severity = 'Critical'
            GROUP BY commodity
            ORDER BY spike_count DESC
            LIMIT 1
        """)

        # Total markets monitored
        market_count = await conn.fetchval(
            "SELECT COUNT(*) FROM markets"
        )

        # Districts with critical gap
        critical_gaps = await conn.fetchval("""
            SELECT COUNT(*)
            FROM (
                SELECT d.name_1
                FROM districts_risk d
                LEFT JOIN markets m
                    ON ST_Within(m.wkb_geometry, d.wkb_geometry)
                GROUP BY d.name_1, d.risk_score
                HAVING
                    (d.risk_score > 400)
                    OR (d.risk_score > 200 AND COUNT(m.ogc_fid) < 8)
            ) gaps
        """)

    return {
        "analysis_period"   : "January 2020 – April 2026",
        "total_markets"     : market_count,
        "total_districts"   : 28,
        "spike_events": {
            "total"         : spike_counts["total_spikes"],
            "critical"      : spike_counts["critical"],
            "severe"        : spike_counts["severe"],
            "moderate"      : spike_counts["moderate"],
        },
        "highest_risk_district": {
            "name"          : top_district["name_1"],
            "region"        : top_district["region"],
            "risk_score"    : float(top_district["risk_score"]),
        },
        "most_spiked_commodity": {
            "name"          : top_commodity["commodity"],
            "critical_events": top_commodity["spike_count"],
        },
        "monitoring_gaps"   : {
            "critical_gap_districts": critical_gaps,
        }
    }
