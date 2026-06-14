"use client"
import React, { useEffect, useState } from "react"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface StatusData {
    latest_date: string
    days_stale:  number
    is_stale:    boolean
    threshold:   number
}

const DataStaleBanner = () => {
    const [status, setStatus] = useState<StatusData | null>(null)

    useEffect(() => {
        fetch(`${API_BASE}/api/indicators/status`)
            .then(r => r.json())
            .then(setStatus)
            .catch(() => null)
    }, [])

    if (!status?.is_stale) return null

    const formatted = new Date(status.latest_date).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric"
    })

    return (
        <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-3 text-sm">
            <span className="text-amber-500 text-base">⚠</span>
            <span className="text-amber-800 text-xs">
                <b>Data is {status.days_stale} days old.</b>{" "}
                Latest available prices are from <b>{formatted}</b>.{" "}
                WFP updates HDX monthly.
            </span>
        </div>
    )
}

export default DataStaleBanner