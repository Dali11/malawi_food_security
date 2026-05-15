"use client"

import { useState, useEffect } from "react"
import type { DistrictDetail } from "@/lib/types"
import { getRiskColor, getRiskLabel } from "@/lib/api"
import PriceChart from "@/components/dashboard/PriceChart"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface DistrictPopupProps {
  district : DistrictDetail
  onClose  : () => void
}

const COMMODITIES = [
  "Maize", "Beans", "Rice", "Sugar",
  "Cowpeas", "Pigeon peas", "Oil (vegetable)"
]

const FORECAST_COMMODITIES = [
  "Maize", "Beans", "Cowpeas", "Rice", "Sugar", "Pigeon peas"
]

// ── Forecast types ────────────────────────────────────────────
interface ForecastPoint {
  month         : string
  month_label   : string
  season        : string
  forecast      : number
  lower_bound   : number
  upper_bound   : number
  risk_level    : string
  pct_vs_baseline: number
}

interface ForecastData {
  district          : string
  commodity         : string
  generated_at      : string
  data_points_used  : number
  baseline_price    : number
  alert_level       : string
  trend             : string
  insight           : string
  forecast          : ForecastPoint[]
  methodology       : string
}

// ── Risk helpers ──────────────────────────────────────────────
function riskBadgeStyle(level: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    Critical: { bg: "#FCEBEB", color: "#A32D2D" },
    Severe:   { bg: "#FAEEDA", color: "#854F0B" },
    Moderate: { bg: "#FFF9C4", color: "#795548" },
    Normal:   { bg: "#EAF3DE", color: "#3B6D11" },
  }
  const s = map[level] ?? map.Normal
  return { background: s.bg, color: s.color,
           fontSize: 10, fontWeight: 500,
           padding: "2px 6px", borderRadius: 4, display: "inline-block" }
}

function riskBarColor(level: string): string {
  const map: Record<string, string> = {
    Critical: "#B71C1C", Severe: "#E65100",
    Moderate: "#F9A825", Normal: "#2E7D32",
  }
  return map[level] ?? "#2E7D32"
}

// ── Forecast bar chart ────────────────────────────────────────
function ForecastChart({ data }: { data: ForecastData }) {
  const maxPrice = Math.max(...data.forecast.map(f => f.upper_bound)) * 1.1
  const baseline = data.baseline_price

  return (
    <div>
      {/* SVG chart */}
      <div style={{ position: "relative", height: 160, marginBottom: 8 }}>
        <svg width="100%" height="160" viewBox="0 0 300 160"
             preserveAspectRatio="xMidYMid meet">

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const y = 140 - t * 120
            const price = Math.round(maxPrice * t)
            return (
              <g key={i}>
                <line x1="30" y1={y} x2="300" y2={y}
                      stroke="#334155" strokeWidth="0.5"/>
                <text x="28" y={y + 3} fontSize="8"
                      fill="#64748B" textAnchor="end">
                  {price >= 1000 ? `${(price/1000).toFixed(1)}k` : price}
                </text>
              </g>
            )
          })}

          {/* Baseline reference line */}
          {(() => {
            const y = 140 - (baseline / maxPrice) * 120
            return (
              <line x1="30" y1={y} x2="300" y2={y}
                    stroke="#F5C842" strokeWidth="1"
                    strokeDasharray="3,2"/>
            )
          })()}

          {/* Forecast bars + confidence bands */}
          {data.forecast.map((f, i) => {
            const n      = data.forecast.length
            const barW   = 40
            const gap    = (270 - n * barW) / (n + 1)
            const x      = 30 + gap + i * (barW + gap)
            const yBar   = 140 - (f.forecast / maxPrice) * 120
            const yLow   = 140 - (f.lower_bound / maxPrice) * 120
            const yHigh  = 140 - (f.upper_bound / maxPrice) * 120
            const barH   = 140 - yBar
            const color  = riskBarColor(f.risk_level)

            return (
              <g key={i}>
                {/* Confidence band */}
                <rect x={x + barW * 0.25} y={yHigh}
                      width={barW * 0.5}
                      height={yLow - yHigh}
                      fill={color} opacity={0.15}
                      rx="2"/>
                {/* Main bar */}
                <rect x={x} y={yBar} width={barW} height={barH}
                      fill={color} opacity={0.85} rx="3"/>
                {/* Price label */}
                <text x={x + barW / 2} y={yBar - 4}
                      fontSize="8" fill={color} textAnchor="middle"
                      fontWeight="500">
                  {f.forecast >= 1000
                    ? `${(f.forecast/1000).toFixed(1)}k`
                    : f.forecast}
                </text>
                {/* Month label */}
                <text x={x + barW / 2} y="155"
                      fontSize="8" fill="#94A3B8" textAnchor="middle">
                  {f.month_label.split(" ")[0]}
                </text>
              </g>
            )
          })}

          {/* Baseline label */}
          {(() => {
            const y = 140 - (baseline / maxPrice) * 120
            return (
              <text x="32" y={y - 3} fontSize="7"
                    fill="#F5C842">baseline</text>
            )
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap",
                    marginBottom: 8, fontSize: 10, color: "#64748B" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 16, height: 2,
                         background: "#F5C842", display: "inline-block" }}/>
          12-month baseline
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 8, background: "#FCEBEB",
                         border: "0.5px solid #F09595",
                         display: "inline-block", borderRadius: 2 }}/>
          80% confidence
        </span>
      </div>
    </div>
  )
}

