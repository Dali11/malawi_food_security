export interface AutomationOverview {
  health: {
    api: string
    database: string
    node_red: string
    node_red_last_seen: string | null
    server_time: string
  }
  schedule: {
    pipeline_cron: string
    report_cron: string
    timezone: string
    next_pipeline_run: string | null
    next_report_run: string | null
  }
  latest_pipeline: {
    run_at: string | null
    status: string
    new_records: number
    new_spikes: number
    new_critical: number
    latest_data_date: string | null
    notes: string | null
  }
  pipeline_history: Array<{
    run_at: string
    status: string
    new_records: number
    new_spikes: number
    new_critical: number
    latest_data_date: string | null
    notes: string
  }>
  runs: Array<{
    run_id: string
    workflow: string
    trigger: string
    status: string
    started_at: string | null
    finished_at: string | null
    duration_ms: number | null
    new_records: number
    new_spikes: number
    new_critical: number
    latest_data_date: string | null
    error: string | null
  }>
  alerts: Array<{
    id: number
    event_date: string
    district: string
    market: string
    commodity: string
    unit: string
    previous_price: number | string | null
    current_price: number | string
    pct_change: number | string
    zscore: number | string
    severity: string
    state: string
    first_seen_at: string
    dashboard_delivery: string
  }>
  notification_deliveries: Array<{
    id: number
    alert_id: number | null
    report_id: string | null
    automation_run_id: string | null
    channel: string
    severity: string | null
    status: string
    attempt_count: number
    last_attempt_at: string | null
    delivered_at: string | null
    last_error: string | null
  }>
  pending_field_observations: number
  latest_report: {
    id: string
    period_start: string
    period_end: string
    status: string
    content: string
    generated_at: string
    model: string | null
  } | null
}
