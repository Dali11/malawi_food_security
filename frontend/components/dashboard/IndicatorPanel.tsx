"use client"

import { useEffect, useState, useCallback } from "react"
import {
    Chart as ChartJS,
    CategoryScale, LinearScale,
    BarElement, LineElement, PointElement,
    ArcElement, Tooltip, Filler,
} from "chart.js"
import { Bar, Line } from "react-chartjs-2"
import {
    getIndicatorSummary, getDistrictFSI, getPSITrend,
    getCommodityStress, getLeanSeasonRisk, getCommodityVsBaseline,
    getDistricts,
} from "@/lib/api"
import type {
    IndicatorSummary, DistrictFSI, PSITrendResponse,
    CommodityStress, LeanRisk, CommodityBaseline,
} from "@/lib/types"

ChartJS.register(
    CategoryScale, LinearScale,
    BarElement, LineElement, PointElement,
    ArcElement, Tooltip, Filler,
)

// ── constants ─────────────────────────────────────────────────────────────

const SECTIONS = [
    { id: "overview",  label: "Overview"           },
    { id: "early",     label: "Early warning"      },
    { id: "coverage",  label: "Coverage & gaps"    },
    { id: "response",  label: "Response priorities"},
] as const

type SectionId = typeof SECTIONS[number]["id"]

const STRESS_COLOR: Record<string, string> = {
    Critical: "#E24B4A", High: "#EF9F27",
    Moderate: "#FAC775", Low : "#1D9E75",
    critical: "#E24B4A", elevated: "#EF9F27", normal: "#1D9E75",
}

const REGIONS     = ["All regions", "Central", "Southern", "Northern"]
const COMMODITIES = [
    "All commodities", "Maize", "Beans", "Rice", "Groundnuts (shelled)",
    "Cowpeas", "Pigeon peas", "Sugar", "Sorghum",
    "Millet", "Soybeans", "Oil (vegetable)", "Sweet potatoes", "Cassava",
]
const CHART_COMMODITIES = COMMODITIES.slice(1)

const chartBase = {
    responsive: true, maintainAspectRatio: false,
    plugins   : { legend: { display: false } },
}

// ── helpers ───────────────────────────────────────────────────────────────

function pctColor(v: number) {
    if (v > 100) return "#A32D2D"
    if (v > 30)  return "#854F0B"
    if (v > 0)   return "#3B6D11"
    return "#185FA5"
}

function coverageLabel(pct: number) {
    if (pct === 0)  return { label: "No data",      color: "#A32D2D" }
    if (pct < 15)   return { label: "Critical gap", color: "#A32D2D" }
    if (pct < 40)   return { label: "Low",          color: "#854F0B" }
    if (pct < 70)   return { label: "Moderate",     color: "#3B6D11" }
    return               { label: "Good",          color: "#185FA5" }
}

// ── sub-components ────────────────────────────────────────────────────────

function Skeleton({ h = "h-40" }: { h?: string }) {
    return <div className={`${h} rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse`}/>
}

function KPI({ label, value, sub, color }: {
    label: string; value: string | number; sub: string; color?: string
}) {
    return (
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4">
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                {label}
            </p>
            <p className={`text-2xl font-semibold leading-none ${color ?? "text-slate-800 dark:text-slate-100"}`}>
                {value}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{sub}</p>
        </div>
    )
}

function SecHeader({ title, sub }: { title: string; sub: string }) {
    return (
        <div className="mb-4">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>
        </div>
    )
}

function Card({ children, className = "" }: {
    children: React.ReactNode; className?: string
}) {
    return (
        <div className={`bg-white dark:bg-slate-900 border border-slate-200
                     dark:border-slate-800 rounded-xl p-4 ${className}`}>
            {children}
        </div>
    )
}

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
    return (
        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: bg, color }}>
      {label}
    </span>
    )
}

