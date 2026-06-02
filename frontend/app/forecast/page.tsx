"use client"

import React, { useState } from "react"
import Header from "@/components/dashboard/Header"
import ForecastPanel from "@/components/dashboard/ForecastPanel"
import { DISTRICTS } from "@/lib/constants"

export default function ForecastPage() {
    const [selectedDistrict, setSelectedDistrict] = useState("Lilongwe")

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-slate-950">
            <Header activePage="forecast" />

            {/* District picker */}
            <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800
                      bg-slate-50 dark:bg-slate-900 flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-slate-500 uppercase tracking-widest">
          District
        </span>
                <select
                    value={selectedDistrict}
                    onChange={e => setSelectedDistrict(e.target.value)}
                    className="text-sm bg-white dark:bg-slate-800 border border-slate-300
                     dark:border-slate-600 rounded-lg px-3 py-1.5 text-slate-800
                     dark:text-slate-100 focus:outline-none focus:ring-2
                     focus:ring-blue-500 cursor-pointer"
                >
                    {DISTRICTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                    ))}
                </select>
            </div>

            {/* Forecast panel */}
            <div className="flex-1 overflow-hidden">
                <ForecastPanel district={selectedDistrict} />
            </div>
        </div>
    )
}