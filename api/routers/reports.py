"""
routers/reports.py
PDF report generation endpoint.
"""

from fastapi import APIRouter
from fastapi.responses import Response
from api.database import get_pool
from api.reports.template import build_html
import weasyprint
from datetime import datetime

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.get("/generate")
async def generate_report():
    """
    Generate and return a PDF report of current food security data.
    Downloads as: malawi_food_security_report_YYYY-MM-DD.pdf
    """
    pool = await get_pool()

    async with pool.acquire() as conn:

        # Summary stats
        summary_row = await conn.fetchrow("""
            SELECT
                COUNT(DISTINCT market)                                  AS total_markets,
                COUNT(DISTINCT name_1)                                  AS total_districts
            FROM districts_risk
        """)

        spike_counts = await conn.fetchrow("""
            SELECT
                COUNT(*)                                                AS total,
                SUM(CASE WHEN spike_severity='Critical' THEN 1 ELSE 0 END) AS critical,
                SUM(CASE WHEN spike_severity='Severe'   THEN 1 ELSE 0 END) AS severe,
                SUM(CASE WHEN spike_severity='Moderate' THEN 1 ELSE 0 END) AS moderate
            FROM spikes
        """)

        top_district = await conn.fetchrow("""
            SELECT name_1, region, risk_score
            FROM districts_risk
            ORDER BY risk_score DESC LIMIT 1
        """)

        top_commodity = await conn.fetchrow("""
            SELECT commodity, COUNT(*) AS critical_events
            FROM spikes
            WHERE spike_severity = 'Critical'
            GROUP BY commodity
            ORDER BY critical_events DESC LIMIT 1
        """)

        monitoring_gaps = await conn.fetchrow("""
            SELECT COUNT(*) AS gap_count
            FROM (
                SELECT d.name_1
                FROM districts_risk d
                LEFT JOIN markets m ON ST_Within(m.wkb_geometry, d.wkb_geometry)
                GROUP BY d.name_1, d.risk_score
                HAVING (d.risk_score > 400)
                    OR (d.risk_score > 200 AND COUNT(m.ogc_fid) < 8)
            ) gaps
        """)

        # District rankings
        districts = await conn.fetch("""
            SELECT name_1, region, risk_score,
                   critical_count, severe_count, moderate_count,
                   spike_rate_pct
            FROM districts_risk
            ORDER BY risk_score DESC
        """)

        # Recent critical spikes
        critical_spikes = await conn.fetch("""
            SELECT date::text, district, market, commodity,
                   price, pct_change
            FROM spikes
            WHERE spike_severity = 'Critical'
            ORDER BY date DESC
            LIMIT 20
        """)

        # Commodity analysis
        commodities = await conn.fetch("""
            SELECT
                commodity,
                SUM(CASE WHEN spike_severity='Critical' THEN 1 ELSE 0 END) AS critical_count,
                COUNT(*) AS total_spikes,
                ROUND(COUNT(*)::numeric / (
                    SELECT COUNT(*) FROM spikes
                ) * 100, 2) AS spike_rate
            FROM spikes
            WHERE spike_severity != 'Normal'
            GROUP BY commodity
            ORDER BY critical_count DESC
            LIMIT 15
        """)

        # Monitoring gaps
        gaps = await conn.fetch("""
            SELECT
                d.name_1 AS district,
                d.region,
                d.risk_score,
                COUNT(m.ogc_fid) AS market_count,
                CASE
                    WHEN COUNT(m.ogc_fid) = 0        THEN 'NO MONITORING'
                    WHEN d.risk_score > 400           THEN 'CRITICAL GAP'
                    WHEN d.risk_score > 200
                     AND COUNT(m.ogc_fid) < 8        THEN 'CRITICAL GAP'
                    WHEN d.risk_score > 100
                     AND COUNT(m.ogc_fid) < 4        THEN 'HIGH GAP'
                    WHEN d.risk_score > 50
                     AND COUNT(m.ogc_fid) < 2        THEN 'MODERATE GAP'
                    ELSE 'ADEQUATE'
                END AS monitoring_status
            FROM districts_risk d
            LEFT JOIN markets m ON ST_Within(m.wkb_geometry, d.wkb_geometry)
            GROUP BY d.name_1, d.region, d.risk_score
            ORDER BY d.risk_score DESC
        """)

    # Build data dict
    data = {
        "summary": {
            "total_markets"   : summary_row["total_markets"],
            "total_districts" : summary_row["total_districts"],
            "spike_events": {
                "total"   : spike_counts["total"],
                "critical": spike_counts["critical"],
                "severe"  : spike_counts["severe"],
                "moderate": spike_counts["moderate"],
            },
            "highest_risk_district": {
                "name"      : top_district["name_1"],
                "region"    : top_district["region"],
                "risk_score": float(top_district["risk_score"]),
            },
            "most_spiked_commodity": {
                "name"           : top_commodity["commodity"],
                "critical_events": top_commodity["critical_events"],
            },
            "monitoring_gaps": {
                "critical_gap_districts": monitoring_gaps["gap_count"]
            }
        },
        "districts"      : [dict(r) for r in districts],
        "critical_spikes": [dict(r) for r in critical_spikes],
        "commodities"    : [dict(r) for r in commodities],
        "gaps"           : [dict(r) for r in gaps],
    }

    # Build HTML and convert to PDF
    html_content = build_html(data)
    pdf_bytes    = weasyprint.HTML(string=html_content).write_pdf()

    filename = f"malawi_food_security_report_{datetime.now().strftime('%Y-%m-%d')}.pdf"

    return Response(
        content    = pdf_bytes,
        media_type = "application/pdf",
        headers    = {
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
