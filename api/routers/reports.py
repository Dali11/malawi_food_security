"""
routers/reports.py
Professional PDF report using ReportLab — matches WeasyPrint quality.
"""

from fastapi import APIRouter
from fastapi.responses import Response, JSONResponse
from api.database import get_pool
from datetime import datetime
import traceback
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.platypus.flowables import Flowable

router = APIRouter(prefix="/api/reports", tags=["Reports"])

# ── Palette ───────────────────────────────────────────────────
NAVY        = colors.HexColor("#1B3A6B")
NAVY_LIGHT  = colors.HexColor("#2A4F8F")
GOLD        = colors.HexColor("#F5C842")
RED         = colors.HexColor("#B71C1C")
RED_LIGHT   = colors.HexColor("#EF5350")
ORANGE      = colors.HexColor("#E65100")
AMBER       = colors.HexColor("#F9A825")
GREEN       = colors.HexColor("#2E7D32")
BLUE_LIGHT  = colors.HexColor("#A8C4E8")
GREY_BG     = colors.HexColor("#F8F9FA")
GREY_LINE   = colors.HexColor("#E0E0E0")
GREY_MID    = colors.HexColor("#666666")
GREY_DARK   = colors.HexColor("#333333")
ORANGE_BG   = colors.HexColor("#FFF3E0")
ORANGE_LINE = colors.HexColor("#FFB74D")
BLUE_BG     = colors.HexColor("#EEF2FF")
WHITE       = colors.white

W, H = A4  # 210 x 297 mm


# ── Custom Flowables ──────────────────────────────────────────
class ColorRect(Flowable):
    """A solid colored rectangle — used for cover page background."""
    def __init__(self, width, height, fill_color):
        Flowable.__init__(self)
        self.width = width
        self.height = height
        self.fill_color = fill_color

    def draw(self):
        self.canv.setFillColor(self.fill_color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)


class LeftBorderBox(Flowable):
    """Alert box with left colored border."""
    def __init__(self, content_para, width, bg_color, border_color, border_width=4):
        Flowable.__init__(self)
        self.content_para = content_para
        self.width = width
        self.bg_color = bg_color
        self.border_color = border_color
        self.border_width = border_width
        self._height = None

    def wrap(self, availWidth, availHeight):
        w, h = self.content_para.wrap(self.width - self.border_width - 16, availHeight)
        self._height = h + 20
        return self.width, self._height

    def draw(self):
        h = self._height
        c = self.canv
        # Background
        c.setFillColor(self.bg_color)
        c.rect(0, 0, self.width, h, fill=1, stroke=0)
        # Border
        c.setFillColor(self.border_color)
        c.rect(0, 0, self.border_width, h, fill=1, stroke=0)
        # Outer border line
        c.setStrokeColor(self.border_color)
        c.setLineWidth(0.5)
        c.rect(0, 0, self.width, h, fill=0, stroke=1)
        # Draw paragraph
        self.content_para.drawOn(c, self.border_width + 10, 10)


# ── Helper functions ──────────────────────────────────────────
def _style(name, **kwargs):
    defaults = dict(fontName="Helvetica", fontSize=9,
                    textColor=GREY_DARK, spaceAfter=0, spaceBefore=0,
                    leading=12)
    defaults.update(kwargs)
    return ParagraphStyle(name, **defaults)


def _p(text, style):
    return Paragraph(text, style)


def risk_color(score):
    if score >= 277: return RED
    if score >= 199: return RED_LIGHT
    if score >= 126: return AMBER
    if score >= 59:  return colors.HexColor("#F9A825")
    return colors.HexColor("#66BB6A")


def risk_label(score):
    if score >= 277: return "Critical"
    if score >= 199: return "High"
    if score >= 126: return "Moderate"
    if score >= 59:  return "Low"
    return "Stable"


def _table_style(stripe=True):
    base = [
        ("BACKGROUND",    (0, 0), (-1, 0),  NAVY),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0),  8),
        ("TOPPADDING",    (0, 0), (-1, 0),  7),
        ("BOTTOMPADDING", (0, 0), (-1, 0),  7),
        ("LEFTPADDING",   (0, 0), (-1,-1),  8),
        ("RIGHTPADDING",  (0, 0), (-1,-1),  8),
        ("FONTSIZE",      (0, 1), (-1,-1),  8.5),
        ("TOPPADDING",    (0, 1), (-1,-1),  5),
        ("BOTTOMPADDING", (0, 1), (-1,-1),  5),
        ("VALIGN",        (0, 0), (-1,-1),  "MIDDLE"),
        ("LINEBELOW",     (0, 0), (-1,-1),  0.3, GREY_LINE),
        ("ROWBACKGROUNDS",(0, 1), (-1,-1),  [WHITE, GREY_BG]) if stripe else None,
    ]
    return TableStyle([s for s in base if s is not None])


