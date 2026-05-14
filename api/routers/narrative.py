"""
routers/narrative.py
AI-powered situation narrative endpoint using Gemini 2.5 Flash.
Falls back to a smart template if Gemini is unavailable.

GET /api/narrative/{district_name}
GET /api/narrative/national
"""

import os
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from dotenv import load_dotenv

from api.database import get_pool

load_dotenv()

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/narrative", tags=["Narrative"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _season(month: int) -> str:
    if month in (11, 12, 1, 2, 3):
        return "rainy / planting season"
    elif month in (4, 5):
        return "early harvest season"
    elif month in (6, 7, 8):
        return "main harvest season"
    else:
        return "lean / pre-harvest season (Sep–Oct)"


def _risk_label(score: int) -> str:
    if score >= 400:  return "Critical"
    if score >= 250:  return "High"
    if score >= 100:  return "Moderate"
    return "Low"


def _risk_color(score: int) -> str:
    if score >= 400:  return "#B71C1C"
    if score >= 250:  return "#EF5350"
    if score >= 100:  return "#FFAB40"
    return "#A5D6A7"


# ── Gemini narrative ──────────────────────────────────────────────────────────

def gemini_narrative(d: dict, national_avg_spike_rate: float,
                     rank: int, total_districts: int) -> str | None:
    """
    Call Gemini 2.5 Flash to generate a professional situation narrative.
    Returns None if the API is unavailable or quota is exceeded — caller
    falls back to the template narrative.
    """
    try:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            log.warning("GEMINI_API_KEY not set — using template narrative")
            return None

        from google import genai  # lazy import so app starts without the lib

        client = genai.Client(api_key=key)

        top_commodities_text = ", ".join(
            f"{c['commodity']} ({c['critical_count']} critical events)"
            for c in d["top_commodities"][:3]
        ) or "No commodities recorded"

        prompt = f"""You are a senior food security analyst at WFP writing an official situation report for NGO partners and government stakeholders in Malawi.

Write a professional 5-paragraph situation report for **{d['name']} District** based on the data below.

--- DATA ---
Region:                  {d['region']}
National risk rank:      {rank} of {total_districts} districts
Composite risk score:    {d['risk_score']} ({_risk_label(d['risk_score'])} risk)
Critical price spikes:   {d['critical_count']}
Severe price spikes:     {d['severe_count']}
Moderate price spikes:   {d['moderate_count']}
Spike rate:              {d['spike_rate_pct']:.1f}% (national average: {national_avg_spike_rate:.1f}%)
Monitored markets:       {d['market_count']}
Average price (MWK):     {d['avg_price']:,.0f}
Most affected commodities: {top_commodities_text}
Analysis period:         January 2020 – April 2026
Current season:          {_season(datetime.now().month)} ({datetime.now().strftime('%B %Y')})
--- END DATA ---

Structure your report with exactly these 5 paragraphs in this order:

1. **OVERVIEW** — National ranking and overall risk profile. Is the district above or below the national average spike rate? What does the composite risk score mean in practical terms?

2. **COMMODITY ANALYSIS** — Which commodities are most severely affected? Why does this matter for household food security and nutrition in this district? Reference the most affected commodities by name.

3. **MARKET MONITORING** — How many markets are monitored? Is coverage adequate for a district of this risk level? What are the implications of monitoring gaps for early warning?

4. **SEASONAL CONTEXT** — How does the current season ({_season(datetime.now().month)}) affect food security dynamics in this district? What seasonal risks should field teams anticipate?

5. **RECOMMENDED ACTIONS** — Three to four specific, actionable recommendations for NGO field teams, DODMA, and district councils. Reference Malawi Vision 2063 (MW2063) Agricultural Productivity and Food Security pillar where appropriate.

Writing style requirements:
- Professional humanitarian report tone — no casual language
- Write in flowing paragraphs, NOT bullet points
- Be specific with numbers from the data provided
- Each paragraph should be 3–4 sentences
- Total length: 320–420 words
- Do not add headers or labels to paragraphs — write them as continuous prose
- Do not start with "I" or "This report"
"""

        response = client.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=prompt,
        )

        text = response.text.strip() if response.text else None
        if text:
            log.info(f"Gemini narrative generated for {d['name']} ({len(text)} chars)")
        return text

    except Exception as e:
        log.warning(f"Gemini API failed for {d.get('name', '?')}: {e} — falling back to template")
        return None


