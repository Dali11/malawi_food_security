/**
 * api.ts
 * All FastAPI fetch functions with retry logic.
 */

import type {
    DistrictCollection,
    DistrictDetail,
    MarketCollection,
    SpikeCollection,
    Summary,
    PriceTrend,
    ForecastData,
    IndicatorSummary,
    DistrictFSI,
    PSIPoint,
    CommodityStress,
    LeanRisk,
    SpikeDistribution,
    CommodityBaseline, PSITrendResponse,
} from "./types"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// ── Fetch with retry ───────────────────────────────────────────────────────
async function apiFetch<T>(endpoint: string, retries = 3): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                cache: "no-store",
            })
            if (!res.ok) throw new Error(`API ${res.status}: ${endpoint}`)
            return res.json() as Promise<T>
        } catch (err) {
            if (attempt === retries) throw err
            await new Promise(r => setTimeout(r, attempt * 500))
        }
    }
    throw new Error(`Failed after ${retries} attempts: ${endpoint}`)
}

// ── Endpoints ──────────────────────────────────────────────────────────────

export async function getDistricts(): Promise<DistrictCollection> {
    return apiFetch<DistrictCollection>("/api/districts/")
}

export async function getDistrict(name: string): Promise<DistrictDetail> {
    return apiFetch<DistrictDetail>(`/api/districts/${encodeURIComponent(name)}`)
}

export async function getMarkets(): Promise<MarketCollection> {
    return apiFetch<MarketCollection>("/api/markets/")
}

export async function getSpikes(params?: {
    severity? : string
    district? : string
    commodity?: string
    limit?    : number
}): Promise<SpikeCollection> {
    const query = new URLSearchParams()
    if (params?.severity)  query.set("severity",  params.severity)
    if (params?.district)  query.set("district",  params.district)
    if (params?.commodity) query.set("commodity", params.commodity)
    if (params?.limit)     query.set("limit",     String(params.limit))
    const qs = query.toString()
    return apiFetch<SpikeCollection>(`/api/spikes/${qs ? `?${qs}` : ""}`)
}

export async function getCriticalSpikes(): Promise<SpikeCollection> {
    return apiFetch<SpikeCollection>("/api/spikes/critical")
}

export async function getSummary(): Promise<Summary> {
    return apiFetch<Summary>("/api/summary/")
}

export async function getDistrictPrices(
    district : string,
    commodity: string = "Maize"
): Promise<PriceTrend> {
    return apiFetch<PriceTrend>(
        `/api/districts/${encodeURIComponent(district)}/prices?commodity=${encodeURIComponent(commodity)}`
    )
}

export async function getForecast(
    district : string,
    commodity: string = "Maize",
    months   : number = 3
): Promise<ForecastData> {
    return apiFetch<ForecastData>(
        `/api/forecast/${encodeURIComponent(district)}?commodity=${encodeURIComponent(commodity)}&months=${months}`
    )
}

// ── Color helpers ──────────────────────────────────────────────────────────

export function getRiskColor(score: number): string {
    if (score === 0)   return "#E8F5E9"
    if (score <= 59)   return "#A5D6A7"
    if (score <= 126)  return "#FFE082"
    if (score <= 199)  return "#FFAB40"
    if (score <= 277)  return "#EF5350"
    return                    "#B71C1C"
}

export function getSeverityColor(severity: string): string {
    switch (severity) {
        case "Critical": return "#B71C1C"
        case "Severe"  : return "#E65100"
        case "Moderate": return "#F9A825"
        default        : return "#43A047"
    }
}

export function getRiskLabel(score: number): string {
    if (score === 0)   return "No Data"
    if (score <= 59)   return "Stable"
    if (score <= 126)  return "Low"
    if (score <= 199)  return "Moderate"
    if (score <= 277)  return "High"
    return                    "Critical"
}


// ── Season baseline types ──────────────────────────────────────────────────
//
// CHANGED from old shape:
//   Old: { districts: [{ seasons: Record<string, { avg_price, observations }> }] }
//   New: { districts: [{ planting_baseline, harvest_baseline,
//                        post_harvest_baseline, lean_baseline }] }
//
// The old nested seasons object is gone. Each season is now a flat
// nullable number field on the district row. This matches the fixed
// backend that uses a tiered 2023–2025 window instead of all-years.

export interface SeasonBaselineDistrict {
    district              : string
    region                : string
    current_season        : string
    planting_baseline     : number | null   // avg MWK Nov–Feb 2023–2025
    harvest_baseline      : number | null   // avg MWK Mar–May 2023–2025
    post_harvest_baseline : number | null   // avg MWK Jun–Aug 2022–2025 (tiered fallback)
    lean_baseline         : number | null   // avg MWK Sep–Oct 2023–2025
    current_price         : number | null   // avg MWK last 90 days
    current_rows          : number          // how many recent observations
    pct_vs_baseline       : number | null   // (current - season_baseline) / baseline × 100
    stress_level          : "Critical" | "Elevated" | "Normal" | "No data"
}

