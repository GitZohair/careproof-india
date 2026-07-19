from __future__ import annotations

from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "careproof-india-architecture-poster.pdf"
DEMO_URL = "https://gitzohair.github.io/careproof-india/"

INK = HexColor("#072E32")
TEAL = HexColor("#0B766E")
TEAL_DARK = HexColor("#0A5652")
TEAL_SOFT = HexColor("#DDEEE8")
MINT = HexColor("#EEF6F1")
PAPER = HexColor("#F6F7F2")
WHITE = HexColor("#FFFFFF")
LINE = HexColor("#CDDAD4")
MUTED = HexColor("#60736D")
AMBER = HexColor("#CB8B34")
AMBER_SOFT = HexColor("#F6E9D4")
BLUE = HexColor("#3F7286")
BLUE_SOFT = HexColor("#E4EFF2")


def register_fonts() -> None:
    fonts = {
        "CareSans": "C:/Windows/Fonts/segoeui.ttf",
        "CareSans-Bold": "C:/Windows/Fonts/segoeuib.ttf",
        "CareSerif": "C:/Windows/Fonts/georgia.ttf",
        "CareSerif-Bold": "C:/Windows/Fonts/georgiab.ttf",
    }
    for name, path in fonts.items():
        pdfmetrics.registerFont(TTFont(name, path))


def text(c: canvas.Canvas, value: str, x: float, y: float, size: float, color=INK,
         font: str = "CareSans", align: str = "left") -> None:
    c.setFont(font, size)
    c.setFillColor(color)
    if align == "right":
        c.drawRightString(x, y, value)
    elif align == "center":
        c.drawCentredString(x, y, value)
    else:
        c.drawString(x, y, value)


def pill(c: canvas.Canvas, value: str, x: float, y: float, width: float,
         fill, foreground, size: float = 6.5) -> None:
    c.setFillColor(fill)
    c.roundRect(x, y, width, 17, 8.5, stroke=0, fill=1)
    text(c, value, x + width / 2, y + 5.2, size, foreground, "CareSans-Bold", "center")


def arrow(c: canvas.Canvas, x1: float, x2: float, y: float) -> None:
    c.setStrokeColor(HexColor("#80A79E"))
    c.setLineWidth(1.25)
    c.line(x1, y, x2 - 5, y)
    c.setFillColor(HexColor("#80A79E"))
    path = c.beginPath()
    path.moveTo(x2 - 5, y + 3.2)
    path.lineTo(x2, y)
    path.lineTo(x2 - 5, y - 3.2)
    path.close()
    c.drawPath(path, stroke=0, fill=1)


def architecture_node(
    c: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    step: str,
    category: str,
    title_value: str,
    lines: list[str],
    accent,
    soft,
) -> None:
    c.setFillColor(WHITE)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.roundRect(x, y, width, height, 9, stroke=1, fill=1)
    c.setFillColor(accent)
    c.roundRect(x, y + height - 8, width, 8, 8, stroke=0, fill=1)
    c.rect(x, y + height - 8, width, 4, stroke=0, fill=1)

    c.setFillColor(soft)
    c.circle(x + 17, y + height - 27, 10, stroke=0, fill=1)
    text(c, step, x + 17, y + height - 29.4, 7, accent, "CareSans-Bold", "center")
    text(c, category.upper(), x + 33, y + height - 24.8, 5.6, accent, "CareSans-Bold")
    text(c, title_value, x + 12, y + height - 49, 11.5, INK, "CareSerif-Bold")

    line_y = y + height - 66
    for item in lines:
        c.setFillColor(accent)
        c.circle(x + 15, line_y + 2.2, 1.5, stroke=0, fill=1)
        text(c, item, x + 21, line_y, 6.8, MUTED)
        line_y -= 13


