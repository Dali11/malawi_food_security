"""
routers/narrative.py
Situation narrative generator for NGO reporting.
GET /api/narrative/{district_name}
GET /api/narrative/national  ← national summary
"""

from fastapi import APIRouter, HTTPException
from api.database import get_pool
from datetime import datetime

router = APIRouter(prefix="/api/narrative", tags=["Narrative"])


# ── Helpers ───────────────────────────────────────────────────

def _month_name(month: int) -> str:
    return [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ][month - 1]


def _season(month: int) -> str:
    """Malawi agricultural seasons."""
    if month in [11, 12, 1, 2]:
        return "planting season"
    if month in [3, 4, 5]:
        return "harvest season"
    if month in [6, 7, 8]:
        return "post-harvest period"
    return "lean season"  # Sep, Oct


def _risk_tier(score: int) -> str:
    if score >= 277: return "critical"
    if score >= 199: return "high"
    if score >= 126: return "moderate"
    if score >= 59:  return "low"
    return "stable"


def _monitoring_status(market_count: int, risk_score: int) -> str:
    if market_count == 0:
        return "no monitored markets"
    if risk_score > 400 or (risk_score > 200 and market_count < 8):
        return "critically insufficient monitoring coverage"
    if risk_score > 100 and market_count < 4:
        return "limited monitoring coverage"
    if risk_score > 50 and market_count < 2:
        return "minimal monitoring coverage"
    return "adequate monitoring coverage"


def _trend_sentence(trend: str, district: str) -> str:
    if trend == "worsening":
        return (
            f"Recent data indicates a deteriorating food security situation in {district}, "
            f"with price pressures intensifying compared to the previous period."
        )
    if trend == "improving":
        return (
            f"There are early indications of price stabilization in {district}, "
            f"though the situation remains fragile and requires continued monitoring."
        )
    return (
        f"Price levels in {district} have remained broadly stable in the most recent period, "
        f"though underlying vulnerability factors persist."
    )


def _recommendation(risk_tier: str, market_count: int,
                    critical_count: int, monitoring_status: str) -> str:
    if risk_tier == "critical":
        recs = [
            "Immediate emergency food security assessment is strongly recommended.",
            "Priority actions include: (1) urgent market price monitoring intensification, "
            "(2) emergency food assistance needs assessment, and "
            "(3) coordination with district authorities on supply chain interventions.",
        ]
        if "insufficient" in monitoring_status or "no monitored" in monitoring_status:
            recs.append(
                "Expansion of market monitoring points is a critical operational gap "
                "that must be addressed to ensure timely detection of future price shocks."
            )
        return " ".join(recs)

    if risk_tier == "high":
        return (
            "Preventive action is recommended before the situation deteriorates further. "
            "Priority actions include increased market monitoring frequency and "
            "pre-positioning of emergency food stocks in vulnerable areas."
        )

    if risk_tier == "moderate":
        return (
            "Continued close monitoring is advised. "
            "Consider early warning communications to local authorities "
            "and preparedness planning for potential deterioration."
        )

    return (
        "Routine monitoring should continue. "
        "No immediate intervention is required, "
        "but seasonal vulnerability factors should be tracked."
    )


def _national_rank_sentence(district: str, rank: int,
                             total: int, risk_score: int) -> str:
    if rank == 1:
        return (
            f"{district} holds the highest food security risk ranking nationally, "
            f"with a composite risk score of {risk_score} — "
            f"the most severe concentration of price shocks recorded across all {total} districts."
        )
    if rank <= 3:
        return (
            f"{district} ranks {rank}{_ordinal(rank)} nationally in food security risk "
            f"with a composite score of {risk_score}, "
            f"placing it among the three most vulnerable districts in Malawi."
        )
    if rank <= 10:
        return (
            f"{district} ranks {rank}{_ordinal(rank)} out of {total} districts nationally "
            f"with a risk score of {risk_score}, "
            f"indicating elevated vulnerability relative to most of the country."
        )
    return (
        f"{district} ranks {rank}{_ordinal(rank)} out of {total} districts nationally "
        f"with a risk score of {risk_score}."
    )


