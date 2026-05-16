"use client"

import { useState, useEffect } from "react"
import type { DistrictDetail } from "@/lib/types"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const FORECAST_COMMODITIES = [
  "Maize", "Beans", "Cowpeas", "Rice", "Sugar", "Pigeon peas"
]

interface ForecastPoint {
  month          : string
  month_label    : string
  season         : string
  forecast       : number
  lower_bound    : number
  upper_bound    : number
  risk_level     : string
  pct_vs_baseline: number
}

interface ForecastData {
  district         : string
  commodity        : string
  generated_at     : string
  data_points_used : number
  baseline_price   : number
  alert_level      : string
  trend            : string
  insight          : string
  forecast         : ForecastPoint[]
  methodology      : string
}

function riskColor(level: string): string {
  return { Critical: "#B71C1C", Severe: "#a53a00", Moderate: "#f59700", Normal: "#2E7D32" }[level] ?? "#2E7D32"
}

function riskBg(level: string): string {
  return { Critical: "#2c2c2c", Severe: "#1a1919", Moderate: "#302e2e", Normal: "#242424" }[level] ?? "#EAF3DE"
}

// ── SVG Chart ─────────────────────────────────────────────────
function ForecastChart({ data }: { data: ForecastData }) {
  const maxPrice = Math.max(...data.forecast.map(f => f.upper_bound)) * 1.15
  const baseline = data.baseline_price
  const n        = data.forecast.length
  const W        = 560
  const H        = 220
  const PAD_L    = 55
  const PAD_B    = 30
  const PAD_T    = 20
  const chartW   = W - PAD_L - 20
  const chartH   = H - PAD_B - PAD_T
  const barW     = Math.min(60, (chartW / n) * 0.55)
  const gap      = (chartW - n * barW) / (n + 1)

  const toY = (price: number) => PAD_T + chartH - (price / maxPrice) * chartH

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">

      {/* Grid lines + Y labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const y     = toY(maxPrice * t)
        const price = Math.round(maxPrice * t)
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={W - 20} y2={y}
                  stroke="#1E293B" strokeWidth="1"/>
            <text x={PAD_L - 4} y={y + 4} fontSize="10"
                  fill="#475569" textAnchor="end">
              {price >= 1000 ? `${(price/1000).toFixed(1)}k` : price}
            </text>
          </g>
        )
      })}

      {/* Baseline line */}
      <line x1={PAD_L} y1={toY(baseline)} x2={W - 20} y2={toY(baseline)}
            stroke="#F5C842" strokeWidth="1.5" strokeDasharray="5,3"/>
      <text x={PAD_L + 4} y={toY(baseline) - 4} fontSize="9" fill="#F5C842">
        baseline {baseline.toLocaleString()} MWK
      </text>

      {/* Bars */}
      {data.forecast.map((f, i) => {
        const x      = PAD_L + gap + i * (barW + gap)
        const yBar   = toY(f.forecast)
        const yLow   = toY(f.lower_bound)
        const yHigh  = toY(f.upper_bound)
        const barH   = H - PAD_B - yBar
        const color  = riskColor(f.risk_level)

        return (
          <g key={i}>
            {/* Confidence band */}
            <rect x={x + barW * 0.1} y={yHigh}
                  width={barW * 0.8} height={Math.abs(yLow - yHigh)}
                  fill={color} opacity="0.12" rx="3"/>

            {/* Bar */}
            <rect x={x} y={yBar} width={barW} height={barH}
                  fill={color} opacity="0.85" rx="4"/>

            {/* Price label */}
            <text x={x + barW / 2} y={yBar - 6}
                  fontSize="11" fill={color} textAnchor="middle" fontWeight="600">
              {f.forecast >= 1000
                ? `${(f.forecast/1000).toFixed(1)}k`
                : f.forecast}
            </text>

            {/* Month label */}
            <text x={x + barW / 2} y={H - 8}
                  fontSize="10" fill="#64748B" textAnchor="middle">
              {f.month_label.split(" ")[0]}
            </text>

            {/* Season label */}
            <text x={x + barW / 2} y={H - 18}
                  fontSize="8" fill="#334155" textAnchor="middle">
              {f.season.split(" ")[0]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

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
                      border-b border-slate-700 bg-[#0a0a0a] flex-shrink-0"
           style={{ background: "#1B3A6B" }}>
        <div>
          <p className="text-base font-semibold text-white">
            Price Forecast — {district.district}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#A8C4E8" }}>
            3-month outlook · MFSM
          </p>
        </div>
        <button onClick={onClose}
          className="text-slate-400 hover:text-white text-xl leading-none
                     bg-white/10 rounded px-2 py-1 transition-colors">
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
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                commodity === c
                  ? "bg-yellow-500 border-yellow-500 text-slate-900 font-bold"
                  : "border-slate-600 text-slate-400 hover:border-slate-400"
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
            <div className="bg-[#111111] rounded-lg animate-pulse h-12"/>
            <div className="bg-[#111111] rounded-lg animate-pulse h-56"/>
            <div className="grid grid-cols-3 gap-3">
              {[1,2,3].map(i => (
                <div key={i} className="bg-[#111111] rounded-lg animate-pulse h-24"/>
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
            <div className="bg-[#111111]/50 rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">
                {commodity} price forecast — MWK/KG
              </p>
              <ForecastChart data={data} />
              <div className="flex gap-4 mt-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="inline-block w-4 h-0.5 bg-yellow-400"/>
                  12-month baseline
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="inline-block w-3 h-3 rounded" style={{ background: "#FCEBEB", border: "0.5px solid #F09595" }}/>
                  80% confidence band
                </span>
              </div>
            </div>

            {/* Month cards */}
            <div className="grid grid-cols-3 gap-3">
              {data.forecast.map((f, i) => (
                <div key={i} className="bg-[#111111] rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">{f.month_label}</p>
                  <p className="text-xs text-slate-600 mb-2">{f.season}</p>
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
                    <span className="text-xs font-mono"
                          style={{ color: riskColor(f.risk_level) }}>
                      {f.pct_vs_baseline > 0 ? "+" : ""}{f.pct_vs_baseline}%
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
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
