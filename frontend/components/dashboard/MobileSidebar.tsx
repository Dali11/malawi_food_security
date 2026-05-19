import { DistrictDetail } from "@/lib/types"
import AlertPanel from "./AlertPanel"
import NarrativePanel from "./NarrativePanel"
import StatsPanel from "./StatsPanel"

export function MobileSidebar({
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