// ── Forecast tab content ──────────────────────────────────────
function ForecastTab({ districtName }: { districtName: string }) {
  const [commodity, setCommodity]   = useState("Maize")
  const [data, setData]             = useState<ForecastData | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState("")

  useEffect(() => {
    setLoading(true)
    setData(null)
    setError("")
    fetch(`${API}/api/forecast/${encodeURIComponent(districtName)}?commodity=${encodeURIComponent(commodity)}&months=3`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [districtName, commodity])

  const alertColors: Record<string, string> = {
    Critical: "#B71C1C", Severe: "#E65100",
    Moderate: "#F9A825", Normal: "#2E7D32",
  }

  return (
    <div className="px-4 py-3">

      {/* Commodity selector */}
      <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
        Select commodity
      </div>
      <div className="flex flex-wrap gap-1 mb-4">
        {FORECAST_COMMODITIES.map(c => (
          <button key={c} onClick={() => setCommodity(c)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              commodity === c
                ? "bg-yellow-500 border-yellow-500 text-slate-900 font-bold"
                : "border-slate-600 text-slate-400 hover:border-slate-400"
            }`}>
            {c}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          <div className="bg-slate-800 rounded animate-pulse h-32" />
          <div className="bg-slate-800 rounded animate-pulse h-8" />
          <div className="bg-slate-800 rounded animate-pulse h-8" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-xs text-red-400 bg-red-900/20 rounded p-2">
          Could not load forecast: {error}
        </div>
      )}

      {/* Forecast content */}
      {!loading && data && (
        <>
          {/* Alert banner */}
          <div style={{
            background: alertColors[data.alert_level] + "22",
            borderLeft: `3px solid ${alertColors[data.alert_level]}`,
            borderRadius: "0 4px 4px 0",
            padding: "8px 10px",
            marginBottom: 12,
            fontSize: 11,
            color: alertColors[data.alert_level],
          }}>
            <b>{data.alert_level} alert</b> · {data.trend} trend
            <div style={{ marginTop: 3, opacity: 0.9 }}>{data.insight}</div>
          </div>

          {/* Chart */}
          <ForecastChart data={data} />

          {/* Month cards */}
          <div className="space-y-2 mb-3">
            {data.forecast.map((f, i) => (
              <div key={i} style={{
                background: "#1E293B",
                borderRadius: 6,
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <div style={{ width: 60, fontSize: 11, color: "#94A3B8" }}>
                  {f.month_label}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    background: "#0F172A",
                    borderRadius: 3,
                    height: 5,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${Math.min((f.forecast / (data.baseline_price * 2.5)) * 100, 100)}%`,
                      height: 5,
                      background: riskBarColor(f.risk_level),
                      borderRadius: 3,
                    }}/>
                  </div>
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 500,
                  color: riskBarColor(f.risk_level),
                  width: 70, textAlign: "right",
                }}>
                  {f.forecast.toLocaleString()} MWK
                </div>
                <span style={riskBadgeStyle(f.risk_level)}>
                  {f.risk_level}
                </span>
              </div>
            ))}
          </div>

          {/* Confidence note */}
          <div className="text-xs text-slate-600 border-t border-slate-800 pt-2">
            Baseline: {data.baseline_price.toLocaleString()} MWK ·
            {" "}Data points: {data.data_points_used} months ·
            {" "}80% confidence interval shown
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
type Tab = "stats" | "forecast"