def _hdr(text):
    return _p(f"<b>{text}</b>", _style("hdr", textColor=WHITE,
              fontSize=8, fontName="Helvetica-Bold"))


def _col(text, color, bold=True):
    tag = f'<font color="{color.hexval()}">{"<b>" if bold else ""}{text}{"</b>" if bold else ""}</font>'
    return _p(tag, _style("col"))


def _section_header(story, title, subtitle=""):
    story.append(Spacer(1, 4*mm))
    story.append(_p(title, _style("h2", fontSize=16, textColor=NAVY,
                                   fontName="Helvetica-Bold", spaceAfter=2)))
    story.append(HRFlowable(width="100%", thickness=3, color=NAVY,
                             spaceAfter=4 if subtitle else 8))
    if subtitle:
        story.append(_p(subtitle, _style("sub", fontSize=9, textColor=GREY_MID,
                                          spaceAfter=8)))


# ── Cover page ────────────────────────────────────────────────
def _build_cover(story, summary, generated_at):
    # Full-page navy background using a wide table
    page_w = 170*mm

    badge_style = _style("badge", fontSize=9, fontName="Helvetica-Bold",
                          textColor=NAVY, backColor=GOLD,
                          leftIndent=6, rightIndent=6)
    title_style = _style("ctitle", fontSize=30, textColor=WHITE,
                          fontName="Helvetica-Bold", leading=36, spaceAfter=4)
    sub_style   = _style("csub",   fontSize=14, textColor=BLUE_LIGHT,
                          fontName="Helvetica", leading=20, spaceAfter=24)
    meta_style  = _style("cmeta",  fontSize=10, textColor=BLUE_LIGHT,
                          fontName="Helvetica", leading=18)
    meta_b      = _style("cmetab", fontSize=10, textColor=WHITE,
                          fontName="Helvetica-Bold", leading=18)

    inner = [
        [_p("CONFIDENTIAL ANALYTICAL REPORT", badge_style)],
        [Spacer(1, 20)],
        [_p("Malawi Food Security Monitor", title_style)],
        [_p("Food Price Spike Analysis &amp; District Risk Assessment", sub_style)],
        [HRFlowable(width=60, thickness=4, color=GOLD, spaceAfter=16)],
        [Spacer(1, 8)],
        [_p(f'<font color="#FFFFFF"><b>Analysis Period:</b></font>'
            f'<font color="#A8C4E8">  January 2020 – April 2026</font>', meta_style)],
        [_p(f'<font color="#FFFFFF"><b>Data Source:</b></font>'
            f'<font color="#A8C4E8">  World Food Programme (WFP) VAM Food Price Database</font>', meta_style)],
        [_p(f'<font color="#FFFFFF"><b>Geographic Scope:</b></font>'
            f'<font color="#A8C4E8">  {summary["total_districts"]} Districts · '
            f'{summary["total_markets"]} Markets · 3 Regions</font>', meta_style)],
        [_p(f'<font color="#FFFFFF"><b>Report Generated:</b></font>'
            f'<font color="#A8C4E8">  {generated_at}</font>', meta_style)],
        [_p(f'<font color="#FFFFFF"><b>Classification:</b></font>'
            f'<font color="#A8C4E8">  For Official Use — NGO / Government Partners</font>', meta_style)],
    ]

    inner_t = Table(inner, colWidths=[140*mm])
    inner_t.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 0),
        ("TOPPADDING",   (0,0), (-1,-1), 2),
        ("BOTTOMPADDING",(0,0), (-1,-1), 2),
    ]))

    cover_t = Table([[inner_t]], colWidths=[page_w])
    cover_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), NAVY),
        ("TOPPADDING",    (0,0), (-1,-1), 50),
        ("BOTTOMPADDING", (0,0), (-1,-1), 50),
        ("LEFTPADDING",   (0,0), (-1,-1), 30),
        ("RIGHTPADDING",  (0,0), (-1,-1), 20),
        ("ROWHEIGHT",     (0,0), (-1,-1), 200*mm),
    ]))
    story.append(cover_t)
    story.append(PageBreak())


