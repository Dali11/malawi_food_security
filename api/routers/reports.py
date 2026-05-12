"""
routers/reports.py
PDF report generation endpoint using ReportLab (no system deps needed).
"""

from fastapi import APIRouter
from fastapi.responses import Response, JSONResponse
from api.database import get_pool
from datetime import datetime
import traceback

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from io import BytesIO

router = APIRouter(prefix="/api/reports", tags=["Reports"])

# ── Colour palette ────────────────────────────────────────────
NAVY       = colors.HexColor("#1B3A6B")
GOLD       = colors.HexColor("#F5C842")
RED        = colors.HexColor("#B71C1C")
ORANGE     = colors.HexColor("#E65100")
AMBER      = colors.HexColor("#F9A825")
GREEN      = colors.HexColor("#2E7D32")
LIGHT_GREY = colors.HexColor("#F8F9FA")
MID_GREY   = colors.HexColor("#666666")


def risk_color(score):
    if score >= 277: return RED
    if score >= 199: return colors.HexColor("#EF5350")
    if score >= 126: return AMBER
    if score >= 59:  return colors.HexColor("#FFE082")
    return colors.HexColor("#A5D6A7")


def risk_label(score):
    if score >= 277: return "Critical"
    if score >= 199: return "High"
    if score >= 126: return "Moderate"
    if score >= 59:  return "Low"
    return "Stable"


