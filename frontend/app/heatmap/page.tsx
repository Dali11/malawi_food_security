"use client"
import { CommodityCell, DistrictRow, useHeatmap } from "@/lib/hooks/useHeatMap"
import React, { useState, useMemo } from "react"

// ── Severity helpers ────────────────────────────────────────────────────────

type Severity = "Critical" | "Severe" | "Moderate" | "Normal" | "nodata"

const SEVERITY_RANK: Record<Severity, number> = {
  Critical: 4, Severe: 3, Moderate: 2, Normal: 1, nodata: 0,
}

const CELL_STYLES: Record<Severity, { bg: string; text: string; pct: string }> = {
  Critical: { bg: "bg-red-950/60",    text: "text-red-300",    pct: "text-red-400"    },
  Severe:   { bg: "bg-orange-950/60", text: "text-orange-300", pct: "text-orange-400" },
  Moderate: { bg: "bg-amber-950/50",  text: "text-amber-300",  pct: "text-amber-400"  },
  Normal:   { bg: "bg-slate-800/60",  text: "text-slate-300",  pct: "text-slate-500"  },
  nodata:   { bg: "bg-slate-900",     text: "text-slate-600",  pct: ""                },
}

const RISK_BADGE: Record<string, string> = {
  Critical: "bg-red-900/60 text-red-300",
  High    : "bg-orange-900/60 text-orange-300",
  Moderate: "bg-amber-900/60 text-amber-300",
  Low     : "bg-blue-900/60 text-blue-300",
  Stable  : "bg-emerald-900/60 text-emerald-300",
}

function riskLabel(score: number): string {
  if (score >= 400) return "Critical"
  if (score >= 250) return "High"
  if (score >= 100) return "Moderate"
  if (score >   0) return "Low"
  return "Stable"
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, valueClass = "text-slate-100",
}: { label: string; value: string | number; sub: string; valueClass?: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 min-w-0">
      <div className="text-slate-400 text-xs font-mono uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono truncate ${valueClass}`}>{value}</div>
      <div className="text-slate-500 text-xs mt-0.5">{sub}</div>
    </div>
  )
}

