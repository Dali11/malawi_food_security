import Header from "@/components/dashboard/Header"
import AutomationDashboard from "@/components/automation/AutomationDashboard"

export default function AutomationPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-slate-950">
      <Header activePage="automation" />
      <div className="flex-1 overflow-y-auto">
        <AutomationDashboard />
      </div>
    </div>
  )
}
