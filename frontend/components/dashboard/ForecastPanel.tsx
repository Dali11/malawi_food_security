"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
    ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts"

import type { ForecastData }    from "@/lib/types"
import { FORECAST_COMMODITIES } from "@/lib/constants"
import { riskBg, riskColor }    from "@/lib/hooks/useColor"
import { getForecast }          from "@/lib/api"

interface Props {
    district : string
    onClose ?: () => void
}

function fmt(v: number): string {
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
}

// ── Fix: loose typing avoids Recharts version-specific TooltipProps mismatch ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any

function CustomTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-2.5
                    text-xs shadow-xl min-w-[160px]">
            <p className="font-semibold text-white mb-0.5">{d?.name} {d?.year}</p>
            <p className="text-slate-400 mb-1.5">{d?.season} season</p>
            <p style={{ color: riskColor(d?.risk) }} className="font-mono font-semibold">
                {d?.forecast?.toLocaleString()} MWK
            </p>
            <p className="text-slate-400 mt-0.5">
                {d?.pct > 0 ? "+" : ""}{d?.pct}% vs baseline
            </p>
            <p className="text-slate-500 mt-1 border-t border-slate-700 pt-1">
                {d?.lower?.toLocaleString()} – {d?.upper?.toLocaleString()} MWK
            </p>
        </div>
    )
}

