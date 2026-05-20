"use client"
import { Download, FileText, Sheet, Sun, Moon, LayoutGrid, Map } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { usePipelineStatus } from "@/lib/hooks/usepipelineStatus"
import PipelineStatusBar from "./Pipelinestatusbar"
import { useTheme } from "../ThemeProvider"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface HeaderProps {
  activePage?: "dashboard" | "heatmap"
}

export default function Header({ activePage = "dashboard" }: HeaderProps) {
  const [date, setDate]         = useState("")
  const [loading, setLoading]   = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, toggle }       = useTheme()
  const { status: pipelineStatus } = usePipelineStatus()

  useEffect(() => {
    const format = () =>
      new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      })
    setDate(format())
    const timer = setInterval(() => setDate(format()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const downloadReport = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/reports/generate`)
      if (!res.ok) throw new Error("Failed to generate report")
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `malawi_food_security_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert("Report generation failed: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setLoading(false)
    }
  }

  const downloadExcel = async () => {
    try {
      const res  = await fetch(`${API}/api/export/excel`)
      if (!res.ok) throw new Error("Failed to export")
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `malawi_food_security_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert("Export Failed: " + (err instanceof Error ? err.message : "Unknown error"))
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
                       flex-shrink-0">

      {/* Main bar */}
      <div className="flex items-center justify-between px-3 md:px-4 h-12">

        {/* Left — title + nav */}
        <div className="flex items-center gap-4 min-w-0">
          <span className="font-bold text-slate-900 dark:text-slate-100 tracking-wide md:text-lg whitespace-nowrap">
            Malawi Food Price Intelligence
          </span>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-2 ml-10">
            <Link
              href="/"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                activePage === "dashboard"
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Map size={12} /> Dashboard
            </Link>
            <Link
              href="/heatmap"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-mono transition-colors ${
                activePage === "heatmap"
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-500"
              }`}
            >
              <LayoutGrid size={12} /> Heatmap
            </Link>
          </nav>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">

          {/* Export buttons */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={downloadReport}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold cursor-pointer
                         bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600
                         text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 12l-4-4h2.5V4h3v4H12L8 12z"/>
                    <path d="M2 13h12v1.5H2z"/>
                  </svg>
                  Export Report
                </>
              )}
            </button>
            <button
              onClick={downloadExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold cursor-pointer
                         bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600
                         text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600
                         transition-colors"
            >
              ⬇ Export Excel
            </button>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="p-1.5 rounded border transition-colors
                       border-slate-200 dark:border-slate-700
                       hover:bg-slate-100 dark:hover:bg-slate-800 ml-5"
          >
            {theme === "dark"
              ? <Sun  size={14} className="text-amber-400" />
              : <Moon size={14} className="text-slate-500" />
            }
          </button>

          {/* Live indicator */}
          <div
            className="flex items-center gap-1.5 group relative cursor-default"
            title={lastRunLabel ? `Last updated: ${lastRunLabel}` : "Live monitoring active"}
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 uppercase tracking-widest hidden sm:inline">
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

          {/* Date */}
          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono hidden sm:block">{date}</span>

          {/* Mobile menu */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Menu"
          >
            <Download size={14} className="text-slate-500" />
          </button>
        </div>
      </div>

      {/* Pipeline status bar */}
      <PipelineStatusBar />

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-700
                        bg-white dark:bg-slate-900 px-4 py-3 space-y-2">
          <div className="flex gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Link href="/" onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded text-sm flex-1 justify-center border transition-colors ${
                activePage === "dashboard"
                  ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                  : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
              }`}>
              <Map size={14} /> Map
            </Link>
            <Link href="/heatmap" onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded text-sm flex-1 justify-center border transition-colors ${
                activePage === "heatmap"
                  ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                  : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
              }`}>
              <LayoutGrid size={14} /> Heatmap
            </Link>
          </div>
          <button onClick={() => { downloadReport(); setMenuOpen(false) }} disabled={loading}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded text-sm
                       bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700
                       text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700
                       disabled:opacity-50 transition-colors text-left">
            <FileText size={14} />
            {loading ? "Generating PDF…" : "Export Situation Report (PDF)"}
          </button>
          <button onClick={() => { downloadExcel(); setMenuOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded text-sm
                       bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700
                       text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700
                       transition-colors text-left">
            <Sheet size={14} />
            Export Data (Excel)
          </button>
        </div>
      )}
    </header>
  )
}