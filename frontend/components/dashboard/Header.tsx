export default function Header() {
  return (
    <header className="h-12 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        {/* Logo dot */}
        {/* <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center">
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-slate-900">
            <path d="M2 12L8 2L14 12ZM5 9L8 4L11 9Z"/>
          </svg>
        </div> */}

        <span className="font-bold text-slate-100 text-sm tracking-wide">
          Malawi Food Security Monitor
        </span>

        <span className="text-slate-600 text-sm">/</span>

        <span className="text-slate-400 text-xs">
          WFP VAM · 2020–2026
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest">
            Live
          </span>
        </div>

        <span className="text-xs text-slate-500 font-mono">
          {new Date().toLocaleDateString("en-GB", {
            day: "2-digit", month: "short", year: "numeric"
          })}
        </span>
      </div>
    </header>
  )
}