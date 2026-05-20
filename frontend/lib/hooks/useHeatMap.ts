"use client"
import { useEffect, useState } from "react"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface CommodityCell {
  price         : number
  pct_change    : number | null
  spike_severity: "Normal" | "Moderate" | "Severe" | "Critical"
  date          : string
  unit          : string
}

export interface DistrictRow {
  district      : string
  region        : string
  risk_score    : number
  critical_count: number
  severe_count  : number
  moderate_count: number
  commodities   : Record<string, CommodityCell>
}

export interface HeatmapSummary {
  total_districts                  : number
  critical_cells                   : number
  severe_cells                     : number
  worst_commodity                  : string | null
  worst_commodity_critical_districts: number
  most_affected_district           : string | null
  most_affected_spike_count        : number
}

export interface HeatmapData {
  commodities: string[]
  districts  : DistrictRow[]
  summary    : HeatmapSummary
}

export function useHeatmap() {
  const [data,    setData   ] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError  ] = useState<string | null>(null)
  

  useEffect(() => {
    fetch(`${API}/api/heatmap/`)
      .then(r => { if (!r.ok) throw new Error("Heatmap data unavailable"); return r.json() })
      .then((d: HeatmapData) => { setData(d); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  return { data, loading, error }
}

