"""
routers/reports.py
Professional PDF report using ReportLab.
"""

from fastapi import APIRouter, Query
from fastapi.responses import Response, JSONResponse
from api.database import get_pool
from datetime import datetime, date as date_type
from io import BytesIO
from typing import List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak,
)
from reportlab.platypus.flowables import Flowable

router = APIRouter(prefix="/api/reports", tags=["Reports"])

# ── Palette ───────────────────────────────────────────────────────────────────
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
BLUE_BG     = colors.HexColor("#EEF2FF")
WHITE       = colors.white
W, H        = A4


# ── Custom flowables ──────────────────────────────────────────────────────────

class ColorRect(Flowable):
    def __init__(self, width, height, fill_color):
        Flowable.__init__(self)
        self.width      = width
        self.height     = height
        self.fill_color = fill_color

    def draw(self):
        self.canv.setFillColor(self.fill_color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)


class LeftBorderBox(Flowable):
    def __init__(self, content_para, width, bg_color, border_color, border_width=4):
        Flowable.__init__(self)
        self.content_para = content_para
        self.width        = width
        self.bg_color     = bg_color
        self.border_color = border_color
        self.border_width = border_width
        self._height      = None

    def wrap(self, availWidth, availHeight):
        _, h         = self.content_para.wrap(self.width - self.border_width - 16, availHeight)
        self._height = h + 20
        return self.width, self._height

    def draw(self):
        h = self._height
        c = self.canv
        c.setFillColor(self.bg_color)
        c.rect(0, 0, self.width, h, fill=1, stroke=0)
        c.setFillColor(self.border_color)
        c.rect(0, 0, self.border_width, h, fill=1, stroke=0)
        c.setStrokeColor(self.border_color)
        c.setLineWidth(0.5)
        c.rect(0, 0, self.width, h, fill=0, stroke=1)
        self.content_para.drawOn(c, self.border_width + 10, 10)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _style(name, **kwargs):
    defaults = dict(fontName="Helvetica", fontSize=9,
                    textColor=GREY_DARK, spaceAfter=0, spaceBefore=0, leading=12)
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
        ("BACKGROUND",    (0,0), (-1,0),  NAVY),
        ("TEXTCOLOR",     (0,0), (-1,0),  WHITE),
        ("FONTNAME",      (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,0),  8),
        ("TOPPADDING",    (0,0), (-1,0),  7),
        ("BOTTOMPADDING", (0,0), (-1,0),  7),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ("FONTSIZE",      (0,1), (-1,-1), 8.5),
        ("TOPPADDING",    (0,1), (-1,-1), 5),
        ("BOTTOMPADDING", (0,1), (-1,-1), 5),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("LINEBELOW",     (0,0), (-1,-1), 0.3, GREY_LINE),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [WHITE, GREY_BG]) if stripe else None,
    ]
    return TableStyle([s for s in base if s is not None])

def _hdr(text):
    return _p(f"<b>{text}</b>", _style("hdr", textColor=WHITE,
              fontSize=8, fontName="Helvetica-Bold"))

def _col(text, color, bold=True):
    tag = (f'<font color="{color.hexval()}">'
           f'{"<b>" if bold else ""}{text}{"</b>" if bold else ""}'
           f'</font>')
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

