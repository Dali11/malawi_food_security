"use client"

import { useState, useEffect } from "react"
import type { DistrictDetail, ForecastData } from "@/lib/types"
import { API, FORECAST_COMMODITIES } from "@/lib/constants"
import { ForecastChart }  from "./ForecastChart"
import { riskBg, riskColor } from "@/lib/hooks/useColor"



// ── Main drawer ───────────────────────────────────────────────
export default function ForecastDrawer({
  district,
  onClose,
}: {
  district: DistrictDetail
  onClose : () => void
}) {
  const [commodity, setCommodity] = useState("Maize")
  const [data, setData]           = useState<ForecastData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState("")

  useEffect(() => {
    setLoading(true)
    setData(null)
    setError("")
    fetch(
      `${API}/api/forecast/${encodeURIComponent(district.district)}` +
      `?commodity=${encodeURIComponent(commodity)}&months=3`
    )
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [district.district, commodity])

  return (
    <div className="flex flex-col h-full" onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4
                      border-b border-slate-700 bg-slate-900 flex-shrink-0"
           style={{ background: "#1B3A6B" }}>
        <div>
          <p className="text-base font-semibold text-white">
            Price Forecast — {district.district}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#A8C4E8" }}>
            3-month outlook · MFPI
          </p>
        </div>
        <button onClick={onClose}
          className="text-slate-400 hover:text-white text-xl leading-none
                     bg-white/10 rounded px-2 py-1 transition-colors cursor-pointer">
          ✕
        </button>
      </div>

      {/* Commodity selector */}
      <div className="px-6 py-3 border-b border-slate-700 flex-shrink-0">
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">
          Select commodity
        </p>
        <div className="flex flex-wrap gap-2">
          {FORECAST_COMMODITIES.map(c => (
            <button key={c} onClick={() => setCommodity(c)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors cursor-pointer ${
                commodity === c
                  ? "bg-yellow-500 border-yellow-500 text-slate-900 font-bold"
                  : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-800"
              }`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-lg animate-pulse h-12"/>
            <div className="bg-slate-800 rounded-lg animate-pulse h-56"/>
            <div className="grid grid-cols-3 gap-3">
              {[1,2,3].map(i => (
                <div key={i} className="bg-slate-800 rounded-lg animate-pulse h-24"/>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400 text-sm">
            Could not generate forecast: {error}
          </div>
        )}

        {/* Forecast content */}
        {!loading && data && (
          <div className="space-y-5">

            {/* Alert banner */}
            <div style={{
              background : riskBg(data.alert_level),
              borderLeft : `4px solid ${riskColor(data.alert_level)}`,
              borderRadius: "0 8px 8px 0",
              padding    : "12px 16px",
            }}>
              <div className="flex items-center gap-2 mb-1">
                <span style={{
                  background : riskColor(data.alert_level),
                  color      : "#ffffff",
                  fontSize   : 11,
                  fontWeight : 600,
                  padding    : "2px 8px",
                  borderRadius: 4,
                }}>
                  {data.alert_level} alert
                </span>
                <span style={{ fontSize: 12, color: riskColor(data.alert_level) }}>
                  · {data.trend} trend
                </span>
              </div>
              <p style={{ fontSize: 13, color: riskColor(data.alert_level), lineHeight: 1.5 }}>
                {data.insight}
              </p>
            </div>

            {/* Chart */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <p className="text-xs dark:text-slate-500 uppercase tracking-widest mb-3">
                {commodity} price forecast — MWK/KG
              </p>
              <ForecastChart data={data} />
              <div className="flex gap-4 mt-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs dark:text-slate-500">
                  <span className="inline-block w-4 h-0.5 bg-yellow-400"/>
                  12-month baseline
                </span>
                <span className="flex items-center gap-1.5 text-xs dark:text-slate-500">
                  <span className="inline-block w-3 h-3 rounded" style={{ background: "#FCEBEB", border: "0.5px solid #F09595" }}/>
                  80% confidence band
                </span>
              </div>
            </div>

            {/* Month cards */}
            <div className="grid grid-cols-3 gap-3">
              {data.forecast.map((f, i) => (
                <div key={i} className="bg-white border border-slate-200 shadow-md dark;border-none dark:bg-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">{f.month_label}</p>
                  <p className="text-xs text-slate-800 mb-2">{f.season}</p>
                  <p className="text-2xl font-bold font-mono mb-2"
                     style={{ color: riskColor(f.risk_level) }}>
                    {f.forecast.toLocaleString()}
                    <span className="text-xs font-normal text-slate-500 ml-1">MWK</span>
                  </p>
                  <div className="flex items-center justify-between">
                    <span style={{
                      background : riskBg(f.risk_level),
                      color      : riskColor(f.risk_level),
                      fontSize   : 10, fontWeight: 600,
                      padding    : "2px 6px", borderRadius: 4,
                    }}>
                      {f.risk_level}
                    </span>
                    <span className="text-xs font-mono "
                          style={{ color: riskColor(f.risk_level) }}>
                      {f.pct_vs_baseline > 0 ? "+" : ""}{f.pct_vs_baseline}%
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-800">
                    {f.lower_bound.toLocaleString()} – {f.upper_bound.toLocaleString()} MWK
                  </div>
                </div>
              ))}
            </div>

            {/* Methodology note */}
            <div className="border-t border-slate-800 pt-3">
              <p className="text-xs text-slate-600 mt-1">
                <span className="text-slate-500">Baseline:</span>{" "}
                {data.baseline_price.toLocaleString()} MWK (12-month average) ·{" "}
                <span className="text-slate-500">Generated:</span>{" "}
                {data.generated_at}
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
