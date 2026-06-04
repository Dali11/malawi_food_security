"use client"

/**
 * IndicatorPanel.tsx  — v2
 * Fixes:
 *  1. PSI chart shows whatever months exist, no padding
 *  2. Commodity stress uses prev-year baseline, not year-1 (avoids all-red)
 *  3. FSI chart fixed height (300px), region filter bug fixed
 *  4. Commodity selector for price vs baseline chart
 */

import { useEffect, useState, useCallback } from "react"
import {
    Chart as ChartJS,
    CategoryScale, LinearScale,
    BarElement, LineElement, PointElement,
    ArcElement, Tooltip, Legend, Filler,
} from "chart.js"
import { Bar, Line, Doughnut } from "react-chartjs-2"

import {
    getIndicatorSummary,
    getDistrictFSI,
    getPSITrend,
    getCommodityStress,
    getLeanSeasonRisk,
    getCommodityVsBaseline,
} from "@/lib/api"

import type {
    IndicatorSummary,
    DistrictFSI,
    PSIPoint,
    CommodityStress,
    LeanRisk,
    CommodityBaseline,
} from "@/lib/types"

ChartJS.register(
    CategoryScale, LinearScale,
    BarElement, LineElement, PointElement,
    ArcElement, Tooltip, Legend, Filler
)

// ── constants ─────────────────────────────────────────────────────────────────

const STRESS_COLOR: Record<string, string> = {
    Critical : "#e24b4a",
    High     : "#ef9f27",
    Moderate : "#fac775",
    Low      : "#5dcaa5",
    critical : "#e24b4a",
    elevated : "#ef9f27",
    normal   : "#5dcaa5",
}

const STRESS_BADGE: Record<string, string> = {
    Critical : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    High     : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    Moderate : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    Low      : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
}

const REGIONS = ["All regions", "Central", "Southern", "Northern"]

// Matches your real commodity list from the DB
const COMMODITIES = [
    "Maize", "Beans", "Rice", "Groundnuts (shelled)",
    "Cowpeas", "Pigeon peas", "Sugar", "Sorghum",
    "Millet", "Soybeans", "Oil (vegetable)",
    "Sweet potatoes", "Cassava",
]

const chartBase = {
    responsive          : true,
    maintainAspectRatio : false,
    plugins             : { legend: { display: false } },
}

// ── sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, valueClass = "text-slate-800 dark:text-slate-100" }: {
    label: string; value: string | number; sub: string; valueClass?: string
}) {
    return (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{label}</p>
            <p className={`text-2xl font-medium leading-none ${valueClass}`}>{value}</p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">{sub}</p>
        </div>
    )
}

function SectionCard({ title, sub, children, action }: {
    title: string; sub: string; children: React.ReactNode; action?: React.ReactNode
}) {
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex justify-between items-start mb-1">
                <div>
                    <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100">{title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">{sub}</p>
                </div>
                {action}
            </div>
            {children}
        </div>
    )
}

function Skeleton({ h = "h-44" }: { h?: string }) {
    return <div className={`${h} rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse`} />
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
      <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />
            {label}
    </span>
    )
}

// ── main component ────────────────────────────────────────────────────────────

