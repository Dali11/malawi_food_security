import Header from "@/components/dashboard/Header"

export default function IndicatorsPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-slate-950">
      <Header activePage="indicators" />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-4xl mb-4">📊</div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Indicators
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-mono">
            Coming soon — food security composite indicators and trend analysis
          </p>
        </div>
      </div>
    </div>
  )
}