def control_card(c: canvas.Canvas, x: float, y: float, width: float, title_value: str,
                 metric: str, detail: str, accent, soft) -> None:
    c.setFillColor(soft)
    c.setStrokeColor(accent)
    c.setLineWidth(0.55)
    c.roundRect(x, y, width, 58, 8, stroke=1, fill=1)
    c.setFillColor(accent)
    c.circle(x + 17, y + 41, 7, stroke=0, fill=1)
    text(c, "+", x + 17, y + 38.3, 8, WHITE, "CareSans-Bold", "center")
    text(c, title_value.upper(), x + 30, y + 43, 6, accent, "CareSans-Bold")
    text(c, metric, x + 13, y + 21, 13, INK, "CareSerif-Bold")
    text(c, detail, x + 13, y + 8.5, 6.5, MUTED)


def metric(c: canvas.Canvas, x: float, y: float, width: float, value: str, label: str) -> None:
    text(c, value, x + width / 2, y + 17, 14.5, INK, "CareSerif-Bold", "center")
    text(c, label.upper(), x + width / 2, y + 5, 5.5, MUTED, "CareSans-Bold", "center")


def principle(c: canvas.Canvas, x: float, y: float, width: float, number: str,
              title_value: str, detail: str) -> None:
    c.setFillColor(WHITE)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.roundRect(x, y, width, 56, 8, stroke=1, fill=1)
    text(c, number, x + 14, y + 36, 8, TEAL, "CareSans-Bold")
    text(c, title_value, x + 35, y + 36, 8.2, INK, "CareSans-Bold")
    text(c, detail, x + 35, y + 19, 6.5, MUTED)


def draw_qr(c: canvas.Canvas, x: float, y: float, size: float) -> None:
    qr = QrCodeWidget(DEMO_URL)
    bounds = qr.getBounds()
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    drawing.add(qr)
    c.setFillColor(WHITE)
    c.roundRect(x - 4, y - 4, size + 8, size + 8, 6, stroke=0, fill=1)
    renderPDF.draw(drawing, c, x, y)


