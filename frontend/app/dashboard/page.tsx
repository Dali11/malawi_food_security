"use client"

import React, { useState, useEffect } from "react"
import MapContainer   from "@/components/map/MapContainer"
import DistrictPopup  from "@/components/popup/DistrictPopup"
import StatsPanel     from "@/components/dashboard/StatsPanel"
import AlertPanel     from "@/components/dashboard/AlertPanel"
import NarrativePanel from "@/components/dashboard/NarrativePanel"
import ForecastDrawer from "@/components/dashboard/ForecastDrawer"
import type { DistrictDetail } from "@/lib/types"
import { BASEMAPS } from "@/lib/constants"
import MapLegend from "@/components/map/MapLegend"
import { MobileDrawer } from "@/components/dashboard/MobileDrawer"
import HeatmapPanel from "../heatmap/page"
import { MobileSidebar } from "@/components/dashboard/MobileSidebar"

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

const SEVERITIES = ["All", "Critical", "Severe", "Moderate"] as const
type SeverityFilter = typeof SEVERITIES[number]
type ActiveView = "map" | "heatmap"

/* ── Main component ──────────────────────────────────────────────────────── */
export default function DashboardClient() {
  const bp = useBreakpoint()

  const [selectedDistrict, setSelectedDistrict] = useState<DistrictDetail | null>(null)
  const [activeSeverity,   setActiveSeverity  ] = useState<SeverityFilter>("All")
  const [activeBasemap,    setActiveBasemap   ] = useState(0)
  const [forecastOpen,     setForecastOpen    ] = useState(false)
  const [sidebarOpen,      setSidebarOpen     ] = useState(false)
  const [activeView,       setActiveView      ] = useState<ActiveView>("map")   // ← NEW

  function handleDistrictClick(district: DistrictDetail | null) {
    setSelectedDistrict(district)
    setForecastOpen(false)
    setSidebarOpen(false)
  }

  function handleClose() {
    setSelectedDistrict(null)
    setForecastOpen(false)
  }

  function toggleView() {
    setActiveView(v => v === "map" ? "heatmap" : "map")
    // Close any open panels when switching to heatmap
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

          {/* Spike filters — only in map view */}
          {activeView === "map" && (
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
          )}

          {/* Heatmap toggle */}
          <button
            onClick={toggleView}
            className={`text-xs px-2.5 py-1 rounded border font-mono flex-shrink-0 transition-colors ${
              activeView === "heatmap"
                ? "bg-emerald-700 border-emerald-600 text-emerald-100"
                : "border-slate-600 text-slate-400"
            }`}
          >
            {activeView === "heatmap" ? "← Map" : "Grid"}
          </button>

          {/* Basemap toggle — compact, only in map view */}
          {activeView === "map" && (
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
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 relative overflow-hidden">

          {/* Map view */}
          <div className={activeView === "map" ? "absolute inset-0" : "hidden"}>
            <MapContainer
              onDistrictClick={handleDistrictClick}
              severityFilter={activeSeverity}
              basemap={BASEMAPS[activeBasemap]}
            />
            <MapLegend />

            {!selectedDistrict && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400]
                              bg-slate-900/90 border border-slate-700 rounded-full
                              px-4 py-1.5 text-xs text-slate-400 pointer-events-none">
                Tap a district to explore
              </div>
            )}

            <MobileSidebar
              open={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              selectedDistrict={selectedDistrict}
            />

           <MobileDrawer
              district={selectedDistrict}
              onClose={handleClose}
            />
          </div>

          {/* Heatmap view */}
          {activeView === "heatmap" && (
            <div className="absolute inset-0 flex flex-col overflow-hidden">
              <HeatmapPanel />
            </div>
          )}
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

          {/* Spike filters — only in map view */}
          {activeView === "map" && (
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
          )}

          {/* Divider */}
          {activeView === "map" && <div className="w-px h-4 bg-slate-700" />}

          {/* Heatmap toggle */}
          <button
            onClick={toggleView}
            className={`text-xs px-3 py-1 rounded border font-mono uppercase tracking-widest transition-colors ${
              activeView === "heatmap"
                ? "bg-emerald-700 border-emerald-600 text-emerald-100"
                : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
            }`}
          >
            {activeView === "heatmap" ? "← Map" : "Heatmap"}
          </button>

          {/* Basemap — only in map view */}
          {activeView === "map" && (
            <>
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
            </>
          )}

          {/* Sidebar toggle — only in map view */}
          {activeView === "map" && (
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="ml-auto text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:bg-slate-800"
            >
              {sidebarOpen ? "Hide panel" : "≡ Overview"}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden relative">

          {/* Left sidebar — only in map view */}
          {activeView === "map" && sidebarOpen && (
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

          {/* Map — keep mounted so switching back is instant */}
          <div className={`flex-1 relative overflow-hidden ${activeView === "heatmap" ? "hidden" : ""}`}>
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

          {/* Heatmap view */}
          {activeView === "heatmap" && (
            <div className="flex-1 flex flex-col overflow-hidden">
                <HeatmapPanel />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── DESKTOP layout ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden flex-col">

      {/* Filter toolbar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-slate-900 border-b border-slate-700">

        {/* Spike filters — only in map view */}
        {activeView === "map" && (
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
        )}

        {/* Divider */}
        {activeView === "map" && <div className="w-px h-4 bg-slate-700" />}

        {/* Heatmap toggle */}
        <button
          onClick={toggleView}
          className={`text-xs px-3 py-1 rounded border font-mono uppercase tracking-widest transition-colors ${
            activeView === "heatmap"
              ? "bg-emerald-700 border-emerald-600 text-emerald-100"
              : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
          }`}
        >
          {activeView === "heatmap" ? "← Map" : "Heatmap"}
        </button>

        {/* Basemap — only in map view */}
        {activeView === "map" && (
          <>
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
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar — only in map view */}
        {activeView === "map" && (
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
        )}

        {/* Map — keep mounted so switching back is instant, hide via CSS */}
        <div className={`relative overflow-hidden ${
          activeView === "map" ? "flex-1" : "hidden"
        }`}>
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

        {/* Heatmap view — full width, replaces map area */}
        {activeView === "heatmap" && (
          <div className="flex-1 flex flex-col overflow-hidden">
             <HeatmapPanel />
          </div>
        )}
      </div>
    </div>
  )
}