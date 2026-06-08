"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
    getNationalSeasonBaseline,
    getCropCalendar,
}                                                    from "@/lib/api"
import type {
    NationalSeasonBaseline,
    CropCalendar,
}                                                    from "@/lib/api"
import { FORECAST_COMMODITIES }                      from "@/lib/constants"

// ── CHANGES vs old component ───────────────────────────────────────────────
// 1. Import: SeasonBaseline → NationalSeasonBaseline, getSeasonBaseline →
//    getNationalSeasonBaseline
// 2. State type: SeasonBaseline | null → NationalSeasonBaseline | null
// 3. fetchBaseline: calls getNationalSeasonBaseline(commodity)
// 4. KPI cards: baseline.districts → baseline.commodities
// 5. District table body: d.seasons[s]?.avg_price →
//    flat field (planting_baseline / harvest_baseline / etc.)
// 6. Footer note: hard-coded "4-year" → baseline.baseline_window
// 7. seasonFieldFor() helper added — maps season name to flat field key
// ──────────────────────────────────────────────────────────────────────────

const SEASONS = ["Planting", "Harvest", "Post-harvest", "Lean"] as const

const SEASON_MONTHS: Record<string, string> = {
    Planting      : "Nov – Feb",
    Harvest       : "Mar – May",
    "Post-harvest": "Jun – Aug",
    Lean          : "Sep – Oct",
}

// Maps a season label to the flat field name on SeasonBaselineDistrict
function seasonFieldFor(
    season: string
): "planting_baseline" | "harvest_baseline" | "post_harvest_baseline" | "lean_baseline" {
    switch (season) {
        case "Planting":     return "planting_baseline"
        case "Harvest":      return "harvest_baseline"
        case "Post-harvest": return "post_harvest_baseline"
        case "Lean":         return "lean_baseline"
        default:             return "planting_baseline"
    }
}

function fmt(n: number | null | undefined): string {
    if (n == null) return "—"
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString()
}

function pctPill(pct: number | null) {
    if (pct === null) return null
    if (pct > 40)  return { bg: "#FCEBEB", color: "#A32D2D" }
    if (pct > 20)  return { bg: "#FAEEDA", color: "#854F0B" }
    if (pct > 0)   return { bg: "#EAF3DE", color: "#3B6D11" }
    return { bg: "#E6F1FB", color: "#185FA5" }
}

function statusPill(status: string) {
    const map: Record<string, { bg: string; color: string }> = {
        Critical : { bg: "#FCEBEB", color: "#A32D2D" },
        Severe   : { bg: "#FAEEDA", color: "#854F0B" },
        Elevated : { bg: "#EAF3DE", color: "#3B6D11" },
        Normal   : { bg: "#EAF3DE", color: "#3B6D11" },
        "No data": { bg: "transparent", color: "#94a3b8" },
    }
    return map[status] ?? map["No data"]
}

function barColor(pct: number | null): string {
    if (pct === null) return "#e2e8f0"
    if (pct > 40) return "#E24B4A"
    if (pct > 20) return "#EF9F27"
    return "#639922"
}

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
    return (
        <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: bg, color }}>
            {label}
        </span>
    )
}

function DeviationBar({ pct, max }: { pct: number | null; max: number }) {
    if (pct === null || max === 0) return (
        <div className="h-0.5 w-full rounded-full mt-1"
             style={{ background: "#e2e8f0" }}/>
    )
    const width = Math.round((Math.abs(pct) / max) * 100)
    return (
        <div className="h-0.5 w-full rounded-full mt-1"
             style={{ background: "#e2e8f0" }}>
            <div className="h-0.5 rounded-full transition-all duration-500"
                 style={{ width: `${width}%`, background: barColor(pct) }}/>
        </div>
    )
}

function SeasonStrip({ current }: { current: string }) {
    return (
        <div className="flex items-center border border-slate-200 dark:border-slate-700
                        rounded-lg overflow-hidden mb-5 h-9">
            <div className="w-1 self-stretch bg-blue-500 flex-shrink-0"/>
            <div className="flex items-center px-4 flex-1 flex-wrap"
                 style={{ gap: "6px 24px" }}>
                {SEASONS.map(s => {
                    const active = s === current
                    return (
                        <span key={s} className="flex items-center gap-1.5">
                            <span className={`text-xs font-medium ${
                                active
                                    ? "text-blue-600 dark:text-blue-400"
                                    : "text-slate-600 dark:text-slate-400"
                            }`}>
                                {s}
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-600">
                                {SEASON_MONTHS[s]}
                            </span>
                            {active && (
                                <span className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-600
                                                 dark:text-blue-400 px-1.5 py-0.5 rounded-full border
                                                 border-blue-200 dark:border-blue-800">
                                    current
                                </span>
                            )}
                        </span>
                    )
                })}
            </div>
        </div>
    )
}