def _ordinal(n: int) -> str:
    if 11 <= n <= 13: return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def _commodity_sentence(district: str, top_commodities: list) -> str:
    if not top_commodities:
        return ""

    top = top_commodities[0]
    name = top["commodity"]
    crit = top["critical_count"]
    total = top["total_spikes"]

    if crit == 0:
        return (
            f"No single commodity has recorded critical price spikes in {district}, "
            f"though {name} shows the highest overall spike frequency with {total} events."
        )

    sentence = (
        f"{name} is the most affected commodity in {district}, "
        f"recording {crit} critical price spike event{'s' if crit != 1 else ''} "
        f"out of {total} total spike observations."
    )

    # Is it a staple?
    staples = ["maize", "maize (new harvest)", "rice", "cassava", "sorghum", "millet"]
    if name.lower() in staples:
        sentence += (
            f" As a primary dietary staple, sustained price volatility in {name} "
            f"poses a direct threat to household food security and nutrition outcomes."
        )
    else:
        sentence += (
            f" While not a primary staple, price volatility in {name} "
            f"affects household purchasing power and dietary diversity."
        )

    # Second commodity if exists
    if len(top_commodities) > 1:
        second = top_commodities[1]
        if second["critical_count"] > 0:
            sentence += (
                f" {second['commodity']} also recorded {second['critical_count']} "
                f"critical event{'s' if second['critical_count'] != 1 else ''}, "
                f"indicating broad-based market stress beyond a single commodity."
            )

    return sentence


def _spike_rate_sentence(district: str, spike_rate: float,
                          national_avg: float) -> str:
    diff = spike_rate - national_avg
    if abs(diff) < 1:
        return (
            f"The overall spike rate of {spike_rate:.1f}% is broadly in line with "
            f"the national average of {national_avg:.1f}%."
        )
    if diff > 3:
        return (
            f"The spike rate of {spike_rate:.1f}% is significantly above "
            f"the national average of {national_avg:.1f}%, "
            f"indicating disproportionate market instability in this district."
        )
    if diff > 0:
        return (
            f"The spike rate of {spike_rate:.1f}% slightly exceeds "
            f"the national average of {national_avg:.1f}%."
        )
    return (
        f"The spike rate of {spike_rate:.1f}% is below "
        f"the national average of {national_avg:.1f}%, "
        f"though absolute spike counts remain concerning."
    )


# ── District narrative builder ────────────────────────────────

