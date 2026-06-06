"use client"

/**
 * ReportsPanel.tsx
 * Full report builder — left config panel + right live preview.
 * Generates district situation reports (PDF + Excel) with:
 *   - Date range / Year / Month+Year filter
 *   - Commodity filter
 *   - Section toggles (narrative, prices, spikes, indicators, forecast, markets, gaps)
 *   - Gemini-powered narrative preview
 */

import { useState, useCallback, useEffect } from "react"
import {
    FileText, Sheet, ChevronDown, Loader2,
    BarChart2, TrendingUp, AlertTriangle, MapPin,
    Calendar, Package, Settings2, Eye,
} from "lucide-react"
import { DISTRICTS, API } from "@/lib/constants"

// ── types ─────────────────────────────────────────────────────────────────────

type ReportType   = "district" | "national" | "commodity"
type DateMode     = "range" | "year" | "month_year"
type ExportFormat = "pdf" | "excel"

interface Sections {
    narrative  : boolean
    prices     : boolean
    spikes     : boolean
    indicators : boolean
    forecast   : boolean
    markets    : boolean
    gaps       : boolean
}

interface Config {
    report_type  : ReportType
    district     : string
    date_mode    : DateMode
    date_from    : string
    date_to      : string
    year         : string
    month        : string
    month_year   : string
    commodity    : string
    sections     : Sections
}

interface PreviewData {
    district     : string
    region       : string
    risk_score   : number
    risk_tier    : string
    national_rank: number
    narrative    : string
    source       : string
    generated_at : string
    paragraphs   : Record<string, string>
}

// ── constants ─────────────────────────────────────────────────────────────────

const COMMODITIES = [
    "All commodities", "Maize", "Beans", "Rice",
    "Groundnuts (shelled)", "Cowpeas", "Pigeon peas",
    "Sugar", "Sorghum", "Millet", "Soybeans",
    "Oil (vegetable)", "Sweet potatoes", "Cassava",
]

const YEARS  = ["2020","2021","2022","2023","2024","2025","2026"]
const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
]

const RISK_COLOR: Record<string, string> = {
    critical : "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800",
    high     : "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800",
    moderate : "text-yellow-700 bg-yellow-50 border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-800",
    low      : "text-green-700 bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800",
    stable   : "text-slate-600 bg-slate-50 border-slate-200",
}

const SECTION_META = [
    { key: "narrative",  label: "Situation narrative",   icon: FileText,      desc: "AI-generated district analysis" },
    { key: "prices",     label: "Commodity prices",      icon: BarChart2,     desc: "Avg prices by commodity" },
    { key: "spikes",     label: "Spike events",          icon: AlertTriangle, desc: "Price spike event table" },
    { key: "indicators", label: "FSI & indicators",      icon: TrendingUp,    desc: "Food Security Index, PSI, volatility" },
    { key: "forecast",   label: "3-month forecast",      icon: TrendingUp,    desc: "Price outlook (Gemini-powered)" },
    { key: "markets",    label: "Market coverage",       icon: MapPin,        desc: "Monitored markets in district" },
    { key: "gaps",       label: "Monitoring gaps",       icon: Settings2,     desc: "Coverage gaps and risk classification" },
]

// ── sub-components ────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[10px] uppercase tracking-widest font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            {children}
        </p>
    )
}

function Select({
                    value, onChange, options, placeholder,
                }: {
    value: string; onChange: (v: string) => void
    options: string[]; placeholder?: string
}) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full text-[12px] border border-slate-200 dark:border-slate-700
                   rounded-lg px-3 py-2 pr-8 bg-white dark:bg-slate-800
                   text-slate-700 dark:text-slate-200
                   focus:outline-none focus:ring-1 focus:ring-slate-400
                   appearance-none"
            >
                {placeholder && <option value="">{placeholder}</option>}
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2
                                        text-slate-400 pointer-events-none" />
        </div>
    )
}