# ── Stat cards ────────────────────────────────────────────────
def _stat_card(label, value, sub, accent):
    label_s = _style("sl", fontSize=7, textColor=GREY_MID,
                      fontName="Helvetica", leading=10)
    value_s = _style("sv", fontSize=20, textColor=accent,
                      fontName="Helvetica-Bold", leading=24)
    sub_s   = _style("ss", fontSize=7, textColor=GREY_MID,
                      fontName="Helvetica", leading=10)
    inner = Table([
        [_p(label.upper(), label_s)],
        [_p(str(value), value_s)],
        [_p(sub, sub_s)],
    ], colWidths=[38*mm])
    inner.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
        ("TOPPADDING",   (0,0),(-1,-1), 1),
        ("BOTTOMPADDING",(0,0),(-1,-1), 1),
    ]))
    outer = Table([[inner]], colWidths=[42*mm])
    outer.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), GREY_BG),
        ("BOX",          (0,0),(-1,-1), 0.5, GREY_LINE),
        ("LINEBEFORE",   (0,0),(0,-1),  4,   accent),
        ("TOPPADDING",   (0,0),(-1,-1), 10),
        ("BOTTOMPADDING",(0,0),(-1,-1), 10),
        ("LEFTPADDING",  (0,0),(-1,-1), 10),
        ("RIGHTPADDING", (0,0),(-1,-1), 6),
    ]))
    return outer


# ── Page footer callback ──────────────────────────────────────
def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GREY_MID)
    footer_text = "Malawi Food Security Monitor  —  WFP VAM Data  —  Confidential"
    canvas.drawString(20*mm, 10*mm, footer_text)
    page_text = f"Page {doc.page}"
    canvas.drawRightString(190*mm, 10*mm, page_text)
    canvas.restoreState()