export default function ForecastPanel({ district, onClose }: Props) {
    const [commodity, setCommodity] = useState("Maize")
    const [data, setData]           = useState<ForecastData | null>(null)
    const [loading, setLoading]     = useState(false)
    const [error, setError]         = useState("")

    const fetchForecast = useCallback(async () => {
        setLoading(true)
        setError("")
        setData(null)
        try {
            setData(await getForecast(district, commodity, 3))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error")
        } finally {
            setLoading(false)
        }
    }, [district, commodity])

    useEffect(() => { fetchForecast() }, [fetchForecast])

    const chartData = data?.forecast.map(f => ({
        name    : f.month_label.split(" ")[0],
        year    : f.month_label.split(" ")[1],
        season  : f.season.split(" ")[0],
        forecast: Math.round(f.forecast),
        lower   : Math.round(f.lower_bound),
        upper   : Math.round(f.upper_bound),
        risk    : f.risk_level,
        pct     : f.pct_vs_baseline,
    })) ?? []

    return (
        <div className="flex flex-col h-full" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3
                      border-b border-slate-700 flex-shrink-0"
                 style={{ background: "#1B3A6B" }}>
                <div>
                    <p className="text-sm font-semibold text-white">
                        Price Forecast — {district}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#A8C4E8" }}>
                        3-month outlook · MFPI
                    </p>
                </div>
                {onClose && (
                    <button onClick={onClose}
                            className="text-slate-400 hover:text-white text-base leading-none
                             bg-white/10 rounded px-2 py-1 transition-colors cursor-pointer">
                        ✕
                    </button>
                )}
            </div>

            {/* Commodity selector */}
            <div className="px-6 py-2 border-b border-slate-700/60 flex-shrink-0 bg-slate-900/20">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">
                    Commodity
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {FORECAST_COMMODITIES.map(c => (
                        <button key={c} onClick={() => setCommodity(c)}
                                className={`text-xs px-2.5 py-0.5 rounded-full border
                                transition-colors cursor-pointer ${
                                    commodity === c
                                        ? "bg-yellow-500 border-yellow-500 text-slate-900 font-semibold"
                                        : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
                                }`}>
                            {c}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">

                {loading && (
                    <div className="space-y-2.5">
                        <div className="bg-slate-800 rounded-lg animate-pulse h-12"/>
                        <div className="bg-slate-800 rounded-lg animate-pulse h-40"/>
                        <div className="grid grid-cols-3 gap-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="bg-slate-800 rounded-lg animate-pulse h-24"/>
                            ))}
                        </div>
                    </div>
                )}

                {!loading && error && (
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-3
                          text-red-400 flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5 flex-shrink-0">⚠</span>
                        <div>
                            <p className="font-semibold text-xs mb-1">Could not generate forecast</p>
                            <p className="text-red-500 text-xs">{error}</p>
                            <button onClick={fetchForecast}
                                    className="mt-2 text-xs bg-red-800/40 hover:bg-red-800/70
                                 px-2.5 py-1 rounded transition-colors">
                                Retry
                            </button>
                        </div>
                    </div>
                )}

                {!loading && data && (
                    <>
                        {/* Alert banner */}
                        <div style={{
                            background  : riskBg(data.alert_level),
                            borderLeft  : `3px solid ${riskColor(data.alert_level)}`,
                            borderRadius: "0 6px 6px 0",
                            padding     : "10px 12px",
                        }}>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span style={{
                                    background  : riskColor(data.alert_level),
                                    color       : "#fff",
                                    fontSize    : 10,
                                    fontWeight  : 600,
                                    padding     : "1px 7px",
                                    borderRadius: 3,
                                }}>
                                    {data.alert_level} alert
                                </span>
                                <span style={{ fontSize: 11, color: riskColor(data.alert_level) }}>
                                    · {data.trend} trend
                                </span>
                            </div>
                            <p style={{ fontSize: 12, color: riskColor(data.alert_level), lineHeight: 1.5 }}>
                                {data.insight}
                            </p>
                        </div>

                        {/* Chart */}
                        <div className="bg-slate-800/50 rounded-xl p-3">
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">
                                {commodity} price forecast — MWK/KG
                            </p>
                            <ResponsiveContainer width="100%" height={100}>
                                <ComposedChart
                                    data={chartData}
                                    margin={{ top: 16, right: 12, left: 0, bottom: 0 }}
                                    barCategoryGap="45%"
                                >
                                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: "rgba(255,255,255,0.55)" }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={fmt}
                                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                                        width={34}
                                    />
                                    <Tooltip
                                        content={CustomTooltip}
                                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                                    />
                                    <ReferenceLine
                                        y={data.baseline_price}
                                        stroke="#F5C842"
                                        strokeDasharray="5 3"
                                        strokeWidth={1.5}
                                        label={{
                                            value   : `baseline ${fmt(data.baseline_price)} MWK`,
                                            position: "insideTopRight",
                                            fontSize: 9,
                                            fill    : "#F5C842",
                                            dy      : -6,
                                        }}
                                    />
                                    <Bar dataKey="forecast" radius={[4, 4, 0, 0]}
                                         label={{
                                             position  : "top",
                                             fontSize  : 11,
                                             fontWeight: 700,
                                             formatter : (v: unknown) => fmt(Number(v)),
                                             fill      : "rgba(255,255,255,0.7)",
                                         }}>
                                        {chartData.map((d, i) => (
                                            <Cell key={i} fill={riskColor(d.risk)} fillOpacity={0.88}/>
                                        ))}
                                    </Bar>
                                </ComposedChart>
                            </ResponsiveContainer>

                            <div className="flex gap-4 mt-2 flex-wrap">
                                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                    <span className="inline-block w-4 h-0.5 bg-yellow-400"/>
                                    12-month baseline
                                </span>
                                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                    <span className="inline-block w-2.5 h-2.5 rounded"
                                          style={{ background: "#FCEBEB", border: "0.5px solid #F09595" }}/>
                                    80% confidence band
                                </span>
                            </div>
                        </div>

                        {/* Month cards */}
                        <div className="grid grid-cols-3 gap-2">
                            {data.forecast.map((f, i) => (
                                <div key={i} className="bg-white border border-slate-200 shadow-sm
                                dark:border-none dark:bg-slate-800 rounded-xl p-3">
                                    <p className="text-xs text-slate-500 mb-0.5">{f.month_label}</p>
                                    <p className="text-[11px] text-slate-400 mb-1.5">{f.season}</p>
                                    <p className="text-xl font-bold font-mono mb-1.5"
                                       style={{ color: riskColor(f.risk_level) }}>
                                        {f.forecast.toLocaleString()}
                                        <span className="text-[10px] font-normal text-slate-500 ml-1">MWK</span>
                                    </p>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span style={{
                                            background  : riskBg(f.risk_level),
                                            color       : riskColor(f.risk_level),
                                            fontSize    : 10,
                                            fontWeight  : 600,
                                            padding     : "1px 5px",
                                            borderRadius: 3,
                                        }}>
                                            {f.risk_level}
                                        </span>
                                        <span className="text-xs font-mono"
                                              style={{ color: riskColor(f.risk_level) }}>
                                            {f.pct_vs_baseline > 0 ? "+" : ""}{f.pct_vs_baseline}%
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400">
                                        {f.lower_bound.toLocaleString()} – {f.upper_bound.toLocaleString()} MWK
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Methodology */}
                        <div className="border-t border-slate-800 pt-2.5">
                            <p className="text-[10px] text-slate-600 leading-relaxed">
                                <span className="text-slate-500">Baseline:</span>{" "}
                                {data.baseline_price.toLocaleString()} MWK (12-month avg) ·{" "}
                                <span className="text-slate-500">Generated:</span>{" "}
                                {data.generated_at} ·{" "}
                                <span className="text-slate-500">Method:</span>{" "}
                                {data.methodology}
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}