function stressPill(stress: string) {
    const m: Record<string, { bg: string; color: string }> = {
        Critical: { bg: "#FCEBEB", color: "#A32D2D" },
        High    : { bg: "#FAEEDA", color: "#854F0B" },
        Moderate: { bg: "#FFF8E1", color: "#5D4037" },
        Low     : { bg: "#EAF3DE", color: "#3B6D11" },
    }
    return m[stress] ?? m.Low
}

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th className={`px-3 py-2 text-xs font-medium uppercase tracking-wide
                  border-b border-slate-200 dark:border-slate-700
                  bg-slate-50 dark:bg-slate-800/60
                  text-slate-500 dark:text-slate-400 ${right ? "text-right" : "text-left"}`}>
        {children}
    </th>
)

const TD = ({ children, right, mono, muted }: {
    children: React.ReactNode; right?: boolean; mono?: boolean; muted?: boolean
}) => (
    <td className={`px-3 py-2.5 text-xs border-b border-slate-100 dark:border-slate-800
                  ${right ? "text-right" : "text-left"}
                  ${mono  ? "font-mono tabular-nums" : ""}
                  ${muted ? "text-slate-400 dark:text-slate-600"
        : "text-slate-700 dark:text-slate-300"}`}>
        {children}
    </td>
)

// ── main ──────────────────────────────────────────────────────────────────

