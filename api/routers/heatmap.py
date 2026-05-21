"""
routers/heatmap.py
Cross-district commodity price heatmap endpoint.
Returns latest price + spike severity per district × commodity pair.
"""
from fastapi import APIRouter
from api.database import get_pool

router = APIRouter(prefix="/api/heatmap", tags=["Heatmap"])

COMMODITIES = [
    "Maize",
    "Beans",
    "Rice",
    "Groundnuts (shelled)",
    "Cowpeas",
    "Oil (vegetable)",
]

@router.get("/")
async def get_heatmap():
    """
    Returns all 28 districts × top commodities with latest price,
    % change, spike severity, and district risk score.
    Powers the cross-district commodity heatmap view.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:

        # Latest price + severity per district × commodity
        rows = await conn.fetch("""
            WITH latest_price AS (
                SELECT DISTINCT ON (district, commodity)
                    district,
                    commodity,
                    unit,
                    price,
                    pct_change,
                    spike_severity,
                    date
                FROM prices
                WHERE commodity = ANY($1::text[])
                  AND unit IN ('KG', 'L')
                  AND price IS NOT NULL
                ORDER BY district, commodity, date DESC
            ),
            worst_severity AS (
                SELECT
                    district,
                    commodity,
                    MAX(CASE spike_severity
                        WHEN 'Critical' THEN 4
                        WHEN 'Severe'   THEN 3
                        WHEN 'Moderate' THEN 2
                        WHEN 'Normal'   THEN 1
                        ELSE 0 END)                         AS severity_rank,
                    MAX(pct_change::numeric)                AS max_pct_change
                FROM prices
                WHERE commodity = ANY($1::text[])
                  AND unit IN ('KG', 'L')
                  AND date::date >= (NOW() - INTERVAL '6 months')::date
                GROUP BY district, commodity
            ),
            severity_label AS (
                SELECT
                    district,
                    commodity,
                    max_pct_change,
                    CASE severity_rank
                        WHEN 4 THEN 'Critical'
                        WHEN 3 THEN 'Severe'
                        WHEN 2 THEN 'Moderate'
                        WHEN 1 THEN 'Normal'
                        ELSE 'Normal' END                   AS worst_severity
                FROM worst_severity
            )
            SELECT
                lp.district,
                lp.commodity,
                lp.unit,
                ROUND(lp.price::numeric, 0)                AS price,
                ROUND(sl.max_pct_change::numeric, 1)       AS pct_change,
                COALESCE(sl.worst_severity, lp.spike_severity, 'Normal') AS spike_severity,
                lp.date,
                dr.region,
                dr.risk_score,
                dr.critical_count,
                dr.severe_count,
                dr.moderate_count
            FROM latest_price lp
            LEFT JOIN severity_label sl
                ON LOWER(sl.district) = LOWER(lp.district)
               AND sl.commodity = lp.commodity
            LEFT JOIN districts_risk dr
                ON LOWER(dr.name_1) = LOWER(lp.district)
            ORDER BY dr.risk_score DESC NULLS LAST, lp.district, lp.commodity
        """, COMMODITIES)

        # District metadata (risk score, region) for all 28
        districts = await conn.fetch("""
            SELECT
                name_1      AS district,
                region,
                risk_score,
                critical_count,
                severe_count,
                moderate_count,
                total_records
            FROM districts_risk
            ORDER BY risk_score DESC NULLS LAST
        """)

    # Build district index
    district_map: dict = {}
    for d in districts:
        district_map[d["district"]] = {
            "district"      : d["district"],
            "region"        : d["region"],
            "risk_score"    : float(d["risk_score"] or 0),
            "critical_count": int(d["critical_count"] or 0),
            "severe_count"  : int(d["severe_count"]   or 0),
            "moderate_count": int(d["moderate_count"] or 0),
            "commodities"   : {},
        }

    # Fill in commodity cells
    for r in rows:
        dist = r["district"]
        # Match even if district name casing differs
        matched = next(
            (k for k in district_map if k.lower() == dist.lower()), None
        )
        if not matched:
            continue
        district_map[matched]["commodities"][r["commodity"]] = {
            "price"         : float(r["price"] or 0),
            "pct_change"    : float(r["pct_change"] or 0) if r["pct_change"] else None,
            "spike_severity": r["spike_severity"] or "Normal",
            "date"          : str(r["date"]),
            "unit"          : r["unit"] or "KG",
        }

    # Summary stats
    all_cells       = [c for d in district_map.values() for c in d["commodities"].values()]
    critical_cells  = [c for c in all_cells if c["spike_severity"] == "Critical"]
    severe_cells    = [c for c in all_cells if c["spike_severity"] == "Severe"]

    # Worst commodity — most critical hits
    from collections import Counter
    critical_by_commodity = Counter(
        r["commodity"] for r in rows if r["spike_severity"] == "Critical"
    )
    worst_commodity = critical_by_commodity.most_common(1)

    # Most affected district — most spiking commodities
    spike_counts_by_district = {
        name: sum(
            1 for c in d["commodities"].values()
            if c["spike_severity"] in ("Critical", "Severe")
        )
        for name, d in district_map.items()
    }
    most_affected = max(spike_counts_by_district, key=spike_counts_by_district.get, default=None)

    return {
        "commodities": COMMODITIES,
        "districts"  : list(district_map.values()),
        "summary": {
            "total_districts"  : len(district_map),
            "critical_cells"   : len(critical_cells),
            "severe_cells"     : len(severe_cells),
            "worst_commodity"  : worst_commodity[0][0] if worst_commodity else None,
            "worst_commodity_critical_districts": worst_commodity[0][1] if worst_commodity else 0,
            "most_affected_district"  : most_affected,
            "most_affected_spike_count": spike_counts_by_district.get(most_affected, 0),
        }
    }