def build_narrative(d: dict, national_avg_spike_rate: float,
                    national_avg_risk: float, rank: int,
                    total_districts: int) -> dict:

    now        = datetime.now()
    month_name = _month_name(now.month)
    season     = _season(now.month)
    tier       = _risk_tier(d["risk_score"])
    mon_status = _monitoring_status(d["market_count"], d["risk_score"])

    # ── Opening paragraph ─────────────────────────────────────
    opening = (
        f"{_national_rank_sentence(d['name'], rank, total_districts, d['risk_score'])} "
        f"Located in {d['region']}, the district has recorded "
        f"{d['critical_count']} critical, {d['severe_count']} severe, and "
        f"{d['moderate_count']} moderate price spike events across the analysis period "
        f"(January 2020 – April 2026), yielding a weighted composite risk score of "
        f"{d['risk_score']} (Critical×3 + Severe×2 + Moderate×1)."
    )

    # ── Commodity paragraph ───────────────────────────────────
    commodity_para = _commodity_sentence(d["name"], d["top_commodities"])

    # ── Spike rate paragraph ──────────────────────────────────
    spike_rate_para = _spike_rate_sentence(
        d["name"], d["spike_rate_pct"], national_avg_spike_rate
    )

    # ── Monitoring paragraph ──────────────────────────────────
    monitoring_para = (
        f"{d['name']} currently has {d['market_count']} "
        f"monitored market{'s' if d['market_count'] != 1 else ''}, "
        f"representing {mon_status}."
    )
    if d["market_count"] == 0:
        monitoring_para += (
            " The complete absence of market monitoring in this district "
            "means price shocks may go entirely undetected, "
            "severely limiting the ability to trigger timely humanitarian response."
        )
    elif "insufficient" in mon_status:
        monitoring_para += (
            f" Given the district's {tier} risk profile, "
            f"the current number of monitored markets is likely insufficient "
            f"to capture the full geographic distribution of price shocks."
        )

    # ── Seasonal context ──────────────────────────────────────
    seasonal_para = (
        f"This assessment is being prepared during {month_name} {now.year}, "
        f"which falls within Malawi's {season}. "
    )
    if season == "lean season":
        seasonal_para += (
            "The lean season (September–October) typically coincides with "
            "the lowest household food stocks and highest market prices, "
            "making current price levels particularly impactful on vulnerable households."
        )
    elif season == "planting season":
        seasonal_para += (
            "During the planting season, food prices typically remain elevated "
            "as household stocks from the previous harvest are depleted. "
            "Early warning monitoring is especially important at this time."
        )
    elif season == "harvest season":
        seasonal_para += (
            "The harvest season typically brings price relief as new crop supplies "
            "enter the market. Any sustained price spikes during this period "
            "are particularly concerning as they may indicate structural supply problems."
        )
    else:
        seasonal_para += (
            "Post-harvest price levels provide an important baseline for "
            "assessing market stability heading into the next lean season."
        )

    # ── Recommendation paragraph ──────────────────────────────
    recommendation = _recommendation(tier, d["market_count"],
                                     d["critical_count"], mon_status)

    # ── Assemble full narrative ───────────────────────────────
    paragraphs = [
        opening,
        commodity_para,
        spike_rate_para + " " + monitoring_para,
        seasonal_para,
        recommendation,
    ]
    full_narrative = "\n\n".join([p for p in paragraphs if p.strip()])

    return {
        "district"        : d["name"],
        "region"          : d["region"],
        "risk_score"      : d["risk_score"],
        "risk_tier"       : tier,
        "national_rank"   : rank,
        "generated_at"    : now.strftime("%d %B %Y %H:%M"),
        "narrative"       : full_narrative,
        "paragraphs": {
            "opening"       : opening,
            "commodities"   : commodity_para,
            "spike_rate"    : spike_rate_para,
            "monitoring"    : monitoring_para,
            "seasonal"      : seasonal_para,
            "recommendation": recommendation,
        }
    }


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/national")
async def national_narrative():
    """Generate a national-level situation summary."""
    pool = await get_pool()
    async with pool.acquire() as conn:

        summary = await conn.fetchrow("""
            SELECT
                COUNT(DISTINCT name_1)                          AS total_districts,
                SUM(critical_count)                             AS total_critical,
                SUM(severe_count)                               AS total_severe,
                SUM(moderate_count)                             AS total_moderate,
                ROUND(AVG(spike_rate_pct)::numeric, 2)          AS avg_spike_rate,
                MAX(risk_score)                                 AS max_risk_score
            FROM districts_risk
        """)

        top_districts = await conn.fetch("""
            SELECT name_1, region, risk_score, critical_count
            FROM districts_risk
            ORDER BY risk_score DESC
            LIMIT 5
        """)

        top_commodity = await conn.fetchrow("""
            SELECT commodity, COUNT(*) AS critical_events
            FROM spikes WHERE spike_severity = 'Critical'
            GROUP BY commodity ORDER BY critical_events DESC LIMIT 1
        """)

        latest_date = await conn.fetchrow("""
            SELECT MAX(date)::text AS latest_date FROM prices
        """)

        pipeline_log = await conn.fetchrow("""
            SELECT run_at::text, new_records, new_critical, status
            FROM pipeline_log
            ORDER BY run_at DESC LIMIT 1
        """)

    now        = datetime.now()
    month_name = _month_name(now.month)
    season     = _season(now.month)

    critical_districts = [r["name_1"] for r in top_districts
                          if _risk_tier(r["risk_score"]) == "critical"]
    high_districts     = [r["name_1"] for r in top_districts
                          if _risk_tier(r["risk_score"]) == "high"]

    top_names = [r["name_1"] for r in top_districts[:3]]

    narrative = f"""MALAWI FOOD SECURITY — NATIONAL SITUATION REPORT
Generated: {now.strftime("%d %B %Y")} | Data through: {latest_date['latest_date'] or 'April 2026'}

OVERVIEW
Across Malawi's {summary['total_districts']} monitored districts, the food security situation \
{"requires urgent attention in several areas" if summary['total_critical'] > 200 else "is mixed, with pockets of significant concern"}. \
A total of {summary['total_critical']:,} critical, {summary['total_severe']:,} severe, and \
{summary['total_moderate']:,} moderate price spike events have been recorded since January 2020, \
reflecting sustained market instability across the analysis period.

HIGHEST RISK AREAS
{", ".join(top_names[:2])} and {top_names[2] if len(top_names) > 2 else "other southern districts"} \
represent the highest-risk districts nationally. \
{"Districts classified at critical risk level include: " + ", ".join(critical_districts) + "." if critical_districts else ""} \
{"Districts classified at high risk include: " + ", ".join(high_districts) + "." if high_districts else ""} \
These districts are concentrated in the Southern Region, suggesting regional structural factors \
— including limited market integration, infrastructure deficits, and climate vulnerability — \
are driving systematic price instability.

COMMODITY ALERT
{top_commodity['commodity'] if top_commodity else 'Maize'} is the most affected commodity nationally, \
recording {top_commodity['critical_events'] if top_commodity else 'N/A'} critical price spike events. \
As the primary dietary staple for the majority of Malawians, sustained volatility in \
{top_commodity['commodity'] if top_commodity else 'maize'} prices has direct implications \
for household food security, nutrition outcomes, and poverty levels.

SEASONAL CONTEXT
This report is prepared during {month_name} {now.year}, within Malawi's {season}. \
{"Lean season conditions typically amplify the impact of price spikes on the most vulnerable households." if season == "lean season" else "Seasonal price dynamics should be considered when interpreting current price levels."}

DATA PIPELINE STATUS
{"Last updated: " + pipeline_log['run_at'] + " | New records: " + str(pipeline_log['new_records']) + " | New critical events: " + str(pipeline_log['new_critical']) if pipeline_log else "Pipeline status unavailable."}

RECOMMENDED ACTIONS
1. Prioritize emergency food security assessments in {", ".join(critical_districts) if critical_districts else "highest-risk districts"}.
2. Strengthen market monitoring coverage in districts with critical risk scores and limited market presence.
3. Coordinate with WFP, DODMA, and district councils on pre-positioning of emergency food stocks ahead of the next lean season.
4. Commission detailed value chain analysis for {top_commodity['commodity'] if top_commodity else 'maize'} to identify structural drivers of price volatility."""

    return {
        "type"         : "national",
        "generated_at" : now.strftime("%d %B %Y %H:%M"),
        "data_through" : latest_date["latest_date"],
        "narrative"    : narrative,
        "stats": {
            "total_districts" : summary["total_districts"],
            "total_critical"  : summary["total_critical"],
            "total_severe"    : summary["total_severe"],
            "total_moderate"  : summary["total_moderate"],
            "avg_spike_rate"  : float(summary["avg_spike_rate"]),
        }
    }


