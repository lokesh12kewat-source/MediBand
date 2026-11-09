"""
MediBand - Single-Page Presentation Slide PDF Generator
Generates a publication-grade, single-page presentation slide PDF summarizing
all technical architecture, deep learning methodologies, technology stack, and benchmarks.
"""

import os
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Group

PROJECT_DIR = Path(r"C:\Users\OMEN\OneDrive\Desktop\SO_in_HH")
OUTPUT_PDF = PROJECT_DIR / "MediBand_Tech_and_Methodology_PPT_Slide.pdf"

# Palette
ORANGE = colors.HexColor("#FF6115")
DARK_NAVY = colors.HexColor("#0F172A")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
BG_LIGHT = colors.HexColor("#F8FAFC")
BORDER_COLOR = colors.HexColor("#E2E8F0")
EMERALD = colors.HexColor("#059669")
EMERALD_BG = colors.HexColor("#ECFDF5")
BLUE_BG = colors.HexColor("#EFF6FF")
BLUE_BORDER = colors.HexColor("#3B82F6")

def create_pipeline_diagram(width=780, height=52):
    """Draws a clean, vector 6-stage architecture pipeline for the PPT slide."""
    d = Drawing(width, height)
    stages = [
        ("1. Input Stream", "1080p / Upload", colors.HexColor("#F1F5F9"), DARK_NAVY),
        ("2. Quality Gate", "Laplacian Blur & Glare", colors.HexColor("#FEF3C7"), colors.HexColor("#B45309")),
        ("3. Pre-Processing", "LetterboxPad (1:2.2)", colors.HexColor("#E0F2FE"), colors.HexColor("#0369A1")),
        ("4. Dual AI Models", "Packaging + Pills (ONNX)", colors.HexColor("#FFF7ED"), ORANGE),
        ("5. Decision Fusion", "Vision + OCR + GS1", colors.HexColor("#EDE9FE"), colors.HexColor("#6D28D9")),
        ("6. Safety Engine", "Duplicate Active Alerts", colors.HexColor("#ECFDF5"), EMERALD),
    ]

    box_w = 112
    box_h = 42
    gap = 20
    x_start = (width - (len(stages) * box_w + (len(stages) - 1) * gap)) / 2
    y_start = 5

    for i, (title, subtitle, bg_col, text_col) in enumerate(stages):
        x = x_start + i * (box_w + gap)
        # Background rect
        d.add(Rect(x, y_start, box_w, box_h, rx=6, ry=6, fillColor=bg_col, strokeColor=text_col, strokeWidth=1))
        # Title text
        d.add(String(x + box_w / 2, y_start + 24, title, fontName="Helvetica-Bold", fontSize=8.5, fillColor=text_col, textAnchor="middle"))
        # Subtitle text
        d.add(String(x + box_w / 2, y_start + 11, subtitle, fontName="Helvetica", fontSize=7, fillColor=DARK_NAVY, textAnchor="middle"))

        # Arrow to next
        if i < len(stages) - 1:
            arrow_x = x + box_w + 3
            arrow_y = y_start + box_h / 2
            d.add(Line(arrow_x, arrow_y, arrow_x + 13, arrow_y, strokeColor=MUTED, strokeWidth=1.5))
            d.add(Line(arrow_x + 9, arrow_y + 3, arrow_x + 13, arrow_y, strokeColor=MUTED, strokeWidth=1.5))
            d.add(Line(arrow_x + 9, arrow_y - 3, arrow_x + 13, arrow_y, strokeColor=MUTED, strokeWidth=1.5))

    return d

