"use client"

import { MapContainerProps } from "@/lib/types"
import dynamic from "next/dynamic"


const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr    : false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-900">
      <div className="text-slate-400 text-sm font-mono animate-pulse">
        Loading map...
      </div>
    </div>
  ),
})

export default function MapContainer(props: MapContainerProps) {
  return (
    <div className="w-full h-full">
      <LeafletMap {...props} />
    </div>
  )
}
