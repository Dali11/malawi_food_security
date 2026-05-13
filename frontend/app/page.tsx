import Header          from "@/components/dashboard/Header"
import DashboardClient from "@/components/dashboard/DashboardClient"

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <DashboardClient />
      </div>
    </div>
  )
}