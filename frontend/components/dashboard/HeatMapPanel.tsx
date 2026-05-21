"use client"
import { CommodityCell, DistrictRow, useHeatmap } from "@/lib/hooks/useHeatMap"
import React, { useState, useMemo, useRef } from "react"
import { useTheme } from "../ThemeProvider"
import { SummaryCard } from "@/lib/hooks/useHeatmapSummaryCard"

// ── Severity helpers ────────────────────────────────────────────────────────

type Severity = "Critical" | "Severe" | "Moderate" | "Normal" | "nodata"

const SEVERITY_RANK: Record<Severity, number> = {
  Critical: 4, Severe: 3, Moderate: 2, Normal: 1, nodata: 0,
}

const CELL_STYLES: Record<Severity, { bg: string; text: string; pct: string }> = {
  Critical: { bg: "bg-red-300    dark:bg-red-950/60",    text: "text-red-800    dark:text-red-300",    pct: "text-red-600    dark:text-red-400"    },
  Severe:   { bg: "bg-orange-200 dark:bg-orange-950/60", text: "text-orange-800 dark:text-orange-300", pct: "text-orange-600 dark:text-orange-400" },
  Moderate: { bg: "bg-amber-100  dark:bg-amber-950/50",  text: "text-amber-800  dark:text-amber-300",  pct: "text-amber-600  dark:text-amber-400"  },
  Normal:   { bg: "bg-slate-100  dark:bg-slate-800/60",  text: "text-slate-700  dark:text-slate-300",  pct: "text-slate-500  dark:text-slate-500"  },
  nodata:   { bg: "bg-slate-50   dark:bg-slate-900",     text: "text-slate-400  dark:text-slate-600",  pct: ""                                      },
}

const RISK_BADGE: Record<string, string> = {
  Critical: "bg-red-100    dark:bg-red-900/60    text-red-700    dark:text-red-300",
  High    : "bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300",
  Moderate: "bg-amber-100  dark:bg-amber-900/60  text-amber-700  dark:text-amber-300",
  Low     : "bg-blue-100   dark:bg-blue-900/60   text-blue-700   dark:text-blue-300",
  Stable  : "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300",
}

function riskLabel(score: number): string {
  if (score >= 400) return "Critical"
  if (score >= 250) return "High"
  if (score >= 100) return "Moderate"
  if (score >   0) return "Low"
  return "Stable"
}

// ── Cell ─────────────────────────────────────────────────────────────────────

function Cell({ cell }: { cell: CommodityCell | undefined }) {
  if (!cell) {
    const s = CELL_STYLES.nodata
    return (
      <td className="px-0.5 sm:px-1 py-0.5">
        <div className={`${s.bg} rounded px-0.5 sm:px-1 py-1.5 text-center min-w-[52px]`}>
          <span className={`block text-xs ${s.text}`}>—</span>
        </div>
      </td>
    )
  }

  const sev = (cell.spike_severity ?? "Normal") as Severity
  const s   = CELL_STYLES[sev] ?? CELL_STYLES.Normal
  const pct = cell.pct_change

  return (
    <td className="px-0.5 sm:px-1 py-0.5">
      <div className={`${s.bg} rounded px-0.5 sm:px-1 py-1.5 text-center min-w-[52px]`}>
        <span className={`block text-xs font-mono font-medium ${s.text}`}>
          {cell.price.toLocaleString()}
        </span>
        {pct !== null && pct !== undefined && (
          <span className={`block text-[9px] font-mono mt-0.5 ${s.pct}`}>
            {pct > 0 ? "+" : ""}{pct.toFixed(0)}%
          </span>
        )}
      </div>
    </td>
  )
}

// ── Mobile district card ──────────────────────────────────────────────────────

