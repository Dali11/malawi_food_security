import { useEffect, useRef, useState } from "react"
import DistrictPopup from "../popup/DistrictPopup"
import ForecastDrawer from "./ForecastDrawer"
import { DistrictDetail } from "@/lib/types"

export function MobileDrawer({
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
    if (district) setDrawerHeight("full")
    else setDrawerHeight("peek")
  }, [district])

  if (!district && !forecastOpen) return null

 const heightMap = {
  peek: "20vh",
  half: "55vh",
  full: "calc(100% - 98px)", 
}

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY
  }
 function onTouchEnd(e: React.TouchEvent) {
    const dy = startY.current - e.changedTouches[0].clientY
    if (dy > 40) {
      setDrawerHeight(h => h === "peek" ? "half" : "full")
    }
    if (dy < -60) {
      setDrawerHeight(h => h === "full" ? "half" : h)
    }
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

      >
        
        {/* Drag handle */}
        <div 
          className="flex justify-center pt-3 pb-1 flex-shrink-0 curso-grab"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
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
        <div className="flex-1 overflow-y-auto overscroll-contain">
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