def build() -> None:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    width, height = landscape(A4)
    c = canvas.Canvas(str(OUTPUT), pagesize=(width, height), pageCompression=1)
    c.setTitle("CareProof India - Architecture Poster")
    c.setAuthor("CareProof India")
    c.setSubject("Evidence-first healthcare facility intelligence architecture")

    c.setFillColor(PAPER)
    c.rect(0, 0, width, height, stroke=0, fill=1)

    # Header
    pill(c, "DATABRICKS DATA + AI HACKATHON  |  FACILITY TRUST DESK", 30, 554, 292, TEAL_SOFT, TEAL)
    c.setFillColor(INK)
    c.roundRect(30, 493, 42, 42, 11, stroke=0, fill=1)
    c.setStrokeColor(WHITE)
    c.setLineWidth(2.2)
    c.circle(51, 514, 10.5, stroke=1, fill=0)
    c.line(47, 514, 50, 510)
    c.line(50, 510, 57, 518)
    text(c, "CareProof India", 84, 514, 25, INK, "CareSerif-Bold")
    text(c, "Evidence-first healthcare facility intelligence for India", 85, 495, 9, MUTED)
    text(c, "FROM CLAIMS TO AUDITABLE PLANNING DECISIONS", 85, 480, 6.3, TEAL, "CareSans-Bold")

    text(c, "SCAN LIVE DEMO", 789, 560, 5.5, TEAL, "CareSans-Bold", "center")
    draw_qr(c, 758, 493, 60)
    text(c, "No login required", 788, 481, 5.5, MUTED, "CareSans", "center")

    # Main pipeline
    text(c, "AUDITABLE DATA-TO-DECISION ARCHITECTURE", 30, 457, 7, TEAL, "CareSans-Bold")
    node_y = 326
    node_h = 115
    node_w = 139
    gap = 17
    start_x = 30
    nodes = [
        ("01", "Source", "Marketplace", ["Virtue Foundation dataset", "10,077 canonical facilities"], BLUE, BLUE_SOFT),
        ("02", "Govern", "Unity Catalog", ["Shared catalog", "Governed workspace access"], TEAL_DARK, TEAL_SOFT),
        ("03", "Transform", "SQL trust layer", ["Clean and geocode", "Extract evidence receipts", "Score six capabilities"], TEAL, MINT),
        ("04", "Serve", "SQL + FastAPI", ["Databricks Warehouse", "Typed analytical APIs"], BLUE, BLUE_SOFT),
        ("05", "Experience", "Planner workspace", ["React + TypeScript", "Map | dossier | access"], TEAL_DARK, TEAL_SOFT),
    ]
    for index, node in enumerate(nodes):
        x = start_x + index * (node_w + gap)
        architecture_node(c, x, node_y, node_w, node_h, *node)
        if index < len(nodes) - 1:
            arrow(c, x + node_w + 2, x + node_w + gap - 2, node_y + node_h / 2)

    # Governance and decision controls
    text(c, "TRUST, REVIEW AND DELIVERY CONTROLS", 30, 303, 7, TEAL, "CareSans-Bold")
    control_y = 234
    control_gap = 13
    control_w = (width - 60 - 2 * control_gap) / 3
    control_card(c, 30, control_y, control_w, "MLflow release gate", "8 / 8 PASS", "Deterministic checks across 26,174 profiles", TEAL, TEAL_SOFT)
    control_card(c, 30 + control_w + control_gap, control_y, control_w, "Lakebase decision trail", "Human review", "Identity, note, override and scoring version", AMBER, AMBER_SOFT)
    control_card(c, 30 + 2 * (control_w + control_gap), control_y, control_w, "Anonymous judge build", "Read-only", "Static catalog snapshot | same product interface", BLUE, BLUE_SOFT)

    # Scale bar
    bar_y = 177
    c.setFillColor(INK)
    c.roundRect(30, bar_y, width - 60, 42, 9, stroke=0, fill=1)
    metric_width = (width - 60) / 5
    metrics = [
        ("10,077", "facilities"),
        ("26,174", "capability profiles"),
        ("75,651", "evidence receipts"),
        ("2,821", "regional aggregates"),
        ("6", "care capabilities"),
    ]
    for index, (value, label) in enumerate(metrics):
        x = 30 + index * metric_width
        text(c, value, x + metric_width / 2, bar_y + 20, 14, WHITE, "CareSerif-Bold", "center")
        text(c, label.upper(), x + metric_width / 2, bar_y + 8, 5.4, HexColor("#B9D3CC"), "CareSans-Bold", "center")
        if index:
            c.setStrokeColor(HexColor("#315258"))
            c.setLineWidth(0.5)
            c.line(x, bar_y + 9, x, bar_y + 33)

    # Trust principles
    text(c, "WHY THE DESIGN IS TRUSTWORTHY", 30, 155, 7, TEAL, "CareSans-Bold")
    principle_gap = 13
    principle_w = (width - 60 - 2 * principle_gap) / 3
    principle(c, 30, 87, principle_w, "01", "Evidence before claims", "Every positive signal links to a source sentence.")
    principle(c, 30 + principle_w + principle_gap, 87, principle_w, "02", "Keep signals separate", "Distance, evidence and clinical suitability stay separate.")
    principle(c, 30 + 2 * (principle_w + principle_gap), 87, principle_w, "03", "Human judgment stays visible", "Overrides require a note; uncertainty stays explicit.")

    # Footer
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(30, 66, width - 30, 66)
    text(c, "CAREPROOF INDIA", 30, 43, 6.2, TEAL, "CareSans-Bold")
    text(c, "Planning intelligence - not accreditation, live availability, or clinical advice.", 123, 43, 6.5, MUTED)
    text(c, "gitzohair.github.io/careproof-india", width - 30, 43, 6.5, INK, "CareSans-Bold", "right")
    text(c, "Databricks Apps | Unity Catalog | SQL Warehouse | MLflow | Lakebase | FastAPI | React", 30, 27, 5.8, MUTED)
    text(c, "github.com/GitZohair/careproof-india", width - 30, 27, 5.8, MUTED, "CareSans", "right")

    c.showPage()
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
