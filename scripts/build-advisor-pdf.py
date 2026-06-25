#!/usr/bin/env python3
"""Render the Fed Navigator Advisor Guide markdown into a branded PDF."""
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)

SRC = "/Users/kj/Documents/Claude/CODE/fed-navigator-dashboard/docs/advisor-guide.md"
OUT = "/Users/kj/Documents/Claude/CODE/fed-navigator-dashboard/docs/advisor-guide.pdf"

NAVY = colors.HexColor("#0E2A52")
NAVY_SOFT = colors.HexColor("#1B3D6B")
RED = colors.HexColor("#C8102E")
INK = colors.HexColor("#1F2937")
GRAY = colors.HexColor("#6B7280")
BG = colors.HexColor("#F3F5F8")
LINE = colors.HexColor("#D9DEE6")
ROWALT = colors.HexColor("#F7F9FB")

PAGE_W, PAGE_H = letter
LMARGIN = RMARGIN = 0.85 * inch
TMARGIN = 1.15 * inch
BMARGIN = 0.85 * inch
CONTENT_W = PAGE_W - LMARGIN - RMARGIN

# ---- inline + cleanup -------------------------------------------------------
EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F0FF\U00002B00-\U00002BFF️]"
)

def clean(t: str) -> str:
    t = t.replace("★", " stars").replace("→", "->")
    t = EMOJI.sub("", t)
    return t.strip()

def inline(t: str) -> str:
    t = clean(t)
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"`([^`]+)`", r'<font face="Courier">\1</font>', t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)  # bold first (may contain *italic*)
    t = re.sub(r"\*(.+?)\*", r"<i>\1</i>", t)
    return t

# ---- styles -----------------------------------------------------------------
kicker = ParagraphStyle("kicker", fontName="Helvetica-Bold", fontSize=10,
                        textColor=RED, spaceAfter=2, leading=12)
title = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=27,
                       textColor=NAVY, leading=30, spaceAfter=4)
subtitle = ParagraphStyle("subtitle", fontName="Helvetica", fontSize=13,
                          textColor=GRAY, leading=17, spaceAfter=6)
h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=15.5,
                    textColor=NAVY, leading=19, spaceBefore=18, spaceAfter=4)
h3 = ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=11.5,
                    textColor=NAVY_SOFT, leading=15, spaceBefore=10, spaceAfter=2)
body = ParagraphStyle("body", fontName="Helvetica", fontSize=10.3,
                      textColor=INK, leading=15, spaceAfter=6, alignment=TA_LEFT)
bullet = ParagraphStyle("bullet", parent=body, leftIndent=15, bulletIndent=4, spaceAfter=3)
quote = ParagraphStyle("quote", fontName="Helvetica-Oblique", fontSize=10.2,
                       textColor=NAVY_SOFT, leading=15)
cell = ParagraphStyle("cell", fontName="Helvetica", fontSize=9.2, textColor=INK, leading=12.5)
cellh = ParagraphStyle("cellh", fontName="Helvetica-Bold", fontSize=9.2,
                       textColor=colors.white, leading=12.5)
foot = ParagraphStyle("foot", fontName="Helvetica", fontSize=8, textColor=GRAY)

# ---- page furniture ---------------------------------------------------------
def on_page(canv, doc):
    canv.saveState()
    # header band
    canv.setFillColor(NAVY)
    canv.rect(0, PAGE_H - 0.62 * inch, PAGE_W, 0.62 * inch, fill=1, stroke=0)
    canv.setFillColor(RED)
    canv.rect(0, PAGE_H - 0.66 * inch, PAGE_W, 0.04 * inch, fill=1, stroke=0)
    canv.setFillColor(colors.white)
    canv.setFont("Helvetica-Bold", 12)
    canv.drawString(LMARGIN, PAGE_H - 0.43 * inch, "FED NAVIGATOR")
    canv.setFont("Helvetica", 9.5)
    canv.setFillColor(colors.HexColor("#AEBBD0"))
    canv.drawRightString(PAGE_W - RMARGIN, PAGE_H - 0.42 * inch, "Advisor Guide")
    # footer
    canv.setStrokeColor(LINE)
    canv.setLineWidth(0.5)
    canv.line(LMARGIN, BMARGIN - 0.16 * inch, PAGE_W - RMARGIN, BMARGIN - 0.16 * inch)
    canv.setFillColor(GRAY)
    canv.setFont("Helvetica", 8)
    canv.drawString(LMARGIN, BMARGIN - 0.34 * inch, "Fed Navigator - Advisor Guide")
    canv.drawRightString(PAGE_W - RMARGIN, BMARGIN - 0.34 * inch, "Page %d" % doc.page)
    canv.restoreState()

