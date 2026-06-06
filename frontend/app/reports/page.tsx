import Header      from "@/components/dashboard/Header"
import ReportsPanel from "@/components/dashboard/ReportsPanel"

export default function ReportsPage() {
    return (
        <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-slate-950">
            <Header activePage="reports" />
            <div className="flex-1 overflow-y-auto">
                <ReportsPanel />
            </div>
        </div>
    )
}