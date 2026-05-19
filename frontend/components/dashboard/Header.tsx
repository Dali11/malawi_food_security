"use client";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Header() {
  const [date, setDate]       = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const format = () =>
      new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      });
    setDate(format());
    const timer = setInterval(() => setDate(format()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const downloadReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/reports/generate`);
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `malawi_food_security_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Report generation failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = async () => {
    try {
      const res  = await fetch(`${API}/api/export/excel`);
      if (!res.ok) throw new Error("Failed to export");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `malawi_food_security_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export Failed: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-700 flex-shrink-0">

      {/* ── Main bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 md:px-4 h-12">

        {/* Left — title */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-slate-100 tracking-wide text-sm whitespace-nowrap">
            {/* Full title on md+, short on mobile */}
            <span className="hidden md:inline">Malawi Food Security </span>
            <span className="inline md:hidden">Malawi Food Security Monitor</span>
          </span>
          <span className="text-slate-600 text-sm hidden sm:inline">/</span>
          <span className="text-slate-400 text-xs hidden sm:inline truncate">WFP VAM · 2020–2026</span>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">

          {/* Export buttons — visible on md+ */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={downloadReport}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold
                         bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold
                         bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600
                         transition-colors"
            >
              ⬇ Export Excel
            </button>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest hidden sm:inline">
              Live
            </span>
          </div>

          {/* Date — hidden on mobile */}
          <span className="text-xs text-slate-500 font-mono hidden sm:inline">{date}</span>

          {/* Mobile overflow menu button */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden flex flex-col gap-1 p-2 rounded hover:bg-slate-800"
            aria-label="Menu"
          >
            <span className="w-4 h-0.5 bg-slate-400 block" />
            <span className="w-4 h-0.5 bg-slate-400 block" />
            <span className="w-4 h-0.5 bg-slate-400 block" />
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown menu ─────────────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden border-t border-slate-700 bg-slate-900 px-4 py-3 space-y-2">
          {/* Date row */}
          <div className="text-xs text-slate-500 font-mono pb-1 border-b border-slate-800">
            {date}
          </div>

          {/* Export PDF */}
          <button
            onClick={() => { downloadReport(); setMenuOpen(false); }}
            disabled={loading}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded text-sm
                       bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700
                       disabled:opacity-50 transition-colors text-left"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 12l-4-4h2.5V4h3v4H12L8 12z"/>
              <path d="M2 13h12v1.5H2z"/>
            </svg>
            {loading ? "Generating PDF…" : "Export Situation Report (PDF)"}
          </button>

          {/* Export Excel */}
          <button
            onClick={() => { downloadExcel(); setMenuOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded text-sm
                       bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700
                       transition-colors text-left"
          >
            <span className="text-base">⬇</span>
            Export Data (Excel)
          </button>
        </div>
      )}
    </header>
  );
}