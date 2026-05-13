"""
template.py
HTML template for the Malawi Food Security PDF report.
WeasyPrint converts this HTML+CSS to PDF.
"""

from datetime import datetime


def build_html(data: dict) -> str:
    """Build the full HTML report from query data."""

    summary        = data["summary"]
    districts      = data["districts"]
    critical_spikes= data["critical_spikes"]
    commodities    = data["commodities"]
    gaps           = data["gaps"]
    generated_at   = datetime.now().strftime("%d %B %Y")

    # ── District rows ─────────────────────────────────────────────────────
    def risk_color(score):
        if score >= 277: return "#B71C1C"
        if score >= 199: return "#EF5350"
        if score >= 126: return "#FFAB40"
        if score >= 59:  return "#FFE082"
        return "#A5D6A7"

    def risk_label(score):
        if score >= 277: return "Critical"
        if score >= 199: return "High"
        if score >= 126: return "Moderate"
        if score >= 59:  return "Low"
        return "Stable"

    district_rows = ""
    for i, d in enumerate(districts, 1):
        color = risk_color(d["risk_score"])
        label = risk_label(d["risk_score"])
        district_rows += f"""
        <tr>
            <td>{i}</td>
            <td><b>{d["name_1"]}</b></td>
            <td>{d["region"]}</td>
            <td style="color:{color};font-weight:bold">{label}</td>
            <td style="color:{color};font-weight:bold">{int(d["risk_score"])}</td>
            <td style="color:#B71C1C;font-weight:bold">{d["critical_count"]}</td>
            <td>{d["severe_count"]}</td>
            <td>{d["moderate_count"]}</td>
            <td>{round(float(d["spike_rate_pct"]),1)}%</td>
        </tr>"""

    # ── Spike rows ────────────────────────────────────────────────────────
    spike_rows = ""
    for s in critical_spikes[:20]:
        spike_rows += f"""
        <tr>
            <td>{s["date"]}</td>
            <td><b>{s["district"]}</b></td>
            <td>{s["market"]}</td>
            <td><b>{s["commodity"]}</b></td>
            <td>{int(float(s["price"])):,} MWK</td>
            <td style="color:#B71C1C;font-weight:bold">+{round(float(s["pct_change"]),1)}%</td>
        </tr>"""

    # ── Commodity rows ────────────────────────────────────────────────────
    commodity_rows = ""
    for c in commodities:
        commodity_rows += f"""
        <tr>
            <td><b>{c["commodity"]}</b></td>
            <td style="color:#B71C1C;font-weight:bold">{c["critical_count"]}</td>
            <td>{c["total_spikes"]}</td>
            <td>{round(float(c["spike_rate"]),1)}%</td>
        </tr>"""

    # ── Gap rows ──────────────────────────────────────────────────────────
    gap_rows = ""
    for g in gaps:
        status_color = {
            "CRITICAL GAP": "#B71C1C",
            "HIGH GAP"    : "#E65100",
            "MODERATE GAP": "#F9A825",
            "ADEQUATE"    : "#2E7D32",
            "NO MONITORING": "#666666",
        }.get(g["monitoring_status"], "#333333")

        gap_rows += f"""
        <tr>
            <td><b>{g["district"]}</b></td>
            <td>{g["region"]}</td>
            <td style="color:#B71C1C;font-weight:bold">{int(g["risk_score"])}</td>
            <td>{int(g["market_count"])}</td>
            <td style="color:{status_color};font-weight:bold">{g["monitoring_status"]}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }}

  /* ── Cover page ── */
  .cover {{
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 60px;
    background: #1B3A6B;
    color: white;
  }}
  .cover-badge {{
    background: #f5c842;
    color: #1B3A6B;
    display: inline-block;
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 10pt;
    font-weight: bold;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 40px;
    width: fit-content;
  }}
  .cover h1 {{
    font-size: 32pt;
    font-weight: bold;
    line-height: 1.2;
    margin-bottom: 16px;
  }}
  .cover h2 {{
    font-size: 16pt;
    font-weight: normal;
    color: #a8c4e8;
    margin-bottom: 48px;
  }}
  .cover-divider {{
    width: 80px;
    height: 4px;
    background: #f5c842;
    margin-bottom: 40px;
  }}
  .cover-meta {{ color: #a8c4e8; font-size: 11pt; line-height: 2; }}
  .cover-meta b {{ color: white; }}

  /* ── Pages ── */
  .page {{
    padding: 40px 50px;
    page-break-after: always;
  }}
  .page:last-child {{ page-break-after: auto; }}

  /* ── Headers ── */
  .page-header {{
    border-bottom: 3px solid #1B3A6B;
    padding-bottom: 12px;
    margin-bottom: 24px;
  }}
  .page-header h2 {{
    font-size: 18pt;
    color: #1B3A6B;
    font-weight: bold;
  }}
  .page-header p {{
    color: #666;
    font-size: 9pt;
    margin-top: 4px;
  }}

  /* ── Stat cards ── */
  .stat-grid {{
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 32px;
  }}
  .stat-card {{
    background: #f8f9fa;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 16px;
    border-left: 4px solid #1B3A6B;
  }}
  .stat-card .label {{
    font-size: 8pt;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }}
  .stat-card .value {{
    font-size: 20pt;
    font-weight: bold;
    color: #1B3A6B;
    line-height: 1;
  }}
  .stat-card .sub {{
    font-size: 8pt;
    color: #999;
    margin-top: 4px;
  }}
  .stat-card.red   {{ border-left-color: #B71C1C; }}
  .stat-card.red .value {{ color: #B71C1C; }}
  .stat-card.amber {{ border-left-color: #E65100; }}
  .stat-card.amber .value {{ color: #E65100; }}
  .stat-card.green {{ border-left-color: #2E7D32; }}
  .stat-card.green .value {{ color: #2E7D32; }}

  /* ── Tables ── */
  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
    margin-bottom: 24px;
  }}
  th {{
    background: #1B3A6B;
    color: white;
    padding: 8px 10px;
    text-align: left;
    font-size: 8.5pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }}
  td {{
    padding: 7px 10px;
    border-bottom: 1px solid #e8e8e8;
    vertical-align: middle;
  }}
  tr:nth-child(even) td {{ background: #f8f9fa; }}
  tr:hover td {{ background: #eef2ff; }}

  /* ── Alert box ── */
  .alert-box {{
    background: #FFF3E0;
    border: 1px solid #FFB74D;
    border-left: 4px solid #E65100;
    border-radius: 4px;
    padding: 14px 18px;
    margin-bottom: 20px;
    font-size: 10pt;
  }}
  .alert-box b {{ color: #E65100; }}

  /* ── Footer ── */
  @page {{
    margin: 0;
    @bottom-center {{
      content: "Malawi Food Security Monitor — WFP VAM Data — Confidential";
      font-size: 8pt;
      color: #999;
    }}
    @bottom-right {{
      content: "Page " counter(page) " of " counter(pages);
      font-size: 8pt;
      color: #999;
    }}
  }}

  .section-intro {{
    background: #EEF2FF;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 20px;
    font-size: 10pt;
    color: #333;
    border-left: 3px solid #1B3A6B;
  }}
</style>
</head>
<body>

<!-- ══ COVER PAGE ══════════════════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-badge">Confidential Analytical Report</div>
  <h1>Malawi Food Security Monitor</h1>
  <h2>Food Price Spike Analysis &amp; District Risk Assessment</h2>
  <div class="cover-divider"></div>
  <div class="cover-meta">
    <div><b>Analysis Period:</b> January 2020 – April 2026</div>
    <div><b>Data Source:</b> World Food Programme (WFP) VAM Food Price Database</div>
    <div><b>Geographic Scope:</b> {summary["total_districts"]} Districts · {summary["total_markets"]} Markets · 3 Regions</div>
    <div><b>Report Generated:</b> {generated_at}</div>
    <div><b>Classification:</b> For Official Use — NGO / Government Partners</div>
  </div>
</div>

<!-- ══ EXECUTIVE SUMMARY ═══════════════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <h2>Executive Summary</h2>
    <p>Key findings from the automated food price spike detection system</p>
  </div>

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Markets Monitored</div>
      <div class="value">{summary["total_markets"]}</div>
      <div class="sub">{summary["total_districts"]} districts covered</div>
    </div>
    <div class="stat-card red">
      <div class="label">Critical Spikes</div>
      <div class="value">{summary["spike_events"]["critical"]}</div>
      <div class="sub">of {summary["spike_events"]["total"]:,} total events</div>
    </div>
    <div class="stat-card amber">
      <div class="label">Highest Risk District</div>
      <div class="value">{summary["highest_risk_district"]["name"]}</div>
      <div class="sub">Score: {summary["highest_risk_district"]["risk_score"]}</div>
    </div>
    <div class="stat-card red">
      <div class="label">Monitoring Gaps</div>
      <div class="value">{summary["monitoring_gaps"]["critical_gap_districts"]}</div>
      <div class="sub">critical gap districts</div>
    </div>
  </div>

  <div class="alert-box">
    <b>Key Finding:</b> {summary["highest_risk_district"]["name"]} District in Southern Region
    has the highest food security risk score ({summary["highest_risk_district"]["risk_score"]})
    in Malawi. {summary["spike_events"]["critical"]} critical price spike events were detected
    across the analysis period. The most affected commodity is
    <b>{summary["most_spiked_commodity"]["name"]}</b> with
    {summary["most_spiked_commodity"]["critical_events"]} critical events —
    representing over 70% of all critical spikes.
  </div>

  <div class="section-intro">
    <b>Methodology:</b> Spike detection uses a dual-method approach requiring both
    month-over-month percentage change ≥20% AND rolling 12-month z-score ≥1.5.
    This eliminates false positives from seasonal variation. Severity follows the
    WFP ALPS (Alert for Price Spikes) framework.
  </div>

  <table>
    <tr>
      <th>Severity Level</th>
      <th>Threshold</th>
      <th>Count</th>
      <th>% of Observations</th>
      <th>Recommended Action</th>
    </tr>
    <tr>
      <td style="color:#B71C1C;font-weight:bold">Critical</td>
      <td>≥60% change + z-score ≥2.5</td>
      <td style="color:#B71C1C;font-weight:bold">{summary["spike_events"]["critical"]}</td>
      <td>{round(summary["spike_events"]["critical"]/summary["spike_events"]["total"]*100,2)}%</td>
      <td>Immediate intervention required</td>
    </tr>
    <tr>
      <td style="color:#E65100;font-weight:bold">Severe</td>
      <td>≥40% change + z-score ≥2.0</td>
      <td style="color:#E65100;font-weight:bold">{summary["spike_events"]["severe"]}</td>
      <td>{round(summary["spike_events"]["severe"]/summary["spike_events"]["total"]*100,2)}%</td>
      <td>Prepare emergency response</td>
    </tr>
    <tr>
      <td style="color:#F9A825;font-weight:bold">Moderate</td>
      <td>≥20% change + z-score ≥1.5</td>
      <td style="color:#F9A825;font-weight:bold">{summary["spike_events"]["moderate"]}</td>
      <td>{round(summary["spike_events"]["moderate"]/summary["spike_events"]["total"]*100,2)}%</td>
      <td>Monitor closely</td>
    </tr>
    <tr>
      <td style="color:#2E7D32;font-weight:bold">Normal</td>
      <td>Below thresholds</td>
      <td style="color:#2E7D32;font-weight:bold">~25,688</td>
      <td>90.82%</td>
      <td>No action required</td>
    </tr>
  </table>
</div>

<!-- ══ DISTRICT RISK RANKINGS ══════════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <h2>District Risk Rankings</h2>
    <p>All 28 districts ranked by weighted composite risk score (Critical×3 + Severe×2 + Moderate×1)</p>
  </div>

  <table>
    <tr>
      <th>#</th>
      <th>District</th>
      <th>Region</th>
      <th>Risk Level</th>
      <th>Risk Score</th>
      <th>Critical</th>
      <th>Severe</th>
      <th>Moderate</th>
      <th>Spike Rate</th>
    </tr>
    {district_rows}
  </table>
</div>

<!-- ══ CRITICAL SPIKE EVENTS ═══════════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <h2>Critical Spike Events</h2>
    <p>Most recent critical price spike events (price jump ≥60% + z-score ≥2.5)</p>
  </div>

  <table>
    <tr>
      <th>Date</th>
      <th>District</th>
      <th>Market</th>
      <th>Commodity</th>
      <th>Price (MWK)</th>
      <th>% Jump</th>
    </tr>
    {spike_rows}
  </table>
</div>

<!-- ══ COMMODITY ANALYSIS ══════════════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <h2>Commodity Analysis</h2>
    <p>Which commodities experienced the most price shocks</p>
  </div>

  <table>
    <tr>
      <th>Commodity</th>
      <th>Critical Events</th>
      <th>Total Spikes</th>
      <th>Spike Rate</th>
    </tr>
    {commodity_rows}
  </table>
</div>

<!-- ══ MONITORING GAPS ═════════════════════════════════════════════════════ -->
<div class="page">
  <div class="page-header">
    <h2>Market Monitoring Gaps</h2>
    <p>Districts with high food security risk but insufficient market monitoring coverage</p>
  </div>

  <div class="alert-box">
    <b>Why this matters:</b> A district with high risk score but few monitored markets
    means food crises may go undetected. These gaps represent priority areas for
    WFP monitoring expansion.
  </div>

  <table>
    <tr>
      <th>District</th>
      <th>Region</th>
      <th>Risk Score</th>
      <th>Markets</th>
      <th>Monitoring Status</th>
    </tr>
    {gap_rows}
  </table>

  <div class="section-intro" style="margin-top:20px">
    <b>Report generated by:</b> Malawi Food Security GIS Monitor |
    <b>Data source:</b> WFP VAM Food Price Database |
    <b>Generated:</b> {generated_at} |
    <b>System_url:</b> https://malawi-food-security-git-master-dali11s-projects.vercel.app/
  </div>
</div>

</body>
</html>"""
