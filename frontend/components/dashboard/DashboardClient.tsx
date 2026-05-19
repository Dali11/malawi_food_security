"use client"

import React, { useState, useEffect, useRef } from "react"
import MapContainer   from "@/components/map/MapContainer"
import DistrictPopup  from "@/components/popup/DistrictPopup"
import StatsPanel     from "@/components/dashboard/StatsPanel"
import AlertPanel     from "@/components/dashboard/AlertPanel"
import NarrativePanel from "@/components/dashboard/NarrativePanel"
import ForecastDrawer from "@/components/dashboard/ForecastDrawer"
import type { DistrictDetail } from "@/lib/types"

/* ── Breakpoint hook ─────────────────────────────────────────────────────── */
type BP = "mobile" | "tablet" | "desktop"

function useBreakpoint(): BP {
  const [bp, setBp] = useState<BP>("desktop")
  useEffect(() => {
    function update() {
      const w = window.innerWidth
      setBp(w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop")
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
  return bp
}

/* ── Constants ───────────────────────────────────────────────────────────── */
const BASEMAPS = [
  { name: "Dark",          url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",                               attr: "CARTO"         },
  { name: "OpenStreetMap", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",                                         attr: "OpenStreetMap" },
  { name: "Satellite",     url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Esri"        },
]
const SEVERITIES = ["All", "Critical", "Severe", "Moderate"] as const
type SeverityFilter = typeof SEVERITIES[number]

/* ── Legend ─────────────────────────────────────────────────────────────── */
function MapLegend() {
  return (
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
  )
}

/* ── Mobile bottom drawer ────────────────────────────────────────────────── */
function MobileDrawer({
  district,
  onClose,
  onForecastOpen,
  forecastOpen,
  onForecastClose,
}: {
  district: DistrictDetail | null
  onClose: () => void
  onForecastOpen: () => void
  forecastOpen: boolean
  onForecastClose: () => void
}) {
  const [drawerHeight, setDrawerHeight] = useState<"peek" | "half" | "full">("peek")
  const startY = useRef<number>(0)

  // Reset when district changes
  useEffect(() => {
    if (district) setDrawerHeight("half")
    else setDrawerHeight("peek")
  }, [district])

  if (!district && !forecastOpen) return null

  const heightMap = {
    peek: "20vh",
    half: "55vh",
    full: "90vh",
  }

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dy = startY.current - e.changedTouches[0].clientY
    if (dy > 40) setDrawerHeight(h => h === "peek" ? "half" : "full")
    if (dy < -40) setDrawerHeight(h => h === "full" ? "half" : "peek")
  }

  return (
    <>
      {/* Backdrop */}
      {(drawerHeight === "full") && (
        <div className="absolute inset-0 z-[600] bg-black/40" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        className="absolute bottom-0 left-0 right-0 z-[700] bg-slate-900 border-t border-slate-700 rounded-t-2xl overflow-hidden flex flex-col transition-all duration-300"
        style={{ height: heightMap[drawerHeight] }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>

        {/* Dismiss button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-slate-500 hover:text-slate-300 text-lg"
        >
          ✕
        </button>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {forecastOpen && district ? (
            <ForecastDrawer district={district} onClose={onForecastClose} />
          ) : district ? (
            <DistrictPopup
              district={district}
              onClose={onClose}
              onForecastOpen={onForecastOpen}
            />
          ) : null}
        </div>
      </div>
    </>
  )
}

/* ── Mobile sidebar sheet (alerts / stats) ───────────────────────────────── */
function MobileSidebar({
  open,
  onClose,
  selectedDistrict,
}: {
  open: boolean
  onClose: () => void
  selectedDistrict: DistrictDetail | null
}) {
  if (!open) return null
  return (
    <>
      <div className="absolute inset-0 z-[800] bg-black/50" onClick={onClose} />
      <div className="absolute top-0 left-0 bottom-0 w-72 z-[900] bg-slate-900 border-r border-slate-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400">
            {selectedDistrict ? "Situation Report" : "Overview"}
          </span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">✕</button>
        </div>
        {/* Content */}
        {selectedDistrict ? (
          <div className="flex-1 overflow-hidden">
            <NarrativePanel districtName={selectedDistrict.district} />
          </div>
        ) : (
          <>
            <StatsPanel />
            <div className="flex-1 overflow-hidden">
              <AlertPanel />
            </div>
          </>
        )}
      </div>
    </>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function DashboardClient() {
  const bp = useBreakpoint()

  const [selectedDistrict, setSelectedDistrict] = useState<DistrictDetail | null>(null)
  const [activeSeverity,   setActiveSeverity  ] = useState<SeverityFilter>("All")
  const [activeBasemap,    setActiveBasemap   ] = useState(0)
  const [forecastOpen,     setForecastOpen    ] = useState(false)
  const [sidebarOpen,      setSidebarOpen     ] = useState(false)

  function handleDistrictClick(district: DistrictDetail | null) {
    setSelectedDistrict(district)
    setForecastOpen(false)
    setSidebarOpen(false)
  }

  function handleClose() {
    setSelectedDistrict(null)
    setForecastOpen(false)
  }

  // ── MOBILE layout ───────────────────────────────────────────────────────
  if (bp === "mobile") {
    return (
      <div className="flex flex-1 overflow-hidden flex-col relative">

        {/* Mobile toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-700 flex-shrink-0">
          {/* Hamburger — opens sidebar */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col gap-1 p-1.5 rounded hover:bg-slate-800 mr-1"
          >
            <span className="w-4 h-0.5 bg-slate-400 block" />
            <span className="w-4 h-0.5 bg-slate-400 block" />
            <span className="w-4 h-0.5 bg-slate-400 block" />
          </button>

          {/* Spike filters */}
          <div className="flex gap-1 overflow-x-auto flex-1">
            {SEVERITIES.map(s => (
              <button key={s} onClick={() => setActiveSeverity(s)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                  activeSeverity === s
                    ? "bg-slate-200 border-slate-200 text-slate-900 font-bold"
                    : "border-slate-600 text-slate-400"
                }`}>
                {s === "Moderate" ? "Mod" : s}
              </button>
            ))}
          </div>

          {/* Basemap toggle — compact icon buttons */}
          <div className="flex gap-1 ml-1">
            {BASEMAPS.map((b, i) => (
              <button key={b.name} onClick={() => setActiveBasemap(i)}
                title={b.name}
                className={`text-xs px-1.5 py-0.5 rounded border transition-colors flex-shrink-0 ${
                  activeBasemap === i
                    ? "bg-slate-200 border-slate-200 text-slate-900 font-bold"
                    : "border-slate-600 text-slate-400"
                }`}>
                {b.name[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Full-screen map */}
        <div className="flex-1 relative overflow-hidden">
          <MapContainer
            onDistrictClick={handleDistrictClick}
            severityFilter={activeSeverity}
            basemap={BASEMAPS[activeBasemap]}
          />
          <MapLegend />

          {/* Tap hint when no district selected */}
          {!selectedDistrict && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400]
                            bg-slate-900/90 border border-slate-700 rounded-full
                            px-4 py-1.5 text-xs text-slate-400 pointer-events-none">
              Tap a district to explore
            </div>
          )}

          {/* Mobile sidebar (alerts/narrative) */}
          <MobileSidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            selectedDistrict={selectedDistrict}
          />

          {/* Bottom drawer — district info */}
          <MobileDrawer
            district={selectedDistrict}
            onClose={handleClose}
            onForecastOpen={() => setForecastOpen(true)}
            forecastOpen={forecastOpen}
            onForecastClose={() => setForecastOpen(false)}
          />
        </div>
      </div>
    )
  }

  // ── TABLET layout ───────────────────────────────────────────────────────
  if (bp === "tablet") {
    return (
      <div className="flex flex-1 overflow-hidden flex-col">

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 flex-wrap">
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

          {/* Sidebar toggle for tablet */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="ml-auto text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-800"
          >
            {sidebarOpen ? "Hide panel" : "≡ Overview"}
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden relative">

          {/* Collapsible left sidebar */}
          {sidebarOpen && (
            <aside className="w-64 flex-shrink-0 bg-slate-900 border-r border-slate-700 flex flex-col overflow-hidden">
              {!selectedDistrict && <StatsPanel />}
              <div className="flex-1 overflow-hidden">
                {selectedDistrict
                  ? <NarrativePanel districtName={selectedDistrict.district} />
                  : <AlertPanel />
                }
              </div>
            </aside>
          )}

          {/* Map + overlays */}
          <div className="flex-1 relative overflow-hidden">
            <MapContainer
              onDistrictClick={handleDistrictClick}
              severityFilter={activeSeverity}
              basemap={BASEMAPS[activeBasemap]}
            />
            <MapLegend />

            {/* Right panel */}
            <div className="absolute top-0 right-0 bottom-0 w-72 z-[500]
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

            {/* Forecast drawer */}
            {selectedDistrict && forecastOpen && (
              <>
                <div className="absolute inset-0 z-[500]" onClick={() => setForecastOpen(false)} />
                <div
                  className="absolute top-0 right-0 bottom-0 z-[600] bg-slate-900 border-l border-slate-700 overflow-hidden"
                  style={{ width: "65%" }}
                >
                  <ForecastDrawer district={selectedDistrict} onClose={() => setForecastOpen(false)} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── DESKTOP layout (original) ───────────────────────────────────────────
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

        {/* Left sidebar */}
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

        {/* Map + overlays */}
        <div className="flex-1 relative overflow-hidden">
          <MapContainer
            onDistrictClick={handleDistrictClick}
            severityFilter={activeSeverity}
            basemap={BASEMAPS[activeBasemap]}
          />
          <MapLegend />

          {/* Right panel */}
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

          {/* Forecast drawer */}
          {selectedDistrict && forecastOpen && (
            <>
              <div className="absolute inset-0 z-[500]" onClick={() => setForecastOpen(false)} />
              <div
                className="absolute top-0 right-0 bottom-0 z-[600]
                           bg-slate-900 border-l border-slate-700 overflow-hidden"
                style={{ width: "55%" }}
              >
                <ForecastDrawer district={selectedDistrict} onClose={() => setForecastOpen(false)} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}