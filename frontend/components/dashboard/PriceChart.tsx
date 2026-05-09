"use client"

/**
 * PriceChart.tsx
 * Recharts line chart showing monthly price trend for a district.
 * Spike months highlighted in red.
 */

import { useEffect, useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot
} from "recharts"
import { getDistrictPrices } from "@/lib/api"
import type { PricePoint } from "@/lib/types"

interface PriceChartProps {
  district  : string
  commodity?: string
}

export default function PriceChart({
  district,
  commodity = "Maize"
}: PriceChartProps) {
  const [data,    setData   ] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getDistrictPrices(district, commodity)
      .then(res => {
        setData(res.prices)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [district, commodity])

  if (loading) {
    return (
      <div className="h-32 flex items-center justify-center">
        <div className="text-slate-500 text-xs animate-pulse">
          Loading price trend...
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center">
        <div className="text-slate-600 text-xs">
          No price data for {commodity} in {district}
        </div>
      </div>
    )
  }

  // Spike months — highlight as red dots
  const spikePoints = data.filter(d => d.spike_count > 0)

  // Format month label — "2025-04-01" → "Apr 25"
  const formatMonth = (val: string) => {
    const d = new Date(val)
    return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
  }

  // Format price — 1234567 → "1.2M" or "45K"
  const formatPrice = (val: number) => {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000)     return `${(val / 1_000).toFixed(0)}K`
    return String(val)
  }

  return (
    <div>
      <div className="text-xs text-slate-400 mb-2 font-mono">
        {commodity} price trend — MWK/KG
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fontSize: 9, fill: "#64748b" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatPrice}
            tick={{ fontSize: 9, fill: "#64748b" }}
            width={32}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border         : "1px solid #334155",
              borderRadius   : "6px",
              fontSize       : "11px",
              color          : "#e2e8f0"
            }}
            formatter={(val: number) => [`${val.toLocaleString()} MWK`, commodity]}
            labelFormatter={formatMonth}
          />
          <Line
            type="monotone"
            dataKey="avg_price"
            stroke="#f5c842"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: "#f5c842" }}
          />
          {/* Red dots on spike months */}
          {spikePoints.map((point, i) => (
            <ReferenceDot
              key={i}
              x={point.month}
              y={point.avg_price}
              r={4}
              fill="#ef4444"
              stroke="white"
              strokeWidth={1}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex gap-3 mt-1">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <div className="w-3 h-0.5 bg-yellow-400" />
          <span>Avg price</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Spike month</span>
        </div>
      </div>
    </div>
  )
}
