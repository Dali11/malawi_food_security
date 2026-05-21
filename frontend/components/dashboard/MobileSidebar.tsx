"use client"
import { DistrictDetail } from "@/lib/types"
import AlertPanel from "./AlertPanel"
import StatsPanel from "./StatsPanel"

export function MobileSidebar({
  open,
  onClose,
}: {
  open            : boolean
  onClose         : () => void
  selectedDistrict?: DistrictDetail | null
}) {
  if (!open) return null
  return (
    <>
      <div className="absolute inset-0 z-[800] bg-black/50" onClick={onClose} />
      <div className="absolute top-0 left-0 bottom-0 w-72 z-[900]
                      bg-white dark:bg-slate-900
                      border-r border-slate-200 dark:border-slate-700
                      flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3
                        border-b border-slate-200 dark:border-slate-700">
          <span className="text-xs font-mono uppercase tracking-widest
                           text-slate-500 dark:text-slate-400">Overview</span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full
                       bg-slate-100 dark:bg-slate-800
                       text-slate-500 dark:text-slate-400
                       hover:text-slate-700 dark:hover:text-slate-200
                       hover:bg-slate-200 dark:hover:bg-slate-700
                       transition-colors text-sm"
          >
            ✕
          </button>
        </div>
        <StatsPanel />
        <div className="flex-1 overflow-hidden">
          <AlertPanel />
        </div>
      </div>
    </>
  )
}