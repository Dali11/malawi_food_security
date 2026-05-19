import { LEGEND } from "@/lib/constants"
import { useState } from "react"

// 3. Compact legend on mobile — replace MapLegend component:
const MapLegend = () => {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="absolute bottom-4 left-2 z-[400] bg-slate-900/90 border border-slate-700 rounded-lg text-xs">
      {/* Toggle header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center justify-between w-full px-2.5 py-1.5 gap-3"
      >
        <span className="text-slate-400 uppercase tracking-widest font-mono text-xs">
          District Risk
        </span>
        <span className="text-slate-500 text-xs">{collapsed ? "▲" : "▼"}</span>
      </button>

      {!collapsed && (
        <div className="px-2.5 pb-2 space-y-1">
          {LEGEND.map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="w-3 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-slate-300">{item.label}</span>
            </div>
          ))}
          <div className="border-t border-slate-700 mt-1.5 pt-1.5 space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-700 flex-shrink-0" />
              <span className="text-slate-300">Critical spike</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-700 flex-shrink-0" />
              <span className="text-slate-300">Market</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default MapLegend