def make_table(rows):
    header, data = rows[0], rows[1:]
    ncol = len(header)
    # weight last column wider
    weights = [1.0] * ncol
    weights[-1] = 1.35
    if ncol >= 2:
        weights[0] = 0.92
    tot = sum(weights)
    widths = [CONTENT_W * w / tot for w in weights]
    tdata = [[Paragraph(inline(c), cellh) for c in header]]
    for r in data:
        tdata.append([Paragraph(inline(c), cell) for c in r])
    t = Table(tdata, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("LINEAFTER", (0, 0), (-2, -1), 0.4, LINE),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
    ]
    for i in range(1, len(tdata)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), ROWALT))
    t.setStyle(TableStyle(style))
    return t

def callout(text_lines):
    inner = [Paragraph(inline(l), quote) for l in text_lines]
    t = Table([[inner]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG),
        ("LINEBEFORE", (0, 0), (0, -1), 3, RED),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t

# ---- parse markdown ---------------------------------------------------------
with open(SRC) as f:
    lines = f.readlines()

story = []
i = 0
n = len(lines)
first_h1_done = False
pending_h1 = pending_h3 = None

def flush_para(buf):
    if buf:
        story.append(Paragraph(inline(" ".join(buf)), body))
        buf.clear()

para_buf = []
while i < n:
    raw = lines[i].rstrip("\n")
    s = raw.strip()

    # table block
    if s.startswith("|") and i + 1 < n and set(lines[i+1].strip()) <= set("|-: "):
        flush_para(para_buf)
        block = []
        while i < n and lines[i].strip().startswith("|"):
            block.append(lines[i].strip())
            i += 1
        rows = []
        for bi, bl in enumerate(block):
            if set(bl) <= set("|-: "):
                continue
            cells = [c.strip() for c in bl.strip("|").split("|")]
            rows.append(cells)
        story.append(Spacer(1, 4))
        story.append(make_table(rows))
        story.append(Spacer(1, 4))
        continue

    if s.startswith("# "):
        flush_para(para_buf)
        story.append(Paragraph("FED NAVIGATOR", kicker))
        story.append(Paragraph(inline(s[2:]), title))
        i += 1
        continue
    if s.startswith("### "):
        flush_para(para_buf)
        # subtitle right after H1 (#### style "###" used as subtitle in source)
        story.append(Paragraph(inline(s[4:]), subtitle))
        story.append(HRFlowable(width="100%", thickness=2, color=NAVY,
                                spaceBefore=2, spaceAfter=8))
        i += 1
        continue
    if s.startswith("## "):
        flush_para(para_buf)
        story.append(Paragraph(inline(s[3:]), h2))
        story.append(HRFlowable(width="100%", thickness=0.6, color=LINE,
                                spaceBefore=1, spaceAfter=6))
        i += 1
        continue
    if s.startswith("---"):
        flush_para(para_buf)
        story.append(Spacer(1, 2))
        i += 1
        continue
    if s.startswith(">"):
        flush_para(para_buf)
        qlines = []
        while i < n and lines[i].strip().startswith(">"):
            qlines.append(lines[i].strip()[1:].strip())
            i += 1
        qlines = [q for q in qlines if q]
        story.append(Spacer(1, 2))
        story.append(callout(qlines))
        story.append(Spacer(1, 4))
        continue
    if s.startswith("- ") or s.startswith("* "):
        flush_para(para_buf)
        story.append(Paragraph(inline(s[2:]), bullet, bulletText="•"))
        i += 1
        continue
    if s == "":
        flush_para(para_buf)
        i += 1
        continue
    # bold-only line acting as a sub-heading (e.g. tier headers)
    if re.fullmatch(r"\*\*.+\*\*", s):
        flush_para(para_buf)
        story.append(Paragraph(inline(s), h3))
        i += 1
        continue
    para_buf.append(s)
    i += 1

flush_para(para_buf)

doc = BaseDocTemplate(OUT, pagesize=letter, leftMargin=LMARGIN, rightMargin=RMARGIN,
                      topMargin=TMARGIN, bottomMargin=BMARGIN,
                      title="Fed Navigator - Advisor Guide", author="Fed Navigator")
frame = Frame(LMARGIN, BMARGIN, CONTENT_W, PAGE_H - TMARGIN - BMARGIN, id="main")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=on_page)])
doc.build(story)
print("wrote", OUT)
