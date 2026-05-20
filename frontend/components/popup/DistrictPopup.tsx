"use client"

import { useState } from "react"
import type { DistrictDetail } from "@/lib/types"
import { getRiskColor, getRiskLabel } from "@/lib/api"
import PriceChart from "@/components/dashboard/PriceChart"



interface DistrictPopupProps {
  district : DistrictDetail
  onClose  : () => void
  onForecastOpen  : () => void 
}

const COMMODITIES = [
  "Maize", "Beans", "Rice", "Sugar",
  "Cowpeas", "Pigeon peas", "Oil (vegetable)"
]


// ── Main component ────────────────────────────────────────────

export default function DistrictPopup({ district, onClose, onForecastOpen }: DistrictPopupProps) {
  const [selectedCommodity, setSelectedCommodity] = useState("Maize")
  const riskColor = getRiskColor(district.risk_score)
  const riskLabel = getRiskLabel(district.risk_score)
  

  // Reset to stats tab when district changes

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 overflow-y-auto">


      {/* Header */}
      <div className="hidden sm:block flex items-center justify-between px-4 py-3 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
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

      {/* Forecast button */}
      <div className="px-4 py-2 border-b border-slate-700">
        <button
          onClick={onForecastOpen}
          className="w-full flex items-center justify-center gap-2 text-xs py-2
                    rounded border border-yellow-600/50 text-yellow-400
                    hover:bg-yellow-500/10 transition-colors font-medium"
        >
         View 3-month price forecast
        </button>
      </div>

      

      {/* Tab content */}
      
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

    </div>
  )
}