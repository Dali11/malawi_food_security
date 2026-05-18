"use client"

import React, { useState } from "react"
import MapContainer    from "@/components/map/MapContainer"
import DistrictPopup   from "@/components/popup/DistrictPopup"
import StatsPanel      from "@/components/dashboard/StatsPanel"
import AlertPanel      from "@/components/dashboard/AlertPanel"
import NarrativePanel  from "@/components/dashboard/NarrativePanel"
import ForecastDrawer  from "@/components/dashboard/ForecastDrawer"
import type { DistrictDetail } from "@/lib/types"

const BASEMAPS = [
  { name: "Dark",         url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",                                                   attr: "CARTO"         },
  { name: "OpenStreetMap",url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",                                                              attr: "OpenStreetMap" },
  { name: "Satellite",    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",                    attr: "Esri"          },
]

const SEVERITIES = ["All", "Critical", "Severe", "Moderate"] as const
type SeverityFilter = typeof SEVERITIES[number]

export default function DashboardClient() {
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictDetail | null>(null)
  const [activeSeverity,   setActiveSeverity  ] = useState<SeverityFilter>("All")
  const [activeBasemap,    setActiveBasemap   ] = useState(0)
  const [forecastOpen,     setForecastOpen    ] = useState(false)

  function handleDistrictClick(district: DistrictDetail | null) {
  setSelectedDistrict(district)
  setForecastOpen(false)
}

  function handleClose() {
    setSelectedDistrict(null)
    setForecastOpen(false)
  }

  return (
    <div className="flex flex-1 overflow-hidden flex-col">
      
     
      {/* Filter toolbar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono uppercase tracking-widest">Spikes</span>
          <div className="flex gap-1">
            {SEVERITIES.map(s => (
              <button key={s} onClick={() => setActiveSeverity(s)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  activeSeverity === s
                    ? "bg-slate-200 border-slate-200 text-slate-900 font-bold"
                    : "border-slate-600 text-slate-400 hover:border-slate-400"
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="w-px h-4 bg-slate-700" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono uppercase tracking-widest">Basemap</span>
          <div className="flex gap-1">
            {BASEMAPS.map((b, i) => (
              <button key={b.name} onClick={() => setActiveBasemap(i)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  activeBasemap === i
                    ? "bg-slate-200 border-slate-200 text-slate-900 font-bold"
                    : "border-slate-600 text-slate-400 hover:border-slate-400"
                }`}>
                {b.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <aside className={`flex-shrink-0 bg-slate-900 border-r border-slate-700 flex flex-col overflow-hidden transition-all duration-300 ${
          selectedDistrict ? "w-80" : "w-64"
        }`}>
          {!selectedDistrict && <StatsPanel />}
          <div className="flex-1 overflow-hidden">
            {selectedDistrict
              ? <NarrativePanel districtName={selectedDistrict.district} />
              : <AlertPanel />
            }
          </div>
        </aside>

        {/* ── Map + overlays ── */}
        <div className="flex-1 relative overflow-hidden">

          {/* Map */}
          <MapContainer
            onDistrictClick={handleDistrictClick}
            severityFilter={activeSeverity}
            basemap={BASEMAPS[activeBasemap]}
          />

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs">
            <div className="text-slate-400 uppercase tracking-widest mb-2 font-mono text-xs">District Risk</div>
            {[
              { label: "Critical", color: "#B71C1C" },
              { label: "High",     color: "#EF5350" },
              { label: "Moderate", color: "#FFAB40" },
              { label: "Low",      color: "#FFE082" },
              { label: "Stable",   color: "#A5D6A7" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 mb-1">
                <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="text-slate-300">{item.label}</span>
              </div>
            ))}
            <div className="border-t border-slate-700 mt-2 pt-2 space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-700" />
                <span className="text-slate-300">Critical spike</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-700" />
                <span className="text-slate-300">Market</span>
              </div>
            </div>
          </div>

        
         {/* ── Right panel (district stats) ── */}
          <div className="absolute top-0 right-0 bottom-0 w-64 z-[500]
                          bg-slate-900 border-l border-slate-700 overflow-hidden">
            {selectedDistrict && !forecastOpen ? (
              <DistrictPopup
                district={selectedDistrict}
                onClose={handleClose}
                onForecastOpen={() => setForecastOpen(true)}
              />
            ) : !forecastOpen ? (
              <div className="flex flex-col h-full">
                <div className="px-4 py-3 border-b border-slate-700">
                  <div className="text-xs text-slate-400 font-mono uppercase tracking-widest">
                    Click a district to see details
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-slate-600 text-xs px-4">
                    <div className="text-2xl mb-2">🗺</div>
                    <div>Select any district on the map to view risk analysis and spike history</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* ── Forecast drawer (50% width overlay) ── */}
          {selectedDistrict && forecastOpen && (
            <>
              {/* Backdrop — clicking closes drawer */}
              <div
                className="absolute inset-0 z-[500]"
                onClick={() => setForecastOpen(false)}
              />
              {/* Drawer */}
              <div
                className="absolute top-0 right-0 bottom-0 z-[600]
                           bg-slate-900 border-l border-slate-700 overflow-hidden
                           animate-slide-in"
                style={{ width: "55%" }}
              >
                <ForecastDrawer
                  district={selectedDistrict}
                  onClose={() => setForecastOpen(false)}
                />
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
