"use client"

import { useSummary } from "@/lib/hooks/useSummary"

export default function StatsPanel() {
  const { stats, loading } = useSummary()

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 p-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#111111] rounded-lg p-3 animate-pulse h-20" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-[#111111] border border-slate-700 rounded-lg p-3"
        >
          <div className="text-slate-400 text-xs font-mono uppercase tracking-wide mb-1">
            {s.label}
          </div>
          <div className={`text-xl font-bold font-mono ${s.color}`}>
            {s.value}
          </div>
          <div className="text-slate-500 text-xs mt-1">{s.sub}</div>
        </div>
      ))}
    </div>
  )
}