def generate_pdf():
    # Landscape A4: 841.89 x 595.28 points (~11.69 x 8.27 inches)
    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=landscape(A4),
        leftMargin=28,
        rightMargin=28,
        topMargin=22,
        bottomMargin=22,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    header_title_style = ParagraphStyle(
        "HeaderTitle",
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=DARK_NAVY,
    )
    header_subtitle_style = ParagraphStyle(
        "HeaderSubtitle",
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=MUTED,
    )
    section_heading_style = ParagraphStyle(
        "SectionHeading",
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=12,
        textColor=DARK_NAVY,
    )
    body_bold = ParagraphStyle(
        "BodyBold",
        fontName="Helvetica-Bold",
        fontSize=7.2,
        leading=9.5,
        textColor=DARK_NAVY,
    )
    body_text = ParagraphStyle(
        "BodyText",
        fontName="Helvetica",
        fontSize=7,
        leading=9.2,
        textColor=SLATE,
    )
    bullet_title = ParagraphStyle(
        "BulletTitle",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=ORANGE,
    )
    table_header = ParagraphStyle(
        "TableHeader",
        fontName="Helvetica-Bold",
        fontSize=7.2,
        leading=9.5,
        textColor=colors.white,
    )

    elements = []

    # 1. Header Banner
    header_table_data = [
        [
            Paragraph("<b>MEDIBAND</b> — Evidence-Backed Pharmaceutical Vision & Adherence Intelligence", header_title_style),
            Paragraph("<b>Target</b>: 1-Page Executive PPT Slide<br/><b>Stack</b>: Next.js 16 • PyTorch 2.6 • CUDA 12.4 • ONNX WASM", header_subtitle_style),
        ]
    ]
    header_table = Table(header_table_data, colWidths=[540, 246])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, ORANGE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 6))

    # 2. End-to-End Architecture Flowchart
    elements.append(Paragraph("<b>1. END-TO-END MULTI-MODAL PIPELINE ARCHITECTURE</b>", section_heading_style))
    elements.append(Spacer(1, 3))
    elements.append(create_pipeline_diagram(width=786, height=48))
    elements.append(Spacer(1, 8))

    # 3. Two-Column Layout for Tech Stack & Methodologies
    # Left Box: Core Methodologies & Engineering Innovations
    method_content = [
        Paragraph("<b>2. CORE METHODOLOGIES & ENGINEERING INNOVATIONS</b>", section_heading_style),
        Spacer(1, 4),
        Paragraph("<b>1. Aspect-Ratio Preservation via LetterboxPad:</b>", bullet_title),
        Paragraph("Standard squashing to 224x224 compresses elongated Indian blister strips (1:2.2 aspect ratio) by &gt;200%, destroying dot-matrix batch text and cavity geometry. We implemented neutral gray letterboxing (RGB 128, 128, 128) in PyTorch and browser WASM canvas, retaining full edge-to-edge geometry.", body_text),
        Spacer(1, 3),
        Paragraph("<b>2. Physics-Based Blister Foil Augmentation Engine:</b>", bullet_title),
        Paragraph("Bridged the domain gap between matte retail cartons and metallic foil packs using <i>SimulateMetallicFoil</i> (specular sheen bars, desaturation, ink contrast) and <i>SimulateBlisterBubbles</i> (cavity highlight flash rims), enabling 89.4%–92.2% confidence on real silver foil packs.", body_text),
        Spacer(1, 3),
        Paragraph("<b>3. Multi-Modal Vision + OCR Decision Fusion:</b>", bullet_title),
        Paragraph("Predictions never rely on raw pixels alone. Visual Top-3 classification is corroborated with OCR-extracted brand names, batch numbers, expiry dates, and GS1 GTIN-14 barcode standards to eliminate false positives.", body_text),
        Spacer(1, 3),
        Paragraph("<b>4. Safety-First Probabilistic Architecture:</b>", bullet_title),
        Paragraph("Adheres to strict medical safety standards: no pack is ever claimed as 'genuine' or 'counterfeit'. Enforces a 50% confidence floor, mandatory pharmacist disclaimers, and real-time duplicate active ingredient conflict alerts against the user's medicine cabinet.", body_text),
    ]

    # Right Box: Tech Stack Breakdown Table
    tech_table_data = [
        [
            Paragraph("Layer", table_header),
            Paragraph("Technologies Used", table_header),
            Paragraph("Role & Implementation in MediBand", table_header),
        ],
        [
            Paragraph("<b>Frontend & UI</b>", body_bold),
            Paragraph("Next.js 16, React 19, TypeScript, Lucide Icons", body_text),
            Paragraph("Porcelain light-theme dashboard, responsive PWA layout", body_text),
        ],
        [
            Paragraph("<b>Deep Learning</b>", body_bold),
            Paragraph("PyTorch 2.6, Torchvision, CUDA 12.4, cuDNN 9.1", body_text),
            Paragraph("MobileNetV3-Small transfer learning, AMP FP16, AdamW", body_text),
        ],
        [
            Paragraph("<b>Hardware Engine</b>", body_bold),
            Paragraph("NVIDIA GeForce RTX 4050 Laptop GPU (6GB VRAM)", body_text),
            Paragraph("Tensor Core accelerated offline training & fast server route", body_text),
        ],
        [
            Paragraph("<b>Browser Edge</b>", body_bold),
            Paragraph("ONNX Runtime Web (WASM execution providers)", body_text),
            Paragraph("100% in-browser offline inference, zero server data leakage", body_text),
        ],
        [
            Paragraph("<b>OCR Extraction</b>", body_bold),
            Paragraph("Tesseract.js (WASM / Web Workers)", body_text),
            Paragraph("Entity extraction: Batch (MZT...), Expiry, Schedule H", body_text),
        ],
        [
            Paragraph("<b>Safety & Parsers</b>", body_bold),
            Paragraph("GS1 Parser (AI 01/10/17/21), RxNorm / INN Engine", body_text),
            Paragraph("Barcode-print cross-verification & duplicate ingredient check", body_text),
        ],
        [
            Paragraph("<b>Testing & QA</b>", body_bold),
            Paragraph("Vitest 5.0.5, TypeScript Strict Mode (tsc)", body_text),
            Paragraph("89 unit tests (100% pass) covering math, parsers & safety", body_text),
        ],
    ]
    tech_table = Table(tech_table_data, colWidths=[70, 140, 176])
    tech_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ("BOX", (0, 0), (-1, -1), 1, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))

    # Mid Table packaging Left & Right into single master row
    mid_data = [[method_content, tech_table]]
    mid_table = Table(mid_data, colWidths=[388, 398])
    mid_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(mid_table)
    elements.append(Spacer(1, 8))

    # 4. Performance Scorecard & Metrics Table
    elements.append(Paragraph("<b>3. KEY BENCHMARK RESULTS & PERFORMANCE SCORECARD</b>", section_heading_style))
    elements.append(Spacer(1, 3))

    scorecard_data = [
        [
            Paragraph("Benchmark Metric", table_header),
            Paragraph("Task A: Packaging Classifier (53 Brands)", table_header),
            Paragraph("Task B: Loose-Pill Classifier (26 Classes)", table_header),
            Paragraph("System Threshold & Status", table_header),
        ],
        [
            Paragraph("<b>Top-1 Validation Accuracy</b>", body_bold),
            Paragraph("<b>98.06%</b> (Pharmassist held-out test split)", body_text),
            Paragraph("<b>99.43%</b> (PharmAIA held-out test split)", body_text),
            Paragraph("<font color='#059669'><b>Target &gt;90% — EXCEEDED</b></font>", body_text),
        ],
        [
            Paragraph("<b>Top-3 Validation Accuracy</b>", body_bold),
            Paragraph("<b>100.00%</b> (Zero top-3 misclassifications)", body_text),
            Paragraph("<b>99.81%</b> (Strict single-pill matching)", body_text),
            Paragraph("<font color='#059669'><b>Target &gt;95% — EXCEEDED</b></font>", body_text),
        ],
        [
            Paragraph("<b>Real Metallic Blister Strip Confidence</b>", body_bold),
            Paragraph("<b>89.4% – 92.2%</b> (Metronidazole real pack test)", body_text),
            Paragraph("N/A (Trained specifically on macro loose pills)", body_text),
            Paragraph("<font color='#059669'><b>Domain Gap Resolved (was 14.6%)</b></font>", body_text),
        ],
        [
            Paragraph("<b>Client ONNX Model Size</b>", body_bold),
            Paragraph("<b>6.86 MB</b> (mediband_packaging_model.onnx)", body_text),
            Paragraph("<b>7.16 MB</b> (mediband_loose_pill_model.onnx)", body_text),
            Paragraph("<font color='#059669'><b>Target &lt;15 MB — OPTIMAL FOR WEB</b></font>", body_text),
        ],
        [
            Paragraph("<b>Execution Latency</b>", body_bold),
            Paragraph("<b>~45 ms</b> (RTX 4050 GPU) / <b>~180 ms</b> (WASM)", body_text),
            Paragraph("<b>~35 ms</b> (RTX 4050 GPU) / <b>~140 ms</b> (WASM)", body_text),
            Paragraph("<font color='#059669'><b>Sub-second Real-time Inference</b></font>", body_text),
        ],
        [
            Paragraph("<b>Verification & Reliability</b>", body_bold),
            Paragraph("<b>89 / 89 Vitest Unit Tests Passing</b> (100%)", body_text),
            Paragraph("<b>0 TypeScript Type Errors</b> (npx tsc --noEmit)", body_text),
            Paragraph("<font color='#059669'><b>Production Build: 12/12 Routes Clean</b></font>", body_text),
        ],
    ]

    scorecard_table = Table(scorecard_data, colWidths=[170, 226, 210, 180])
    scorecard_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK_NAVY),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ("BOX", (0, 0), (-1, -1), 1, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(scorecard_table)

    # Build document
    doc.build(elements)
    print(f"SUCCESS: Generated PDF at {OUTPUT_PDF}")
    print(f"File size: {OUTPUT_PDF.stat().st_size / 1024:.1f} KB")

if __name__ == "__main__":
    generate_pdf()