def _stat_card(label, value, sub, accent):
    label_s = _style("sl", fontSize=7,  textColor=GREY_MID, fontName="Helvetica", leading=10)
    value_s = _style("sv", fontSize=20, textColor=accent,   fontName="Helvetica-Bold", leading=24)
    sub_s   = _style("ss", fontSize=7,  textColor=GREY_MID, fontName="Helvetica", leading=10)
    inner   = Table([
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

def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GREY_MID)
    canvas.drawString(20*mm, 10*mm,
                      "Malawi Food Security Monitor  —  WFP VAM Data  —  Confidential")
    canvas.drawRightString(190*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

def _build_cover(story, summary, generated_at):
    page_w      = 170*mm
    badge_style = _style("badge", fontSize=9, fontName="Helvetica-Bold",
                          textColor=NAVY, backColor=GOLD, leftIndent=6, rightIndent=6)
    title_style = _style("ctitle", fontSize=30, textColor=WHITE,
                          fontName="Helvetica-Bold", leading=36, spaceAfter=4)
    sub_style   = _style("csub", fontSize=14, textColor=BLUE_LIGHT,
                          fontName="Helvetica", leading=20, spaceAfter=24)
    meta_style  = _style("cmeta", fontSize=10, textColor=BLUE_LIGHT,
                          fontName="Helvetica", leading=18)

    inner = [
        [_p("CONFIDENTIAL ANALYTICAL REPORT", badge_style)],
        [Spacer(1, 20)],
        [_p("Malawi Food Security Monitor", title_style)],
        [_p("Food Price Spike Analysis &amp; District Risk Assessment", sub_style)],
        [HRFlowable(width=60, thickness=4, color=GOLD, spaceAfter=16)],
        [Spacer(1, 8)],
        [_p(f'<font color="#FFFFFF"><b>Analysis Period:</b></font>'
            f'<font color="#A8C4E8">  January 2020 – {datetime.now().strftime("%B %Y")}</font>',
            meta_style)],
        [_p(f'<font color="#FFFFFF"><b>Data Source:</b></font>'
            f'<font color="#A8C4E8">  World Food Programme (WFP) VAM Food Price Database</font>',
            meta_style)],
        [_p(f'<font color="#FFFFFF"><b>Geographic Scope:</b></font>'
            f'<font color="#A8C4E8">  {summary["total_districts"]} Districts · '
            f'{summary["total_markets"]} Markets · 3 Regions</font>', meta_style)],
        [_p(f'<font color="#FFFFFF"><b>Report Generated:</b></font>'
            f'<font color="#A8C4E8">  {generated_at}</font>', meta_style)],
        [_p(f'<font color="#FFFFFF"><b>Classification:</b></font>'
            f'<font color="#A8C4E8">  For Official Use — NGO / Government Partners</font>',
            meta_style)],
    ]

    inner_t = Table(inner, colWidths=[140*mm])
    inner_t.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
        ("TOPPADDING",   (0,0),(-1,-1), 2),
        ("BOTTOMPADDING",(0,0),(-1,-1), 2),
    ]))

    cover_t = Table([[inner_t]], colWidths=[page_w])
    cover_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), NAVY),
        ("TOPPADDING",    (0,0),(-1,-1), 50),
        ("BOTTOMPADDING", (0,0),(-1,-1), 50),
        ("LEFTPADDING",   (0,0),(-1,-1), 30),
        ("RIGHTPADDING",  (0,0),(-1,-1), 20),
        ("ROWHEIGHT",     (0,0),(-1,-1), 200*mm),
    ]))
    story.append(cover_t)
    story.append(PageBreak())


# ── National PDF ──────────────────────────────────────────────────────────────

