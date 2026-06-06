"use client"

/**
 * ReportsPanel.tsx  v2
 * Intelligent report builder with:
 *  - Multi-commodity selection (checkboxes, select all)
 *  - Forecast + FSI indicators sections
 *  - PDF · Excel · DOCX export
 *  - Live narrative preview powered by Gemini
 *  - Report format: narrative prose, not just numbers
 */

import { useState, useCallback, useEffect, useRef } from "react"
import {
    FileText, Sheet, FileEdit, ChevronDown, Loader2,
    BarChart2, TrendingUp, AlertTriangle, MapPin, CheckSquare,
    Calendar, Package, Settings2, Eye, Info, X, Check,
} from "lucide-react"
import { DISTRICTS, API } from "@/lib/constants"

// ── types ─────────────────────────────────────────────────────────────────────

type ReportType   = "district" | "national"
type DateMode     = "range" | "year" | "month_year"
type ExportFormat = "pdf" | "excel" | "docx"

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
    commodities  : string[]  // multi-select
    sections     : Sections
}

interface PreviewData {
    district      : string
    region        : string
    risk_score    : number
    risk_tier     : string
    national_rank : number
    narrative     : string
    source        : string
    generated_at  : string
}

// ── constants ─────────────────────────────────────────────────────────────────

const ALL_COMMODITIES = [
    "Maize", "Beans", "Rice",
    "Groundnuts (shelled)", "Cowpeas", "Pigeon peas",
    "Sugar", "Sorghum", "Millet", "Soybeans",
    "Oil (vegetable)", "Sweet potatoes", "Cassava",
    "Tomatoes", "Local vegetables", "Exotic vegetables",
    "Fish (small, dry)",
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
    { key: "narrative",  label: "Situation narrative",   icon: FileText,      desc: "AI-generated prose analysis" },
    { key: "indicators", label: "FSI & indicators",      icon: TrendingUp,    desc: "Risk score, PSI, coverage" },
    { key: "forecast",   label: "3-month forecast",      icon: TrendingUp,    desc: "Price outlook + severity projection" },
    { key: "prices",     label: "Commodity prices",      icon: BarChart2,     desc: "Avg prices by commodity" },
    { key: "spikes",     label: "Spike events",          icon: AlertTriangle, desc: "Full spike event table" },
    { key: "markets",    label: "Market coverage",       icon: MapPin,        desc: "Monitored markets" },
    { key: "gaps",       label: "Monitoring gaps",       icon: Settings2,     desc: "Coverage gap classification" },
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
                value={value} onChange={e => onChange(e.target.value)}
                className="w-full text-[12px] border border-slate-200 dark:border-slate-700
                   rounded-lg px-3 py-2 pr-8 bg-white dark:bg-slate-800
                   text-slate-700 dark:text-slate-200 focus:outline-none
                   focus:ring-1 focus:ring-slate-400 appearance-none"
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
                  transition-all ${checked
                ? "border-slate-800 bg-slate-800 dark:border-slate-200 dark:bg-slate-700"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
        >
            <Icon size={14} className={checked ? "text-white dark:text-slate-200" : "text-slate-400"} />
            <div className="flex-1 min-w-0">
                <p className={`text-[12px] font-medium leading-tight ${checked ? "text-white dark:text-slate-100" : "text-slate-700 dark:text-slate-200"}`}>{label}</p>
                <p className={`text-[10px] leading-tight mt-0.5 ${checked ? "text-slate-300" : "text-slate-400"}`}>{desc}</p>
            </div>
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                checked ? "bg-emerald-500 border-emerald-500" : "border-slate-300 dark:border-slate-600"
            }`}>
                {checked && <Check size={10} className="text-white" />}
            </div>
        </button>
    )
}

// Multi-commodity selector with dropdown
function CommoditySelector({
                               selected, onChange,
                           }: {
    selected: string[]; onChange: (v: string[]) => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])

    const allSelected = selected.length === ALL_COMMODITIES.length
    const toggle = (c: string) =>
        onChange(selected.includes(c) ? selected.filter(x => x !== c) : [...selected, c])
    const toggleAll = () =>
        onChange(allSelected ? [] : [...ALL_COMMODITIES])

    const displayLabel = selected.length === 0
        ? "All commodities"
        : selected.length === 1
            ? selected[0]
            : `${selected.length} commodities selected`

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full text-[12px] border border-slate-200 dark:border-slate-700
                   rounded-lg px-3 py-2 bg-white dark:bg-slate-800
                   text-slate-700 dark:text-slate-200 focus:outline-none
                   focus:ring-1 focus:ring-slate-400 flex items-center justify-between gap-2"
            >
                <span className={selected.length === 0 ? "text-slate-400" : ""}>{displayLabel}</span>
                <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
            </button>

            {open && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800
                        border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg
                        max-h-64 overflow-y-auto">
                    {/* Select all */}
                    <button
                        onClick={toggleAll}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px]
                               font-semibold text-slate-600 dark:text-slate-300
                               hover:bg-slate-50 dark:hover:bg-slate-700 border-b
                               border-slate-100 dark:border-slate-700"
                    >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                            allSelected ? "bg-emerald-500 border-emerald-500" : "border-slate-300 dark:border-slate-600"
                        }`}>
                            {allSelected && <Check size={9} className="text-white" />}
                        </div>
                        All commodities
                    </button>
                    {ALL_COMMODITIES.map(c => (
                        <button
                            key={c}
                            onClick={() => toggle(c)}
                            className="w-full flex items-center gap-2.5 px-3 py-2
                                   text-[11px] text-slate-600 dark:text-slate-300
                                   hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                                selected.includes(c) ? "bg-emerald-500 border-emerald-500" : "border-slate-300 dark:border-slate-600"
                            }`}>
                                {selected.includes(c) && <Check size={9} className="text-white" />}
                            </div>
                            {c}
                        </button>
                    ))}
                </div>
            )}

            {/* chips for selected */}
            {selected.length > 0 && selected.length <= 5 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {selected.map(c => (
                        <span key={c}
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5
                                   bg-slate-100 dark:bg-slate-700 rounded-full
                                   text-slate-600 dark:text-slate-300">
                            {c}
                            <button onClick={() => toggle(c)}
                                    className="hover:text-red-500 leading-none">
                                <X size={9} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

function ExportBtn({
                       format, onClick, loading, disabled,
                   }: {
    format: ExportFormat; onClick: () => void
    loading: boolean; disabled: boolean
}) {
    const cfg = {
        pdf   : { label: "Export PDF",   icon: FileText,  cls: "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200" },
        excel : { label: "Export Excel", icon: Sheet,     cls: "bg-emerald-600 text-white hover:bg-emerald-700" },
        docx  : { label: "Export DOCX",  icon: FileEdit,  cls: "bg-blue-600 text-white hover:bg-blue-700" },
    }[format]
    const Icon = cfg.icon
    return (
        <button
            onClick={onClick} disabled={disabled || loading}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-semibold
                  transition-all disabled:opacity-50 disabled:cursor-not-allowed ${cfg.cls}`}
        >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
            {loading ? "Generating…" : cfg.label}
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
        commodities : [],          // empty = All commodities
        sections    : {
            narrative  : true,
            indicators : true,
            forecast   : true,
            prices     : true,
            spikes     : true,
            markets    : true,
            gaps       : false,
        },
    })

    const [preview,        setPreview]        = useState<PreviewData | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewError,   setPreviewError]   = useState<string | null>(null)
    const [pdfLoading,     setPdfLoading]     = useState(false)
    const [xlsxLoading,    setXlsxLoading]    = useState(false)
    const [docxLoading,    setDocxLoading]    = useState(false)
    const [exportError,    setExportError]    = useState<string | null>(null)

    const set = useCallback(<K extends keyof Config>(key: K, val: Config[K]) =>
        setConfig(prev => ({ ...prev, [key]: val })), [])

    const setSection = useCallback((key: keyof Sections, val: boolean) =>
        setConfig(prev => ({ ...prev, sections: { ...prev.sections, [key]: val } })), [])

    // ── build query params ──────────────────────────────────────────────────
    function buildParams(extraFmt?: string): URLSearchParams {
        const p = new URLSearchParams()

        if (config.date_mode === "range") {
            if (config.date_from) p.set("date_from", config.date_from)
            if (config.date_to)   p.set("date_to",   config.date_to)
        } else if (config.date_mode === "year") {
            p.set("year", config.year)
        } else {
            const idx = MONTHS.indexOf(config.month)
            const mo  = (idx + 1).toString().padStart(2, "0")
            // FIX: use real last day of month, not always 31
            const lastDay = new Date(parseInt(config.month_year), idx + 1, 0).getDate()
            p.set("date_from", `${config.month_year}-${mo}-01`)
            p.set("date_to",   `${config.month_year}-${mo}-${lastDay.toString().padStart(2,"0")}`)
        }

        // multi-commodity: append each as separate param
        config.commodities.forEach(c => p.append("commodity", c))

        // sections
        Object.entries(config.sections).forEach(([k, v]) => {
            if (v) p.append("sections", k)
        })

        if (extraFmt) p.set("fmt", extraFmt)
        return p
    }

    // ── narrative preview ───────────────────────────────────────────────────
    const loadPreview = useCallback(async () => {
        if (!config.district) return
        setPreviewLoading(true); setPreviewError(null)
        try {
            const res = await fetch(`${API}/api/narrative/${encodeURIComponent(config.district)}`)
            if (!res.ok) throw new Error(`${res.status}`)
            setPreview(await res.json())
        } catch (e) {
            setPreviewError(e instanceof Error ? e.message : "Failed to load preview")
        } finally {
            setPreviewLoading(false)
        }
    }, [config.district])

    useEffect(() => { loadPreview() }, [loadPreview])

    // ── export handlers ─────────────────────────────────────────────────────
    const exportFile = async (format: ExportFormat) => {
        setExportError(null)
        const setLoading = format === "pdf" ? setPdfLoading
            : format === "excel" ? setXlsxLoading
                : setDocxLoading

        setLoading(true)
        try {
            let url: string
            const params = buildParams(format === "docx" ? "docx" : undefined)

            if (format === "excel") {
                url = config.report_type === "district"
                    ? `${API}/api/export/district/${encodeURIComponent(config.district)}?${params}`
                    : `${API}/api/export/excel?${params}`
            } else {
                url = config.report_type === "district"
                    ? `${API}/api/reports/district/${encodeURIComponent(config.district)}?${params}`
                    : `${API}/api/reports/generate?${params}`
            }

            const res = await fetch(url)
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: "Unknown error" }))
                throw new Error(err.error || `Server error ${res.status}`)
            }

            const blob = await res.blob()
            const link = document.createElement("a")
            link.href  = URL.createObjectURL(blob)
            const safe = config.district.toLowerCase().replace(/ /g, "_")
            const date = new Date().toISOString().slice(0, 10)
            const ext  = format === "excel" ? "xlsx" : format
            link.download = `report_${safe}_${date}.${ext}`
            link.click()
            URL.revokeObjectURL(link.href)
        } catch (e) {
            setExportError(e instanceof Error ? e.message : "Export failed")
        } finally {
            setLoading(false)
        }
    }

    const sectionCount = Object.values(config.sections).filter(Boolean).length
    const commodityLabel = config.commodities.length === 0
        ? "All commodities"
        : config.commodities.length === 1
            ? config.commodities[0]
            : `${config.commodities.length} commodities`

    // ── render ──────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col md:flex-row h-full min-h-screen">

            {/* ── LEFT: configurator ─────────────────────────────────────────── */}
            <div className="w-full md:w-80 flex-shrink-0 border-r border-slate-200
                      dark:border-slate-800 bg-slate-50 dark:bg-slate-900 overflow-y-auto">

                <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-0.5">
                        <FileText size={16} className="text-slate-700 dark:text-slate-300" />
                        <h2 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                            Report Builder
                        </h2>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Narrative intelligence report · PDF · Excel · DOCX
                    </p>
                </div>

                <div className="px-4 py-4 space-y-5">

                    {/* report type */}
                    <div>
                        <Label>Report type</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                            {(["district","national"] as ReportType[]).map(t => (
                                <button key={t} onClick={() => set("report_type", t)}
                                        className={`text-[12px] py-2 rounded-lg border font-medium transition-all capitalize ${
                                            config.report_type === t
                                                ? "bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800"
                                                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800"
                                        }`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* district */}
                    {config.report_type === "district" && (
                        <div>
                            <Label>District</Label>
                            <Select value={config.district}
                                    onChange={v => set("district", v)}
                                    options={DISTRICTS} />
                        </div>
                    )}

                    {/* date filter */}
                    <div>
                        <Label>Date filter</Label>
                        <div className="flex gap-1 mb-2">
                            {(["range","year","month_year"] as DateMode[]).map(m => (
                                <button key={m} onClick={() => set("date_mode", m)}
                                        className={`flex-1 text-[11px] py-1.5 rounded-md border transition-all ${
                                            config.date_mode === m
                                                ? "bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800"
                                                : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white dark:hover:bg-slate-800"
                                        }`}>
                                    {m === "range" ? "Range" : m === "year" ? "Year" : "Month"}
                                </button>
                            ))}
                        </div>

                        {config.date_mode === "range" && (
                            <div className="space-y-2">
                                {(["date_from","date_to"] as const).map(k => (
                                    <div key={k}>
                                        <p className="text-[10px] text-slate-400 mb-1">{k === "date_from" ? "From" : "To"}</p>
                                        <input type="date" value={config[k]}
                                               onChange={e => set(k, e.target.value)}
                                               className="w-full text-[12px] border border-slate-200 dark:border-slate-700
                                       rounded-lg px-3 py-2 bg-white dark:bg-slate-800
                                       text-slate-700 dark:text-slate-200 focus:outline-none
                                       focus:ring-1 focus:ring-slate-400" />
                                    </div>
                                ))}
                            </div>
                        )}
                        {config.date_mode === "year" && (
                            <Select value={config.year} onChange={v => set("year", v)} options={YEARS} />
                        )}
                        {config.date_mode === "month_year" && (
                            <div className="grid grid-cols-2 gap-2">
                                <Select value={config.month} onChange={v => set("month", v)} options={MONTHS} />
                                <Select value={config.month_year} onChange={v => set("month_year", v)} options={YEARS} />
                            </div>
                        )}
                    </div>

                    {/* multi-commodity */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <Label>Commodities</Label>
                            {config.commodities.length > 0 && (
                                <button onClick={() => set("commodities", [])}
                                        className="text-[10px] text-slate-400 hover:text-slate-600">
                                    Clear
                                </button>
                            )}
                        </div>
                        <CommoditySelector
                            selected={config.commodities}
                            onChange={v => set("commodities", v)}
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                            Select multiple to generate a cross-commodity narrative. Leave empty to cover all.
                        </p>
                    </div>

                    {/* sections */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label>Sections to include</Label>
                            <span className="text-[10px] text-slate-400">{sectionCount} selected</span>
                        </div>
                        <div className="space-y-1.5">
                            {SECTION_META.map(s => (
                                <Toggle key={s.key}
                                        checked={config.sections[s.key as keyof Sections]}
                                        onChange={v => setSection(s.key as keyof Sections, v)}
                                        label={s.label} desc={s.desc} icon={s.icon} />
                            ))}
                        </div>
                        {/* Why forecast + indicators tooltip */}
                        <div className="mt-2 flex gap-1.5 text-[10px] text-slate-400 leading-relaxed
                                   bg-slate-100 dark:bg-slate-800/60 rounded-lg p-2.5">
                            <Info size={11} className="flex-shrink-0 mt-0.5" />
                            <span>
                                <b>Forecast</b> makes the report forward-looking — what will happen.
                                <b> Indicators</b> explain why — FSI, PSI, coverage gaps.
                                Together they turn numbers into an intelligence brief.
                            </span>
                        </div>
                    </div>

                    {/* export error */}
                    {exportError && (
                        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-lg
                              p-2.5 text-[11px] text-red-600 flex items-start gap-2">
                            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                            <span>{exportError}</span>
                        </div>
                    )}

                    {/* export buttons */}
                    <div className="pt-2 space-y-2">
                        <ExportBtn format="pdf"   onClick={() => exportFile("pdf")}   loading={pdfLoading}  disabled={config.report_type === "district" && !config.district} />
                        <ExportBtn format="excel" onClick={() => exportFile("excel")} loading={xlsxLoading} disabled={config.report_type === "district" && !config.district} />
                        <ExportBtn format="docx"  onClick={() => exportFile("docx")}  loading={docxLoading} disabled={config.report_type === "district" && !config.district} />
                        <p className="text-[10px] text-slate-400 text-center pt-1">
                            DOCX is fully editable in Word or Google Docs
                        </p>
                    </div>
                </div>
            </div>

            {/* ── RIGHT: live preview ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-950 p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Eye size={16} className="text-slate-500" />
                        <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                            Report Preview
                        </h3>
                    </div>
                    <button onClick={loadPreview} disabled={previewLoading}
                            className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300
                       flex items-center gap-1 transition-colors">
                        {previewLoading ? <Loader2 size={11} className="animate-spin" /> : "↻"}
                        Refresh
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
                    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200
                          rounded-xl p-4 text-red-600 text-sm">
                        Failed to load preview: {previewError}
                    </div>
                )}

                {preview && !previewLoading && (
                    <div className="space-y-4 max-w-3xl">

                        {/* district banner */}
                        <div className="bg-slate-900 dark:bg-slate-800 rounded-xl p-5 border-l-4 border-yellow-400">
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
                                    { label: "Risk score",    value: preview.risk_score },
                                    { label: "National rank", value: `#${preview.national_rank}` },
                                    { label: "Generated",     value: preview.generated_at?.split(" ").slice(0,3).join(" ") },
                                ].map(m => (
                                    <div key={m.label} className="bg-white/5 rounded-lg px-3 py-2">
                                        <p className="text-[10px] text-slate-400 mb-0.5">{m.label}</p>
                                        <p className="text-[14px] font-semibold text-white">{m.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* report config summary */}
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
                                            : `${config.month} ${config.month_year}`}
                                </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3
                              border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Package size={12} className="text-slate-400" />
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Commodities</p>
                                </div>
                                <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">
                                    {commodityLabel}
                                </p>
                            </div>
                        </div>

                        {/* sections included */}
                        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4
                            border border-slate-200 dark:border-slate-800">
                            <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-2">
                                Sections in export ({sectionCount})
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

                        {/* report format explanation */}
                        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200
                            dark:border-blue-900 rounded-xl p-4">
                            <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 mb-1.5">
                                What makes this report different
                            </p>
                            <div className="space-y-1.5 text-[11px] text-blue-700 dark:text-blue-400">
                                <p>✦ <b>Narrative prose</b> — each section opens with a written analysis paragraph, not just a table</p>
                                <p>✦ <b>FSI + PSI indicators</b> — risk index, spike rate, coverage gap status with interpretation</p>
                                <p>✦ <b>Forecast outlook</b> — 3-month projected prices with severity classification</p>
                                <p>✦ <b>Recommendations</b> — data-driven action guidance based on risk tier</p>
                                <p>✦ <b>DOCX export</b> — fully editable in Word or Google Docs for field teams</p>
                            </div>
                        </div>

                        {/* narrative preview */}
                        {config.sections.narrative && (
                            <div className="bg-white dark:bg-slate-900 rounded-xl p-5
                              border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                                        Situation Narrative (preview)
                                    </p>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                        preview.source === "gemini"
                                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                    }`}>
                                        {preview.source === "gemini" ? "✦ Gemini 2.5 Flash" : "Template"}
                                    </span>
                                </div>
                                {preview.narrative.split("\n\n").slice(0, 3).map((para, i) => (
                                    <p key={i} className="text-[12px] text-slate-600 dark:text-slate-300
                                          leading-relaxed mb-3 last:mb-0">
                                        {para.replace(/\*\*/g, "")}
                                    </p>
                                ))}
                                <p className="text-[11px] text-slate-400 mt-2 italic">
                                    Full narrative + all sections appear in the exported report
                                </p>
                            </div>
                        )}

                        {/* export CTA */}
                        <div className="bg-slate-900 dark:bg-slate-800 rounded-xl p-4
                            flex flex-col gap-3">
                            <div>
                                <p className="text-[12px] font-semibold text-white mb-0.5">
                                    Ready to export
                                </p>
                                <p className="text-[11px] text-slate-400">
                                    {sectionCount} sections · {commodityLabel} · {config.district}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <ExportBtn format="pdf"   onClick={() => exportFile("pdf")}   loading={pdfLoading}  disabled={!config.district} />
                                <ExportBtn format="excel" onClick={() => exportFile("excel")} loading={xlsxLoading} disabled={!config.district} />
                                <ExportBtn format="docx"  onClick={() => exportFile("docx")}  loading={docxLoading} disabled={!config.district} />
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    )
}