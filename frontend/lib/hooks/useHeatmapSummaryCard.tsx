//______Summary Card-________
export function SummaryCard({
  label, value, sub, valueClass = "text-slate-900",
}: { label: string; value: string | number; sub: string; valueClass?: string }) {


  return (
    <div className="bg-slate-100 dark:bg-slate-800 dark:border shadow-md hover:shadow-lg dark:border-slate-700 rounded-lg p-3 min-w-0">
      <div className="dark:text-slate-400 text-slate-900 text-xs font-mono uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono truncate ${valueClass}`}>{value}</div>
      <div className="text-slate-500 text-xs mt-0.5">{sub}</div>
    </div>
  )
}