def build_pdf(data: dict) -> bytes:
    buffer = BytesIO()
    doc    = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=16*mm,  bottomMargin=18*mm,
        title="Malawi Food Security Monitor", author="WFP VAM",
    )

    story        = []
    summary      = data["summary"]
    districts    = data["districts"]
    crit_spikes  = data["critical_spikes"]
    commodities  = data["commodities"]
    gaps         = data["gaps"]
    generated_at = datetime.now().strftime("%d %B %Y")

    total = summary["spike_events"]["total"]    or 1
    crit  = summary["spike_events"]["critical"] or 0
    sev   = summary["spike_events"]["severe"]   or 0
    mod   = summary["spike_events"]["moderate"] or 0

    body  = _style("body",  fontSize=9, textColor=GREY_DARK, leading=13)
    small = _style("small", fontSize=8, textColor=GREY_MID,  leading=11)

    # Cover
    _build_cover(story, summary, generated_at)

    # Executive summary
    _section_header(story, "Executive Summary",
                    "Key findings from the automated food price spike detection system")

    cards = Table([[
        _stat_card("Markets Monitored", summary["total_markets"],
                   f"{summary['total_districts']} districts covered", NAVY),
        _stat_card("Critical Spikes", crit,
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

    alert_text = (
        f"<b>Key Finding:</b> {summary['highest_risk_district']['name']} District in "
        f"{summary['highest_risk_district']['region']} has the highest food security risk score "
        f"({int(summary['highest_risk_district']['risk_score'])}) in Malawi. "
        f"{crit} critical price spike events were detected across the analysis period. "
        f"The most affected commodity is <b>{summary['most_spiked_commodity']['name']}</b> with "
        f"{summary['most_spiked_commodity']['critical_events']} critical events."
    )
    story.append(LeftBorderBox(
        _p(alert_text, _style("alert", fontSize=9.5, textColor=GREY_DARK, leading=14)),
        170*mm, ORANGE_BG, ORANGE, border_width=4
    ))
    story.append(Spacer(1, 5*mm))

    story.append(LeftBorderBox(
        _p(
            "<b>Methodology:</b> Spike detection uses a dual-method approach requiring both "
            "month-over-month percentage change ≥20% AND rolling 12-month z-score ≥1.5. "
            "Severity follows the WFP ALPS framework.",
            _style("method", fontSize=9, textColor=GREY_DARK, leading=13)
        ),
        170*mm, BLUE_BG, NAVY, border_width=3
    ))
    story.append(Spacer(1, 5*mm))

    sev_data = [
        [_hdr("Severity Level"), _hdr("Threshold"), _hdr("Count"),
         _hdr("% of Observations"), _hdr("Recommended Action")],
        [_col("Critical", RED),  "≥60% change + z-score ≥2.5",
         _col(str(crit), RED),   f"{round(crit/total*100,2)}%",
         "Immediate intervention required"],
        [_col("Severe", ORANGE), "≥40% change + z-score ≥2.0",
         _col(str(sev), ORANGE), f"{round(sev/total*100,2)}%",
         "Prepare emergency response"],
        [_col("Moderate", AMBER),"≥20% change + z-score ≥1.5",
         _col(str(mod), AMBER),  f"{round(mod/total*100,2)}%",
         "Monitor closely"],
        [_col("Normal", GREEN),  "Below thresholds",
         _col(str(total-crit-sev-mod), GREEN), "—",
         "No action required"],
    ]
    sev_t = Table(sev_data, colWidths=[30*mm,48*mm,20*mm,32*mm,40*mm], repeatRows=1)
    sev_t.setStyle(_table_style())
    story.append(sev_t)
    story.append(PageBreak())

    # District risk rankings
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
            _p(f"{round(float(d['spike_rate_pct']),1)}%", small),
        ])
    dist_t = Table(dist_rows,
                   colWidths=[8*mm,28*mm,24*mm,20*mm,18*mm,17*mm,15*mm,18*mm,18*mm],
                   repeatRows=1)
    dist_t.setStyle(_table_style())
    story.append(dist_t)
    story.append(PageBreak())

    # Critical spike events
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
            _col(f"+{round(float(s['pct_change']),1)}%", RED),
        ])
    spike_t = Table(spike_rows,
                    colWidths=[22*mm,30*mm,38*mm,32*mm,28*mm,20*mm],
                    repeatRows=1)
    spike_t.setStyle(_table_style())
    story.append(spike_t)
    story.append(PageBreak())

    # Commodity analysis
    _section_header(story, "Commodity Analysis",
                    "Which commodities experienced the most price shocks")

    comm_rows = [[_hdr("Commodity"), _hdr("Critical Events"),
                  _hdr("Total Spikes"), _hdr("Spike Rate")]]
    for c in commodities:
        comm_rows.append([
            _p(f"<b>{c['commodity']}</b>", body),
            _col(str(c["critical_count"]), RED),
            _p(str(c["total_spikes"]), body),
            _p(f"{round(float(c['spike_rate']),1)}%", body),
        ])
    comm_t = Table(comm_rows, colWidths=[70*mm,40*mm,35*mm,25*mm], repeatRows=1)
    comm_t.setStyle(_table_style())
    story.append(comm_t)
    story.append(PageBreak())

    # Monitoring gaps
    _section_header(story, "Market Monitoring Gaps",
                    "Districts with high food security risk but insufficient monitoring coverage")

    story.append(LeftBorderBox(
        _p(
            "<b>Why this matters:</b> A district with high risk score but few monitored markets "
            "means food crises may go undetected. These gaps represent priority areas for "
            "WFP monitoring expansion.",
            _style("why", fontSize=9, textColor=GREY_DARK, leading=13)
        ),
        170*mm, ORANGE_BG, ORANGE, border_width=4
    ))
    story.append(Spacer(1, 5*mm))

    sc_map = {
        "CRITICAL GAP" : RED,
        "HIGH GAP"     : ORANGE,
        "MODERATE GAP" : AMBER,
        "ADEQUATE"     : GREEN,
        "NO MONITORING": GREY_MID,
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
    gap_t = Table(gap_rows, colWidths=[38*mm,35*mm,28*mm,22*mm,47*mm], repeatRows=1)
    gap_t.setStyle(_table_style())
    story.append(gap_t)
    story.append(Spacer(1, 8*mm))

    story.append(LeftBorderBox(
        _p(
            f"<b>Report generated by:</b> Malawi Food Security GIS Monitor  |  "
            f"<b>Data source:</b> WFP VAM Food Price Database  |  "
            f"<b>Generated:</b> {generated_at}",
            _style("fn", fontSize=8, textColor=GREY_MID, leading=12)
        ),
        170*mm, BLUE_BG, NAVY, border_width=3
    ))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


# ── District PDF ──────────────────────────────────────────────────────────────

def build_district_pdf(data: dict) -> bytes:
    buffer = BytesIO()
    doc    = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=16*mm,  bottomMargin=18*mm,
        title=f"District Report — {data['district']['district']}",
        author="WFP VAM",
    )

    story        = []
    district     = data["district"]
    spikes       = data["spikes"]
    prices       = data["prices"]
    markets      = data["markets"]
    indicators   = data.get("indicators")
    date_range   = data.get("date_range", {})
    commodity    = data.get("commodity", "All commodities")
    generated_at = datetime.now().strftime("%d %B %Y %H:%M")

    body  = _style("body",  fontSize=9, textColor=GREY_DARK, leading=13)
    small = _style("small", fontSize=8, textColor=GREY_MID,  leading=11)

    # Cover
    _build_cover(story, {
        "total_districts": 1,
        "total_markets"  : len(markets),
        "highest_risk_district": {
            "name"      : district["district"],
            "region"    : district["region"],
            "risk_score": district["risk_score"],
        },
        "most_spiked_commodity": {"name": commodity, "critical_events": 0},
        "monitoring_gaps"      : {"critical_gap_districts": 0},
        "spike_events"         : {"total": 0, "critical": 0, "severe": 0, "moderate": 0},
    }, generated_at)

    rc = risk_color(district["risk_score"])
    rl = risk_label(district["risk_score"])

    _section_header(
        story,
        f"District Report — {district['district']}",
        f"{district['region']}  ·  "
        f"{date_range.get('from','2020-01-01')} to {date_range.get('to','today')}  ·  "
        f"Commodity: {commodity}"
    )

    cards = Table([[
        _stat_card("Risk Score",    int(district["risk_score"]),    rl, rc),
        _stat_card("Critical Spikes", int(district["critical_count"]), "spike events", RED),
        _stat_card("Avg Price",
                   f"{int(float(district['avg_price'])):,} MWK",
                   "across all commodities", NAVY),
        _stat_card("Markets", len(markets), "monitored markets", GREEN),
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

    if indicators:
        fsi = float(indicators.get("fsi_score") or 0)
        story.append(LeftBorderBox(
            _p(
                f"<b>Food Security Index:</b> {fsi:.1f}/100  ·  "
                f"<b>Spike Rate:</b> {float(indicators.get('spike_rate_pct') or 0):.1f}%  ·  "
                f"<b>Risk Level:</b> {rl}",
                _style("ind", fontSize=9.5, textColor=GREY_DARK, leading=14)
            ),
            170*mm, BLUE_BG, NAVY, border_width=4
        ))
        story.append(Spacer(1, 5*mm))

    if prices:
        _section_header(story, "Commodity Prices",
                        "Average prices and % change for the selected period")
        price_rows = [[_hdr("Commodity"), _hdr("Avg Price (MWK)"),
                       _hdr("Avg % Change"), _hdr("Observations")]]
        for p in prices:
            pct = float(p.get("avg_pct_change") or 0)
            price_rows.append([
                _p(f"<b>{p['commodity']}</b>", body),
                _p(f"{int(float(p['avg_price'])):,} MWK", body),
                _col(f"{'+' if pct > 0 else ''}{pct:.1f}%",
                     RED if pct > 40 else ORANGE if pct > 15 else GREEN),
                _p(str(p["obs"]), small),
            ])
        price_t = Table(price_rows, colWidths=[70*mm,40*mm,35*mm,25*mm], repeatRows=1)
        price_t.setStyle(_table_style())
        story.append(price_t)
        story.append(Spacer(1, 5*mm))

    if markets:
        _section_header(story, "Market Coverage", "Markets monitored in this district")
        mkt_rows = [[_hdr("Market"), _hdr("Commodities"), _hdr("Total Spikes"),
                     _hdr("Critical"), _hdr("Spike Rate"), _hdr("Last Report")]]
        for m in markets:
            mkt_rows.append([
                _p(f"<b>{m['market']}</b>", body),
                _p(str(m["num_commodities"]), small),
                _p(str(m["total_spikes"]), body),
                _col(str(m["critical_count"]), RED),
                _p(f"{float(m['spike_rate_pct']):.1f}%", small),
                _p(str(m.get("latest_date") or "—"), small),
            ])
        mkt_t = Table(mkt_rows,
                      colWidths=[45*mm,22*mm,25*mm,20*mm,22*mm,36*mm],
                      repeatRows=1)
        mkt_t.setStyle(_table_style())
        story.append(mkt_t)
        story.append(PageBreak())

    if spikes:
        _section_header(
            story, "Spike Events",
            f"Price spike events · "
            f"{date_range.get('from','2020-01-01')} to {date_range.get('to','today')}"
        )
        sev_colors  = {"Critical": RED, "Severe": ORANGE, "Moderate": AMBER}
        spike_rows  = [[_hdr("Date"), _hdr("Market"), _hdr("Commodity"),
                        _hdr("Price (MWK)"), _hdr("% Jump"), _hdr("Severity")]]
        for s in spikes:
            sc = sev_colors.get(s["spike_severity"], GREEN)
            spike_rows.append([
                _p(str(s["date"]), small),
                _p(s["market"], body),
                _p(f"<b>{s['commodity']}</b>", body),
                _p(f"{int(float(s['price'])):,} MWK", body),
                _col(f"+{float(s['pct_change']):.1f}%", sc),
                _col(s["spike_severity"], sc),
            ])
        spike_t = Table(spike_rows,
                        colWidths=[22*mm,38*mm,32*mm,28*mm,22*mm,28*mm],
                        repeatRows=1)
        spike_t.setStyle(_table_style())
        story.append(spike_t)

    story.append(Spacer(1, 8*mm))
    story.append(LeftBorderBox(
        _p(
            f"<b>District:</b> {district['district']}  |  "
            f"<b>Generated:</b> {generated_at}  |  "
            f"<b>Source:</b> WFP VAM Food Price Database",
            _style("fn", fontSize=8, textColor=GREY_MID, leading=12)
        ),
        170*mm, BLUE_BG, NAVY, border_width=3
    ))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/generate")
async def generate_report():
    """National report — all 28 districts."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:

            summary = await conn.fetchrow("""
                SELECT
                    (SELECT COUNT(*) FROM markets)                    AS total_markets,
                    (SELECT COUNT(*) FROM districts_risk)             AS total_districts,
                    (SELECT COUNT(*) FROM spikes)                     AS total_spikes,
                    (SELECT COUNT(*) FROM spikes WHERE spike_severity='Critical') AS critical,
                    (SELECT COUNT(*) FROM spikes WHERE spike_severity='Severe')   AS severe,
                    (SELECT COUNT(*) FROM spikes WHERE spike_severity='Moderate') AS moderate
            """)

            top_district = await conn.fetchrow("""
                SELECT name_1, region, risk_score
                FROM districts_risk
                ORDER BY risk_score DESC NULLS LAST
                LIMIT 1
            """)

            top_commodity = await conn.fetchrow("""
                SELECT commodity, COUNT(*) AS critical_events
                FROM spikes WHERE spike_severity = 'Critical'
                GROUP BY commodity ORDER BY critical_events DESC LIMIT 1
            """)

            districts = await conn.fetch("""
                SELECT name_1, region, risk_score, critical_count,
                       severe_count, moderate_count, spike_rate_pct
                FROM districts_risk
                ORDER BY risk_score DESC NULLS LAST
            """)

            crit_spikes = await conn.fetch("""
                SELECT date::text AS date, district, market, commodity,
                       price, pct_change, zscore
                FROM spikes
                WHERE spike_severity = 'Critical'
                ORDER BY date DESC
                LIMIT 30
            """)

            commodities = await conn.fetch("""
                SELECT commodity,
                    COUNT(*) FILTER (WHERE spike_severity='Critical') AS critical_count,
                    COUNT(*)                                           AS total_spikes,
                    ROUND(
                        COUNT(*) FILTER (WHERE spike_severity='Critical')::numeric
                        / NULLIF(COUNT(*),0) * 100, 1
                    )                                                 AS spike_rate
                FROM spikes
                GROUP BY commodity
                ORDER BY critical_count DESC
                LIMIT 20
            """)

            gaps = await conn.fetch("""
                SELECT
                    dr.name_1     AS district,
                    dr.region,
                    dr.risk_score,
                    COUNT(m.ogc_fid) AS market_count,
                    CASE
                        WHEN COUNT(m.ogc_fid) = 0       THEN 'NO MONITORING'
                        WHEN dr.risk_score > 300
                             AND COUNT(m.ogc_fid) < 3   THEN 'CRITICAL GAP'
                        WHEN dr.risk_score > 150
                             AND COUNT(m.ogc_fid) < 5   THEN 'HIGH GAP'
                        WHEN dr.risk_score > 50
                             AND COUNT(m.ogc_fid) < 8   THEN 'MODERATE GAP'
                        ELSE 'ADEQUATE'
                    END AS monitoring_status
                FROM districts_risk dr
                LEFT JOIN markets m ON ST_Within(m.wkb_geometry, dr.wkb_geometry)
                GROUP BY dr.name_1, dr.region, dr.risk_score
                ORDER BY dr.risk_score DESC
            """)

        data = {
            "summary": {
                "total_markets"    : int(summary["total_markets"]),
                "total_districts"  : int(summary["total_districts"]),
                "spike_events"     : {
                    "total"   : int(summary["total_spikes"]),
                    "critical": int(summary["critical"]),
                    "severe"  : int(summary["severe"]),
                    "moderate": int(summary["moderate"]),
                },
                "highest_risk_district": {
                    "name"      : top_district["name_1"],
                    "region"    : top_district["region"],
                    "risk_score": float(top_district["risk_score"]),
                },
                "most_spiked_commodity": {
                    "name"          : top_commodity["commodity"] if top_commodity else "N/A",
                    "critical_events": int(top_commodity["critical_events"]) if top_commodity else 0,
                },
                "monitoring_gaps": {
                    "critical_gap_districts": sum(
                        1 for g in gaps
                        if g["monitoring_status"] in ("CRITICAL GAP", "NO MONITORING")
                    ),
                },
            },
            "districts"    : [dict(r) for r in districts],
            "critical_spikes": [dict(r) for r in crit_spikes],
            "commodities"  : [dict(r) for r in commodities],
            "gaps"         : [dict(r) for r in gaps],
        }

        pdf_bytes = build_pdf(data)
        filename  = f"malawi_food_security_{datetime.now().strftime('%Y-%m-%d')}.pdf"
        return Response(
            content    = pdf_bytes,
            media_type = "application/pdf",
            headers    = {"Content-Disposition": f"attachment; filename={filename}"},
        )

    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={
            "error": str(e), "trace": traceback.format_exc(),
        })


@router.get("/district/{district_name}")
async def generate_district_report(
    district_name : str,
    date_from     : Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to       : Optional[str] = Query(None, description="YYYY-MM-DD"),
    year          : Optional[str] = Query(None, description="e.g. 2026"),
    commodity     : Optional[str] = Query(None, description="e.g. Maize"),
    sections      : List[str]     = Query(
        default=["narrative","prices","spikes","indicators","markets"]
    ),
):
    """District-level report with optional date and commodity filters."""
    from urllib.parse import unquote
    district_name = unquote(district_name)

    if year and not date_from:
        date_from = f"{year}-01-01"
        date_to   = f"{year}-12-31"
    if not date_from: date_from = "2020-01-01"
    if not date_to:   date_to   = datetime.now().strftime("%Y-%m-%d")

    date_from_obj = date_type.fromisoformat(date_from)
    date_to_obj   = date_type.fromisoformat(date_to)
    comm_filter   = None if (not commodity or commodity == "All commodities") else commodity

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:

            district = await conn.fetchrow("""
                SELECT district, region, risk_score,
                       critical_count, severe_count, moderate_count,
                       COALESCE(spike_rate_pct, 0) AS spike_rate_pct,
                       COALESCE(avg_price, 0)      AS avg_price
                FROM districts_risk
                WHERE district ILIKE $1
                LIMIT 1
            """, district_name)

            if not district:
                return JSONResponse(status_code=404,
                                    content={"error": f"District '{district_name}' not found"})

            spikes = await conn.fetch("""
                SELECT date::text AS date, market, commodity,
                       price, pct_change, zscore, spike_severity
                FROM spikes
                WHERE district ILIKE $1
                  AND date BETWEEN $2 AND $3
                  AND ($4::text IS NULL OR commodity ILIKE $4)
                ORDER BY date DESC
                LIMIT 50
            """, district_name, date_from_obj, date_to_obj, comm_filter)

            prices = await conn.fetch("""
                SELECT
                    commodity,
                    ROUND(AVG(price::numeric)::numeric, 0)      AS avg_price,
                    ROUND(AVG(pct_change::numeric)::numeric, 1) AS avg_pct_change,
                    COUNT(*)                                     AS obs
                FROM prices
                WHERE district    ILIKE $1
                  AND price      ~ '^[0-9]+(\.[0-9]+)?$'
                  AND pct_change ~ '^-?[0-9]+(\.[0-9]+)?$'
                  AND ($2::text IS NULL OR commodity ILIKE $2)
                  AND date::date BETWEEN $3 AND $4
                GROUP BY commodity
                ORDER BY avg_price DESC
            """, district_name, comm_filter, date_from_obj, date_to_obj)

            markets = await conn.fetch("""
                SELECT market, num_commodities, total_spikes,
                       critical_count, spike_rate_pct, latest_date::text
                FROM markets
                WHERE district ILIKE $1
                ORDER BY total_spikes DESC
            """, district_name)

            indicators = None
            if "indicators" in sections:
                indicators = await conn.fetchrow("""
                    SELECT
                        risk_score,
                        critical_count,
                        COALESCE(spike_rate_pct, 0) AS spike_rate_pct,
                        COALESCE(avg_price, 0)      AS avg_price,
                        ROUND((1 - risk_score::numeric / 436) * 100, 1) AS fsi_score
                    FROM districts_risk
                    WHERE district ILIKE $1
                """, district_name)

        pdf_bytes = build_district_pdf({
            "district"  : dict(district),
            "spikes"    : [dict(r) for r in spikes],
            "prices"    : [dict(r) for r in prices],
            "markets"   : [dict(r) for r in markets],
            "sections"  : sections,
            "date_range": {"from": date_from, "to": date_to},
            "commodity" : commodity or "All commodities",
            "indicators": dict(indicators) if indicators else None,
        })

        safe_name = district_name.replace(" ", "_").lower()
        filename  = f"district_report_{safe_name}_{datetime.now().strftime('%Y-%m-%d')}.pdf"
        return Response(
            content    = pdf_bytes,
            media_type = "application/pdf",
            headers    = {"Content-Disposition": f"attachment; filename={filename}"},
        )

    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={
            "error": str(e), "trace": traceback.format_exc(),
        })