def build_pdf(data: dict) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
        title="Malawi Food Security Monitor",
    )

    styles = getSampleStyleSheet()
    story  = []

    # ── Styles ────────────────────────────────────────────────
    title_style = ParagraphStyle("title",
        fontSize=28, textColor=colors.white,
        fontName="Helvetica-Bold", spaceAfter=6)
    sub_style = ParagraphStyle("sub",
        fontSize=14, textColor=colors.HexColor("#A8C4E8"),
        fontName="Helvetica", spaceAfter=20)
    meta_style = ParagraphStyle("meta",
        fontSize=10, textColor=colors.HexColor("#A8C4E8"),
        fontName="Helvetica", spaceAfter=4)
    h2_style = ParagraphStyle("h2",
        fontSize=16, textColor=NAVY,
        fontName="Helvetica-Bold", spaceAfter=4)
    body_style = ParagraphStyle("body",
        fontSize=9, textColor=colors.HexColor("#333333"),
        fontName="Helvetica", spaceAfter=6)
    alert_style = ParagraphStyle("alert",
        fontSize=9, textColor=colors.HexColor("#333333"),
        fontName="Helvetica", spaceAfter=6,
        leftIndent=8, rightIndent=8)

    summary       = data["summary"]
    districts     = data["districts"]
    crit_spikes   = data["critical_spikes"]
    commodities   = data["commodities"]
    gaps          = data["gaps"]
    generated_at  = datetime.now().strftime("%d %B %Y")

    # ══ COVER PAGE ════════════════════════════════════════════
    cover_table = Table([[
        Table([
            [Paragraph("CONFIDENTIAL ANALYTICAL REPORT", ParagraphStyle(
                "badge2", fontSize=9, fontName="Helvetica-Bold",
                textColor=NAVY, backColor=GOLD))],
            [Spacer(1, 30)],
            [Paragraph("Malawi Food Security Monitor", title_style)],
            [Paragraph("Food Price Spike Analysis &amp; District Risk Assessment", sub_style)],
            [HRFlowable(width=60, thickness=4, color=GOLD, spaceAfter=20)],
            [Paragraph(f"<b>Analysis Period:</b>  January 2020 - April 2026", meta_style)],
            [Paragraph(f"<b>Data Source:</b>  World Food Programme (WFP) VAM Food Price Database", meta_style)],
            [Paragraph(f"<b>Geographic Scope:</b>  {summary['total_districts']} Districts - {summary['total_markets']} Markets - 3 Regions", meta_style)],
            [Paragraph(f"<b>Report Generated:</b>  {generated_at}", meta_style)],
            [Paragraph("<b>Classification:</b>  For Official Use - NGO / Government Partners", meta_style)],
        ], colWidths=[150*mm])
    ]], colWidths=[170*mm])

    cover_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY),
        ("TOPPADDING",    (0,0), (-1,-1), 40),
        ("BOTTOMPADDING", (0,0), (-1,-1), 40),
        ("LEFTPADDING",   (0,0), (-1,-1), 30),
    ]))
    story.append(cover_table)
    story.append(PageBreak())

    # ══ EXECUTIVE SUMMARY ════════════════════════════════════
    story.append(Paragraph("Executive Summary", h2_style))
    story.append(HRFlowable(width="100%", thickness=3, color=NAVY, spaceAfter=12))

    spike_total = summary["spike_events"]["total"] or 1
    stat_data = [[
        _stat_cell("Markets Monitored",   str(summary["total_markets"]),   f"{summary['total_districts']} districts", NAVY),
        _stat_cell("Critical Spikes",     str(summary["spike_events"]["critical"]), f"of {summary['spike_events']['total']:,} total", RED),
        _stat_cell("Highest Risk",        summary["highest_risk_district"]["name"], f"Score: {int(summary['highest_risk_district']['risk_score'])}", ORANGE),
        _stat_cell("Monitoring Gaps",     str(summary["monitoring_gaps"]["critical_gap_districts"]), "critical gap districts", RED),
    ]]
    stat_table = Table(stat_data, colWidths=[40*mm]*4)
    stat_table.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), LIGHT_GREY),
        ("BOX",           (0,0), (-1,-1), 0.5, colors.HexColor("#E0E0E0")),
        ("INNERGRID",     (0,0), (-1,-1), 0.5, colors.HexColor("#E0E0E0")),
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
    ]))
    story.append(stat_table)
    story.append(Spacer(1, 12))

    alert_text = (
        f"<b>Key Finding:</b> {summary['highest_risk_district']['name']} District has the highest "
        f"risk score ({int(summary['highest_risk_district']['risk_score'])}). "
        f"{summary['spike_events']['critical']} critical price spike events were detected. "
        f"Most affected commodity: <b>{summary['most_spiked_commodity']['name']}</b> with "
        f"{summary['most_spiked_commodity']['critical_events']} critical events."
    )
    alert_table = Table([[Paragraph(alert_text, alert_style)]], colWidths=[170*mm])
    alert_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,-1), colors.HexColor("#FFF3E0")),
        ("BOX",          (0,0), (-1,-1), 1, colors.HexColor("#FFB74D")),
        ("LINEBEFORE",   (0,0), (0,-1),  4, ORANGE),
        ("TOPPADDING",   (0,0), (-1,-1), 10),
        ("BOTTOMPADDING",(0,0), (-1,-1), 10),
    ]))
    story.append(alert_table)
    story.append(Spacer(1, 12))

    sev_data = [
        [_hdr("Severity"), _hdr("Threshold"), _hdr("Count"), _hdr("% of Total"), _hdr("Action")],
        [_red("Critical"),  ">=60% + z>=2.5", _red(str(summary["spike_events"]["critical"])),
         f"{round(summary['spike_events']['critical']/spike_total*100,2)}%", "Immediate intervention"],
        [_orange("Severe"), ">=40% + z>=2.0", _orange(str(summary["spike_events"]["severe"])),
         f"{round(summary['spike_events']['severe']/spike_total*100,2)}%",   "Prepare emergency response"],
        [_amber("Moderate"),">=20% + z>=1.5", _amber(str(summary["spike_events"]["moderate"])),
         f"{round(summary['spike_events']['moderate']/spike_total*100,2)}%", "Monitor closely"],
        ["Normal", "Below thresholds",
         str(summary["spike_events"]["total"] - summary["spike_events"]["critical"] -
             summary["spike_events"]["severe"] - summary["spike_events"]["moderate"]),
         "-", "No action required"],
    ]
    story.append(_make_table(sev_data, [35*mm, 45*mm, 25*mm, 28*mm, 37*mm]))
    story.append(PageBreak())

    # ══ DISTRICT RISK RANKINGS ════════════════════════════════
    story.append(Paragraph("District Risk Rankings", h2_style))
    story.append(HRFlowable(width="100%", thickness=3, color=NAVY, spaceAfter=12))
    story.append(Paragraph(
        "All districts ranked by weighted composite risk score (Critical x3 + Severe x2 + Moderate x1)",
        body_style))

    dist_data = [[_hdr("#"), _hdr("District"), _hdr("Region"), _hdr("Risk Level"),
                  _hdr("Score"), _hdr("Critical"), _hdr("Severe"), _hdr("Moderate"), _hdr("Spike Rate")]]
    for i, d in enumerate(districts, 1):
        rc = risk_color(d["risk_score"])
        rl = risk_label(d["risk_score"])
        dist_data.append([
            str(i), Paragraph(f"<b>{d['name_1']}</b>", body_style), d["region"],
            Paragraph(f'<font color="{rc.hexval()}">{rl}</font>', body_style),
            Paragraph(f'<font color="{rc.hexval()}"><b>{int(d["risk_score"])}</b></font>', body_style),
            Paragraph(f'<font color="{RED.hexval()}"><b>{d["critical_count"]}</b></font>', body_style),
            str(d["severe_count"]), str(d["moderate_count"]),
            f"{round(float(d['spike_rate_pct']),1)}%",
        ])
    story.append(_make_table(dist_data, [10*mm,32*mm,22*mm,22*mm,18*mm,18*mm,16*mm,20*mm,18*mm]))
    story.append(PageBreak())

    # ══ CRITICAL SPIKE EVENTS ════════════════════════════════
    story.append(Paragraph("Critical Spike Events", h2_style))
    story.append(HRFlowable(width="100%", thickness=3, color=NAVY, spaceAfter=12))
    spike_data = [[_hdr("Date"), _hdr("District"), _hdr("Market"),
                   _hdr("Commodity"), _hdr("Price (MWK)"), _hdr("% Jump")]]
    for s in crit_spikes[:20]:
        spike_data.append([
            s["date"], Paragraph(f"<b>{s['district']}</b>", body_style),
            s["market"], Paragraph(f"<b>{s['commodity']}</b>", body_style),
            f"{int(float(s['price'])):,}",
            Paragraph(f'<font color="{RED.hexval()}"><b>+{round(float(s["pct_change"]),1)}%</b></font>', body_style),
        ])
    story.append(_make_table(spike_data, [22*mm,30*mm,35*mm,30*mm,28*mm,25*mm]))
    story.append(PageBreak())

    # ══ COMMODITY ANALYSIS ════════════════════════════════════
    story.append(Paragraph("Commodity Analysis", h2_style))
    story.append(HRFlowable(width="100%", thickness=3, color=NAVY, spaceAfter=12))
    comm_data = [[_hdr("Commodity"), _hdr("Critical Events"), _hdr("Total Spikes"), _hdr("Spike Rate")]]
    for c in commodities:
        comm_data.append([
            Paragraph(f"<b>{c['commodity']}</b>", body_style),
            Paragraph(f'<font color="{RED.hexval()}"><b>{c["critical_count"]}</b></font>', body_style),
            str(c["total_spikes"]),
            f"{round(float(c['spike_rate']),1)}%",
        ])
    story.append(_make_table(comm_data, [60*mm, 40*mm, 40*mm, 30*mm]))
    story.append(PageBreak())

    # ══ MONITORING GAPS ═══════════════════════════════════════
    story.append(Paragraph("Market Monitoring Gaps", h2_style))
    story.append(HRFlowable(width="100%", thickness=3, color=NAVY, spaceAfter=12))
    gap_data = [[_hdr("District"), _hdr("Region"), _hdr("Risk Score"),
                 _hdr("Markets"), _hdr("Monitoring Status")]]
    status_colors = {
        "CRITICAL GAP": RED, "HIGH GAP": ORANGE,
        "MODERATE GAP": AMBER, "ADEQUATE": GREEN, "NO MONITORING": MID_GREY,
    }
    for g in gaps:
        sc = status_colors.get(g["monitoring_status"], MID_GREY)
        gap_data.append([
            Paragraph(f"<b>{g['district']}</b>", body_style), g["region"],
            Paragraph(f'<font color="{RED.hexval()}"><b>{int(g["risk_score"])}</b></font>', body_style),
            str(int(g["market_count"])),
            Paragraph(f'<font color="{sc.hexval()}"><b>{g["monitoring_status"]}</b></font>', body_style),
        ])
    story.append(_make_table(gap_data, [40*mm, 30*mm, 28*mm, 25*mm, 47*mm]))

    doc.build(story)
    return buffer.getvalue()