export default function DistrictPopup({ district, onClose }: DistrictPopupProps) {
  const [selectedCommodity, setSelectedCommodity] = useState("Maize")
  const [activeTab, setActiveTab]                 = useState<Tab>("stats")
  const riskColor = getRiskColor(district.risk_score)
  const riskLabel = getRiskLabel(district.risk_score)

  // Reset to stats tab when district changes
  useEffect(() => { setActiveTab("stats") }, [district.district])

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
        <div>
          <div className="font-bold text-slate-100">{district.district}</div>
          <div className="text-xs text-slate-400">{district.region}</div>
        </div>
        <button onClick={onClose}
          className="text-slate-500 hover:text-slate-300 text-lg leading-none">
          ✕
        </button>
      </div>

      {/* Risk badge */}
      <div className="px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full text-xs font-bold text-white"
               style={{ backgroundColor: riskColor }}>
            {riskLabel}
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {district.risk_score}
          </div>
          <div className="text-xs text-slate-400">risk score</div>
        </div>
      </div>

      {/* Spike counts */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-slate-700">
        {[
          { label: "Critical", value: district.critical_count, color: "text-red-400"    },
          { label: "Severe",   value: district.severe_count,   color: "text-orange-400" },
          { label: "Moderate", value: district.moderate_count, color: "text-yellow-400" },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="px-4 py-3 border-b border-slate-700 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Avg price</span>
          <span className="font-mono text-slate-200">
            {district.avg_price_mwk.toLocaleString()} MWK
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Spike rate</span>
          <span className="font-mono text-slate-200">{district.spike_rate_pct}%</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Markets monitored</span>
          <span className="font-mono text-slate-200">{district.markets.length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 sticky top-[105px] bg-slate-900 z-10">
        {([
          { id: "stats",    label: "Price trend" },
          { id: "forecast", label: "⚡ Forecast"  },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 text-xs py-2 border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-yellow-500 text-yellow-400 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "stats" && (
        <>
          {/* Price trend chart */}
          <div className="px-4 py-3 border-b border-slate-700">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
              Price Trend
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {COMMODITIES.map(c => (
                <button key={c} onClick={() => setSelectedCommodity(c)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    selectedCommodity === c
                      ? "bg-yellow-500 border-yellow-500 text-slate-900 font-bold"
                      : "border-slate-600 text-slate-400 hover:border-slate-400"
                  }`}>
                  {c}
                </button>
              ))}
            </div>
            <PriceChart district={district.district} commodity={selectedCommodity} />
          </div>

          {/* Markets */}
          <div className="px-4 py-3 border-b border-slate-700">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
              Markets
            </div>
            <div className="space-y-1">
              {district.markets.map((m, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-slate-300">{m.market}</span>
                  <span className="text-slate-500">{m.spike_rate_pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent critical spikes */}
          <div className="px-4 py-3">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
              Recent Critical Events
            </div>
            <div className="space-y-2">
              {district.recent_critical_spikes.length === 0 && (
                <div className="text-xs text-slate-600">No critical spikes</div>
              )}
              {district.recent_critical_spikes.map((s, i) => (
                <div key={i} className="bg-slate-800 rounded p-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-200">{s.commodity}</span>
                    <span className="font-bold text-red-400">+{s.pct_change}%</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {s.market} · {s.date}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === "forecast" && (
        <ForecastTab districtName={district.district} />
      )}

    </div>
  )
}