export interface SeasonBaseline {
    district         : string               // district name (district endpoint only)
    current_season   : string               // e.g. "Post-harvest"
    season_months    : number[]             // e.g. [6, 7, 8]
    baseline_window  : string               // human-readable, shown in footer
    commodities      : SeasonBaselineDistrict[]  // one row per commodity
}

// National commodity baseline (from /api/season-baseline/commodities)
export interface CommodityBaselineRow {
    commodity             : string
    current_season        : string
    planting_baseline     : number | null
    harvest_baseline      : number | null
    post_harvest_baseline : number | null
    lean_baseline         : number | null
    current_price         : number | null
    pct_vs_baseline       : number | null
    stress_level          : "Critical" | "Elevated" | "Normal" | "No data"
}

export interface NationalSeasonBaseline {
    current_season   : string
    season_months    : number[]
    baseline_window  : string
    commodities      : CommodityBaselineRow[]
}

export interface CropCalendar {
    current_season : string
    current_month  : string
    seasons        : string[]
    commodities    : {
        commodity        : string
        current_price    : number | null
        current_season   : string
        pct_vs_baseline  : number | null
        status           : string
        seasons          : Record<string, number | null>
    }[]
}

// ── Season baseline fetch functions ───────────────────────────────────────

/**
 * District baseline — one row per commodity for a specific district.
 * Replaces the old getSeasonBaseline(commodity) which hit /api/season/baseline.
 * New endpoint: /api/season-baseline/district/:name?commodity=...
 */
export async function getDistrictSeasonBaseline(
    district : string,
    commodity?: string,
): Promise<SeasonBaseline> {
    const qs = commodity ? `?commodity=${encodeURIComponent(commodity)}` : ""
    return apiFetch<SeasonBaseline>(
        `/api/season-baseline/district/${encodeURIComponent(district)}${qs}`
    )
}

/**
 * National commodity baseline — one row per commodity across all districts.
 * New endpoint: /api/season-baseline/commodities?commodity=...
 */
export async function getNationalSeasonBaseline(
    commodity?: string,
): Promise<NationalSeasonBaseline> {
    const qs = commodity ? `?commodity=${encodeURIComponent(commodity)}` : ""
    return apiFetch<NationalSeasonBaseline>(`/api/season-baseline/commodities${qs}`)
}

/**
 * @deprecated Use getDistrictSeasonBaseline() or getNationalSeasonBaseline().
 * Kept temporarily so other imports don't break during migration.
 */
export async function getSeasonBaseline(commodity: string): Promise<SeasonBaseline> {
    console.warn(
        "[api] getSeasonBaseline() is deprecated. " +
        "Use getDistrictSeasonBaseline() or getNationalSeasonBaseline()."
    )
    return apiFetch<SeasonBaseline>(
        `/api/season-baseline/commodities?commodity=${encodeURIComponent(commodity)}`
    )
}

export async function getCropCalendar(): Promise<CropCalendar> {
    return apiFetch<CropCalendar>("/api/season/calendar")
}


// ── Indicator API functions ─────────────────────────────────────────────────

export async function getIndicatorSummary(): Promise<IndicatorSummary> {
    return apiFetch<IndicatorSummary>("/api/indicators/summary")
}

export async function getDistrictFSI(region?: string): Promise<DistrictFSI[]> {
    const qs = region ? `?region=${encodeURIComponent(region)}` : ""
    return apiFetch<DistrictFSI[]>(`/api/indicators/districts${qs}`)
}

export async function getPSITrend(
    commodity?: string,
    district? : string
): Promise<PSITrendResponse> {
    const q = new URLSearchParams()
    if (commodity && commodity !== "All commodities") q.set("commodity", commodity)
    if (district  && district  !== "All districts")  q.set("district",  district)
    const qs = q.toString()
    return apiFetch<PSITrendResponse>(`/api/indicators/psi-trend${qs ? `?${qs}` : ""}`)
}

export async function getCommodityStress(): Promise<CommodityStress[]> {
    return apiFetch<CommodityStress[]>("/api/indicators/commodity-stress")
}

export async function getLeanSeasonRisk(): Promise<LeanRisk[]> {
    return apiFetch<LeanRisk[]>("/api/indicators/lean-season-risk")
}

export async function getCommodityVsBaseline(commodity: string = "Maize"): Promise<CommodityBaseline> {
    return apiFetch<CommodityBaseline>(
        `/api/indicators/commodity-vs-baseline?commodity=${encodeURIComponent(commodity)}`
    )
}

export async function getSpikeDistribution(): Promise<SpikeDistribution[]> {
    return apiFetch<SpikeDistribution[]>("/api/indicators/spike-distribution")
}