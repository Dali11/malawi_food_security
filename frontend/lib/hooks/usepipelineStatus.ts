"use client"
import { useEffect, useState } from "react"

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface PipelineStatus {
  run_at       : string   // ISO timestamp
  new_records  : number
  new_spikes   : number
  new_critical : number
  latest_date  : string
  status       : "success" | "failed"
  notes        : string
}

export function usePipelineStatus(refreshMs = 60_000) {
  const [status,  setStatus ] = useState<PipelineStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError  ] = useState<string | null>(null)

  const fetch_ = () =>
    fetch(`${API}/api/pipeline/latest`)
      .then(r => { if (!r.ok) throw new Error("Pipeline status unavailable"); return r.json() })
      .then((data: PipelineStatus) => { setStatus(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })

  useEffect(() => {
    fetch_()
    const timer = setInterval(fetch_, refreshMs)
    return () => clearInterval(timer)
  }, [])

  return { status, loading, error }
}