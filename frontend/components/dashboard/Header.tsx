"use client"
import { Sun, Moon, MoreHorizontal, AlertTriangle, FileText, Sheet } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useTheme } from "@/components/ThemeProvider"
import { useSummary } from "@/lib/hooks/useSummary"
import { usePipelineStatus } from "@/lib/hooks/usepipelineStatus"
import PipelineStatusBar from "./Pipelinestatusbar"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface HeaderProps {
    activePage?: "dashboard" | "forecast" | "heatmap" | "season" | "indicators" | "reports"
}

const TABS = [
  { id: "dashboard",  label: "Dashboard",       href: "/"           },
<<<<<<< Updated upstream
  { id: "forecast",  label: "Forecast",         href: "/forecast"    },
  { id: "heatmap",    label: "Heatmap",         href: "/heatmap"    },
  { id: "season",     label: "Season baseline", href: "/season"     },
  { id: "indicators", label: "Indicators",      href: "/indicators" },
    { id: "reports", label: "Reports", href: "/reports" },
=======
  {id: "forecast",    label: "Forecast",        href: "/forecast"   },
  { id: "heatmap",    label: "Heatmap",         href: "/heatmap"    },
  { id: "season",     label: "Season baseline", href: "/season"     },
  { id: "indicators", label: "Indicators",      href: "/indicators" }
>>>>>>> Stashed changes
]

