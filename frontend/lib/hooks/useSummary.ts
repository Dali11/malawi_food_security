"use client"

import { useEffect, useState } from "react"
import { getSummary } from "@/lib/api"
import type { StatItem, Summary } from "@/lib/types"



export function useSummary() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError  ] = useState<string | null>(null)

  useEffect(() => {
    getSummary()
      .then(data => {
        setSummary(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Stats only built when summary is available
  const stats: StatItem[] = summary ? [
    {
      label : "Markets Monitored",
      value : summary.total_markets,
      sub   : `${summary.total_districts} districts`,
      color : "text-blue-400",
    },
    {
      label : "Critical Spikes",
      value : summary.spike_events.critical,
      sub   : `of ${summary.spike_events.total.toLocaleString()} total`,
      color : "text-red-400",
    },
    {
      label : "Highest Risk",
      value : summary.highest_risk_district.name,
      sub   : `Score: ${summary.highest_risk_district.risk_score}`,
      color : "text-orange-400",
    },
    {
      label : "Monitoring Gaps",
      value : summary.monitoring_gaps.critical_gap_districts,
      sub   : "critical gap districts",
      color : "text-yellow-400",
    },
  ] : []

  return { summary, stats, loading, error }
}
