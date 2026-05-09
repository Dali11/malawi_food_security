// ── GeoJSON base types ─────────────────────────────────────────────────────

export interface GeoJSONPoint {
  type: "Point"
  coordinates: [number, number]   // [longitude, latitude]
}

export interface GeoJSONPolygon {
  type: "Polygon" | "MultiPolygon"
  coordinates: number[][][] | number[][][][]
}

// ── District ───────────────────────────────────────────────────────────────

export interface DistrictProperties {
  district       : string
  region         : string
  risk_score     : number
  critical_count : number
  severe_count   : number
  moderate_count : number
  spike_rate_pct : number
}

export interface DistrictFeature {
  type       : "Feature"
  properties : DistrictProperties
  geometry   : GeoJSONPolygon
}

export interface DistrictCollection {
  type     : "FeatureCollection"
  count    : number
  features : DistrictFeature[]
}

// ── District detail (single district click) ────────────────────────────────

export interface MarketSummary {
  market         : string
  total_spikes   : number
  spike_rate_pct : number
}

export interface RecentSpike {
  commodity      : string
  market         : string
  pct_change     : number
  spike_severity : string
  date           : string
}

export interface DistrictDetail extends DistrictProperties {
  avg_price_mwk          : number
  markets                : MarketSummary[]
  recent_critical_spikes : RecentSpike[]
  geometry               : GeoJSONPolygon
}

// ── Market ─────────────────────────────────────────────────────────────────

export interface MarketProperties {
  market          : string
  district        : string
  region          : string
  num_commodities : number
  total_spikes    : number
  critical_count  : number
  spike_rate_pct  : number
  latest_date     : string
}

export interface MarketFeature {
  type       : "Feature"
  properties : MarketProperties
  geometry   : GeoJSONPoint
}

export interface MarketCollection {
  type     : "FeatureCollection"
  count    : number
  features : MarketFeature[]
}

// ── Spike ──────────────────────────────────────────────────────────────────

export interface SpikeProperties {
  district       : string
  market         : string
  commodity      : string
  price_mwk      : number
  pct_change     : number
  zscore         : number
  spike_severity : "Critical" | "Severe" | "Moderate"
  date           : string
}

export interface SpikeFeature {
  type       : "Feature"
  properties : SpikeProperties
  geometry   : GeoJSONPoint
}

export interface SpikeCollection {
  type     : "FeatureCollection"
  count    : number
  features : SpikeFeature[]
}

// ── Summary ────────────────────────────────────────────────────────────────

export interface Summary {
  analysis_period : string
  total_markets   : number
  total_districts : number
  spike_events: {
    total    : number
    critical : number
    severe   : number
    moderate : number
  }
  highest_risk_district: {
    name       : string
    region     : string
    risk_score : number
  }
  most_spiked_commodity: {
    name           : string
    critical_events: number
  }
  monitoring_gaps: {
    critical_gap_districts: number
  }
}

// ── UI state ───────────────────────────────────────────────────────────────

export type SeverityLevel = "Critical" | "Severe" | "Moderate" | "Normal"

export type ActiveLayer = "districts" | "markets" | "spikes"

export interface MapFilters {
  severity  : SeverityLevel | "All"
  region    : string
  commodity : string
}
// ── Price trend ────────────────────────────────────────────────────────────

export interface PricePoint {
  month          : string
  avg_price      : number
  spike_count    : number
  spike_severity : string
}

export interface PriceTrend {
  district  : string
  commodity : string
  count     : number
  prices    : PricePoint[]
}