# ── Helpers ───────────────────────────────────────────────────
def _hdr(text):
    return Paragraph(f"<b>{text}</b>", ParagraphStyle(
        "th", fontSize=8, textColor=colors.white,
        fontName="Helvetica-Bold"))

def _red(text):
    return Paragraph(f'<font color="{RED.hexval()}"><b>{text}</b></font>',
        ParagraphStyle("td", fontSize=9, fontName="Helvetica"))

def _orange(text):
    return Paragraph(f'<font color="{ORANGE.hexval()}"><b>{text}</b></font>',
        ParagraphStyle("td", fontSize=9, fontName="Helvetica"))

def _amber(text):
    return Paragraph(f'<font color="{AMBER.hexval()}"><b>{text}</b></font>',
        ParagraphStyle("td", fontSize=9, fontName="Helvetica"))

def _make_table(data, col_widths):
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0),  NAVY),
        ("TEXTCOLOR",     (0,0), (-1,0),  colors.white),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [colors.white, LIGHT_GREY]),
        ("GRID",          (0,0), (-1,-1), 0.4, colors.HexColor("#E8E8E8")),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("FONTSIZE",      (0,1), (-1,-1), 8.5),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    return t

def _stat_cell(label, value, sub, color):
    return Table([
        [Paragraph(label.upper(), ParagraphStyle("slbl", fontSize=7, textColor=MID_GREY,
            fontName="Helvetica"))],
        [Paragraph(f'<font color="{color.hexval()}"><b>{value}</b></font>',
            ParagraphStyle("sval", fontSize=18, fontName="Helvetica-Bold"))],
        [Paragraph(sub, ParagraphStyle("ssub", fontSize=7, textColor=MID_GREY,
            fontName="Helvetica"))],
    ], colWidths=[36*mm])


