#!/usr/bin/env python3
"""Render docs/advisor-cheatsheet.md into a compact, single-page branded PDF."""
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)

SRC = "/Users/kj/Documents/Claude/CODE/fed-navigator-dashboard/docs/advisor-cheatsheet.md"
OUT = "/Users/kj/Documents/Claude/CODE/fed-navigator-dashboard/docs/advisor-cheatsheet.pdf"

NAVY = colors.HexColor("#0E2A52")
NAVY_SOFT = colors.HexColor("#1B3D6B")
RED = colors.HexColor("#C8102E")
INK = colors.HexColor("#1F2937")
GRAY = colors.HexColor("#6B7280")
BG = colors.HexColor("#F3F5F8")
LINE = colors.HexColor("#D9DEE6")
ROWALT = colors.HexColor("#F7F9FB")

PAGE_W, PAGE_H = letter
LM = RM = 0.7 * inch
TM = 0.92 * inch
BM = 0.55 * inch
CW = PAGE_W - LM - RM

EMOJI = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF️]")

def clean(t):
    return EMOJI.sub("", t.replace("★", " stars").replace("→", "->")).strip()

def inline(t):
    t = clean(t)
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"`([^`]+)`", r'<font face="Courier">\1</font>', t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)  # bold first (may contain *italic*)
    t = re.sub(r"\*(.+?)\*", r"<i>\1</i>", t)
    return t

title = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=20, textColor=NAVY, leading=22, spaceAfter=2)
sub = ParagraphStyle("s", fontName="Helvetica-Oblique", fontSize=11.5, textColor=GRAY, leading=14, spaceAfter=4)
h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11.5, textColor=NAVY, leading=13, spaceBefore=8, spaceAfter=2)
body = ParagraphStyle("b", fontName="Helvetica", fontSize=8.8, textColor=INK, leading=11.6, spaceAfter=2)
bullet = ParagraphStyle("bu", parent=body, leftIndent=12, bulletIndent=2, spaceAfter=1.5)
quote = ParagraphStyle("q", fontName="Helvetica-Oblique", fontSize=8.8, textColor=NAVY_SOFT, leading=11.8)
cell = ParagraphStyle("c", fontName="Helvetica", fontSize=8.4, textColor=INK, leading=10.8)
cellh = ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=8.4, textColor=colors.white, leading=10.8)
foot = ParagraphStyle("f", fontName="Helvetica-Oblique", fontSize=7.6, textColor=GRAY, leading=10)

def on_page(canv, doc):
    canv.saveState()
    canv.setFillColor(NAVY)
    canv.rect(0, PAGE_H - 0.5 * inch, PAGE_W, 0.5 * inch, fill=1, stroke=0)
    canv.setFillColor(RED)
    canv.rect(0, PAGE_H - 0.53 * inch, PAGE_W, 0.03 * inch, fill=1, stroke=0)
    canv.setFillColor(colors.white)
    canv.setFont("Helvetica-Bold", 10.5)
    canv.drawString(LM, PAGE_H - 0.34 * inch, "FED NAVIGATOR")
    canv.setFont("Helvetica", 8.5)
    canv.setFillColor(colors.HexColor("#AEBBD0"))
    canv.drawRightString(PAGE_W - RM, PAGE_H - 0.34 * inch, "Advisor Cheat Sheet")
    canv.restoreState()

def make_table(rows):
    header, data = rows[0], rows[1:]
    widths = [CW * 0.13, CW * 0.62, CW * 0.25]
    tdata = [[Paragraph(inline(c), cellh) for c in header]]
    for r in data:
        tdata.append([Paragraph(inline(c), cell) for c in r])
    t = Table(tdata, colWidths=widths)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
    ]
    for i in range(1, len(tdata)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), ROWALT))
    t.setStyle(TableStyle(style))
    return t

def callout(lines, accent=RED):
    inner = [Paragraph(inline(l), quote) for l in lines]
    t = Table([[inner]], colWidths=[CW])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG),
        ("LINEBEFORE", (0, 0), (0, -1), 3, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t

with open(SRC) as f:
    lines = f.readlines()

story, i, n, buf = [], 0, None, []
n = len(lines)

def flush():
    if buf:
        story.append(Paragraph(inline(" ".join(buf)), body))
        buf.clear()

while i < n:
    s = lines[i].strip()
    if s.startswith("|") and i + 1 < n and set(lines[i + 1].strip()) <= set("|-: "):
        flush()
        block = []
        while i < n and lines[i].strip().startswith("|"):
            block.append(lines[i].strip()); i += 1
        rows = [[c.strip() for c in b.strip("|").split("|")] for b in block if not set(b) <= set("|-: ")]
        story.append(Spacer(1, 2)); story.append(make_table(rows)); story.append(Spacer(1, 2)); continue
    if s.startswith("# "):
        flush(); story.append(Paragraph(inline(s[2:]), title)); i += 1; continue
    if s.startswith("### "):
        flush(); story.append(Paragraph(inline(s[4:]), sub))
        story.append(HRFlowable(width="100%", thickness=1.6, color=NAVY, spaceBefore=1, spaceAfter=5)); i += 1; continue
    if s.startswith("## "):
        flush(); story.append(Paragraph(inline(s[3:]), h2)); i += 1; continue
    if s.startswith("---"):
        flush(); story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=5, spaceAfter=3)); i += 1; continue
    if s.startswith(">"):
        flush(); q = []
        while i < n and lines[i].strip().startswith(">"):
            q.append(lines[i].strip()[1:].strip()); i += 1
        story.append(callout([x for x in q if x])); story.append(Spacer(1, 3)); continue
    if re.match(r"^\d+\.\s", s):
        flush(); story.append(Paragraph(inline(re.sub(r"^\d+\.\s", "", s)), bullet, bulletText=s.split(".")[0] + ".")); i += 1; continue
    if s.startswith("- "):
        flush(); story.append(Paragraph(inline(s[2:]), bullet, bulletText="•")); i += 1; continue
    if s == "":
        flush(); i += 1; continue
    buf.append(s); i += 1
flush()

# trailing footer line styled small
doc = BaseDocTemplate(OUT, pagesize=letter, leftMargin=LM, rightMargin=RM, topMargin=TM, bottomMargin=BM,
                      title="Fed Navigator - Advisor Cheat Sheet", author="Fed Navigator")
frame = Frame(LM, BM, CW, PAGE_H - TM - BM, id="m")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=on_page)])
doc.build(story)
print("wrote", OUT)
