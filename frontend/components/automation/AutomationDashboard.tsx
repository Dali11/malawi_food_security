"use client"

import { useCallback, useEffect, useState } from "react"
import type { AutomationOverview } from "@/lib/automation"

function label(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded"
}

function number(value: number | string | null | undefined, digits = 1): string {
  if (value === null || value === undefined || value === "") return "—"
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-GB", { maximumFractionDigits: digits }) : "—"
}

function StatusPill({ value }: { value: string | null | undefined }) {
  const status = (value || "unknown").toLowerCase()
  const style = status === "healthy" || status === "success" || status === "delivered"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
    : status === "degraded" || status === "queued" || status === "running"
      ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
      : status === "failed" || status === "unavailable"
        ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-mono uppercase ${style}`}>{value || "unknown"}</span>
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${className}`}>
      <h2 className="border-b border-slate-100 px-4 py-3 text-xs font-mono font-semibold uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:text-slate-400">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  )
}

export default function AutomationDashboard() {
  const [data, setData] = useState<AutomationOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/automation/overview", { cache: "no-store" })
      if (!response.ok) throw new Error(response.status === 503 ? "Automation monitoring is not configured." : "System status is unavailable.")
      const overview = (await response.json()) as AutomationOverview
      setData(overview)
      setError(null)
      setRefreshedAt(new Date().toISOString())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "System status is unavailable.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">Operations</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">Automation &amp; system monitoring</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pipeline runs, early-warning alerts and service health.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{refreshedAt ? `Updated ${label(refreshedAt)}` : "Refreshes every minute"}</span>
          <button onClick={() => void refresh()} disabled={loading} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-mono text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Refresh</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{error}</div>}
      {loading && !data && <div className="rounded border border-slate-200 p-6 text-sm text-slate-500 dark:border-slate-700">Loading live system status…</div>}

      {data && <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="System health">
          {[
            ["FastAPI", data.health.api],
            ["PostgreSQL", data.health.database],
            ["Node-RED", data.health.node_red],
            ["Pending field observations", String(data.pending_field_observations)],
          ].map(([name, value]) => (
            <div key={name} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-sm text-slate-600 dark:text-slate-300">{name}</span>
              {name === "Pending field observations" ? <strong className="font-mono text-slate-900 dark:text-slate-100">{value}</strong> : <StatusPill value={value} />}
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Latest pipeline execution">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusPill value={data.latest_pipeline.status} />
              <span className="text-xs text-slate-500">{label(data.latest_pipeline.run_at)}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["New rows", data.latest_pipeline.new_records], ["Price spikes", data.latest_pipeline.new_spikes], ["Critical", data.latest_pipeline.new_critical], ["Data through", data.latest_pipeline.latest_data_date || "—"]].map(([title, value]) => (
                <div key={String(title)} className="rounded bg-slate-50 p-3 dark:bg-slate-800/70">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{title}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{typeof value === "number" ? value.toLocaleString("en-GB") : value}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">Next scheduled: {label(data.schedule.next_pipeline_run)} ({data.schedule.timezone})</p>
            <p className="mt-1 text-xs text-slate-500">Weekly report: {data.schedule.report_cron} — next {label(data.schedule.next_report_run)}</p>
            {data.health.node_red_last_seen && <p className="mt-1 text-xs text-slate-500">Node-RED heartbeat: {label(data.health.node_red_last_seen)}</p>}
          </Panel>

          <Panel title="Recent pipeline history">
            {data.pipeline_history.length === 0 ? <p className="text-sm text-slate-500">No pipeline history recorded.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] text-left text-xs">
                  <thead className="text-[10px] font-mono uppercase text-slate-400"><tr><th className="pb-2">Run time</th><th className="pb-2">Status</th><th className="pb-2">Rows</th><th className="pb-2">Spikes</th><th className="pb-2">Latest data</th></tr></thead>
                  <tbody>{data.pipeline_history.map((run, index) => <tr key={`${run.run_at}-${index}`} className="border-t border-slate-100 dark:border-slate-800"><td className="py-2 pr-2 text-slate-600 dark:text-slate-300">{label(run.run_at)}</td><td className="py-2 pr-2"><StatusPill value={run.status} /></td><td className="py-2 pr-2">{number(run.new_records, 0)}</td><td className="py-2 pr-2">{number(run.new_spikes, 0)}</td><td className="py-2">{run.latest_data_date || "—"}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Panel>
        </section>

        <Panel title="Recent food price alerts">
          {data.alerts.length === 0 ? <p className="text-sm text-slate-500">No alert events have been captured by the automation workflow yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead className="text-[10px] font-mono uppercase text-slate-400"><tr><th className="pb-2">Date</th><th className="pb-2">District / market</th><th className="pb-2">Commodity</th><th className="pb-2">Previous</th><th className="pb-2">Current</th><th className="pb-2">Change</th><th className="pb-2">Severity</th><th className="pb-2">Dashboard</th></tr></thead>
                <tbody>{data.alerts.map(alert => <tr key={alert.id} className="border-t border-slate-100 dark:border-slate-800"><td className="py-2 pr-2">{alert.event_date}</td><td className="py-2 pr-3"><span className="font-medium">{alert.district}</span><span className="block text-slate-400">{alert.market}</span></td><td className="py-2 pr-2">{alert.commodity} ({alert.unit})</td><td className="py-2 pr-2">{number(alert.previous_price, 2)}</td><td className="py-2 pr-2">{number(alert.current_price, 2)}</td><td className="py-2 pr-2">{number(alert.pct_change, 1)}%</td><td className="py-2 pr-2"><StatusPill value={alert.severity} /></td><td className="py-2"><StatusPill value={alert.dashboard_delivery} /></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Panel>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Notification delivery">
            {data.notification_deliveries.length === 0 ? <p className="text-sm text-slate-500">No delivery attempts recorded.</p> : (
              <div className="space-y-2">{data.notification_deliveries.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800"><div><span className="text-sm font-medium capitalize text-slate-700 dark:text-slate-200">{item.channel}</span><span className="ml-2 text-xs text-slate-400">{item.alert_id ? `Alert ${item.alert_id}` : item.report_id ? "Weekly report" : item.automation_run_id ? "Workflow failure" : "System"}{item.severity ? ` · ${item.severity}` : ""}</span></div><div className="flex items-center gap-2"><span className="text-[10px] text-slate-400">Attempts {item.attempt_count}</span><StatusPill value={item.status} /></div></div>)}</div>
            )}
            <p className="mt-3 text-[11px] text-slate-400">Dashboard delivery is enabled. External email, WhatsApp and SMS require provider credentials.</p>
          </Panel>

          <Panel title="Latest weekly intelligence report">
            {!data.latest_report ? <p className="text-sm text-slate-500">No weekly report has been generated yet.</p> : <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{data.latest_report.period_start} – {data.latest_report.period_end}</span><span>{data.latest_report.model || "Evidence summary"} · {label(data.latest_report.generated_at)}</span></div>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-200">{data.latest_report.content}</pre>
            </>}
          </Panel>
        </section>
        <p className="pb-2 text-[11px] text-slate-400">The Node-RED editor is not exposed through this dashboard. Monitoring data is read-only.</p>
      </>}
    </main>
  )
}