# ── Main build function ───────────────────────────────────────
def build_pdf(data: dict) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=16*mm, bottomMargin=18*mm,
        title="Malawi Food Security Monitor",
        author="WFP VAM",
    )

    story = []
    summary      = data["summary"]
    districts    = data["districts"]
    crit_spikes  = data["critical_spikes"]
    commodities  = data["commodities"]
    gaps         = data["gaps"]
    generated_at = datetime.now().strftime("%d %B %Y")

    total = summary["spike_events"]["total"] or 1
    crit  = summary["spike_events"]["critical"] or 0
    sev   = summary["spike_events"]["severe"]   or 0
    mod   = summary["spike_events"]["moderate"] or 0

    body  = _style("body",  fontSize=9,  textColor=GREY_DARK, leading=13)
    small = _style("small", fontSize=8,  textColor=GREY_MID,  leading=11)
    bold  = _style("bold",  fontSize=9,  textColor=GREY_DARK, fontName="Helvetica-Bold")

    # ══ COVER ══════════════════════════════════════════════════
    _build_cover(story, summary, generated_at)

    # ══ EXECUTIVE SUMMARY ══════════════════════════════════════
    _section_header(story, "Executive Summary",
                    "Key findings from the automated food price spike detection system")

    # Stat cards row
    cards = Table([[
        _stat_card("Markets Monitored",
                   summary["total_markets"],
                   f"{summary['total_districts']} districts covered", NAVY),
        _stat_card("Critical Spikes",
                   crit,
                   f"of {total:,} total events", RED),
        _stat_card("Highest Risk District",
                   summary["highest_risk_district"]["name"],
                   f"Score: {int(summary['highest_risk_district']['risk_score'])}", ORANGE),
        _stat_card("Monitoring Gaps",
                   summary["monitoring_gaps"]["critical_gap_districts"],
                   "critical gap districts", RED),
    ]], colWidths=[42*mm]*4)
    cards.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
        ("TOPPADDING",   (0,0),(-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 0),
        ("INNERGRID",    (0,0),(-1,-1), 2, WHITE),
    ]))
    story.append(cards)
    story.append(Spacer(1, 6*mm))

    # Alert box
    alert_text = (
        f"<b>Key Finding:</b> {summary['highest_risk_district']['name']} District in "
        f"{summary['highest_risk_district']['region']} has the highest food security risk score "
        f"({int(summary['highest_risk_district']['risk_score'])}) in Malawi. "
        f"{crit} critical price spike events were detected across the analysis period. "
        f"The most affected commodity is <b>{summary['most_spiked_commodity']['name']}</b> with "
        f"{summary['most_spiked_commodity']['critical_events']} critical events — "
        f"representing over 70% of all critical spikes."
    )
    alert_para = _p(alert_text, _style("alert", fontSize=9.5, textColor=GREY_DARK,
                                        leading=14, fontName="Helvetica"))
    story.append(LeftBorderBox(alert_para, 170*mm, ORANGE_BG, ORANGE, border_width=4))
    story.append(Spacer(1, 5*mm))

    # Methodology box
    method_text = (
        "<b>Methodology:</b> Spike detection uses a dual-method approach requiring both "
        "month-over-month percentage change ≥20% AND rolling 12-month z-score ≥1.5. "
        "This eliminates false positives from seasonal variation. Severity follows the "
        "WFP ALPS (Alert for Price Spikes) framework."
    )
    method_para = _p(method_text, _style("method", fontSize=9, textColor=GREY_DARK, leading=13))
    story.append(LeftBorderBox(method_para, 170*mm, BLUE_BG, NAVY, border_width=3))
    story.append(Spacer(1, 5*mm))

    # Severity table
    sev_data = [
        [_hdr("Severity Level"), _hdr("Threshold"), _hdr("Count"),
         _hdr("% of Observations"), _hdr("Recommended Action")],
        [_col("Critical", RED),
         "≥60% change + z-score ≥2.5",
         _col(str(crit), RED),
         f"{round(crit/total*100, 2)}%",
         "Immediate intervention required"],
        [_col("Severe", ORANGE),
         "≥40% change + z-score ≥2.0",
         _col(str(sev), ORANGE),
         f"{round(sev/total*100, 2)}%",
         "Prepare emergency response"],
        [_col("Moderate", AMBER),
         "≥20% change + z-score ≥1.5",
         _col(str(mod), AMBER),
         f"{round(mod/total*100, 2)}%",
         "Monitor closely"],
        [_col("Normal", GREEN),
         "Below thresholds",
         _col(str(total - crit - sev - mod), GREEN),
         "—",
         "No action required"],
    ]
    sev_t = Table(sev_data, colWidths=[30*mm, 48*mm, 20*mm, 32*mm, 40*mm],
                  repeatRows=1)
    sev_t.setStyle(_table_style())
    story.append(sev_t)
    story.append(PageBreak())

    # ══ DISTRICT RISK RANKINGS ═════════════════════════════════
    _section_header(story, "District Risk Rankings",
                    "All 28 districts ranked by weighted composite risk score "
                    "(Critical×3 + Severe×2 + Moderate×1)")

    dist_rows = [[_hdr("#"), _hdr("District"), _hdr("Region"), _hdr("Risk Level"),
                  _hdr("Risk Score"), _hdr("Critical"), _hdr("Severe"),
                  _hdr("Moderate"), _hdr("Spike Rate")]]
    for i, d in enumerate(districts, 1):
        rc = risk_color(d["risk_score"])
        rl = risk_label(d["risk_score"])
        dist_rows.append([
            _p(str(i), small),
            _p(f"<b>{d['name_1']}</b>", body),
            _p(d["region"], small),
            _col(rl, rc),
            _col(str(int(d["risk_score"])), rc),
            _col(str(d["critical_count"]), RED),
            _p(str(d["severe_count"]), body),
            _p(str(d["moderate_count"]), body),
            _p(f"{round(float(d['spike_rate_pct']), 1)}%", small),
        ])
    dist_t = Table(dist_rows,
                   colWidths=[8*mm, 28*mm, 24*mm, 20*mm, 18*mm, 17*mm, 15*mm, 18*mm, 18*mm],
                   repeatRows=1)
    dist_t.setStyle(_table_style())
    story.append(dist_t)
    story.append(PageBreak())

    # ══ CRITICAL SPIKE EVENTS ══════════════════════════════════
    _section_header(story, "Critical Spike Events",
                    "Most recent critical price spike events (price jump ≥60% + z-score ≥2.5)")

    spike_rows = [[_hdr("Date"), _hdr("District"), _hdr("Market"),
                   _hdr("Commodity"), _hdr("Price (MWK)"), _hdr("% Jump")]]
    for s in crit_spikes[:20]:
        spike_rows.append([
            _p(s["date"], small),
            _p(f"<b>{s['district']}</b>", body),
            _p(s["market"], body),
            _p(f"<b>{s['commodity']}</b>", body),
            _p(f"{int(float(s['price'])):,} MWK", body),
            _col(f"+{round(float(s['pct_change']), 1)}%", RED),
        ])
    spike_t = Table(spike_rows,
                    colWidths=[22*mm, 30*mm, 38*mm, 32*mm, 28*mm, 20*mm],
                    repeatRows=1)
    spike_t.setStyle(_table_style())
    story.append(spike_t)
    story.append(PageBreak())

    # ══ COMMODITY ANALYSIS ═════════════════════════════════════
    _section_header(story, "Commodity Analysis",
                    "Which commodities experienced the most price shocks")

    comm_rows = [[_hdr("Commodity"), _hdr("Critical Events"),
                  _hdr("Total Spikes"), _hdr("Spike Rate")]]
    for c in commodities:
        comm_rows.append([
            _p(f"<b>{c['commodity']}</b>", body),
            _col(str(c["critical_count"]), RED),
            _p(str(c["total_spikes"]), body),
            _p(f"{round(float(c['spike_rate']), 1)}%", body),
        ])
    comm_t = Table(comm_rows, colWidths=[70*mm, 40*mm, 35*mm, 25*mm], repeatRows=1)
    comm_t.setStyle(_table_style())
    story.append(comm_t)
    story.append(PageBreak())

    # ══ MONITORING GAPS ════════════════════════════════════════
    _section_header(story, "Market Monitoring Gaps",
                    "Districts with high food security risk but insufficient market monitoring coverage")

    # Why it matters box
    why_text = (
        "<b>Why this matters:</b> A district with high risk score but few monitored markets "
        "means food crises may go undetected. These gaps represent priority areas for "
        "WFP monitoring expansion."
    )
    why_para = _p(why_text, _style("why", fontSize=9, textColor=GREY_DARK, leading=13))
    story.append(LeftBorderBox(why_para, 170*mm, ORANGE_BG, ORANGE, border_width=4))
    story.append(Spacer(1, 5*mm))

    sc_map = {
        "CRITICAL GAP":   RED,
        "HIGH GAP":       ORANGE,
        "MODERATE GAP":   AMBER,
        "ADEQUATE":       GREEN,
        "NO MONITORING":  GREY_MID,
    }
    gap_rows = [[_hdr("District"), _hdr("Region"), _hdr("Risk Score"),
                 _hdr("Markets"), _hdr("Monitoring Status")]]
    for g in gaps:
        sc = sc_map.get(g["monitoring_status"], GREY_MID)
        gap_rows.append([
            _p(f"<b>{g['district']}</b>", body),
            _p(g["region"], body),
            _col(str(int(g["risk_score"])), RED),
            _p(str(int(g["market_count"])), body),
            _col(g["monitoring_status"], sc),
        ])
    gap_t = Table(gap_rows, colWidths=[38*mm, 35*mm, 28*mm, 22*mm, 47*mm], repeatRows=1)
    gap_t.setStyle(_table_style())
    story.append(gap_t)

    # Footer note
    story.append(Spacer(1, 8*mm))
    footer_note = (
        f"<b>Report generated by:</b> Malawi Food Security GIS Monitor  |  "
        f"<b>Data source:</b> WFP VAM Food Price Database  |  "
        f"<b>Generated:</b> {generated_at}  |  "
        f"<b>System:</b> frontend-seven-omega-94.vercel.app"
    )
    fn_para = _p(footer_note, _style("fn", fontSize=8, textColor=GREY_MID, leading=12))
    story.append(LeftBorderBox(fn_para, 170*mm, BLUE_BG, NAVY, border_width=3))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


