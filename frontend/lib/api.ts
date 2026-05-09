/**
 * api.ts
 * All FastAPI fetch functions.
 * Single source of truth for API communication.
 */

import type {
  PriceTrend,
  DistrictCollection,
  DistrictDetail,
  MarketCollection,
  SpikeCollection,
  Summary,
} from "./types"

// ── Base URL ───────────────────────────────────────────────────────────────
// In production change this to your deployed API URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// ── Generic fetch with error handling ─────────────────────────────────────
async function apiFetch<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    next: { revalidate: 3600 },   // cache for 1 hour — data updates monthly
  })

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${endpoint}`)
  }

  return res.json() as Promise<T>
}

// ── Endpoints ──────────────────────────────────────────────────────────────

/** All 28 districts as GeoJSON — used for choropleth layer */
export async function getDistricts(): Promise<DistrictCollection> {
  return apiFetch<DistrictCollection>("/api/districts/")
}

/** One district full detail — used for district popup panel */
export async function getDistrict(name: string): Promise<DistrictDetail> {
  return apiFetch<DistrictDetail>(`/api/districts/${encodeURIComponent(name)}`)
}

/** All 113 markets as GeoJSON — used for market dot layer */
export async function getMarkets(): Promise<MarketCollection> {
  return apiFetch<MarketCollection>("/api/markets/")
}

/** Spike events with optional filters */
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

/** Critical spikes only — used for alert panel */
export async function getCriticalSpikes(): Promise<SpikeCollection> {
  return apiFetch<SpikeCollection>("/api/spikes/critical")
}

/** National summary statistics — used for header stats */
export async function getSummary(): Promise<Summary> {
  return apiFetch<Summary>("/api/summary/")
}

// ── Risk score → colour mapping ────────────────────────────────────────────
// Used by the choropleth layer to colour districts
export function getRiskColor(score: number): string {
  if (score === 0)   return "#E8F5E9"   // no data — light green
  if (score <= 59)   return "#A5D6A7"   // stable — green
  if (score <= 126)  return "#FFE082"   // low — yellow
  if (score <= 199)  return "#FFAB40"   // moderate — amber
  if (score <= 277)  return "#EF5350"   // high — red
  return                    "#B71C1C"   // critical — dark red
}

// ── Severity → colour mapping ──────────────────────────────────────────────
export function getSeverityColor(severity: string): string {
  switch (severity) {
    case "Critical": return "#B71C1C"
    case "Severe"  : return "#E65100"
    case "Moderate": return "#F9A825"
    default        : return "#43A047"
  }
}

// ── Risk score → label ─────────────────────────────────────────────────────
export function getRiskLabel(score: number): string {
  if (score === 0)   return "No Data"
  if (score <= 59)   return "Stable"
  if (score <= 126)  return "Low"
  if (score <= 199)  return "Moderate"
  if (score <= 277)  return "High"
  return                    "Critical"
}
/** Price time series for one district and commodity */
export async function getDistrictPrices(
  district : string,
  commodity: string = "Maize"
): Promise<PriceTrend> {
  return apiFetch<PriceTrend>(
    `/api/districts/${encodeURIComponent(district)}/prices?commodity=${encodeURIComponent(commodity)}`
  )
}