function Toggle({
                    checked, onChange, label, desc, icon: Icon,
                }: {
    checked: boolean; onChange: (v: boolean) => void
    label: string; desc: string; icon: React.ElementType
}) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left
                  transition-all ${
                checked
                    ? "border-slate-800 bg-slate-800 dark:border-slate-200 dark:bg-slate-700"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
        >
            <Icon size={14} className={checked ? "text-white dark:text-slate-200" : "text-slate-400"} />
            <div className="flex-1 min-w-0">
                <p className={`text-[12px] font-medium leading-tight ${
                    checked ? "text-white dark:text-slate-100" : "text-slate-700 dark:text-slate-200"
                }`}>{label}</p>
                <p className={`text-[10px] leading-tight mt-0.5 ${
                    checked ? "text-slate-300" : "text-slate-400"
                }`}>{desc}</p>
            </div>
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                checked ? "bg-emerald-500 border-emerald-500" : "border-slate-300 dark:border-slate-600"
            }`}>
                {checked && <span className="text-white text-[10px] leading-none">✓</span>}
            </div>
        </button>
    )
}

function ExportBtn({
                       format, onClick, loading, disabled,
                   }: {
    format: ExportFormat; onClick: () => void
    loading: boolean; disabled: boolean
}) {
    const isPdf = format === "pdf"
    return (
        <button
            onClick={onClick}
            disabled={disabled || loading}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold
                  transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isPdf
                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
        >
            {loading
                ? <Loader2 size={14} className="animate-spin" />
                : isPdf ? <FileText size={14} /> : <Sheet size={14} />
            }
            {loading ? "Generating…" : isPdf ? "Export PDF" : "Export Excel"}
        </button>
    )
}

// ── main component ────────────────────────────────────────────────────────────

export default function ReportsPanel() {
    const [config, setConfig] = useState<Config>({
        report_type : "district",
        district    : "Machinga",
        date_mode   : "range",
        date_from   : "2020-01-01",
        date_to     : new Date().toISOString().slice(0, 10),
        year        : "2026",
        month       : "June",
        month_year  : "2026",
        commodity   : "All commodities",
        sections    : {
            narrative  : true,
            prices     : true,
            spikes     : true,
            indicators : true,
            forecast   : false,
            markets    : true,
            gaps       : false,
        },
    })

    const [preview,      setPreview]      = useState<PreviewData | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewError,   setPreviewError]   = useState<string | null>(null)
    const [pdfLoading,   setPdfLoading]   = useState(false)
    const [xlsxLoading,  setXlsxLoading]  = useState(false)

    const set = useCallback(<K extends keyof Config>(key: K, val: Config[K]) => {
        setConfig(prev => ({ ...prev, [key]: val }))
    }, [])

    const setSection = useCallback((key: keyof Sections, val: boolean) => {
        setConfig(prev => ({
            ...prev,
            sections: { ...prev.sections, [key]: val },
        }))
    }, [])

    // ── load narrative preview ──────────────────────────────────────────────────
    const loadPreview = useCallback(async () => {
        if (!config.district) return
        setPreviewLoading(true)
        setPreviewError(null)
        try {
            const res = await fetch(
                `${API}/api/narrative/${encodeURIComponent(config.district)}`
            )
            if (!res.ok) throw new Error(`${res.status}`)
            const data = await res.json()
            setPreview(data)
        } catch (e) {
            setPreviewError(e instanceof Error ? e.message : "Failed to load preview")
        } finally {
            setPreviewLoading(false)
        }
    }, [config.district])

    useEffect(() => { loadPreview() }, [loadPreview])

    // ── build query params ──────────────────────────────────────────────────────
    function buildParams(): URLSearchParams {
        const p = new URLSearchParams()

        // date
        if (config.date_mode === "range") {
            if (config.date_from) p.set("date_from", config.date_from)
            if (config.date_to)   p.set("date_to",   config.date_to)
        } else if (config.date_mode === "year") {
            p.set("year", config.year)
        } else {
            const mo = (MONTHS.indexOf(config.month) + 1).toString().padStart(2, "0")
            p.set("date_from", `${config.month_year}-${mo}-01`)
            p.set("date_to",   `${config.month_year}-${mo}-31`)
        }

        // commodity
        if (config.commodity !== "All commodities")
            p.set("commodity", config.commodity)

        // sections
        Object.entries(config.sections).forEach(([k, v]) => {
            if (v) p.append("sections", k)
        })

        return p
    }

    // ── export handlers ─────────────────────────────────────────────────────────
    const exportPDF = async () => {
        setPdfLoading(true)
        try {
            const params = buildParams()
            const url    = config.report_type === "district"
                ? `${API}/api/reports/district/${encodeURIComponent(config.district)}?${params}`
                : `${API}/api/reports/generate?${params}`
            const res    = await fetch(url)
            if (!res.ok) throw new Error(`Server error ${res.status}`)
            const blob   = await res.blob()
            const link   = document.createElement("a")
            link.href    = URL.createObjectURL(blob)
            link.download = `report_${config.district.toLowerCase().replace(/ /g,"_")}_${new Date().toISOString().slice(0,10)}.pdf`
            link.click()
            URL.revokeObjectURL(link.href)
        } catch (e) {
            alert("PDF export failed: " + (e instanceof Error ? e.message : "Unknown"))
        } finally { setPdfLoading(false) }
    }

    const exportExcel = async () => {
        setXlsxLoading(true)
        try {
            const params = buildParams()
            const url    = config.report_type === "district"
                ? `${API}/api/export/district/${encodeURIComponent(config.district)}?${params}`
                : `${API}/api/export/excel?${params}`
            const res    = await fetch(url)
            if (!res.ok) throw new Error(`Server error ${res.status}`)
            const blob   = await res.blob()
            const link   = document.createElement("a")
            link.href    = URL.createObjectURL(blob)
            link.download = `report_${config.district.toLowerCase().replace(/ /g,"_")}_${new Date().toISOString().slice(0,10)}.xlsx`
            link.click()
            URL.revokeObjectURL(link.href)
        } catch (e) {
            alert("Excel export failed: " + (e instanceof Error ? e.message : "Unknown"))
        } finally { setXlsxLoading(false) }
    }

    // ── section count ───────────────────────────────────────────────────────────
    const sectionCount = Object.values(config.sections).filter(Boolean).length

    // ── render ──────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col md:flex-row h-full min-h-screen">

            {/* ── LEFT: configurator ──────────────────────────────────────────────── */}
            <div className="w-full md:w-80 flex-shrink-0 border-r border-slate-200
                      dark:border-slate-800 bg-slate-50 dark:bg-slate-900
                      overflow-y-auto">

                {/* header */}
                <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-0.5">
                        <FileText size={16} className="text-slate-700 dark:text-slate-300" />
                        <h2 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                            Report Builder
                        </h2>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Configure your district situation report
                    </p>
                </div>

                <div className="px-4 py-4 space-y-5">

                    {/* report type */}
                    <div>
                        <Label>Report type</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                            {(["district", "national"] as ReportType[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => set("report_type", t)}
                                    className={`text-[12px] py-2 rounded-lg border font-medium transition-all capitalize ${
                                        config.report_type === t
                                            ? "bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800 dark:border-slate-100"
                                            : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800"
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* district selector */}
                    {config.report_type === "district" && (
                        <div>
                            <Label>District</Label>
                            <Select
                                value={config.district}
                                onChange={v => set("district", v)}
                                options={DISTRICTS}
                            />
                        </div>
                    )}

                    {/* date filter */}
                    <div>
                        <Label>Date filter</Label>
                        <div className="flex gap-1 mb-2">
                            {(["range","year","month_year"] as DateMode[]).map(m => (
                                <button
                                    key={m}
                                    onClick={() => set("date_mode", m)}
                                    className={`flex-1 text-[11px] py-1.5 rounded-md border transition-all ${
                                        config.date_mode === m
                                            ? "bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800"
                                            : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white dark:hover:bg-slate-800"
                                    }`}
                                >
                                    {m === "range" ? "Range" : m === "year" ? "Year" : "Month"}
                                </button>
                            ))}
                        </div>

                        {config.date_mode === "range" && (
                            <div className="space-y-2">
                                <div>
                                    <p className="text-[10px] text-slate-400 mb-1">From</p>
                                    <input
                                        type="date" value={config.date_from}
                                        onChange={e => set("date_from", e.target.value)}
                                        className="w-full text-[12px] border border-slate-200 dark:border-slate-700
                               rounded-lg px-3 py-2 bg-white dark:bg-slate-800
                               text-slate-700 dark:text-slate-200 focus:outline-none
                               focus:ring-1 focus:ring-slate-400"
                                    />
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-400 mb-1">To</p>
                                    <input
                                        type="date" value={config.date_to}
                                        onChange={e => set("date_to", e.target.value)}
                                        className="w-full text-[12px] border border-slate-200 dark:border-slate-700
                               rounded-lg px-3 py-2 bg-white dark:bg-slate-800
                               text-slate-700 dark:text-slate-200 focus:outline-none
                               focus:ring-1 focus:ring-slate-400"
                                    />
                                </div>
                            </div>
                        )}

                        {config.date_mode === "year" && (
                            <Select
                                value={config.year}
                                onChange={v => set("year", v)}
                                options={YEARS}
                            />
                        )}

                        {config.date_mode === "month_year" && (
                            <div className="grid grid-cols-2 gap-2">
                                <Select
                                    value={config.month}
                                    onChange={v => set("month", v)}
                                    options={MONTHS}
                                />
                                <Select
                                    value={config.month_year}
                                    onChange={v => set("month_year", v)}
                                    options={YEARS}
                                />
                            </div>
                        )}
                    </div>

                    {/* commodity */}
                    <div>
                        <Label>Commodity</Label>
                        <Select
                            value={config.commodity}
                            onChange={v => set("commodity", v)}
                            options={COMMODITIES}
                        />
                    </div>

                    {/* sections */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label>Sections to include</Label>
                            <span className="text-[10px] text-slate-400">{sectionCount} selected</span>
                        </div>
                        <div className="space-y-1.5">
                            {SECTION_META.map(s => (
                                <Toggle
                                    key={s.key}
                                    checked={config.sections[s.key as keyof Sections]}
                                    onChange={v => setSection(s.key as keyof Sections, v)}
                                    label={s.label}
                                    desc={s.desc}
                                    icon={s.icon}
                                />
                            ))}
                        </div>
                    </div>

                    {/* export buttons */}
                    <div className="pt-2 space-y-2">
                        <ExportBtn
                            format="pdf" onClick={exportPDF}
                            loading={pdfLoading}
                            disabled={config.report_type === "district" && !config.district}
                        />
                        <ExportBtn
                            format="excel" onClick={exportExcel}
                            loading={xlsxLoading}
                            disabled={config.report_type === "district" && !config.district}
                        />
                    </div>
                </div>
            </div>

            {/* ── RIGHT: live preview ──────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-950 p-4 md:p-6">

                {/* preview header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Eye size={16} className="text-slate-500" />
                        <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                            Report Preview
                        </h3>
                    </div>
                    <button
                        onClick={loadPreview}
                        disabled={previewLoading}
                        className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300
                       flex items-center gap-1 transition-colors"
                    >
                        {previewLoading
                            ? <Loader2 size={11} className="animate-spin" />
                            : "↻"
                        }
                        Refresh preview
                    </button>
                </div>

                {previewLoading && (
                    <div className="space-y-3">
                        {[1,2,3,4].map(i => (
                            <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                        ))}
                    </div>
                )}

                {previewError && !previewLoading && (
                    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800
                          rounded-xl p-4 text-red-600 dark:text-red-400 text-sm">
                        Failed to load preview: {previewError}
                    </div>
                )}

                {preview && !previewLoading && (
                    <div className="space-y-4 max-w-3xl">

                        {/* district banner */}
                        <div className="bg-slate-900 dark:bg-slate-800 rounded-xl p-5
                            border-l-4 border-yellow-400">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">
                                        District Situation Report
                                    </p>
                                    <h1 className="text-xl font-bold text-white mb-0.5">{preview.district}</h1>
                                    <p className="text-[12px] text-slate-400">{preview.region} Region · Malawi</p>
                                </div>
                                <div className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border capitalize ${
                                    RISK_COLOR[preview.risk_tier] ?? RISK_COLOR.stable
                                }`}>
                                    {preview.risk_tier} risk
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mt-4">
                                {[
                                    { label: "Risk score",      value: preview.risk_score },
                                    { label: "National rank",   value: `#${preview.national_rank}` },
                                    { label: "Generated",       value: preview.generated_at.split(" ").slice(0,3).join(" ") },
                                ].map(m => (
                                    <div key={m.label} className="bg-white/5 rounded-lg px-3 py-2">
                                        <p className="text-[10px] text-slate-400 mb-0.5">{m.label}</p>
                                        <p className="text-[14px] font-semibold text-white">{m.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* sections that will be included */}
                        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4
                            border border-slate-200 dark:border-slate-800">
                            <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-2">
                                Sections included in export ({sectionCount})
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {SECTION_META.filter(s => config.sections[s.key as keyof Sections]).map(s => (
                                    <span key={s.key}
                                          className="text-[11px] px-2 py-0.5 rounded-full
                                   bg-slate-800 dark:bg-slate-100
                                   text-white dark:text-slate-900 font-medium">
                    {s.label}
                  </span>
                                ))}
                            </div>
                        </div>

                        {/* date + commodity context */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3
                              border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Calendar size={12} className="text-slate-400" />
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Period</p>
                                </div>
                                <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">
                                    {config.date_mode === "range"
                                        ? `${config.date_from} → ${config.date_to}`
                                        : config.date_mode === "year"
                                            ? `Full year ${config.year}`
                                            : `${config.month} ${config.month_year}`
                                    }
                                </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3
                              border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Package size={12} className="text-slate-400" />
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Commodity</p>
                                </div>
                                <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">
                                    {config.commodity}
                                </p>
                            </div>
                        </div>

                        {/* narrative preview */}
                        {config.sections.narrative && (
                            <div className="bg-white dark:bg-slate-900 rounded-xl p-5
                              border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                                        Situation Narrative
                                    </p>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                        preview.source === "gemini"
                                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                    }`}>
                    {preview.source === "gemini" ? "✦ Gemini 2.5 Flash" : "Template"}
                  </span>
                                </div>
                                <div className="prose prose-sm max-w-none dark:prose-invert">
                                    {preview.narrative.split("\n\n").map((para, i) => (
                                        <p key={i} className="text-[12px] text-slate-600 dark:text-slate-300
                                          leading-relaxed mb-3 last:mb-0">
                                            {para}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* export call-to-action */}
                        <div className="bg-slate-900 dark:bg-slate-800 rounded-xl p-4
                            flex items-center justify-between gap-4">
                            <div>
                                <p className="text-[12px] font-semibold text-white mb-0.5">
                                    Ready to export
                                </p>
                                <p className="text-[11px] text-slate-400">
                                    {sectionCount} sections · {config.commodity} · {config.district}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <ExportBtn
                                    format="pdf" onClick={exportPDF}
                                    loading={pdfLoading}
                                    disabled={!config.district}
                                />
                                <ExportBtn
                                    format="excel" onClick={exportExcel}
                                    loading={xlsxLoading}
                                    disabled={!config.district}
                                />
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    )
}