function Cell({ cell }: { cell: CommodityCell | undefined }) {
  if (!cell) {
    const s = CELL_STYLES.nodata
    return (
      <td className={`px-1 py-0.5`}>
        <div className={`${s.bg} rounded px-1 py-1.5 text-center`}>
          <span className={`block text-xs ${s.text}`}>—</span>
        </div>
      </td>
    )
  }

  const sev = (cell.spike_severity ?? "Normal") as Severity
  const s   = CELL_STYLES[sev] ?? CELL_STYLES.Normal
  const pct = cell.pct_change

  return (
    <td className="px-1 py-0.5">
      <div className={`${s.bg} rounded px-1 py-1.5 text-center`}>
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

// ── Main component ───────────────────────────────────────────────────────────

type SortMode = "price" | "risk" | "name" | "region"
type Filter   = "All" | "Critical" | "Severe" | "Moderate"

export default function HeatmapPanel() {
  const { data, loading, error } = useHeatmap()
  const [sortMode,    setSortMode   ] = useState<SortMode>("price")
  const [filter,      setFilter     ] = useState<Filter>("All")
  const [activeCom,   setActiveCom  ] = useState<string | null>(null)

  const commodities = data?.commodities ?? []

  // Filter + sort districts
  const rows = useMemo<DistrictRow[]>(() => {
    if (!data) return []
    let list = [...data.districts]

    // Filter by spike level
    if (filter !== "All") {
      list = list.filter(d =>
        Object.values(d.commodities).some(c => c.spike_severity === filter)
      )
    }

    // Filter by active commodity — show districts that HAVE data for it
    if (activeCom) {
      list = list.filter(d => d.commodities[activeCom] !== undefined)
    }

    // Sort
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

  // Group by region when sorting by region
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

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-slate-400 text-sm font-mono animate-pulse">
          Loading heatmap data…
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-red-400 text-sm font-mono">
          Failed to load heatmap: {error}
        </div>
      </div>
    )
  }

  const s = data.summary

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 flex-shrink-0">
        <SummaryCard
          label="Districts monitored"
          value={s.total_districts}
          sub="all regions"
        />
        <SummaryCard
          label="Critical cells"
          value={s.critical_cells}
          sub="district × commodity pairs"
          valueClass="text-red-400"
        />
        <SummaryCard
          label="Worst commodity"
          value={s.worst_commodity ?? "—"}
          sub={`${s.worst_commodity_critical_districts} districts critical`}
          valueClass="text-orange-400"
        />
        <SummaryCard
          label="Most affected"
          value={s.most_affected_district ?? "—"}
          sub={`${s.most_affected_spike_count} commodities spiking`}
          valueClass="text-amber-400"
        />
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 pb-2 flex-wrap flex-shrink-0 border-b border-slate-800">

        {/* Severity filter */}
        <span className="text-slate-500 text-xs font-mono">SHOW:</span>
        {(["All", "Critical", "Severe", "Moderate"] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2.5 py-1 rounded-full border font-mono transition-colors ${
              filter === f
                ? "bg-emerald-700 border-emerald-600 text-emerald-100"
                : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            {f}
          </button>
        ))}

        <div className="w-px h-4 bg-slate-700 mx-1" />

        {/* Commodity filter pills */}
        <button
          onClick={() => setActiveCom(null)}
          className={`text-xs px-2.5 py-1 rounded-full border font-mono transition-colors ${
            !activeCom
              ? "bg-slate-600 border-slate-500 text-slate-100"
              : "border-slate-700 text-slate-400 hover:border-slate-500"
          }`}
        >
          All commodities
        </button>
        {commodities.map(c => (
          <button
            key={c}
            onClick={() => setActiveCom(activeCom === c ? null : c)}
            className={`text-xs px-2.5 py-1 rounded-full border font-mono transition-colors ${
              activeCom === c
                ? "bg-slate-600 border-slate-500 text-slate-100"
                : "border-slate-700 text-slate-400 hover:border-slate-500"
            }`}
          >
            {c}
          </button>
        ))}

        {/* Sort */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-slate-500 text-xs font-mono">SORT:</span>
          {(["price", "risk", "region", "name"] as SortMode[]).map(m => (
            <button
              key={m}
              onClick={() => setSortMode(m)}
              className={`text-xs px-2 py-1 rounded border font-mono transition-colors ${
                sortMode === m
                  ? "bg-slate-700 border-slate-500 text-slate-100"
                  : "border-slate-800 text-slate-500 hover:text-slate-300"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs" style={{ minWidth: "600px" }}>
          <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800">
            <tr>
              <th className="text-left text-slate-500 font-mono text-[10px] uppercase tracking-wide
                             px-3 py-2 w-36 sticky left-0 bg-slate-900 z-20">
                District
              </th>
              <th className="text-slate-500 font-mono text-[10px] uppercase tracking-wide px-1 py-2 w-16">
                Risk
              </th>
              {displayedCommodities.map(c => {
                // Get unit from first district that has this commodity
                const unit = data.districts.find(d => d.commodities[c])?.commodities[c] as any
                const unitLabel = unit?.unit ?? "MWK/KG"
                return (
                <th
                  key={c}
                  className="text-slate-500 font-mono text-[10px] uppercase tracking-wide
                             px-1 py-2 text-center max-w-[90px]"
                >
                  <span className="block truncate">{c.replace(" (shelled)", "").replace(" (vegetable)", "")}</span>
                  <span className="block text-[8px] text-slate-600 font-normal normal-case">MWK/KG</span>
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
                                   text-slate-600 bg-slate-950/50 border-y border-slate-800"
                      >
                        {region} region
                      </td>
                    </tr>
                    {regionRows.map(d => (
                      <DistrictTableRow
                        key={d.district}
                        d={d}
                        displayedCommodities={displayedCommodities}
                      />
                    ))}
                  </React.Fragment>
                ))
              : rows.map(d => (
                  <DistrictTableRow
                    key={d.district}
                    d={d}
                    displayedCommodities={displayedCommodities}
                  />
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
      <div className="flex items-center gap-4 px-3 py-2 border-t border-slate-800 flex-shrink-0 flex-wrap">
        {([
          ["Critical", "bg-red-950/60 border-red-800/50",    "text-red-300"   ],
          ["Severe",   "bg-orange-950/60 border-orange-800/50","text-orange-300"],
          ["Moderate", "bg-amber-950/50 border-amber-800/50", "text-amber-300" ],
          ["Normal",   "bg-slate-800/60 border-slate-700",   "text-slate-400" ],
          ["No data",  "bg-slate-900 border-slate-800",      "text-slate-600" ],
        ] as [string, string, string][]).map(([label, bg, text]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm border ${bg}`} />
            <span className={`text-[10px] font-mono ${text}`}>{label}</span>
          </div>
        ))}
        <span className="ml-auto text-[10px] font-mono text-slate-600">
          Prices in MWK · Latest available data per district
        </span>
      </div>
    </div>
  )
}

// ── District row ─────────────────────────────────────────────────────────────

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
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
      <td className="px-3 py-1 sticky left-0 bg-slate-900 z-10 border-r border-slate-800">
        <span className="font-medium text-slate-200 text-xs">{d.district}</span>
        <span className="block text-[10px] text-slate-500 font-mono">{d.region}</span>
      </td>
      <td className="px-1 py-1 text-center">
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${badge}`}>
          {rl}
        </span>
        <span className="block text-[9px] text-slate-600 font-mono mt-0.5">
          {d.risk_score.toFixed(0)}
        </span>
      </td>
      {displayedCommodities.map(c => (
        <Cell key={c} cell={d.commodities[c]} />
      ))}
    </tr>
  )
}