export default function IndicatorPanel() {
    const [section, setSection]         = useState<SectionId>("overview")
    const [summary, setSummary]         = useState<IndicatorSummary | null>(null)
    const [districts, setDistricts]     = useState<DistrictFSI[]>([])
    const [psiData, setPsiData]         = useState<PSITrendResponse | null>(null)
    const [commStress, setCommStress]   = useState<CommodityStress[]>([])
    const [leanRisk, setLeanRisk]       = useState<LeanRisk[]>([])
    const [commBase, setCommBase]       = useState<CommodityBaseline | null>(null)
    const [distNames, setDistNames]     = useState<string[]>([])

    const [region,       setRegion]       = useState("All regions")
    const [psiComm,      setPsiComm]      = useState("All commodities")
    const [psiDist,      setPsiDist]      = useState("All districts")
    const [commChartCom, setCommChartCom] = useState("Maize")

    const [loading,     setLoading]     = useState(true)
    const [distLoad,    setDistLoad]    = useState(false)
    const [psiLoad,     setPsiLoad]     = useState(false)
    const [commLoad,    setCommLoad]    = useState(false)
    const [error,       setError]       = useState<string | null>(null)

    useEffect(() => {
        Promise.all([
            getIndicatorSummary(),
            getDistrictFSI(),
            getPSITrend(),
            getCommodityStress(),
            getLeanSeasonRisk(),
            getCommodityVsBaseline("Maize"),
            getDistricts(),
        ])
            .then(([s, d, p, c, l, cb, distCol]) => {
                setSummary(s)
                setDistricts(d)
                setPsiData(p as PSITrendResponse)
                setCommStress(c)
                setLeanRisk(l)
                setCommBase(cb)
                setDistNames(
                    distCol.features
                        .map((f: { properties: { district: string } }) => f.properties.district)
                        .filter(Boolean).sort()
                )
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }, [])

    const refreshPSI = useCallback(async (comm: string, dist: string) => {
        setPsiLoad(true)
        try {
            const d = await getPSITrend(
                comm === "All commodities" ? undefined : comm,
                dist === "All districts"  ? undefined : dist,
            )
            setPsiData(d as PSITrendResponse)
        } catch {} finally { setPsiLoad(false) }
    }, [])

    const handlePsiComm = useCallback((c: string) => {
        setPsiComm(c); refreshPSI(c, psiDist)
    }, [psiDist, refreshPSI])

    const handlePsiDist = useCallback((d: string) => {
        setPsiDist(d); refreshPSI(psiComm, d)
    }, [psiComm, refreshPSI])

    const handleRegion = useCallback(async (r: string) => {
        setRegion(r); setDistLoad(true)
        try {
            setDistricts(await getDistrictFSI(r === "All regions" ? undefined : r))
        } catch {} finally { setDistLoad(false) }
    }, [])

    const handleCommChart = useCallback(async (c: string) => {
        setCommChartCom(c); setCommLoad(true)
        try {
            setCommBase(await getCommodityVsBaseline(c))
        } catch {} finally { setCommLoad(false) }
    }, [])

    // chart data
    const series = psiData?.series ?? []

    const psiChartData = {
        labels: series.map(p => p.month),
        datasets: [
            {
                label: "PSI",
                data : series.map(p => p.psi),
                borderColor: "#378ADD", backgroundColor: "rgba(55,138,221,0.07)",
                fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#378ADD",
            },
            {
                label: "Threshold",
                data : series.map(() => 75),
                borderColor: "#E24B4A", borderDash: [5, 4], borderWidth: 1.5,
                pointRadius: 0, fill: false,
            },
        ],
    }

    const commStressData = {
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

    const commBaseData = {
        labels: commBase?.series.map(s => String(s.year)) ?? [],
        datasets: [
            {
                label: "Actual",
                data : commBase?.series.map(s => s.actual) ?? [],
                backgroundColor: "#378ADD", borderRadius: 3,
            },
            {
                label: "Prev year",
                data : commBase?.series.map(s => s.baseline) ?? [],
                backgroundColor: "#b4b2a9", borderRadius: 3,
            },
        ],
    }

    const distOptions = ["All districts", ...distNames]

    // priority score for response section
    const priorityDistricts = [...districts]
        .sort((a, b) => {
            const score = (d: DistrictFSI) =>
                (100 - d.fsi_score) * 0.4 +
                (d.stress === "Critical" ? 100 : d.stress === "High" ? 75 :
                    d.stress === "Moderate" ? 40 : 10) * 0.3 +
                (100 - d.coverage) * 0.2 +
                Math.min(d.volatility, 100) * 0.1
            return score(b) - score(a)
        })
        .slice(0, 8)

    if (error) return (
        <div className="flex items-center justify-center h-64 text-red-500 text-sm">
            Failed to load indicators: {error}
        </div>
    )

    return (
        <div className="flex-1 flex flex-col overflow-hidden">

            {/* ── page header ──────────────────────────────────────────────── */}
            <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-slate-900
                      border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            Indicators
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Composite food security signals across 28 districts
                        </p>
                    </div>

                    {/* section nav */}
                    <div className="flex gap-1.5 flex-wrap">
                        {SECTIONS.map(s => (
                            <button key={s.id} onClick={() => setSection(s.id)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-full border
                                  transition-colors ${
                                        section === s.id
                                            ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100"
                                            : "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-500"
                                    }`}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── body ─────────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* ══ OVERVIEW ═══════════════════════════════════════════════ */}
                {section === "overview" && (
                    <>
                        {/* KPIs */}
                        <div className="grid gap-3"
                             style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                            {loading ? Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} h="h-24"/>
                            )) : summary ? (
                                <>
                                    <KPI label="Food Security Index"
                                         value={summary.fsi.avg_score.toFixed(1)}
                                         sub={`${summary.fsi.critical_districts} critical districts`}
                                         color={summary.fsi.avg_score < 40 ? "text-red-600 dark:text-red-400"
                                             : summary.fsi.avg_score < 60 ? "text-amber-600 dark:text-amber-400"
                                                 : "text-green-600 dark:text-green-400"}/>
                                    <KPI label="Price Stress Index"
                                         value={`${summary.price_stress_index.toFixed(0)}%`}
                                         sub="districts above seasonal baseline"
                                         color="text-amber-600 dark:text-amber-400"/>
                                    <KPI label="Avg volatility"
                                         value={`+${summary.avg_volatility.toFixed(0)}%`}
                                         sub="vs historical baseline"
                                         color="text-amber-600 dark:text-amber-400"/>
                                    <KPI label="Critical commodities"
                                         value={summary.critical_commodities}
                                         sub={`of ${summary.fsi.total_districts} districts reporting`}
                                         color="text-red-600 dark:text-red-400"/>
                                </>
                            ) : null}
                        </div>

                        {/* PSI trend */}
                        <Card>
                            <SecHeader
                                title="Price Stress Index — monthly trend"
                                sub="% of districts above seasonal baseline · last 6 months"
                            />
                            <div className="flex flex-wrap gap-3 mb-3 items-center">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-400">Commodity</span>
                                    <select value={psiComm} onChange={e => handlePsiComm(e.target.value)}
                                            className="text-xs border border-slate-200 dark:border-slate-700
                                     rounded-md px-2 py-1 bg-white dark:bg-slate-800
                                     text-slate-700 dark:text-slate-200 focus:outline-none">
                                        {COMMODITIES.map(o => <option key={o}>{o}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-400">District</span>
                                    <select value={psiDist} onChange={e => handlePsiDist(e.target.value)}
                                            className="text-xs border border-slate-200 dark:border-slate-700
                                     rounded-md px-2 py-1 bg-white dark:bg-slate-800
                                     text-slate-700 dark:text-slate-200 focus:outline-none">
                                        {distOptions.map(o => <option key={o}>{o}</option>)}
                                    </select>
                                </div>
                                <div className="ml-auto flex gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 inline-block rounded"
                          style={{ background: "#E24B4A", borderTop: "2px dashed #E24B4A" }}/>
                    Critical threshold (75%)
                  </span>
                                    <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 inline-block rounded bg-blue-500"/>
                    PSI
                  </span>
                                </div>
                            </div>
                            {loading || psiLoad ? <Skeleton h="h-44"/> : (
                                <div className="h-44">
                                    <Line data={psiChartData} options={{
                                        ...chartBase,
                                        scales: {
                                            x: { ticks: { font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.04)" } },
                                            y: {
                                                min: 0, max: 100,
                                                ticks: { font: { size: 11 }, callback: v => `${v}%` },
                                                grid: { color: "rgba(0,0,0,0.04)" },
                                            },
                                        },
                                    }}/>
                                </div>
                            )}
                        </Card>

                        {/* commodity stress + price vs baseline */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card>
                                <SecHeader
                                    title="Commodity stress vs baseline"
                                    sub="Avg price deviation vs previous year"
                                />
                                <div className="flex gap-4 mb-3 text-xs text-slate-500">
                                    {[["#E24B4A","Critical (>40%)"],["#EF9F27","Elevated (>15%)"],["#1D9E75","Normal"]].map(([c,l]) => (
                                        <span key={l} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c }}/>
                                            {l}
                    </span>
                                    ))}
                                </div>
                                {loading ? <Skeleton/> : (
                                    <div style={{ height: Math.max(commStress.length * 28 + 20, 160) }}>
                                        <Bar data={commStressData} options={{
                                            ...chartBase,
                                            indexAxis: "y" as const,
                                            scales: {
                                                x: { ticks: { font: { size: 11 }, callback: v => `${v}%` }, grid: { color: "rgba(0,0,0,0.04)" } },
                                                y: { ticks: { font: { size: 11 } }, grid: { display: false } },
                                            },
                                        }}/>
                                    </div>
                                )}
                            </Card>

                            <Card>
                                <SecHeader
                                    title="Commodity price vs baseline"
                                    sub="Annual avg MWK/KG · actual vs previous year"
                                />
                                <div className="flex flex-wrap gap-3 mb-3 items-center">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-slate-400">Commodity</span>
                                        <select value={commChartCom} onChange={e => handleCommChart(e.target.value)}
                                                className="text-xs border border-slate-200 dark:border-slate-700
                                       rounded-md px-2 py-1 bg-white dark:bg-slate-800
                                       text-slate-700 dark:text-slate-200 focus:outline-none">
                                            {CHART_COMMODITIES.map(o => <option key={o}>{o}</option>)}
                                        </select>
                                    </div>
                                    <div className="ml-auto flex gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block bg-blue-500"/>Actual
                    </span>
                                        <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block bg-slate-300"/>Prev year
                    </span>
                                    </div>
                                </div>
                                {loading || commLoad ? <Skeleton h="h-44"/> : (
                                    <div className="h-44">
                                        <Bar data={commBaseData} options={{
                                            ...chartBase,
                                            scales: {
                                                x: { ticks: { font: { size: 11 } }, grid: { display: false } },
                                                y: {
                                                    ticks: {
                                                        font: { size: 11 },
                                                        callback: v => Number(v) >= 1000
                                                            ? `${(Number(v)/1000).toFixed(1)}k` : v,
                                                    },
                                                    grid: { color: "rgba(0,0,0,0.04)" },
                                                },
                                            },
                                        }}/>
                                    </div>
                                )}
                            </Card>
                        </div>

                        {/* District FSI chart */}
                        <Card>
                            <SecHeader
                                title="District Food Security Index"
                                sub="Composite score · lower = higher food insecurity risk"
                            />
                            <div className="flex gap-2 flex-wrap mb-3">
                                {REGIONS.map(r => (
                                    <button key={r} onClick={() => handleRegion(r)}
                                            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                                                region === r
                                                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900"
                                                    : "border-slate-300 dark:border-slate-600 text-slate-500 hover:border-slate-500"
                                            }`}>
                                        {r}
                                    </button>
                                ))}
                            </div>
                            {!loading && districts.length > 0 && (
                                <div className="flex gap-4 mb-3 text-xs text-slate-500">
                                    <span>Showing <strong className="text-slate-700 dark:text-slate-200">{districts.length}</strong> districts</span>
                                    <span>Avg FSI: <strong className="text-slate-700 dark:text-slate-200">
                    {Math.round(districts.reduce((s, d) => s + d.fsi_score, 0) / districts.length)}
                  </strong></span>
                                    <span>Critical: <strong className="text-red-600">{districts.filter(d => d.stress === "Critical").length}</strong></span>
                                    <span>High: <strong className="text-amber-600">{districts.filter(d => d.stress === "High").length}</strong></span>
                                </div>
                            )}
                            {loading || distLoad ? <Skeleton h="h-56"/> : districts.length === 0 ? (
                                <div className="h-56 flex items-center justify-center text-slate-400 text-sm">
                                    No districts found
                                </div>
                            ) : (
                                <div className="h-56">
                                    <Bar data={fsiChartData} options={{
                                        ...chartBase,
                                        scales: {
                                            x: { ticks: { font: { size: 9 }, maxRotation: 45, autoSkip: false }, grid: { display: false } },
                                            y: {
                                                min: 0, max: 100,
                                                ticks: { font: { size: 11 } },
                                                grid: { color: "rgba(0,0,0,0.04)" },
                                            },
                                        },
                                        plugins: {
                                            legend : { display: false },
                                            tooltip: { callbacks: { label: c => ` FSI: ${c.raw} · ${districts[c.dataIndex]?.stress}` } },
                                        },
                                    }}/>
                                </div>
                            )}
                        </Card>

                        {/* District composite table */}
                        <Card>
                            <SecHeader
                                title="District composite indicators"
                                sub="Price stress · volatility · monitoring coverage"
                            />
                            {loading ? <Skeleton h="h-64"/> : (
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                    <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                                        <colgroup>
                                            <col style={{ width: "20%" }}/><col style={{ width: "12%" }}/>
                                            <col style={{ width: "18%" }}/><col style={{ width: "12%" }}/>
                                            <col style={{ width: "12%" }}/><col style={{ width: "26%" }}/>
                                        </colgroup>
                                        <thead>
                                        <tr>
                                            <TH>District</TH><TH>Region</TH>
                                            <TH>FSI score</TH><TH right>Stress</TH>
                                            <TH right>Volatility</TH><TH>Coverage</TH>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {districts.map(d => {
                                            const sp  = stressPill(d.stress)
                                            const cov = coverageLabel(d.coverage)
                                            return (
                                                <tr key={d.district}
                                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <TD><span className="font-medium text-slate-800 dark:text-slate-200">{d.district}</span></TD>
                                                    <TD muted>{d.region?.replace(" Region", "")}</TD>
                                                    <TD>
                                                        <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 w-6 text-right">
                                  {Math.round(d.fsi_score)}
                                </span>
                                                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                                <div className="h-1.5 rounded-full"
                                                                     style={{
                                                                         width: `${d.fsi_score}%`,
                                                                         background: STRESS_COLOR[d.stress] ?? "#b4b2a9",
                                                                     }}/>
                                                            </div>
                                                        </div>
                                                    </TD>
                                                    <TD right>
                                                        <Pill label={d.stress} bg={sp.bg} color={sp.color}/>
                                                    </TD>
                                                    <TD right mono>
                              <span style={{ color: pctColor(d.volatility) }}>
                                {d.volatility > 0 ? "+" : ""}{Math.round(d.volatility)}%
                              </span>
                                                    </TD>
                                                    <TD>
                                                        <div style={{ color: cov.color }} className="text-xs font-medium">
                                                            {cov.label}
                                                        </div>
                                                        <div className="h-1 w-full bg-slate-100 dark:bg-slate-700 rounded-full mt-1 overflow-hidden">
                                                            <div className="h-1 rounded-full"
                                                                 style={{ width: `${Math.min(d.coverage, 100)}%`, background: cov.color }}/>
                                                        </div>
                                                    </TD>
                                                </tr>
                                            )
                                        })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    </>
                )}

                {/* ══ EARLY WARNING ══════════════════════════════════════════ */}
                {section === "early" && (
                    <>
                        <SecHeader
                            title="Early warning signals"
                            sub="Districts showing rapid price acceleration or forecast deterioration"
                        />

                        {/* alert rows */}
                        <Card>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                                Rapid price acceleration
                            </p>
                            {loading ? <Skeleton h="h-40"/> : (
                                <div className="space-y-2">
                                    {districts
                                        .filter(d => d.stress === "Critical" || (d.stress === "High" && d.volatility > 15))
                                        .slice(0, 5)
                                        .map(d => {
                                            const sp = stressPill(d.stress)
                                            return (
                                                <div key={d.district}
                                                     className="flex items-start gap-3 p-3 rounded-lg border
                                        border-slate-100 dark:border-slate-800
                                        hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                                                         style={{ background: STRESS_COLOR[d.stress] }}/>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                {d.district}
                              </span>
                                                            <span className="text-xs text-slate-400">
                                · {d.region?.replace(" Region", "")}
                              </span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            FSI: {Math.round(d.fsi_score)} · Volatility: +{Math.round(d.volatility)}% · Coverage: {coverageLabel(d.coverage).label}
                                                        </p>
                                                    </div>
                                                    <Pill label={d.stress} bg={sp.bg} color={sp.color}/>
                                                </div>
                                            )
                                        })}
                                </div>
                            )}
                        </Card>

                        {/* lean season projection */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card>
                                <SecHeader
                                    title="Lean season projection"
                                    sub="Districts by expected risk tier · Sep – Oct"
                                />
                                {loading ? <Skeleton h="h-40"/> : (
                                    <>
                                        <div className="grid grid-cols-2 gap-2 mb-4">
                                            {leanRisk.map(l => {
                                                const sp = stressPill(l.tier)
                                                return (
                                                    <div key={l.tier}
                                                         className="text-center p-3 rounded-lg"
                                                         style={{ background: sp.bg }}>
                                                        <div className="text-2xl font-semibold" style={{ color: sp.color }}>
                                                            {l.count}
                                                        </div>
                                                        <div className="text-xs font-medium mt-0.5" style={{ color: sp.color }}>
                                                            {l.tier}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                        <p className="text-xs text-slate-400 dark:text-slate-600">
                                            Based on current price trajectory and historical seasonal patterns
                                        </p>
                                    </>
                                )}
                            </Card>

                            <Card>
                                <SecHeader
                                    title="Forecast deterioration"
                                    sub="Districts with highest projected price increase · next 60 days"
                                />
                                {loading ? <Skeleton h="h-40"/> : (
                                    <div className="space-y-2">
                                        {[...districts]
                                            .sort((a, b) => b.volatility - a.volatility)
                                            .slice(0, 6)
                                            .map(d => (
                                                <div key={d.district} className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500 w-24 truncate">{d.district}</span>
                                                    <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                        <div className="h-3 rounded-full transition-all duration-500"
                                                             style={{
                                                                 width: `${Math.min((d.volatility / Math.max(...districts.map(x => x.volatility))) * 100, 100)}%`,
                                                                 background: STRESS_COLOR[d.stress],
                                                             }}/>
                                                    </div>
                                                    <span className="text-xs font-mono font-medium w-10 text-right"
                                                          style={{ color: pctColor(d.volatility) }}>
                            +{Math.round(d.volatility)}%
                          </span>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </Card>
                        </div>
                    </>
                )}

                {/* ══ COVERAGE ═══════════════════════════════════════════════ */}
                {section === "coverage" && (
                    <>
                        <SecHeader
                            title="Coverage & data quality"
                            sub="Market reporting health across 28 districts"
                        />

                        <div className="grid gap-3"
                             style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                            {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h="h-20"/>) : summary && (
                                <>
                                    <KPI label="Total districts"
                                         value={summary.fsi.total_districts}
                                         sub="in monitoring system"/>
                                    <KPI label="Stressed districts"
                                         value={summary.fsi.stressed_districts}
                                         sub="risk score > 150"
                                         color="text-amber-600 dark:text-amber-400"/>
                                    <KPI label="Critical districts"
                                         value={summary.fsi.critical_districts}
                                         sub="risk score > 300"
                                         color="text-red-600 dark:text-red-400"/>
                                    <KPI label="Coverage gaps"
                                         value={districts.filter(d => d.coverage < 15).length}
                                         sub="districts < 15% coverage"
                                         color="text-red-600 dark:text-red-400"/>
                                </>
                            )}
                        </div>

                        <Card>
                            <SecHeader
                                title="Coverage by district"
                                sub="% of key commodities with recent price data"
                            />
                            {loading ? <Skeleton h="h-64"/> : (
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                    <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                                        <colgroup>
                                            <col style={{ width: "22%" }}/><col style={{ width: "12%" }}/>
                                            <col style={{ width: "12%" }}/><col style={{ width: "12%" }}/>
                                            <col style={{ width: "42%" }}/>
                                        </colgroup>
                                        <thead>
                                        <tr>
                                            <TH>District</TH><TH>Region</TH>
                                            <TH right>FSI</TH><TH right>Stress</TH>
                                            <TH>Coverage</TH>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {[...districts]
                                            .sort((a, b) => a.coverage - b.coverage)
                                            .map(d => {
                                                const sp  = stressPill(d.stress)
                                                const cov = coverageLabel(d.coverage)
                                                return (
                                                    <tr key={d.district}
                                                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                        <TD><span className="font-medium text-slate-800 dark:text-slate-200">{d.district}</span></TD>
                                                        <TD muted>{d.region?.replace(" Region", "")}</TD>
                                                        <TD right mono>{Math.round(d.fsi_score)}</TD>
                                                        <TD right>
                                                            <Pill label={d.stress} bg={sp.bg} color={sp.color}/>
                                                        </TD>
                                                        <TD>
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                                    <div className="h-1.5 rounded-full"
                                                                         style={{ width: `${Math.min(d.coverage, 100)}%`, background: cov.color }}/>
                                                                </div>
                                                                <span className="text-xs font-medium w-20 flex-shrink-0"
                                                                      style={{ color: cov.color }}>
                                    {Math.round(d.coverage)}% — {cov.label}
                                  </span>
                                                            </div>
                                                        </TD>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    </>
                )}

                {/* ══ RESPONSE PRIORITIES ════════════════════════════════════ */}
                {section === "response" && (
                    <>
                        <SecHeader
                            title="Response prioritization"
                            sub="Top districts for intervention · composite priority score"
                        />

                        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200
                            dark:border-slate-700 rounded-xl px-4 py-3 text-xs
                            text-slate-500 dark:text-slate-400 mb-2">
                            Priority score = FSI (40%) + stress level (30%) + coverage gap (20%) + volatility (10%)
                        </div>

                        {loading ? <Skeleton h="h-64"/> : (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                                    <colgroup>
                                        <col style={{ width: "5%" }}/><col style={{ width: "18%" }}/>
                                        <col style={{ width: "10%" }}/><col style={{ width: "10%" }}/>
                                        <col style={{ width: "12%" }}/><col style={{ width: "12%" }}/>
                                        <col style={{ width: "33%" }}/>
                                    </colgroup>
                                    <thead>
                                    <tr>
                                        <TH>#</TH><TH>District</TH>
                                        <TH right>FSI</TH><TH right>Stress</TH>
                                        <TH right>Volatility</TH><TH right>Coverage</TH>
                                        <TH>Priority score</TH>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {priorityDistricts.map((d, i) => {
                                        const sp    = stressPill(d.stress)
                                        const cov   = coverageLabel(d.coverage)
                                        const score = Math.round(
                                            (100 - d.fsi_score) * 0.4 +
                                            (d.stress === "Critical" ? 100 : d.stress === "High" ? 75 :
                                                d.stress === "Moderate" ? 40 : 10) * 0.3 +
                                            (100 - d.coverage) * 0.2 +
                                            Math.min(d.volatility, 100) * 0.1
                                        )
                                        return (
                                            <tr key={d.district}
                                                className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                                                    i === 0 ? "bg-red-50/30 dark:bg-red-950/10" : ""
                                                }`}>
                                                <TD>
                            <span className="text-xs font-semibold"
                                  style={{ color: i < 2 ? "#A32D2D" : i < 5 ? "#854F0B" : "#3B6D11" }}>
                              {i + 1}
                            </span>
                                                </TD>
                                                <TD>
                                                    <div className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                                                        {d.district}
                                                    </div>
                                                    <div className="text-xs text-slate-400">{d.region?.replace(" Region", "")}</div>
                                                </TD>
                                                <TD right mono>{Math.round(d.fsi_score)}</TD>
                                                <TD right>
                                                    <Pill label={d.stress} bg={sp.bg} color={sp.color}/>
                                                </TD>
                                                <TD right mono>
                            <span style={{ color: pctColor(d.volatility) }}>
                              +{Math.round(d.volatility)}%
                            </span>
                                                </TD>
                                                <TD right>
                            <span className="text-xs font-medium" style={{ color: cov.color }}>
                              {Math.round(d.coverage)}%
                            </span>
                                                </TD>
                                                <TD>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                            <div className="h-2 rounded-full transition-all duration-500"
                                                                 style={{
                                                                     width: `${score}%`,
                                                                     background: i < 2 ? "#E24B4A" : i < 5 ? "#EF9F27" : "#1D9E75",
                                                                 }}/>
                                                        </div>
                                                        <span className="text-xs font-semibold w-6 text-right"
                                                              style={{ color: i < 2 ? "#A32D2D" : i < 5 ? "#854F0B" : "#3B6D11" }}>
                                {score}
                              </span>
                                                    </div>
                                                </TD>
                                            </tr>
                                        )
                                    })}
                                    </tbody>
                                </table>
                                <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800">
                                    <p className="text-xs text-slate-400 dark:text-slate-600">
                                        Top {priorityDistricts.length} districts of 28 · sorted by composite priority score
                                    </p>
                                </div>
                            </div>
                        )}
                    </>
                )}

            </div>
        </div>
    )
}