"use client"

import dynamic from "next/dynamic"
import type { DistrictDetail } from "@/lib/types"

export interface BasemapConfig {
  name : string
  url  : string
  attr : string
}

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr    : false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-slate-400 text-sm font-mono animate-pulse">
        Loading map...
      </div>
    </div>
  ),
})

interface MapContainerProps {
  onDistrictClick : (district: DistrictDetail | null) => void
  severityFilter  : string
  basemap         : BasemapConfig
}

export default function MapContainer(props: MapContainerProps) {
  return (
    <div className="w-full h-full">
      <LeafletMap {...props} />
    </div>
  )
}
