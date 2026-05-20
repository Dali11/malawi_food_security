import Header       from "@/components/dashboard/Header"
import HeatmapPanel from "@/components/dashboard/HeatMapPanel"

export default function HeatmapPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden
                    bg-white dark:bg-slate-950">
      <Header activePage="heatmap" />
      <div className="flex-1 overflow-hidden">
        <HeatmapPanel />
      </div>
    </div>
  )
}