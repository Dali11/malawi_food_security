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
  ForecastData
} from "./types"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// ── Fetch with retry ───────────────────────────────────────────────────────
async function apiFetch<T>(endpoint: string, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        cache: "no-store",    // always fresh in production
      })
      if (!res.ok) throw new Error(`API ${res.status}: ${endpoint}`)
      return res.json() as Promise<T>
    } catch (err) {
      if (attempt === retries) throw err
      // Wait before retry: 500ms, 1000ms, 1500ms
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



//______________seasonaBaseline___________________________
export interface SeasonBaseline {
    commodity      : string
    current_season : string
    districts      : {
        district        : string
        region          : string
        risk_score      : number
        current_price   : number | null
        latest_date     : string | null
        pct_vs_baseline : number | null
        seasons         : Record<string, { avg_price: number; observations: number }>
    }[]
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

export async function getSeasonBaseline(commodity: string): Promise<SeasonBaseline> {
    return apiFetch<SeasonBaseline>(`/api/season/baseline?commodity=${encodeURIComponent(commodity)}`)
}

export async function getCropCalendar(): Promise<CropCalendar> {
    return apiFetch<CropCalendar>("/api/season/calendar")
}