export default function IndicatorPanel() {
    const [summary,     setSummary]     = useState<IndicatorSummary | null>(null)
    const [districts,   setDistricts]   = useState<DistrictFSI[]>([])
    const [psiTrend,    setPsiTrend]    = useState<PSIPoint[]>([])
    const [commStress,  setCommStress]  = useState<CommodityStress[]>([])
    const [leanRisk,    setLeanRisk]    = useState<LeanRisk[]>([])
    const [commBaseline, setCommBaseline] = useState<CommodityBaseline | null>(null)

    const [region,      setRegion]      = useState("All regions")
    const [commodity,   setCommodity]   = useState("Maize")
    const [loading,     setLoading]     = useState(true)
    const [distLoading, setDistLoading] = useState(false)
    const [commLoading, setCommLoading] = useState(false)
    const [error,       setError]       = useState<string | null>(null)

    // initial parallel load
    useEffect(() => {
        setLoading(true)
        Promise.all([
            getIndicatorSummary(),
            getDistrictFSI(),
            getPSITrend(),
            getCommodityStress(),
            getLeanSeasonRisk(),
            getCommodityVsBaseline("Maize"),
        ])
            .then(([s, d, p, c, l, cb]) => {
                setSummary(s)
                setDistricts(d)
                setPsiTrend(p)
                setCommStress(c)
                setLeanRisk(l)
                setCommBaseline(cb)
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }, [])

    // region filter — re-fetch districts only
    const handleRegion = useCallback(async (r: string) => {
        setRegion(r)
        setDistLoading(true)
        try {
            const regionParam = r === "All regions" ? undefined : r
            const data = await getDistrictFSI(regionParam)
            setDistricts(data)
        } catch {
            // keep existing data
        } finally {
            setDistLoading(false)
        }
    }, [])

    // commodity selector — re-fetch baseline chart only
    const handleCommodity = useCallback(async (c: string) => {
        setCommodity(c)
        setCommLoading(true)
        try {
            const data = await getCommodityVsBaseline(c)
            setCommBaseline(data)
        } catch {
            // keep existing
        } finally {
            setCommLoading(false)
        }
    }, [])

    // ── chart data ─────────────────────────────────────────────────────────────

    const psiChartData = {
        labels: psiTrend.map(p => p.month),
        datasets: [
            {
                label               : "PSI",
                data                : psiTrend.map(p => p.psi),
                borderColor         : "#378add",
                backgroundColor     : "rgba(55,138,221,0.08)",
                fill                : true,
                tension             : 0.4,
                pointRadius         : 4,
                pointBackgroundColor: "#378add",
            },
            {
                label      : "Critical threshold",
                data       : psiTrend.map(() => 75),
                borderColor: "#e24b4a",
                borderDash : [5, 4],
                borderWidth: 1.5,
                pointRadius: 0,
                fill       : false,
            },
        ],
    }

    const commChartData = {
        labels: commStress.map(c => c.commodity),
        datasets: [{
            data           : commStress.map(c => c.deviation),
            backgroundColor: commStress.map(c => STRESS_COLOR[c.stress_level] ?? "#b4b2a9"),
            borderRadius   : 3,
        }],
    }

    const fsiChartData = {
        labels: districts.map(d => d.district),
        datasets: [{
            data           : districts.map(d => d.fsi_score),
            backgroundColor: districts.map(d => STRESS_COLOR[d.stress] ?? "#b4b2a9"),
            borderRadius   : 4,
        }],
    }

    const leanChartData = {
        labels: leanRisk.map(l => l.tier),
        datasets: [{
            data           : leanRisk.map(l => l.count),
            backgroundColor: leanRisk.map(l => STRESS_COLOR[l.tier] ?? "#b4b2a9"),
            borderWidth    : 0,
            hoverOffset    : 4,
        }],
    }

    const commBaselineChartData = {
        labels: commBaseline?.series.map(s => String(s.year)) ?? [],
        datasets: [
            {
                label          : "Actual",
                data           : commBaseline?.series.map(s => s.actual) ?? [],
                backgroundColor: "#378add",
                borderRadius   : 3,
            },
            {
                label          : "Prev year baseline",
                data           : commBaseline?.series.map(s => s.baseline) ?? [],
                backgroundColor: "#b4b2a9",
                borderRadius   : 3,
            },
        ],
    }

    // ── render ─────────────────────────────────────────────────────────────────

    if (error) {
        return (
            <div className="flex items-center justify-center h-64 text-red-500 text-sm">
                Failed to load indicators: {error}
            </div>
        )
    }

    return (
        <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

            {/* metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h="h-24" />)
                ) : summary ? (
                    <>
                        <MetricCard
                            label="Food Security Index"
                            value={summary.fsi.avg_score.toFixed(1)}
                            sub={`${summary.fsi.critical_districts} critical districts`}
                            valueClass={summary.fsi.avg_score < 40 ? "text-red-600 dark:text-red-400"
                                : summary.fsi.avg_score < 60 ? "text-amber-600 dark:text-amber-400"
                                    : "text-green-600 dark:text-green-400"}
                        />
                        <MetricCard
                            label="Price Stress Index"
                            value={`${summary.price_stress_index.toFixed(0)}%`}
                            sub="districts above baseline"
                            valueClass="text-amber-600 dark:text-amber-400"
                        />
                        <MetricCard
                            label="Avg volatility"
                            value={`+${summary.avg_volatility.toFixed(0)}%`}
                            sub="vs historical baseline"
                            valueClass="text-amber-600 dark:text-amber-400"
                        />
                        <MetricCard
                            label="Critical commodities"
                            value={summary.critical_commodities}
                            sub={`of ${summary.fsi.total_districts} districts reporting`}
                            valueClass="text-red-600 dark:text-red-400"
                        />
                    </>
                ) : null}
            </div>

            {/* row 1: PSI trend + commodity stress */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <SectionCard
                    title="Price Stress Index — monthly trend"
                    sub="% of districts above seasonal baseline · last 6 months"
                >
                    <div className="flex gap-4 mb-3">
                        <LegendDot color="#e24b4a" label="Critical threshold (75%)" />
                        <LegendDot color="#378add" label="PSI" />
                    </div>
                    {loading ? <Skeleton /> : (
                        <div className="h-48 relative">
                            <Line
                                data={psiChartData}
                                options={{
                                    ...chartBase,
                                    scales: {
                                        x: {
                                            ticks: { font: { size: 11 } },
                                            grid : { color: "rgba(0,0,0,0.05)" },
                                        },
                                        y: {
                                            min: 30, max: 100,
                                            ticks: { font: { size: 11 }, callback: v => `${v}%` },
                                            grid : { color: "rgba(0,0,0,0.05)" },
                                        },
                                    },
                                }}
                            />
                        </div>
                    )}
                </SectionCard>

                <SectionCard
                    title="Commodity stress vs baseline"
                    sub="Avg price deviation vs previous year · current year"
                >
                    <div className="flex gap-4 mb-3">
                        <LegendDot color="#e24b4a" label="Critical (>40%)" />
                        <LegendDot color="#ef9f27" label="Elevated (>15%)" />
                        <LegendDot color="#5dcaa5" label="Normal" />
                    </div>
                    {loading ? <Skeleton /> : (
                        <div style={{ height: Math.max(commStress.length * 30 + 20, 160) }} className="relative">
                            <Bar
                                data={commChartData}
                                options={{
                                    ...chartBase,
                                    indexAxis: "y" as const,
                                    scales: {
                                        x: {
                                            ticks: { font: { size: 11 }, callback: v => `+${v}%` },
                                            grid : { color: "rgba(0,0,0,0.05)" },
                                        },
                                        y: {
                                            ticks: { font: { size: 11 } },
                                            grid : { display: false },
                                        },
                                    },
                                }}
                            />
                        </div>
                    )}
                </SectionCard>
            </div>

            {/* row 2: district FSI chart — fixed 300px, no scroll needed */}
            <SectionCard
                title="District Food Security Index"
                sub="Composite score · lower = higher food insecurity risk"
            >
                <div className="flex gap-2 flex-wrap mb-3">
                    {REGIONS.map(r => (
                        <button
                            key={r}
                            onClick={() => handleRegion(r)}
                            className={`text-[12px] px-3 py-1 rounded-full border transition-colors ${
                                region === r
                                    ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900"
                                    : "border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                            }`}
                        >
                            {r}
                        </button>
                    ))}
                </div>

                {!loading && districts.length > 0 && (
                    <div className="flex gap-4 mb-3 text-[12px] text-slate-500 dark:text-slate-400">
                        <span>Showing <strong className="text-slate-700 dark:text-slate-200">{districts.length}</strong> districts</span>
                        <span>Avg FSI: <strong className="text-slate-700 dark:text-slate-200">
              {(districts.reduce((s, d) => s + d.fsi_score, 0) / districts.length).toFixed(0)}
            </strong></span>
                        <span>Critical: <strong className="text-red-600">{districts.filter(d => d.stress === "Critical").length}</strong></span>
                        <span>High: <strong className="text-amber-600">{districts.filter(d => d.stress === "High").length}</strong></span>
                    </div>
                )}

                {loading || distLoading ? <Skeleton h="h-72" /> : districts.length === 0 ? (
                    <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
                        No districts found for selected region
                    </div>
                ) : (
                    /* Fixed 300px — all districts visible via Chart.js bar sizing */
                    <div className="h-72 relative">
                        <Bar
                            data={fsiChartData}
                            options={{
                                ...chartBase,
                                scales: {
                                    x: {
                                        ticks: { font: { size: 9 }, maxRotation: 45, autoSkip: false },
                                        grid : { display: false },
                                    },
                                    y: {
                                        min: 0, max: 100,
                                        ticks: { font: { size: 11 } },
                                        grid : { color: "rgba(0,0,0,0.05)" },
                                    },
                                },
                                plugins: {
                                    legend : { display: false },
                                    tooltip: { callbacks: { label: c => ` FSI: ${c.raw} · ${districts[c.dataIndex]?.stress}` } },
                                },
                            }}
                        />
                    </div>
                )}
            </SectionCard>

            {/* row 3: district table — filtered by same region as chart */}
            <SectionCard
                title="District composite indicators"
                sub="Price stress · volatility · monitoring coverage"
            >
                {loading ? <Skeleton h="h-64" /> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                            <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800">
                                {["District", "Region", "FSI score", "Stress", "Volatility", "Coverage"].map((h, i) => (
                                    <th
                                        key={h}
                                        className={`py-2 px-2 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium ${i === 0 ? "text-left" : "text-right"}`}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {districts.map(d => (
                                <tr
                                    key={d.district}
                                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                >
                                    <td className="py-2 px-2 font-medium text-slate-800 dark:text-slate-100">{d.district}</td>
                                    <td className="py-2 px-2 text-right text-slate-500 dark:text-slate-400">{d.region}</td>
                                    <td className="py-2 px-2 text-right">
                                        <span className="text-slate-700 dark:text-slate-200 mr-2">{d.fsi_score.toFixed(0)}</span>
                                        <span
                                            className="inline-block align-middle w-10 h-1.5 rounded-full"
                                            style={{ background: STRESS_COLOR[d.stress] ?? "#b4b2a9", opacity: 0.7 }}
                                        />
                                    </td>
                                    <td className="py-2 px-2 text-right">
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded ${STRESS_BADGE[d.stress] ?? ""}`}>
                        {d.stress}
                      </span>
                                    </td>
                                    <td className={`py-2 px-2 text-right font-medium ${
                                        d.volatility > 100 ? "text-red-600" : d.volatility > 30 ? "text-amber-600" : "text-green-600"
                                    }`}>
                                        {d.volatility > 0 ? "+" : ""}{d.volatility.toFixed(0)}%
                                    </td>
                                    <td className="py-2 px-2 text-right text-slate-500 dark:text-slate-400">
                                        {d.coverage.toFixed(0)}%
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            {/* row 4: lean season donut + commodity vs baseline */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <SectionCard
                    title="Lean season risk projection"
                    sub="Districts by expected risk tier · Sep–Oct"
                >
                    {loading ? <Skeleton h="h-52" /> : (
                        <>
                            <div className="h-44 relative">
                                <Doughnut data={leanChartData} options={{ ...chartBase, cutout: "65%" }} />
                            </div>
                            <div className="flex flex-wrap gap-3 mt-3">
                                {leanRisk.map(l => (
                                    <LegendDot key={l.tier} color={STRESS_COLOR[l.tier]} label={`${l.tier} (${l.count})`} />
                                ))}
                            </div>
                        </>
                    )}
                </SectionCard>

                <SectionCard
                    title="Commodity price vs baseline"
                    sub="Annual avg MWK/KG · actual vs previous year"
                >
                    {/* commodity selector */}
                    <div className="mb-3">
                        <select
                            value={commodity}
                            onChange={e => handleCommodity(e.target.value)}
                            className="text-[12px] border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        >
                            {COMMODITIES.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-4 mb-2">
                        <LegendDot color="#378add" label="Actual" />
                        <LegendDot color="#b4b2a9" label="Prev year baseline" />
                    </div>

                    {loading || commLoading ? <Skeleton h="h-44" /> : (
                        <div className="h-44 relative">
                            <Bar
                                data={commBaselineChartData}
                                options={{
                                    ...chartBase,
                                    scales: {
                                        x: {
                                            ticks: { font: { size: 11 } },
                                            grid : { display: false },
                                        },
                                        y: {
                                            ticks: {
                                                font    : { size: 11 },
                                                callback: v => Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(1)}k` : v,
                                            },
                                            grid: { color: "rgba(0,0,0,0.05)" },
                                        },
                                    },
                                    plugins: { legend: { display: false } },
                                }}
                            />
                        </div>
                    )}
                </SectionCard>

            </div>
        </div>
    )
}