import Header         from "@/components/dashboard/Header"
import IndicatorPanel from "@/components/dashboard/IndicatorPanel"

export default function IndicatorsPage() {
    return (
        <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-slate-950">
            <Header activePage="indicators" />
            <div className="flex-1 overflow-y-auto">
                <IndicatorPanel />
            </div>
        </div>
    )
}