# ── Template narrative (fallback) ─────────────────────────────────────────────

def build_narrative(d: dict, national_avg_spike_rate: float,
                    national_avg_risk: float, rank: int,
                    total_districts: int) -> dict:
    """
    Smart template narrative — used when Gemini is unavailable.
    Returns a dict with 'narrative' (full text) and 'paragraphs' (keyed sections).
    """
    name            = d["name"]
    region          = d["region"]
    risk_score      = d["risk_score"]
    critical_count  = d["critical_count"]
    severe_count    = d["severe_count"]
    moderate_count  = d["moderate_count"]
    spike_rate      = d["spike_rate_pct"]
    market_count    = d["market_count"]
    avg_price       = d["avg_price"]
    top_commodities = d["top_commodities"]
    risk_label      = _risk_label(risk_score)
    season          = _season(datetime.now().month)
    month_name      = datetime.now().strftime("%B %Y")

    # Compare to national average
    if spike_rate > national_avg_spike_rate * 1.3:
        rate_context = (
            f"a spike rate of {spike_rate:.1f}%, significantly above the national average "
            f"of {national_avg_spike_rate:.1f}%, indicating elevated and sustained market stress"
        )
    elif spike_rate > national_avg_spike_rate:
        rate_context = (
            f"a spike rate of {spike_rate:.1f}%, above the national average of "
            f"{national_avg_spike_rate:.1f}%"
        )
    else:
        rate_context = (
            f"a spike rate of {spike_rate:.1f}%, below the national average of "
            f"{national_avg_spike_rate:.1f}%, though the district still requires monitoring"
        )

    # Top commodity sentence
    if top_commodities:
        top = top_commodities[0]
        commodity_lead = (
            f"{top['commodity']} is the most critically affected commodity, "
            f"recording {top['critical_count']} critical price spike events out of "
            f"{top['total_spikes']} total spikes."
        )
        if len(top_commodities) > 1:
            others = ", ".join(c["commodity"] for c in top_commodities[1:3])
            commodity_lead += f" {others} also show significant volatility."
    else:
        commodity_lead = "Commodity-level data is currently being compiled for this district."

    # Market coverage
    if market_count == 0:
        market_sentence = (
            "No markets are currently monitored in this district, representing a critical "
            "data gap that severely limits early warning capacity."
        )
    elif market_count <= 3:
        market_sentence = (
            f"Only {market_count} market{'s are' if market_count > 1 else ' is'} monitored "
            f"in {name}, which is insufficient for a district with a {risk_label.lower()} risk profile. "
            "Expanding market coverage should be treated as a priority intervention."
        )
    else:
        market_sentence = (
            f"{market_count} markets are currently monitored across {name}, "
            f"providing a reasonable baseline for price surveillance, though continued "
            "coverage expansion remains important."
        )

    # Paragraphs
    paragraphs = {
        "opening": (
            f"{name} District, located in {region}, holds national risk rank {rank} of "
            f"{total_districts} monitored districts with a composite risk score of {risk_score} "
            f"({risk_label} risk). The district recorded {critical_count} critical, "
            f"{severe_count} severe, and {moderate_count} moderate price spike events across "
            f"the January 2020 – April 2026 analysis period, reflecting {rate_context}. "
            f"This classification places {name} among the districts requiring priority attention "
            f"from national food security agencies and NGO partners."
        ),
        "commodity": (
            f"{commodity_lead} As the primary dietary staple for the majority of households, "
            f"volatility in staple grain prices has direct implications for household food security, "
            f"nutrition outcomes, and poverty levels — particularly for vulnerable groups including "
            f"female-headed households and subsistence farmers. Average market prices in {name} "
            f"stand at {avg_price:,.0f} MWK, providing a baseline for tracking price evolution "
            f"against seasonal norms and MW2063 food security targets."
        ),
        "monitoring": market_sentence + (
            f" Sustained investment in market monitoring infrastructure directly supports "
            f"the Malawi Vision 2063 pillar on Agricultural Productivity and Food Security, "
            f"enabling evidence-based intervention targeting and reducing response lag times "
            f"during emerging price crises."
        ),
        "seasonal": (
            f"This report is prepared in {month_name} during Malawi's {season}. "
            f"Seasonal price dynamics are a critical contextual factor — prices for staple grains "
            f"typically follow predictable patterns tied to planting, harvest, and lean season cycles. "
            f"Field teams in {name} should assess whether current price levels represent seasonal "
            f"norms or structural anomalies that warrant emergency response."
        ),
        "recommendations": (
            f"The following actions are recommended: (1) Prioritize emergency food security "
            f"assessments in {name}, focusing on markets with the highest critical spike "
            f"concentrations. (2) Strengthen coordination between WFP, DODMA, and the "
            f"{name} District Council on pre-positioning of emergency food stocks ahead "
            f"of the next lean season. (3) Commission a rapid value chain analysis for "
            f"{'Maize' if top_commodities and 'maize' in top_commodities[0]['commodity'].lower() else top_commodities[0]['commodity'] if top_commodities else 'staple grains'} "
            f"to identify structural drivers of sustained price volatility. "
            f"(4) Expand market monitoring coverage to close surveillance gaps and strengthen "
            f"the early warning system in alignment with MW2063 food security objectives."
        ),
    }

    full_narrative = "\n\n".join(paragraphs.values())

    return {
        "type"          : "district",
        "district"      : name,
        "region"        : region,
        "risk_label"    : risk_label,
        "risk_color"    : _risk_color(risk_score),
        "generated_at"  : datetime.now().strftime("%d %b %Y %H:%M"),
        "data_through"  : "2026-04-15",
        "narrative"     : full_narrative,
        "paragraphs"    : paragraphs,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/national")
async def national_narrative():
    """Generate a national-level food security situation summary."""
    pool = await get_pool()
    async with pool.acquire() as conn:

        national = await conn.fetchrow("""
            SELECT
                COUNT(*)                                         AS total_districts,
                SUM(critical_count)                              AS total_critical,
                SUM(severe_count)                                AS total_severe,
                SUM(moderate_count)                              AS total_moderate,
                ROUND(AVG(spike_rate_pct)::numeric, 2)           AS avg_spike_rate
            FROM districts_risk
        """)

        top_districts = await conn.fetch("""
            SELECT name_1, region, risk_score
            FROM districts_risk
            ORDER BY risk_score DESC
            LIMIT 5
        """)

        top_commodity = await conn.fetchrow("""
            SELECT commodity,
                   COUNT(*) FILTER (WHERE spike_severity = 'Critical') AS critical_count
            FROM spikes
            GROUP BY commodity
            ORDER BY critical_count DESC
            LIMIT 1
        """)

        pipeline_log = await conn.fetchrow("""
            SELECT ran_at, new_records, new_critical
            FROM pipeline_log
            ORDER BY ran_at DESC
            LIMIT 1
        """)

    top3 = [r["name_1"] for r in top_districts[:3]]
    critical_districts = [r["name_1"] for r in top_districts if r["risk_score"] >= 400]
    high_districts     = [r["name_1"] for r in top_districts if 250 <= r["risk_score"] < 400]

    # Check if Gemini can write the national summary too
    national_gemini = None
    try:
        key = os.getenv("GEMINI_API_KEY")
        if key:
            from google import genai
            client = genai.Client(api_key=key)
            prompt = f"""You are a WFP food security analyst writing a national situation report for Malawi.

Write a concise 3-paragraph national food security situation overview based on this data:

- Total monitored districts: {national['total_districts']}
- Total critical price spikes: {national['total_critical']}
- Total severe price spikes: {national['total_severe']}  
- Total moderate price spikes: {national['total_moderate']}
- National average spike rate: {national['avg_spike_rate']:.1f}%
- Highest risk districts: {', '.join(top3)}
- Districts at critical risk: {', '.join(critical_districts) if critical_districts else 'None'}
- Districts at high risk: {', '.join(high_districts) if high_districts else 'None'}
- Most affected commodity nationally: {top_commodity['commodity'] if top_commodity else 'Maize'} ({top_commodity['critical_count'] if top_commodity else 0} critical events)
- Analysis period: January 2020 – April 2026
- Current season: {_season(datetime.now().month)} ({datetime.now().strftime('%B %Y')})

Paragraph 1: National overview — scale of food price instability across Malawi.
Paragraph 2: Highest risk areas — regional concentration and structural drivers.
Paragraph 3: Priority recommendations — actions for WFP, DODMA, and NGO partners referencing MW2063.

Write in professional humanitarian report style. No bullet points. 250–320 words total."""

            resp = client.models.generate_content(
                model="models/gemini-2.5-flash",
                contents=prompt,
            )
            national_gemini = resp.text.strip() if resp.text else None
    except Exception as e:
        log.warning(f"Gemini national narrative failed: {e}")

    # Template fallback for national
    if not national_gemini:
        southern_districts = [r["name_1"] for r in top_districts if r["region"] and "Southern" in r["region"]]
        regional_note = (
            f"Districts classified at critical risk level include: {', '.join(critical_districts)}. "
            if critical_districts else ""
        )
        high_note = (
            f"Districts classified at high risk include: {', '.join(high_districts)}. "
            if high_districts else ""
        )
        regional_concentration = (
            f"These districts are concentrated in the Southern Region, suggesting regional "
            "structural factors — including limited market integration, infrastructure deficits, "
            "and climate vulnerability — are driving systematic price instability."
            if len(southern_districts) >= 2 else ""
        )

        national_gemini = (
            f"MALAWI FOOD SECURITY — NATIONAL SITUATION REPORT\n"
            f"Generated: {datetime.now().strftime('%d %b %Y')} | "
            f"Data through: 2026-04-15\n\n"
            f"OVERVIEW\n"
            f"Across Malawi's {national['total_districts']} monitored districts, the food security "
            f"situation requires urgent attention in several areas. A total of {national['total_critical']} "
            f"critical, {national['total_severe']} severe, and {national['total_moderate']} moderate "
            f"price spike events have been recorded since January 2020, reflecting sustained market "
            f"instability across the analysis period.\n\n"
            f"HIGHEST RISK AREAS\n"
            f"{', '.join(top3)} represent the highest-risk districts nationally. "
            f"{regional_note}{high_note}{regional_concentration}\n\n"
            f"COMMODITY ALERT\n"
            f"{top_commodity['commodity'] if top_commodity else 'Maize'} is the most affected "
            f"commodity nationally, recording "
            f"{top_commodity['critical_count'] if top_commodity else 0} critical price spike events. "
            f"As the primary dietary staple for the majority of Malawians, sustained volatility in "
            f"{'Maize' if not top_commodity else top_commodity['commodity']} prices has direct "
            f"implications for household food security, nutrition outcomes, and poverty levels.\n\n"
            f"SEASONAL CONTEXT\n"
            f"This report is prepared during {datetime.now().strftime('%B %Y')}, within Malawi's "
            f"{_season(datetime.now().month)}. Seasonal price dynamics should be considered when "
            f"interpreting current price levels.\n\n"
            f"DATA PIPELINE STATUS\n"
            f"Last updated: {pipeline_log['ran_at']} | "
            f"New records: {pipeline_log['new_records']} | "
            f"New critical events: {pipeline_log['new_critical']}"
            if pipeline_log else "Pipeline status unavailable."
        )

    return {
        "type"        : "national",
        "generated_at": datetime.now().strftime("%d %b %Y %H:%M"),
        "data_through": "2026-04-15",
        "source"      : "gemini" if national_gemini and "NATIONAL SITUATION REPORT" not in national_gemini else "template",
        "narrative"   : national_gemini,
        "stats": {
            "total_districts": int(national["total_districts"]),
            "total_critical" : int(national["total_critical"]  or 0),
            "total_severe"   : int(national["total_severe"]    or 0),
            "total_moderate" : int(national["total_moderate"]  or 0),
            "avg_spike_rate" : float(national["avg_spike_rate"] or 0),
        },
    }


@router.get("/{district_name}")
async def district_narrative(district_name: str):
    """Generate an AI-powered situation narrative for a specific district."""
    pool = await get_pool()
    async with pool.acquire() as conn:

        district_row = await conn.fetchrow("""
            SELECT name_1, region, risk_score, critical_count,
                   severe_count, moderate_count, spike_rate_pct
            FROM districts_risk
            WHERE LOWER(name_1) = LOWER($1)
        """, district_name)

        if not district_row:
            raise HTTPException(
                status_code=404,
                detail=f"District '{district_name}' not found. Check spelling."
            )

        market_row = await conn.fetchrow("""
            SELECT COUNT(*) AS market_count
            FROM markets
            WHERE LOWER(district) = LOWER($1)
        """, district_name)

        avg_price_row = await conn.fetchrow("""
            SELECT ROUND(AVG(price::numeric), 0) AS avg_price
            FROM prices
            WHERE LOWER(district) = LOWER($1)
        """, district_name)

        commodities = await conn.fetch("""
            SELECT commodity,
                   COUNT(*) FILTER (WHERE spike_severity = 'Critical') AS critical_count,
                   COUNT(*)                                              AS total_spikes
            FROM spikes
            WHERE LOWER(district) = LOWER($1)
            GROUP BY commodity
            ORDER BY critical_count DESC, total_spikes DESC
            LIMIT 5
        """, district_name)

        national = await conn.fetchrow("""
            SELECT
                ROUND(AVG(spike_rate_pct)::numeric, 2) AS avg_spike_rate,
                ROUND(AVG(risk_score)::numeric, 0)     AS avg_risk_score,
                COUNT(*)                               AS total_districts
            FROM districts_risk
        """)

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
        "region"         : district_row["region"] or "Unknown Region",
        "risk_score"     : int(district_row["risk_score"]      or 0),
        "critical_count" : int(district_row["critical_count"]  or 0),
        "severe_count"   : int(district_row["severe_count"]    or 0),
        "moderate_count" : int(district_row["moderate_count"]  or 0),
        "spike_rate_pct" : float(district_row["spike_rate_pct"] or 0),
        "market_count"   : int(market_row["market_count"])      if market_row   else 0,
        "avg_price"      : float(avg_price_row["avg_price"])    if avg_price_row and avg_price_row["avg_price"] else 0,
        "top_commodities": [dict(r) for r in commodities],
    }

    rank            = int(rank_row["rank"])           if rank_row else 0
    total_districts = int(national["total_districts"]) if national else 28
    nat_avg_rate    = float(national["avg_spike_rate"] or 0) if national else 0
    nat_avg_risk    = float(national["avg_risk_score"] or 0) if national else 0

    # Try Gemini first
    gemini_text = gemini_narrative(
        d,
        national_avg_spike_rate=nat_avg_rate,
        rank=rank,
        total_districts=total_districts,
    )

    # Build template result (always computed — used as fallback and for structured fields)
    result = build_narrative(
        d,
        national_avg_spike_rate=nat_avg_rate,
        national_avg_risk=nat_avg_risk,
        rank=rank,
        total_districts=total_districts,
    )

    if gemini_text:
        result["narrative"] = gemini_text
        result["source"]    = "gemini"
        result["model"]     = "gemini-2.5-flash"
    else:
        result["source"]    = "template"
        result["model"]     = "template-v2"

    result["rank"] = rank

    return result