# ── Endpoint ──────────────────────────────────────────────────
@router.get("/generate")
async def generate_report():
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:

            summary_row = await conn.fetchrow("""
                SELECT
                    (SELECT COUNT(*) FROM markets)                       AS total_markets,
                    (SELECT COUNT(DISTINCT name_1) FROM districts_risk)  AS total_districts
            """)
            spike_counts = await conn.fetchrow("""
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN spike_severity='Critical' THEN 1 ELSE 0 END) AS critical,
                    SUM(CASE WHEN spike_severity='Severe'   THEN 1 ELSE 0 END) AS severe,
                    SUM(CASE WHEN spike_severity='Moderate' THEN 1 ELSE 0 END) AS moderate
                FROM spikes
            """)
            top_district = await conn.fetchrow("""
                SELECT name_1, region, risk_score FROM districts_risk
                ORDER BY risk_score DESC LIMIT 1
            """)
            top_commodity = await conn.fetchrow("""
                SELECT commodity, COUNT(*) AS critical_events FROM spikes
                WHERE spike_severity='Critical'
                GROUP BY commodity ORDER BY critical_events DESC LIMIT 1
            """)
            monitoring_gaps = await conn.fetchrow("""
                SELECT COUNT(*) AS gap_count FROM (
                    SELECT d.name_1 FROM districts_risk d
                    LEFT JOIN markets m ON ST_Within(m.wkb_geometry, d.wkb_geometry)
                    GROUP BY d.name_1, d.risk_score
                    HAVING (d.risk_score > 400)
                        OR (d.risk_score > 200 AND COUNT(m.ogc_fid) < 8)
                ) gaps
            """)
            districts = await conn.fetch("""
                SELECT name_1, region, risk_score, critical_count,
                       severe_count, moderate_count, spike_rate_pct
                FROM districts_risk ORDER BY risk_score DESC
            """)
            critical_spikes = await conn.fetch("""
                SELECT date::text, district, market, commodity, price, pct_change
                FROM spikes WHERE spike_severity='Critical'
                ORDER BY date DESC LIMIT 20
            """)
            commodities = await conn.fetch("""
                SELECT commodity,
                    SUM(CASE WHEN spike_severity='Critical' THEN 1 ELSE 0 END) AS critical_count,
                    COUNT(*) AS total_spikes,
                    ROUND(COUNT(*)::numeric / NULLIF(
                        (SELECT COUNT(*) FROM spikes WHERE spike_severity != 'Normal'), 0
                    ) * 100, 2) AS spike_rate
                FROM spikes WHERE spike_severity != 'Normal'
                GROUP BY commodity ORDER BY critical_count DESC LIMIT 15
            """)
            gaps = await conn.fetch("""
                SELECT d.name_1 AS district, d.region, d.risk_score,
                    COUNT(m.ogc_fid) AS market_count,
                    CASE
                        WHEN COUNT(m.ogc_fid) = 0         THEN 'NO MONITORING'
                        WHEN d.risk_score > 400            THEN 'CRITICAL GAP'
                        WHEN d.risk_score > 200 AND COUNT(m.ogc_fid) < 8 THEN 'CRITICAL GAP'
                        WHEN d.risk_score > 100 AND COUNT(m.ogc_fid) < 4 THEN 'HIGH GAP'
                        WHEN d.risk_score > 50  AND COUNT(m.ogc_fid) < 2 THEN 'MODERATE GAP'
                        ELSE 'ADEQUATE'
                    END AS monitoring_status
                FROM districts_risk d
                LEFT JOIN markets m ON ST_Within(m.wkb_geometry, d.wkb_geometry)
                GROUP BY d.name_1, d.region, d.risk_score
                ORDER BY d.risk_score DESC
            """)

        data = {
            "summary": {
                "total_markets"   : summary_row["total_markets"],
                "total_districts" : summary_row["total_districts"],
                "spike_events": {
                    "total"   : spike_counts["total"]    or 0,
                    "critical": spike_counts["critical"] or 0,
                    "severe"  : spike_counts["severe"]   or 0,
                    "moderate": spike_counts["moderate"] or 0,
                },
                "highest_risk_district": {
                    "name"      : top_district["name_1"]            if top_district else "N/A",
                    "region"    : top_district["region"]            if top_district else "N/A",
                    "risk_score": float(top_district["risk_score"]) if top_district else 0,
                },
                "most_spiked_commodity": {
                    "name"           : top_commodity["commodity"]       if top_commodity else "N/A",
                    "critical_events": top_commodity["critical_events"] if top_commodity else 0,
                },
                "monitoring_gaps": {
                    "critical_gap_districts": monitoring_gaps["gap_count"] or 0
                },
            },
            "districts"      : [dict(r) for r in districts],
            "critical_spikes": [dict(r) for r in critical_spikes],
            "commodities"    : [dict(r) for r in commodities],
            "gaps"           : [dict(r) for r in gaps],
        }

        pdf_bytes = build_pdf(data)
        filename  = f"malawi_food_security_{datetime.now().strftime('%Y-%m-%d')}.pdf"

        return Response(
            content    = pdf_bytes,
            media_type = "application/pdf",
            headers    = {"Content-Disposition": f"attachment; filename={filename}"},
        )

    except Exception as e:
        return JSONResponse(status_code=500, content={
            "error": str(e), "trace": traceback.format_exc()
        })