const TH = ({
                children, right, blue,
            }: {
    children: React.ReactNode
    right?: boolean
    blue?: boolean
}) => (
    <th className={`px-3 py-2 text-xs font-medium uppercase tracking-wide
                    border-b border-slate-200 dark:border-slate-700
                    bg-slate-50 dark:bg-slate-800/60 ${
        right ? "text-right" : "text-left"
    } ${blue ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"}`}>
        {children}
    </th>
)

const TD = ({
                children, right, mono, muted,
            }: {
    children: React.ReactNode
    right?: boolean
    mono?: boolean
    muted?: boolean
}) => (
    <td className={`px-3 py-3 text-xs border-b border-slate-100 dark:border-slate-800 ${
        right ? "text-right" : "text-left"
    } ${mono ? "font-mono tabular-nums" : ""} ${
        muted
            ? "text-slate-400 dark:text-slate-600"
            : "text-slate-700 dark:text-slate-300"
    }`}>
        {children}
    </td>
)

export default function SeasonPanel() {
    const [tab, setTab]                 = useState<"calendar" | "baseline">("calendar")
    const [commodity, setCommodity]     = useState("Maize")
    const [calendar, setCalendar]       = useState<CropCalendar | null>(null)

    // CHANGED: was SeasonBaseline | null, now NationalSeasonBaseline | null
    const [baseline, setBaseline]       = useState<NationalSeasonBaseline | null>(null)

    const [loadingCal, setLoadingCal]   = useState(true)
    const [loadingBase, setLoadingBase] = useState(false)
    const [error, setError]             = useState("")

    useEffect(() => {
        getCropCalendar()
            .then(setCalendar)
            .catch(e => setError(e.message))
            .finally(() => setLoadingCal(false))
    }, [])

    const fetchBaseline = useCallback(() => {
        setLoadingBase(true)
        setBaseline(null)
        // CHANGED: getNationalSeasonBaseline(commodity) — no longer passes commodity
        // as a filter (returns all commodities, commodity pill filters client-side)
        // OR pass commodity to filter server-side — either works.
        // Passing it server-side is faster for large datasets:
        getNationalSeasonBaseline(commodity)
            .then(setBaseline)
            .catch(e => setError(e.message))
            .finally(() => setLoadingBase(false))
    }, [commodity])

    useEffect(() => {
        if (tab === "baseline") fetchBaseline()
    }, [tab, fetchBaseline])

    const currentSeason = calendar?.current_season
        ?? baseline?.current_season
        ?? "Post-harvest"

    // CHANGED: baseline.districts → baseline.commodities
    const rows = baseline?.commodities ?? []

    const aboveBaseline = rows.filter(
        d => (d.pct_vs_baseline ?? 0) > 0
    ).length

    const reporting = rows.filter(d => d.current_price != null).length

    const avgDev = (() => {
        if (!rows.length) return null
        const valid = rows.filter(d => d.pct_vs_baseline !== null)
        if (!valid.length) return null
        return Math.round(
            valid.reduce((s, d) => s + (d.pct_vs_baseline ?? 0), 0) / valid.length
        )
    })()

    const maxPct = rows.length
        ? Math.max(
            ...rows.map(d => Math.abs(d.pct_vs_baseline ?? 0)).filter(v => v > 0),
            1
        )
        : 1

    const Skeleton = ({ rows: n = 6 }: { rows?: number }) => (
        <div className="space-y-2">
            {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg animate-pulse
                                        bg-slate-100 dark:bg-slate-800"/>
            ))}
        </div>
    )

    return (
        <div className="flex-1 flex flex-col overflow-hidden">

            {/* ── header ──────────────────────────────────────────────────── */}
            <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-slate-900
                            border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            Season baseline
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {calendar?.current_month ?? "—"}
                            &nbsp;·&nbsp;
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                                {currentSeason} season
                            </span>
                            &nbsp;·&nbsp;
                            {SEASON_MONTHS[currentSeason]}
                        </p>
                    </div>

                    <div className="flex flex-shrink-0 border border-slate-200
                                    dark:border-slate-700 rounded-lg overflow-hidden">
                        {(["calendar", "baseline"] as const).map((t, i) => (
                            <button key={t} onClick={() => setTab(t)}
                                    className={`px-4 py-1.5 text-xs font-medium transition-colors
                                                capitalize ${
                                        i > 0
                                            ? "border-l border-slate-200 dark:border-slate-700"
                                            : ""
                                    } ${
                                        tab === t
                                            ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                                            : "bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    }`}>
                                {t === "calendar" ? "Crop calendar" : "District baseline"}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── body ────────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-600
                                    bg-red-50 dark:bg-red-950/20 border border-red-200
                                    dark:border-red-800 flex items-center justify-between">
                        {error}
                        <button onClick={() => setError("")}
                                className="text-xs underline ml-4 flex-shrink-0">
                            Dismiss
                        </button>
                    </div>
                )}

                <SeasonStrip current={currentSeason} />

                {/* ── CROP CALENDAR ─────────────────────────────────────── */}
                {tab === "calendar" && (
                    loadingCal ? <Skeleton /> : calendar && (
                        <>
                            <div className="rounded-xl border border-slate-200
                                            dark:border-slate-700 overflow-hidden">
                                <table className="w-full border-collapse"
                                       style={{ tableLayout: "fixed" }}>
                                    <colgroup>
                                        <col style={{ width: "22%" }}/>
                                        <col style={{ width: "12%" }}/>
                                        <col style={{ width: "12%" }}/>
                                        <col style={{ width: "12%" }}/>
                                        <col style={{ width: "12%" }}/>
                                        <col style={{ width: "12%" }}/>
                                        <col style={{ width: "18%" }}/>
                                    </colgroup>
                                    <thead>
                                    <tr>
                                        <TH>Commodity</TH>
                                        {SEASONS.map(s => (
                                            <TH key={s} right blue={s === currentSeason}>
                                                {s === "Post-harvest" ? "Post-harv." : s}
                                            </TH>
                                        ))}
                                        <TH right>vs baseline</TH>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {calendar.commodities.map((c, i) => {
                                        const sp = statusPill(c.status)
                                        const pp = pctPill(c.pct_vs_baseline)
                                        return (
                                            <tr key={i}
                                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40
                                                               transition-colors">
                                                <TD>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-medium text-slate-800
                                                                             dark:text-slate-200 text-xs">
                                                                {c.commodity}
                                                            </span>
                                                        <Pill label={c.status} bg={sp.bg} color={sp.color}/>
                                                    </div>
                                                </TD>
                                                {SEASONS.map(s => (
                                                    <TD key={s} right mono muted={s !== currentSeason}>
                                                            <span className={
                                                                s === currentSeason
                                                                    ? "text-blue-600 dark:text-blue-400 font-medium"
                                                                    : ""
                                                            }>
                                                                {fmt(c.seasons[s])}
                                                            </span>
                                                    </TD>
                                                ))}
                                                <TD right>
                                                    {pp && c.pct_vs_baseline !== null ? (
                                                        <Pill
                                                            label={`${c.pct_vs_baseline > 0 ? "+" : ""}${c.pct_vs_baseline}%`}
                                                            bg={pp.bg}
                                                            color={pp.color}
                                                        />
                                                    ) : (
                                                        <span className="text-slate-300 dark:text-slate-600">—</span>
                                                    )}
                                                </TD>
                                            </tr>
                                        )
                                    })}
                                    </tbody>
                                </table>
                            </div>
                            {/* CHANGED: hard-coded "4-year" → dynamic from API */}
                            <p className="mt-3 text-xs text-slate-400 dark:text-slate-600">
                                Baseline = {baseline?.baseline_window ?? "2023–2025 (post-harvest: 2022–2025 fallback)"}
                                &nbsp;·&nbsp; Prices in MWK/KG
                            </p>
                        </>
                    )
                )}

                {/* ── DISTRICT BASELINE ─────────────────────────────────── */}
                {tab === "baseline" && (
                    <div className="space-y-4">

                        {/* commodity pills */}
                        <div className="flex items-center gap-2 mt-2 mb-2 flex-wrap">
                            <span className="text-xs text-slate-400 dark:text-slate-600
                                             uppercase tracking-widest">
                                Commodity
                            </span>
                            {FORECAST_COMMODITIES.map(c => (
                                <button key={c} onClick={() => setCommodity(c)}
                                        className={`text-xs px-3 py-1 rounded-full border
                                                    transition-colors ${
                                            commodity === c
                                                ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100"
                                                : "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-500"
                                        }`}>
                                    {c}
                                </button>
                            ))}
                        </div>

                        {/* KPI cards — CHANGED: baseline.districts → rows */}
                        {baseline && (
                            <div className="grid gap-3 mb-2"
                                 style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                                {[
                                    {
                                        label: "Season",
                                        value: baseline.current_season,
                                        cls  : "text-blue-600 dark:text-blue-400",
                                        size : "text-base",
                                    },
                                    {
                                        label: "Reporting",
                                        value: `${reporting} / ${rows.length}`,
                                        cls  : "text-slate-800 dark:text-slate-200",
                                        size : "text-xl",
                                    },
                                    {
                                        label: "Above baseline",
                                        value: `${aboveBaseline} commodities`,
                                        cls  : "text-red-600 dark:text-red-400",
                                        size : "text-xl",
                                    },
                                    {
                                        label: "Avg deviation",
                                        value: avgDev !== null
                                            ? `${avgDev > 0 ? "+" : ""}${avgDev}%`
                                            : "—",
                                        cls: avgDev && avgDev > 20
                                            ? "text-amber-600 dark:text-amber-400"
                                            : "text-slate-800 dark:text-slate-200",
                                        size: "text-xl",
                                    },
                                ].map(card => (
                                    <div key={card.label}
                                         className="bg-slate-50 dark:bg-slate-800/60 rounded-xl
                                                     p-4 min-h-[80px]">
                                        <p className="text-xs text-slate-400 dark:text-slate-500
                                                       uppercase tracking-wider mb-1.5">
                                            {card.label}
                                        </p>
                                        <p className={`font-semibold ${card.size} ${card.cls}`}>
                                            {card.value}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {loadingBase && <Skeleton rows={8}/>}

                        {!loadingBase && baseline && (
                            <div className="rounded-xl border border-slate-200
                                            dark:border-slate-700 overflow-hidden">
                                <table className="w-full border-collapse"
                                       style={{ tableLayout: "fixed" }}>
                                    <colgroup>
                                        <col style={{ width: "20%" }}/>
                                        <col style={{ width: "10%" }}/>
                                        <col style={{ width: "10%" }}/>
                                        <col style={{ width: "10%" }}/>
                                        <col style={{ width: "10%" }}/>
                                        <col style={{ width: "10%" }}/>
                                        <col style={{ width: "15%" }}/>
                                    </colgroup>
                                    <thead>
                                    <tr>
                                        {/* CHANGED: "District" → "Commodity"
                                                This tab now shows commodities, not districts.
                                                District baseline lives at /district/:name */}
                                        <TH>Commodity</TH>
                                        {SEASONS.map(s => (
                                            <TH key={s} right blue={s === baseline.current_season}>
                                                {s === "Post-harvest" ? "Post-harv." : s}
                                            </TH>
                                        ))}
                                        <TH right>Current</TH>
                                        <TH right>vs baseline</TH>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {/* CHANGED: baseline.districts → rows
                                            CHANGED: d.seasons[s]?.avg_price →
                                                     d[seasonFieldFor(s)] (flat field) */}
                                    {rows.map((d, i) => {
                                        const pp = pctPill(d.pct_vs_baseline)
                                        return (
                                            <tr key={i}
                                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40
                                                               transition-colors">
                                                <TD>
                                                    <div className="font-medium text-slate-800
                                                                        dark:text-slate-200 text-xs">
                                                        {d.commodity}
                                                    </div>
                                                    <DeviationBar pct={d.pct_vs_baseline} max={maxPct}/>
                                                </TD>
                                                {/* CHANGED: reads flat fields via seasonFieldFor() */}
                                                {SEASONS.map(s => (
                                                    <TD key={s} right mono
                                                        muted={s !== baseline.current_season}>
                                                            <span className={
                                                                s === baseline.current_season
                                                                    ? "text-blue-600 dark:text-blue-400 font-medium"
                                                                    : ""
                                                            }>
                                                                {fmt(d[seasonFieldFor(s)])}
                                                            </span>
                                                    </TD>
                                                ))}
                                                <TD right mono>
                                                        <span className="font-medium text-slate-800
                                                                         dark:text-slate-200">
                                                            {fmt(d.current_price)}
                                                        </span>
                                                </TD>
                                                <TD right>
                                                    {pp && d.pct_vs_baseline !== null ? (
                                                        <Pill
                                                            label={`${d.pct_vs_baseline > 0 ? "+" : ""}${d.pct_vs_baseline}%`}
                                                            bg={pp.bg}
                                                            color={pp.color}
                                                        />
                                                    ) : (
                                                        <span className="text-slate-300 dark:text-slate-600">—</span>
                                                    )}
                                                </TD>
                                            </tr>
                                        )
                                    })}
                                    </tbody>
                                </table>
                                <div className="px-4 py-2.5 border-t border-slate-100
                                                dark:border-slate-800">
                                    {/* CHANGED: dynamic baseline_window from API */}
                                    <p className="text-xs text-slate-400 dark:text-slate-600">
                                        Baseline = {baseline.baseline_window}
                                        &nbsp;·&nbsp; Sorted by deviation from seasonal norm
                                        &nbsp;·&nbsp; MWK/KG
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}