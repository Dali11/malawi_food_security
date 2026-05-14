"use client"

import { useEffect, useState } from "react"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface NarrativeParagraphs {
  opening: string
  commodities: string
  spike_rate: string
  monitoring: string
  seasonal: string
  recommendation: string
}

interface NarrativeData {
  district: string
  region: string
  risk_score: number
  risk_tier: string
  national_rank: number
  generated_at: string
  narrative: string
  paragraphs: NarrativeParagraphs
}

const TIER_COLORS: Record<string, { border: string; label: string; bg: string }> = {
  critical: { border: "#B71C1C", label: "Critical", bg: "#FCEBEB" },
  high:     { border: "#E65100", label: "High",     bg: "#FFF3E0" },
  moderate: { border: "#F9A825", label: "Moderate", bg: "#FAEEDA" },
  low:      { border: "#1565C0", label: "Low",      bg: "#E6F1FB" },
  stable:   { border: "#2E7D32", label: "Stable",   bg: "#EAF3DE" },
}

const SECTION_COLORS: Record<string, string> = {
  opening:        "#B71C1C",
  commodities:    "#E65100",
  monitoring:     "#F9A825",
  seasonal:       "#1565C0",
  recommendation: "#2E7D32",
}

const SECTION_LABELS: Record<string, string> = {
  opening:        "Overview",
  commodities:    "Commodity alert",
  monitoring:     "Monitoring",
  seasonal:       "Seasonal context",
  recommendation: "Recommended action",
}

const SECTION_ORDER = [
  "opening",
  "commodity",
  "monitoring",
  "seasonal",
  "recommendations",
]

export default function NarrativePanel({ districtName }: { districtName: string }) {
  const [data, setData]       = useState<NarrativeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    if (!districtName) return
    setLoading(true)
    setData(null)
    setError("")

    fetch(`${API}/api/narrative/${encodeURIComponent(districtName)}`)
      .then(r => {
        if (!r.ok) throw new Error(`API error: ${r.status}`)
        return r.json()
      })
      .then((d: NarrativeData) => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [districtName])

  function copyNarrative() {
    if (!data?.narrative) return
    navigator.clipboard.writeText(data.narrative).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const tier = data?.risk_tier
    ? (TIER_COLORS[data.risk_tier] ?? TIER_COLORS.stable)
    : null

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-slate-400">
            Situation Report
          </span>
          {data?.national_rank && (
            <span className="ml-2 text-xs text-slate-500">
              #{data.national_rank} nationally
            </span>
          )}
        </div>
        {tier && (
          <span style={{
            background: tier.bg,
            color: tier.border,
            fontSize: 10,
            fontWeight: 500,
            padding: "2px 6px",
            borderRadius: 4,
          }}>
            {tier.label}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* Loading */}
        {loading && (
        <div className="p-3 space-y-2">
            <div className="text-slate-500 text-xs animate-pulse">
            Generating narrative...
            </div>
            <div className="text-slate-600 text-xs">
            Fetching district data from database
            </div>
            {/* Skeleton lines */}
            <div className="space-y-2 mt-3">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-slate-800 rounded animate-pulse"
                style={{ height: 8, width: `${70 + Math.random() * 30}%` }} />
            ))}
            </div>
        </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="p-3 text-red-400 text-xs">
            Failed to load narrative: {error}
          </div>
        )}

        {/* Content */}
        {!loading && !error && data && (
          <>
            {/* District info */}
            <div className="px-3 py-2 border-b border-slate-800">
              <p className="text-xs font-medium text-slate-200">{data.district}</p>
              <p className="text-xs text-slate-500 mt-0.5">{data.region}</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Generated {data.generated_at}
              </p>
            </div>

            {/* Narrative sections */}
            <div className="px-3 py-2 space-y-3">
              {SECTION_ORDER.map(key => {
                const text = data.paragraphs?.[key as keyof NarrativeParagraphs]
                if (!text) return null
                const color = SECTION_COLORS[key] ?? "#64748B"
                const label = SECTION_LABELS[key] ?? key

                return (
                  <div
                    key={key}
                    style={{
                      borderLeft: `2px solid ${color}`,
                      paddingLeft: 8,
                    }}
                  >
                    <p style={{
                      fontSize: 9,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#64748B",
                      marginBottom: 3,
                    }}>
                      {label}
                    </p>
                    <p style={{
                      fontSize: 11,
                      lineHeight: 1.6,
                      color: "#CBD5E1",
                    }}>
                      {text}
                    </p>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Copy button */}
      {data?.narrative && (
        <div className="px-3 py-2 border-t border-slate-700">
          <button
            onClick={copyNarrative}
            className="w-full flex items-center justify-center gap-2 text-xs py-1.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {copied ? (
              <span>✓ Copied to clipboard</span>
            ) : (
              <span>⎘ Copy narrative for report</span>
            )}
          </button>
        </div>
      )}

    </div>
  )
}