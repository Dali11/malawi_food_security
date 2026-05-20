"use client"

import { usePipelineStatus } from "@/lib/hooks/usepipelineStatus"


function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  <  1) return "just now"
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export default function PipelineStatusBar() {
  const { status, loading, error } = usePipelineStatus()

  // Don't render anything while loading or on error
  if (loading || error || !status) return null

  const isRevision = status.notes?.toLowerCase().includes("revision")
  const hasFailed  = status.status === "failed"
  const hasUpdates = status.new_records > 0

  // Nothing meaningful to show — pipeline ran but no changes
  if (!hasUpdates && !hasFailed) return null

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-1.5 text-xs font-mono border-b flex-shrink-0
        ${hasFailed
          ? "bg-red-950/40 border-red-800/50 text-red-400"
          : "bg-emerald-950/40 border-emerald-800/30 text-emerald-400"}
      `}
    >
      {/* Pulse dot */}
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasFailed ? "bg-red-500" : "bg-emerald-500 animate-pulse"}`} />

      {hasFailed ? (
        <span className="text-red-300">Pipeline error — {status.notes}</span>
      ) : (
        <>
          {/* What changed */}
          <span className="text-slate-400">
            {isRevision ? "WFP revision applied" : "Data updated"}
          </span>

          <span className="text-slate-600">·</span>

          {/* Counts */}
          <span>
            <span className="text-slate-200 font-semibold">{status.new_records.toLocaleString()}</span>
            <span className="text-slate-400"> records</span>
          </span>

          {status.new_spikes > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <span>
                <span className="text-orange-400 font-semibold">{status.new_spikes}</span>
                <span className="text-slate-400"> spikes</span>
              </span>
            </>
          )}

          {status.new_critical > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <span>
                <span className="text-red-400 font-semibold">{status.new_critical}</span>
                <span className="text-slate-400"> critical</span>
              </span>
            </>
          )}

          {status.latest_date && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">
                latest data{" "}
                <span className="text-slate-300">
                  {new Date(status.latest_date).toLocaleDateString("en-GB", {
                    month: "short", year: "numeric"
                  })}
                </span>
              </span>
            </>
          )}

          {/* Timestamp */}
          <span className="ml-auto text-slate-600 hidden sm:inline">
            {timeAgo(status.run_at)}
          </span>
        </>
      )}
    </div>
  )
}