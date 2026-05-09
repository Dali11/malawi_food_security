import Header         from "@/components/dashboard/Header"
import StatsPanel     from "@/components/dashboard/StatsPanel"
import AlertPanel     from "@/components/dashboard/AlertPanel"
import DashboardClient from "@/components/dashboard/DashboardClient"

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">

      {/* Server rendered — no JS needed */}
      <Header />

      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar — server rendered */}
        <aside className="w-64 flex-shrink-0 bg-slate-900 border-r border-slate-700 flex flex-col overflow-hidden">
          <StatsPanel />
          <div className="flex-1 overflow-hidden">
            <AlertPanel />
          </div>
        </aside>

        {/* Client island — map + district popup share state here */}
        <DashboardClient />

      </div>
    </div>
  )
}
