"use client";
import { useState, useEffect } from "react";

export default function Header() {
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);

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
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API}/api/reports/generate`);
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `malawi_food_security_${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Report generation failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <header className="h-12 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <span className="font-bold text-slate-100 text-sm tracking-wide">
          Malawi Food Security Monitor
        </span>
        <span className="text-slate-600 text-sm">/</span>
        <span className="text-slate-400 text-xs">WFP VAM · 2020–2026</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Export button */}
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

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest">
            Live
          </span>
        </div>

        <span className="text-xs text-slate-500 font-mono">{date}</span>
      </div>
    </header>
  );
}