import Header from "@/components/dashboard/Header"

export default function SeasonPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-slate-950">
      <Header activePage="season" />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-4xl mb-4">🌱</div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Season Baseline
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-mono">
            Coming soon — seasonal price benchmarks and crop calendar overlays
          </p>
        </div>
      </div>
    </div>
  )
}