export default function Header({ activePage = "dashboard" }: HeaderProps) {
  const [date, setDate]         = useState("")
  const [loading, setLoading]   = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, toggle }       = useTheme()
  const { status: pipelineStatus } = usePipelineStatus()
  const { summary }             = useSummary()
  const menuRef                 = useRef<HTMLDivElement>(null)
  const criticalCount           = summary?.spike_events?.critical ?? 0

  useEffect(() => {
    const format = () => new Date().toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    })
    setDate(format())
    const timer = setInterval(() => setDate(format()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function handleCriticalBadgeClick() {
    // Fire a custom event that DashboardClient listens to
    window.dispatchEvent(new CustomEvent("mfs:open-alert-sidebar"))
  }

  const downloadReport = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/reports/generate`)
      if (!res.ok) throw new Error("Failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `malawi_food_security_${new Date().toISOString().slice(0,10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert("Failed: " + (err instanceof Error ? err.message : "Unknown"))
    } finally { setLoading(false) }
  }

  const downloadExcel = async () => {
    try {
      const res = await fetch(`${API}/api/export/excel`)
      if (!res.ok) throw new Error("Failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `malawi_food_security_${new Date().toISOString().slice(0,10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert("Failed: " + (err instanceof Error ? err.message : "Unknown"))
    }
  }

  const lastRunLabel = pipelineStatus?.run_at
    ? new Date(pipelineStatus.run_at).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : null

  return (
    <header className="bg-white dark:bg-slate-900
                       border-b border-slate-200 dark:border-slate-700
                       flex-shrink-0 flex flex-col">

      {/* ── STATUS BAR — mobile only ──────────────────────────────────────── */}
      <div className="flex md:hidden items-center justify-between px-3 py-1.5
                      bg-slate-50 dark:bg-slate-950
                      border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
              Live
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{date}</span>
        </div>
        {criticalCount > 0 && (
          <button
            onClick={handleCriticalBadgeClick}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full
                       bg-red-50 dark:bg-red-950/60
                       border border-red-200 dark:border-red-800/50
                       text-red-600 dark:text-red-400 text-[10px] font-mono font-medium"
          >
            <AlertTriangle size={9} />
            {criticalCount} critical
          </button>
        )}
      </div>

      {/* ── TITLE BAR ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 md:px-4 h-11">
        <div className="flex items-center gap-2 min-w-0">
          <span className="hidden md:block text-[18px] font-bold
                           text-slate-900 dark:text-slate-200">
            MALAWI FOOD PRICE INTELLIGENCE
          </span>
          <span className="font-bold block sm:hidden text-slate-900 dark:text-slate-100 tracking-wide text-sm">
            FOOD PRICE INTELLIGENCE
          </span>
        </div>

        <div className="flex items-center gap-1.5">

          {/* Desktop exports */}
          <div className="hidden md:flex items-center gap-2 mr-2">
            <button onClick={downloadReport} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold
                         bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600
                         text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600
                         disabled:opacity-50 transition-colors">
              {loading ? "Generating…" : "Export Report"}
            </button>
            <button onClick={downloadExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold
                         bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600
                         text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600
                         transition-colors">
              Export Excel
            </button>
          </div>

          {/* Desktop live */}
          <div className="hidden md:flex items-center gap-1.5 group relative cursor-default"
               title={lastRunLabel ? `Last updated: ${lastRunLabel}` : "Live"}>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
              Live
            </span>
            {lastRunLabel && (
              <div className="absolute top-full right-0 mt-2 hidden group-hover:block
                              bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                              rounded px-2 py-1 text-xs font-mono text-slate-700 dark:text-slate-300
                              whitespace-nowrap z-50 shadow-xl">
                Last sync: {lastRunLabel}
                {pipelineStatus?.new_records ? (
                  <span className="ml-1 text-emerald-500">
                    (+{pipelineStatus.new_records.toLocaleString()} records)
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Desktop date */}
          <span className="hidden md:block text-xs text-slate-400 dark:text-slate-500 font-mono mx-1">
            {date}
          </span>

          {/* Theme toggle — all breakpoints */}
          <button
            onClick={toggle}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className="p-1.5 rounded border transition-colors
                       border-slate-200 dark:border-slate-700
                       hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === "dark"
              ? <Sun  size={14} className="text-amber-400" />
              : <Moon size={14} className="text-slate-500" />
            }
          </button>

          {/* Mobile overflow menu */}
          <div className="relative md:hidden" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="p-1.5 rounded border transition-colors
                         border-slate-200 dark:border-slate-700
                         hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MoreHorizontal size={14} className="text-slate-500 dark:text-slate-400" />
            </button>
            {menuOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-52 z-[2000]
                              bg-white dark:bg-slate-800
                              border border-slate-200 dark:border-slate-700
                              rounded-lg shadow-xl overflow-hidden">
                <button onClick={() => { downloadReport(); setMenuOpen(false) }} disabled={loading}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm
                             text-slate-700 dark:text-slate-200
                             hover:bg-slate-50 dark:hover:bg-slate-700
                             disabled:opacity-50 transition-colors text-left">
                  <FileText size={14} className="text-slate-400" />
                  {loading ? "Generating…" : "Export Situation Report"}
                </button>
                <div className="border-t border-slate-100 dark:border-slate-700" />
                <button onClick={() => { downloadExcel(); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm
                             text-slate-700 dark:text-slate-200
                             hover:bg-slate-50 dark:hover:bg-slate-700
                             transition-colors text-left">
                  <Sheet size={14} className="text-slate-400" />
                  Export Data (Excel)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline status bar */}
      <PipelineStatusBar />

      {/* ── TAB ROW ───────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 dark:border-slate-800">

        {/* Mobile — scrollable */}
        <div className="relative md:hidden">
          <div className="flex overflow-x-auto px-2 gap-0"
               style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {TABS.map(tab => (
              <Link key={tab.id} href={tab.href}
                className={`flex items-center px-3 py-2.5 text-xs font-mono
                            whitespace-nowrap flex-shrink-0 border-b-2 transition-colors ${
                  activePage === tab.id
                    ? "border-emerald-500 text-slate-900 dark:text-slate-100 font-semibold"
                    : "border-transparent text-slate-500 dark:text-slate-400"
                }`}>
                {tab.label}
              </Link>
            ))}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none
                          bg-gradient-to-l from-white dark:from-slate-900 to-transparent" />
        </div>

        {/* Desktop — regular nav */}
        <nav className="hidden md:flex items-center px-4 gap-0">
          {TABS.map(tab => (
            <Link key={tab.id} href={tab.href}
              className={`flex items-center px-3 py-2 text-xs font-mono
                          border-b-2 transition-colors ${
                activePage === tab.id
                  ? "border-emerald-500 text-slate-900 dark:text-slate-100 font-semibold"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
