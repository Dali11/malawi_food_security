import Header from "@/components/dashboard/Header"
import SeasonPanel from "@/components/dashboard/SeasonPanel"

export default function SeasonPage() {
    return (
        <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-slate-950">
            <Header activePage="season" />
            <SeasonPanel />
        </div>
    )
}