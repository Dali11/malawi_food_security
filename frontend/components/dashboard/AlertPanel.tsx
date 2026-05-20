"use client"
import { useEffect, useState } from "react"
import { getCriticalSpikes } from "@/lib/api"
import type { SpikeFeature } from "@/lib/types"

export default function AlertPanel() {
  const [spikes, setSpikes] = useState<SpikeFeature[]>([])

  useEffect(() => {
    getCriticalSpikes()
      .then(data => setSpikes(data.features.slice(0, 15)))
      .catch(console.error)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-sm font-mono uppercase tracking-widest text-slate-900 dark:text-slate-400">
          Critical Alerts
        </span>
        <span className="ml-2 text-xs bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 px-2 py-0.5 rounded-full">
          {spikes.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {spikes.length === 0 && (
          <div className="p-3 text-slate-400 dark:text-slate-500 text-xs">Loading alerts...</div>
        )}
        {spikes.map((f, i) => {
          const p = f.properties
          return (
            <div
              key={i}
              className="px-3 py-2 border-b border-slate-100 dark:border-slate-800
                         hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  {p.commodity}
                </div>
                <div className="text-xs font-bold text-red-500 dark:text-red-400">
                  +{p.pct_change}%
                </div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                {p.market} · {p.district}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-600 mt-0.5">
                {p.date}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}