@router.get("/{district_name}")
async def district_narrative(district_name: str):
    """Generate a situation narrative for a specific district."""
    pool = await get_pool()
    async with pool.acquire() as conn:

        # District data
        district_row = await conn.fetchrow("""
            SELECT name_1, region, risk_score, critical_count,
                   severe_count, moderate_count, spike_rate_pct
            FROM districts_risk
            WHERE LOWER(name_1) = LOWER($1)
        """, district_name)

        if not district_row:
            raise HTTPException(status_code=404,
                                detail=f"District '{district_name}' not found")

        # Market count
        market_row = await conn.fetchrow("""
            SELECT COUNT(m.ogc_fid) AS market_count
            FROM districts_risk d
            LEFT JOIN markets m ON ST_Within(m.wkb_geometry, d.wkb_geometry)
            WHERE LOWER(d.name_1) = LOWER($1)
            GROUP BY d.name_1
        """, district_name)

        # Top commodities
        commodities = await conn.fetch("""
            SELECT commodity,
                   COUNT(*) FILTER (WHERE spike_severity = 'Critical') AS critical_count,
                   COUNT(*) AS total_spikes
            FROM spikes
            WHERE LOWER(district) = LOWER($1)
            GROUP BY commodity
            ORDER BY critical_count DESC, total_spikes DESC
            LIMIT 5
        """, district_name)

        # National averages for context
        national = await conn.fetchrow("""
            SELECT
                ROUND(AVG(spike_rate_pct)::numeric, 2) AS avg_spike_rate,
                ROUND(AVG(risk_score)::numeric, 0)     AS avg_risk_score,
                COUNT(*)                               AS total_districts
            FROM districts_risk
        """)

        # National rank
        rank_row = await conn.fetchrow("""
            SELECT rank FROM (
                SELECT name_1,
                       RANK() OVER (ORDER BY risk_score DESC) AS rank
                FROM districts_risk
            ) ranked
            WHERE LOWER(name_1) = LOWER($1)
        """, district_name)

    d = {
        "name"           : district_row["name_1"],
        "region"         : district_row["region"],
        "risk_score"     : district_row["risk_score"],
        "critical_count" : district_row["critical_count"],
        "severe_count"   : district_row["severe_count"],
        "moderate_count" : district_row["moderate_count"],
        "spike_rate_pct" : float(district_row["spike_rate_pct"] or 0),
        "market_count"   : int(market_row["market_count"]) if market_row else 0,
        "top_commodities": [dict(r) for r in commodities],
    }

    return build_narrative(
        d,
        national_avg_spike_rate = float(national["avg_spike_rate"] or 0),
        national_avg_risk       = float(national["avg_risk_score"] or 0),
        rank                    = int(rank_row["rank"]) if rank_row else 0,
        total_districts         = int(national["total_districts"]),
    )