function DistrictCard({
  d,
  displayedCommodities,
  data,
}: {
  d: DistrictRow
  displayedCommodities: string[]
  data: NonNullable<ReturnType<typeof useHeatmap>["data"]>
}) {
  const rl    = riskLabel(d.risk_score)
  const badge = RISK_BADGE[rl] ?? RISK_BADGE.Stable

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">{d.district}</p>
          <p className="text-[10px] font-mono text-slate-500">{d.region}</p>
        </div>
        <div className="text-right">
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${badge}`}>{rl}</span>
          <p className="text-[9px] font-mono text-slate-400 dark:text-slate-600 mt-0.5">{d.risk_score.toFixed(0)}</p>
        </div>
      </div>

      {/* Commodity grid — always show all */}
      <div className="grid grid-cols-2 gap-1.5">
        {displayedCommodities.map(c => {
          const cell = d.commodities[c]
          const sev  = (cell?.spike_severity ?? "nodata") as Severity
          const s    = CELL_STYLES[sev]
          const shortName = c.replace(" (shelled)", "").replace(" (vegetable)", "")
          return (
            <div key={c} className={`${s.bg} rounded p-2`}>
              <p className={`text-[9px] font-mono uppercase tracking-wide ${s.pct || "text-slate-400"}`}>{shortName}</p>
              {cell ? (
                <>
                  <p className={`text-sm font-mono font-semibold ${s.text}`}>{cell.price.toLocaleString()}</p>
                  {cell.pct_change != null && (
                    <p className={`text-[9px] font-mono ${s.pct}`}>
                      {cell.pct_change > 0 ? "+" : ""}{cell.pct_change.toFixed(0)}%
                    </p>
                  )}
                </>
              ) : (
                <p className={`text-sm font-mono ${s.text}`}>—</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

type SortMode = "price" | "risk" | "name" | "region"
type Filter   = "All" | "Critical" | "Severe" | "Moderate"

export default function HeatmapPanel() {
  const { data, loading, error } = useHeatmap()
  const [sortMode,  setSortMode ] = useState<SortMode>("price")
  const [filter,    setFilter   ] = useState<Filter>("All")
  const [activeCom, setActiveCom] = useState<string | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const { theme } = useTheme()
  const toolbarScrollRef = useRef<HTMLDivElement>(null)

  const commodities = data?.commodities ?? []

  const rows = useMemo<DistrictRow[]>(() => {
    if (!data) return []
    let list = [...data.districts]

    if (filter !== "All") {
      list = list.filter(d =>
        Object.values(d.commodities).some(c => c.spike_severity === filter)
      )
    }

    if (activeCom) {
      list = list.filter(d => d.commodities[activeCom] !== undefined)
    }

    if (sortMode === "price") {
      list.sort((a, b) => {
        const com = activeCom ?? data.commodities[0]
        const pa  = a.commodities[com]?.price ?? 0
        const pb  = b.commodities[com]?.price ?? 0
        return pb - pa
      })
    }
    if (sortMode === "risk")   list.sort((a, b) => b.risk_score - a.risk_score)
    if (sortMode === "name")   list.sort((a, b) => a.district.localeCompare(b.district))
    if (sortMode === "region") list.sort((a, b) => a.region.localeCompare(b.region) || b.risk_score - a.risk_score)

    return list
  }, [data, filter, sortMode, activeCom])

  const regions = useMemo(() => {
    if (sortMode !== "region") return null
    const map = new Map<string, DistrictRow[]>()
    rows.forEach(r => {
      if (!map.has(r.region)) map.set(r.region, [])
      map.get(r.region)!.push(r)
    })
    return map
  }, [rows, sortMode])

  const displayedCommodities = activeCom ? [activeCom] : commodities

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
        <div className="text-slate-500 dark:text-slate-400 text-sm font-mono animate-pulse p-4">
          Loading heatmap data…
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="text-red-600 dark:text-red-400 text-sm font-mono">
          Failed to load heatmap: {error}
        </div>
      </div>
    )
  }

  const s = data.summary

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden">

      {/* ── Summary cards ─────────────────────────────────────────────────── */}

      {/* Mobile: collapsed by default */}
      <div className="md:hidden flex-shrink-0 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setSummaryOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
        >
          <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Overview</span>
          <span className="flex items-center gap-2 text-[10px] font-mono">
            {!summaryOpen && (
              <span className="text-slate-400 dark:text-slate-600">
                {s.total_districts} districts · {s.critical_cells} critical
              </span>
            )}
            <span className="text-slate-400">{summaryOpen ? "▲ Hide" : "▼ Show"}</span>
          </span>
        </button>
        {summaryOpen && (
          <div className="grid grid-cols-2 gap-2 p-2 border-t border-slate-100 dark:border-slate-800/60">
            <SummaryCard label="Districts monitored" value={s.total_districts} sub="all regions" />
            <SummaryCard label="Critical cells" value={s.critical_cells} sub="district × commodity pairs" valueClass="text-red-600 dark:text-red-400" />
            <SummaryCard label="Worst commodity" value={s.worst_commodity ?? "—"} sub={`${s.worst_commodity_critical_districts} districts critical`} valueClass="text-orange-600 dark:text-orange-400" />
            <SummaryCard label="Most affected" value={s.most_affected_district ?? "—"} sub={`${s.most_affected_spike_count} commodities spiking`} valueClass="text-amber-600 dark:text-amber-400" />
          </div>
        )}
      </div>

      {/* Desktop: always visible */}
      <div className="hidden md:grid md:grid-cols-4 gap-2 p-3 flex-shrink-0">
        <SummaryCard label="Districts monitored" value={s.total_districts} sub="all regions" />
        <SummaryCard label="Critical cells" value={s.critical_cells} sub="district × commodity pairs" valueClass="text-red-600 dark:text-red-400" />
        <SummaryCard label="Worst commodity" value={s.worst_commodity ?? "—"} sub={`${s.worst_commodity_critical_districts} districts critical`} valueClass="text-orange-600 dark:text-orange-400" />
        <SummaryCard label="Most affected" value={s.most_affected_district ?? "—"} sub={`${s.most_affected_spike_count} commodities spiking`} valueClass="text-amber-600 dark:text-amber-400" />
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-800">
        {/* Row 1: Show filters + Sort (on md+, all on one line) */}
        <div className="flex items-center gap-2 px-2 sm:px-3 pt-2 pb-1 flex-wrap">
          <span className="text-slate-500 text-xs font-bold">SHOW:</span>
          {(["All", "Critical", "Severe", "Moderate"] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-full border font-mono transition-colors cursor-pointer ${
                filter === f
                  ? "bg-emerald-700 border-emerald-600 text-emerald-100"
                  : "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-400 hover:border-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {f}
            </button>
          ))}

          {/* Sort — pushed to right on md+, new row on mobile handled by flex-wrap */}
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <span className="text-slate-500 text-xs font-mono hidden sm:inline">SORT:</span>
            {(["price", "risk", "region", "name"] as SortMode[]).map(m => (
              <button
                key={m}
                onClick={() => setSortMode(m)}
                className={`text-xs px-2 py-1 rounded border font-mono transition-colors ${
                  sortMode === m
                    ? "bg-slate-200 dark:bg-slate-700 border-slate-400 dark:border-slate-500 text-slate-900 dark:text-slate-100"
                    : "border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Commodity pills — horizontally scrollable on mobile */}
        <div
          ref={toolbarScrollRef}
          className="flex items-center gap-1.5 px-2 sm:px-3 pb-2 overflow-x-auto scrollbar-none"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <button
            onClick={() => setActiveCom(null)}
            className={`text-xs px-2.5 py-1 rounded-full border font-mono transition-colors cursor-pointer flex-shrink-0 ${
              !activeCom
                ? "bg-slate-600 border-slate-500 text-white"
                : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-500"
            }`}
          >
            All commodities
          </button>
          {commodities.map(c => (
            <button
              key={c}
              onClick={() => setActiveCom(activeCom === c ? null : c)}
              className={`text-xs px-2.5 py-1 rounded-full border font-mono transition-colors cursor-pointer flex-shrink-0 ${
                activeCom === c
                  ? "bg-slate-600 border-slate-500 text-white"
                  : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 hover:border-slate-500"
              }`}
            >
              {c.replace(" (shelled)", "").replace(" (vegetable)", "")}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table (md+) / Card list (mobile) ──────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">

        {/* Mobile card view — hidden on md+ */}
        <div className="md:hidden p-2 space-y-2">
          {sortMode === "region" && regions
            ? Array.from(regions.entries()).map(([region, regionRows]) => (
                <React.Fragment key={region}>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 dark:text-slate-600 px-1 pt-2">
                    {region} region
                  </p>
                  {regionRows.map(d => (
                    <DistrictCard key={d.district} d={d} displayedCommodities={displayedCommodities} data={data} />
                  ))}
                </React.Fragment>
              ))
            : rows.map(d => (
                <DistrictCard key={d.district} d={d} displayedCommodities={displayedCommodities} data={data} />
              ))
          }
          {rows.length === 0 && (
            <p className="text-center py-12 text-slate-500 font-mono text-xs">
              No districts match the current filter
            </p>
          )}
        </div>

        {/* Desktop table view — hidden below md */}
        <table className="hidden md:table w-full border-collapse text-xs" style={{ minWidth: "600px" }}>
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="text-left text-slate-600 dark:text-slate-500 font-mono text-[10px] uppercase tracking-wide
                             px-3 py-2 w-36 sticky left-0 bg-slate-100 dark:bg-slate-900 z-20">
                District
              </th>
              <th className="text-slate-600 dark:text-slate-500 font-mono text-[12px] uppercase tracking-wide px-1 py-2 w-16">
                Risk
              </th>
              {displayedCommodities.map(c => {
                const unit = data.districts.find(d => d.commodities[c])?.commodities[c] as any
                const unitLabel = unit?.unit ?? "MWK/KG"
                return (
                  <th
                    key={c}
                    className="text-slate-600 dark:text-slate-500 font-mono text-[10px] uppercase tracking-wide
                               px-1 py-2 text-center max-w-[90px]"
                  >
                    <span className="block truncate">{c.replace(" (shelled)", "").replace(" (vegetable)", "")}</span>
                    <span className="block text-[8px] text-slate-400 dark:text-slate-600 font-normal normal-case">M{unitLabel}</span>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {sortMode === "region" && regions
              ? Array.from(regions.entries()).map(([region, regionRows]) => (
                  <React.Fragment key={region}>
                    <tr>
                      <td
                        colSpan={2 + displayedCommodities.length}
                        className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest
                                   text-slate-500 dark:text-slate-600 bg-slate-100/80 dark:bg-slate-950/50
                                   border-y border-slate-200 dark:border-slate-800"
                      >
                        {region} region
                      </td>
                    </tr>
                    {regionRows.map(d => (
                      <DistrictTableRow key={d.district} d={d} displayedCommodities={displayedCommodities} />
                    ))}
                  </React.Fragment>
                ))
              : rows.map(d => (
                  <DistrictTableRow key={d.district} d={d} displayedCommodities={displayedCommodities} />
                ))
            }

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={2 + displayedCommodities.length}
                  className="text-center py-12 text-slate-500 font-mono text-xs"
                >
                  No districts match the current filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 sm:gap-4 px-2 sm:px-3 py-2 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 flex-wrap">
        {([
          ["Critical", "bg-red-100    dark:bg-red-950/60    border-red-300    dark:border-red-800/50",    "text-red-700    dark:text-red-300"   ],
          ["Severe",   "bg-orange-100 dark:bg-orange-950/60 border-orange-300 dark:border-orange-800/50", "text-orange-700 dark:text-orange-300"],
          ["Moderate", "bg-amber-100  dark:bg-amber-950/50  border-amber-300  dark:border-amber-800/50",  "text-amber-700  dark:text-amber-300" ],
          ["Normal",   "bg-slate-100  dark:bg-slate-800/60  border-slate-300  dark:border-slate-700",     "text-slate-600  dark:text-slate-400" ],
          ["No data",  "bg-slate-50   dark:bg-slate-900     border-slate-200  dark:border-slate-800",     "text-slate-400  dark:text-slate-600" ],
        ] as [string, string, string][]).map(([label, bg, text]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm border ${bg}`} />
            <span className={`text-[10px] font-mono ${text}`}>{label}</span>
          </div>
        ))}
        <span className="hidden sm:inline ml-auto text-[10px] font-mono text-slate-400 dark:text-slate-600">
          Prices in MWK · Latest available data per district
        </span>
      </div>
    </div>
  )
}

// ── District table row (desktop) ──────────────────────────────────────────────

function DistrictTableRow({
  d,
  displayedCommodities,
}: {
  d: DistrictRow
  displayedCommodities: string[]
}) {
  const rl    = riskLabel(d.risk_score)
  const badge = RISK_BADGE[rl] ?? RISK_BADGE.Stable

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
      <td className="px-3 py-1 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-800">
        <span className="font-medium text-slate-800 dark:text-slate-200 text-xs">{d.district}</span>
        <span className="block text-[10px] text-slate-500 font-mono">{d.region}</span>
      </td>
      <td className="px-1 py-1 text-center">
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${badge}`}>
          {rl}
        </span>
        <span className="block text-[9px] text-slate-400 dark:text-slate-600 font-mono mt-0.5">
          {d.risk_score.toFixed(0)}
        </span>
      </td>
      {displayedCommodities.map(c => (
        <Cell key={c} cell={d.commodities[c]} />
      ))}
    </tr>
  )
}