# ── Endpoint ──────────────────────────────────────────────────
@router.get("/generate")
async def generate_report():
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:

            summary_row = await conn.fetchrow("""
                SELECT
                    (SELECT COUNT(*) FROM markets)                        AS total_markets,
                    (SELECT COUNT(DISTINCT name_1) FROM districts_risk)   AS total_districts
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
                        WHEN COUNT(m.ogc_fid) = 0                          THEN 'NO MONITORING'
                        WHEN d.risk_score > 400                            THEN 'CRITICAL GAP'
                        WHEN d.risk_score > 200 AND COUNT(m.ogc_fid) < 8  THEN 'CRITICAL GAP'
                        WHEN d.risk_score > 100 AND COUNT(m.ogc_fid) < 4  THEN 'HIGH GAP'
                        WHEN d.risk_score > 50  AND COUNT(m.ogc_fid) < 2  THEN 'MODERATE GAP'
                        ELSE 'ADEQUATE'
                    END AS monitoring_status
                FROM districts_risk d
                LEFT JOIN markets m ON ST_Within(m.wkb_geometry, d.wkb_geometry)
                GROUP BY d.name_1, d.region, d.risk_score
                ORDER BY d.risk_score DESC
            """)

        data = {
            "summary": {
                "total_markets"  : summary_row["total_markets"],
                "total_districts": summary_row["total_districts"],
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
            "error": str(e),
            "trace": traceback.format_exc(),
        })