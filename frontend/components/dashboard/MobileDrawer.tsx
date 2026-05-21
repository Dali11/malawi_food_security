"use client"
import { useEffect, useRef, useState } from "react"
import DistrictPopup  from "../popup/DistrictPopup"
import ForecastDrawer from "./ForecastDrawer"
import NarrativePanel from "./NarrativePanel"
import { DistrictDetail } from "@/lib/types"

type MobileTab = "stats" | "forecast" | "report"

type MobileDrawerProps = {
  district      : DistrictDetail | null
  onClose       : () => void
  onForecastOpen: () => void
  forecastOpen  : boolean
  onForecastClose: () => void
}

export function MobileDrawer({
  district,
  onClose,
  onForecastOpen,
  forecastOpen,
  onForecastClose,
}: MobileDrawerProps) {
  const [drawerHeight, setDrawerHeight] = useState<"half" | "full">("full")
  const [activeTab,    setActiveTab   ] = useState<MobileTab>("stats")
  const startY = useRef<number>(0)

  useEffect(() => {
    if (district) { setDrawerHeight("full"); setActiveTab("stats") }
  }, [district])

  if (!district) return null

  const heightMap = {
    half: "55vh",
    full: "calc(100% - 88px)",
  }

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dy = startY.current - e.changedTouches[0].clientY
    if (dy > 40)  setDrawerHeight("full")
    if (dy < -60) setDrawerHeight(h => h === "full" ? "half" : h)
  }

  const TABS: { id: MobileTab; label: string }[] = [
    { id: "stats",    label: "Stats"           },
    { id: "forecast", label: "Forecast"        },
    { id: "report",   label: "Generate Report" },
  ]

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[700]
                 bg-white dark:bg-slate-900
                 border-t border-slate-200 dark:border-slate-700
                 rounded-t-2xl flex flex-col transition-all duration-300 overflow-hidden"
      style={{ height: heightMap[drawerHeight] }}
    >
      {/* Drag handle */}
      <div
        className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab active:cursor-grabbing"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
      </div>

      {/* District name + close */}
      <div className="flex items-start justify-between px-4 pb-2 flex-shrink-0">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-tight">
            {district.district}
          </h2>
          <p className="text-xs text-slate-500">{district.region}</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full
                     bg-slate-100 dark:bg-slate-800
                     text-slate-500 dark:text-slate-400
                     hover:text-slate-700 dark:hover:text-slate-200
                     hover:bg-slate-200 dark:hover:bg-slate-700
                     transition-colors flex-shrink-0 ml-2 text-sm"
        >
          ✕
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 flex-shrink-0 mx-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-yellow-500 text-yellow-600 dark:text-yellow-400"
                : "border-transparent text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {activeTab === "stats" && (
          <DistrictPopup
            district={district}
            onClose={onClose}
            onForecastOpen={() => setActiveTab("forecast")}
          />
        )}
        {activeTab === "report" && (
          <NarrativePanel districtName={district.district} />
        )}
        {activeTab === "forecast" && (
          <ForecastDrawer
            district={district}
            onClose={() => setActiveTab("stats")}
          />
        )}
      </div>
    </div>
  )
}