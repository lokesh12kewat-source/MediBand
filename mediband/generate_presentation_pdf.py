"""
MediBand - Presentation PDF Generator
Generates a professional, beautifully styled multi-page PDF presentation document.
"""

import os
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

OUTPUT_DIR = Path(__file__).resolve().parent
PDF_PATH = OUTPUT_DIR / "MediBand_Presentation_Content.pdf"

class NumberedCanvas(canvas.Canvas):
    """Adds running headers and footers with total page count."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_header_footer(num_pages)
            super().showPage()
        super().save()

    def draw_header_footer(self, page_count):
        self.saveState()
        # Top banner line
        self.setStrokeColor(colors.HexColor("#FF6115"))
        self.setLineWidth(2.5)
        self.line(40, 575, 752, 575)

        # Header text
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#666666"))
        self.drawString(40, 582, "MEDIBAND | Evidence-Backed Medication Intelligence & Computer Vision")
        self.drawRightString(752, 582, "PPT CONTENT & TECHNICAL BRIEFING")

        # Bottom footer line
        self.setStrokeColor(colors.HexColor("#E0E0E0"))
        self.setLineWidth(1)
        self.line(40, 35, 752, 35)

        # Footer text
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#888888"))
        self.drawString(40, 24, "MediBand Technical Presentation -- Confidential & Proprietary")
        self.drawRightString(752, 24, f"Slide {self._pageNumber} of {page_count}")
        self.restoreState()

def build_pdf():
    # Landscape orientation: 792 x 612 pt
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=landscape(letter),
        leftMargin=40,
        rightMargin=40,
        topMargin=45,
        bottomMargin=45
    )

    styles = getSampleStyleSheet()

    # Custom styles
    brand_orange = colors.HexColor("#FF6115")
    dark_slate = colors.HexColor("#1A1A1A")
    sub_slate = colors.HexColor("#4A4A4A")

    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=dark_slate,
        spaceAfter=6
    )

    slide_heading = ParagraphStyle(
        "SlideHeading",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=brand_orange,
        spaceAfter=4
    )

    slide_subheading = ParagraphStyle(
        "SlideSubheading",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=sub_slate,
        spaceAfter=12
    )

    section_header = ParagraphStyle(
        "SectionHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=dark_slate,
        spaceBefore=4,
        spaceAfter=3
    )

    bullet_style = ParagraphStyle(
        "BulletText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12.5,
        textColor=dark_slate,
        spaceAfter=3
    )

    callout_title = ParagraphStyle(
        "CalloutTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=brand_orange
    )

    callout_body = ParagraphStyle(
        "CalloutBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11.5,
        textColor=dark_slate
    )

    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )

    table_body_style = ParagraphStyle(
        "TableBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10.5,
        textColor=dark_slate
    )

    story = []

    # =========================================================================
    # SLIDE 1: COVER & EXECUTIVE OVERVIEW
    # =========================================================================
    story.append(Spacer(1, 15))
    story.append(Paragraph("MediBand: Indian Medicine Visual Intelligence", title_style))
    story.append(Paragraph("Evidence-Backed Medication Verification, Adherence Tracking & Deep Learning Identification System", slide_subheading))
    story.append(HRFlowable(width="100%", thickness=1.5, color=brand_orange, spaceBefore=4, spaceAfter=15))

    overview_p1 = Paragraph(
        "<b>Project Focus:</b> MediBand bridges the critical gap in pharmaceutical safety by combining "
        "<b>browser-native optical capture</b>, <b>on-device deep learning (RTX-accelerated MobileNetV3)</b>, "
        "and <b>GS1 barcode evidence verification</b> tailored specifically for common Indian pharmaceutical brands.",
        bullet_style
    )
    overview_p2 = Paragraph(
        "<b>Core Breakthrough:</b> Rather than making black-box assertions, MediBand operates on an <b>evidence-backed "
        "hierarchy</b>: real-time visual pattern matching on 53 Indian medicines (98.03% Top-1 Accuracy), "
        "cross-verified against GTIN barcodes, generic active salts, and shelf-life compliance.",
        bullet_style
    )
    story.append(overview_p1)
    story.append(Spacer(1, 6))
    story.append(overview_p2)
    story.append(Spacer(1, 15))

    # Metric summary cards
    cards_data = [
        [
            Paragraph("<b>TASK A (PACKAGING)</b><br/><font size='16' color='#FF6115'><b>98.03%</b></font><br/><font color='#666'>Top-1 Acc (53 Brands)</font>", callout_body),
            Paragraph("<b>TASK B (LOOSE PILLS)</b><br/><font size='16' color='#FF6115'><b>95.91%</b></font><br/><font color='#666'>Top-3 Acc (26 Classes)</font>", callout_body),
            Paragraph("<b>GPU ACCELERATION</b><br/><font size='16' color='#FF6115'><b>~3.2 ms</b></font><br/><font color='#666'>RTX 4050 AMP FP16</font>", callout_body),
            Paragraph("<b>EDGE ONNX MODELS</b><br/><font size='16' color='#FF6115'><b>6.8 MB</b></font><br/><font color='#666'>Client Web Runtime</font>", callout_body)
        ]
    ]
    cards_table = Table(cards_data, colWidths=[175, 175, 175, 175])
    cards_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8F9FA")),
        ('BOX', (0, 0), (0, 0), 1, colors.HexColor("#E0E0E0")),
        ('BOX', (1, 0), (1, 0), 1, colors.HexColor("#E0E0E0")),
        ('BOX', (2, 0), (2, 0), 1, colors.HexColor("#E0E0E0")),
        ('BOX', (3, 0), (3, 0), 1, colors.HexColor("#E0E0E0")),
        ('PADDING', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(cards_table)
    story.append(PageBreak())

    # =========================================================================
    # SLIDE 2: TECHNOLOGIES OR TOOLS TO BE USED
    # =========================================================================
    story.append(Paragraph("Slide 1: Technologies & Tools to be Used", slide_heading))
    story.append(Paragraph("Complete breakdown of programming languages, machine learning frameworks, acceleration stacks, and developer tooling.", slide_subheading))
    story.append(HRFlowable(width="100%", thickness=1, color=brand_orange, spaceBefore=0, spaceAfter=10))

    tech_data = [
        [
            Paragraph("<b>Category</b>", table_header_style),
            Paragraph("<b>Technology / Tool</b>", table_header_style),
            Paragraph("<b>Role in MediBand Architecture</b>", table_header_style)
        ],
        [
            Paragraph("<b>Frontend Framework</b>", table_body_style),
            Paragraph("Next.js 16 (App Router)<br/>React 19 & TypeScript 5", table_body_style),
            Paragraph("Component rendering, end-to-end type-safe API boundaries, client-side camera streaming, and dynamic routing.", table_body_style)
        ],
        [
            Paragraph("<b>Styling & UX</b>", table_body_style),
            Paragraph("Tailwind CSS 4<br/>Lucide React", table_body_style),
            Paragraph("High-contrast responsive mobile viewfinder, minimal clean typography, porcelain/orange MediBand branding palette.", table_body_style)
        ],
        [
            Paragraph("<b>Machine Learning</b>", table_body_style),
            Paragraph("PyTorch 2.6 & torchvision<br/>MobileNetV3-Small", table_body_style),
            Paragraph("Deep neural network training with transfer learning, custom 53-class classification head, and cosine learning rate decay.", table_body_style)
        ],
        [
            Paragraph("<b>Hardware Acceleration</b>", table_body_style),
            Paragraph("NVIDIA GeForce RTX 4050<br/>CUDA 12.4 + cuDNN 9.1", table_body_style),
            Paragraph("High-throughput training acceleration; Automatic Mixed Precision (AMP FP16) utilizing 4th-Gen Ada Lovelace Tensor Cores.", table_body_style)
        ],
        [
            Paragraph("<b>Edge Web Deployment</b>", table_body_style),
            Paragraph("ONNX Runtime Web<br/>(onnxruntime-web)", table_body_style),
            Paragraph("Zero-install, browser-based neural network execution (6.86 MB model) with WebAssembly and WebGL backend.", table_body_style)
        ],
        [
            Paragraph("<b>Computer Vision Quality</b>", table_body_style),
            Paragraph("HTML5 Canvas / Pixel API<br/>Discrete Laplacian Kernel", table_body_style),
            Paragraph("Real-time pre-capture diagnostics: blur variance thresholding, excessive darkness detection, and blister glare warning.", table_body_style)
        ],
        [
            Paragraph("<b>Barcode & Verification</b>", table_body_style),
            Paragraph("@zxing/browser & library<br/>GS1 DataMatrix Parser", table_body_style),
            Paragraph("ISO/IEC 16022 barcode decoding, Application Identifier parsing (GTIN-01, Expiry-17, Batch-10, Serial-21).", table_body_style)
        ],
        [
            Paragraph("<b>Testing Suite</b>", table_body_style),
            Paragraph("Vitest 5 & ts-node", table_body_style),
            Paragraph("76 unit tests covering date math, GTIN validation, ingredient normalization, and quality checks.", table_body_style)
        ]
    ]

    t_tech = Table(tech_data, colWidths=[130, 160, 410])
    t_tech.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#FF6115")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFA")]),
        ('PADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(t_tech)
    story.append(PageBreak())

    # =========================================================================
    # SLIDE 3: METHODOLOGY
    # =========================================================================
    story.append(Paragraph("Slide 2: Methodology", slide_heading))
    story.append(Paragraph("Systematic approach to dataset engineering, leakage-free validation, GPU transfer learning, and clinical safety.", slide_subheading))
    story.append(HRFlowable(width="100%", thickness=1, color=brand_orange, spaceBefore=0, spaceAfter=10))

    meth_col1 = [
        Paragraph("<b>1. Ground-Truth Dataset Architecture</b>", section_header),
        Paragraph("• <b>Target Domain:</b> 53 common Indian pharmaceutical products (Dolo-650, Shelcal, Pan-D, Allegra, Montair, Atarax, Ciplar, etc.).", bullet_style),
        Paragraph("• <b>Dual Recognition Strategy:</b> Discrete handling for <i>Packaging</i> (strips/boxes/bottles) vs. <i>Loose Pills</i> (individual unboxed tablets).", bullet_style),
        Paragraph("• <b>Zero-Leakage Partitioning:</b> All Roboflow augmentations (rotation, jitter, scaling) restricted strictly to training. Test and validation sets contain 100% original raw captures.", bullet_style),
        Spacer(1, 6),
        Paragraph("<b>2. Two-Phase GPU Transfer Learning</b>", section_header),
        Paragraph("• <b>Phase 1 (Warm-Up):</b> ImageNet pre-trained backbone frozen; classification head optimized with AdamW (lr = 1e-3).", bullet_style),
        Paragraph("• <b>Phase 2 (Fine-Tuning):</b> Upper half of convolutional backbone unfrozen; trained end-to-end with Cosine Annealing (lr = 1e-4 -> 1e-6).", bullet_style),
        Paragraph("• <b>Label Smoothing:</b> Applied epsilon = 0.1 to mitigate over-confidence across visually similar packaging geometries.", bullet_style),
    ]

    meth_col2 = [
        Paragraph("<b>3. Pre-Inference Quality Gatekeeper</b>", section_header),
        Paragraph("• <b>Blur Variance Check:</b> 2D discrete Laplacian variance computation; rejects camera shake before model execution.", bullet_style),
        Paragraph("• <b>Luminance Filter:</b> Rejects captures with mean brightness < 40/255 to eliminate shadow misclassifications.", bullet_style),
        Paragraph("• <b>Specular Glare Filter:</b> Flags over-exposed saturated hotspots (> 8% pixel count) common on reflective blister foil.", bullet_style),
        Spacer(1, 6),
        Paragraph("<b>4. Evidence-First Safety Protocol</b>", section_header),
        Paragraph("• <b>Strict Hedging:</b> Replaces binary 'Authentic/Fake' labels with probabilistic visual matches and Top-3 candidates.", bullet_style),
        Paragraph("• <b>Verification Synergy:</b> Combines visual recognition with GS1 batch decoding and active salt analysis (e.g. Paracetamol overlap warnings).", bullet_style),
        Paragraph("• <b>Mandatory Disclaimers:</b> Collapsible clinical limitation cards instructing user verification with certified pharmacists.", bullet_style)
    ]

    meth_table = Table([[meth_col1, meth_col2]], colWidths=[350, 350])
    meth_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor("#FDFDFD")),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor("#FDFDFD")),
        ('BOX', (0, 0), (0, 0), 1, colors.HexColor("#EAEAEA")),
        ('BOX', (1, 0), (1, 0), 1, colors.HexColor("#EAEAEA")),
    ]))
    story.append(meth_table)
    story.append(PageBreak())

    # =========================================================================
    # SLIDE 4: PROCESS FOR IMPLEMENTATION & ARCHITECTURE
    # =========================================================================
    story.append(Paragraph("Slide 3: Process for Implementation & Architecture", slide_heading))
    story.append(Paragraph("Pipeline flowchart, phased rollout schedule, and working prototype execution path.", slide_subheading))
    story.append(HRFlowable(width="100%", thickness=1, color=brand_orange, spaceBefore=0, spaceAfter=8))

    # Flowchart table
    flow_steps = [
        [
            Paragraph("<b>STEP 1: CAPTURE</b><br/><font color='#555'>HTML5 getUserMedia<br/>Rear-camera stream</font>", callout_body),
            Paragraph("<b>STEP 2: QUALITY GATE</b><br/><font color='#555'>Laplacian blur variance<br/>Luminance & glare filter</font>", callout_body),
            Paragraph("<b>STEP 3: PREPROCESS</b><br/><font color='#555'>224x224 RGB resize<br/>ImageNet normalization</font>", callout_body),
            Paragraph("<b>STEP 4: ONNX ENGINE</b><br/><font color='#555'>In-browser inference<br/>Softmax probability array</font>", callout_body),
            Paragraph("<b>STEP 5: VERIFICATION</b><br/><font color='#555'>Top-3 visual matches<br/>GS1 barcode & salts check</font>", callout_body)
        ]
    ]
    flow_table = Table(flow_steps, colWidths=[140, 140, 140, 140, 140])
    flow_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FFF7F2")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#FF6115")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#FFA87D")),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(flow_table)
    story.append(Spacer(1, 12))

    story.append(Paragraph("<b>Implementation Stages:</b>", section_header))

    impl_data = [
        [
            Paragraph("<b>Phase</b>", table_header_style),
            Paragraph("<b>Milestone & Tasks</b>", table_header_style),
            Paragraph("<b>Outputs & Verification</b>", table_header_style)
        ],
        [
            Paragraph("<b>Phase 1<br/>Data Pipeline</b>", table_body_style),
            Paragraph("• Structured 53-class Pharmassist dataset into raw and augmented sub-stores.<br/>• Built deterministic splitting script (`prepare_dataset.py`) for train/val/test splits.<br/>• Formatted metadata schemas mapping brand names to salt compositions.", table_body_style),
            Paragraph("4,183 training / 407 val / 407 held-out test splits.<br/>`class_indices.json` bidirectional mapping.<br/>Zero synthetic test leakage.", table_body_style)
        ],
        [
            Paragraph("<b>Phase 2<br/>GPU Training</b>", table_body_style),
            Paragraph("• Developed PyTorch 2.6 CUDA pipeline for NVIDIA RTX 4050 Laptop GPU.<br/>• Activated AMP (FP16) on Ada Lovelace Tensor Cores + cuDNN 9.1 auto-tuner.<br/>• Executed 2-phase fine-tuning (5 warm-up epochs + 15 fine-tuning epochs).", table_body_style),
            Paragraph("98.03% Top-1 accuracy on held-out test set.<br/>99.51% Top-3 accuracy.<br/>`best_model_gpu.pt` checkpoint (6.98 MB).", table_body_style)
        ],
        [
            Paragraph("<b>Phase 3<br/>Model Export</b>", table_body_style),
            Paragraph("• Exported trained weights to ONNX format with dynamic batch dimensions.<br/>• Optimized constant-folding graph transformations for low-memory browser execution.<br/>• Embedded label dictionaries into the Next.js static asset bundle.", table_body_style),
            Paragraph("`mediband_packaging_model.onnx` (6.86 MB).<br/>`data/ml_classes.json` ready for client-side decoding.", table_body_style)
        ],
        [
            Paragraph("<b>Phase 4<br/>UI & Integration</b>", table_body_style),
            Paragraph("• Integrated live camera viewfinder with Packaging / Loose Pill mode toggles.<br/>• Built real-time quality diagnostics preview with warning chips (Dark/Blur/Glare).<br/>• Connected scan results to the Medicine Cabinet adherence engine and duplicate salt alerts.", table_body_style),
            Paragraph("Full responsive web application.<br/>76 / 76 unit tests passing.<br/>Interactive scanner & adherence prototype.", table_body_style)
        ]
    ]

    t_impl = Table(impl_data, colWidths=[90, 360, 250])
    t_impl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#FF6115")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFA")]),
        ('PADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(t_impl)
    story.append(PageBreak())

    # =========================================================================
    # SLIDE 5: EXPERIMENTAL RESULTS & VALIDATION METRICS
    # =========================================================================
    story.append(Paragraph("Slide 4: Experimental Results & Benchmarks", slide_heading))
    story.append(Paragraph("Validation metrics on strictly held-out real Indian medicine packaging and loose pills (NVIDIA RTX 4050 GPU).", slide_subheading))
    story.append(HRFlowable(width="100%", thickness=1, color=brand_orange, spaceBefore=0, spaceAfter=8))

    results_data = [
        [
            Paragraph("<b>Task & Domain</b>", table_header_style),
            Paragraph("<b>Classes & Samples</b>", table_header_style),
            Paragraph("<b>Target Metric</b>", table_header_style),
            Paragraph("<b>Achieved Performance</b>", table_header_style),
            Paragraph("<b>Model Size & Status</b>", table_header_style)
        ],
        [
            Paragraph("<b>Task A: Packaging</b><br/><font color='#555'>Strips, boxes, bottles</font>", table_body_style),
            Paragraph("53 Indian Brands<br/>4,183 train / 407 raw test", table_body_style),
            Paragraph("Top-1 >= 70%<br/>Top-3 >= 85%", table_body_style),
            Paragraph("<b>Top-1: 98.03%</b><br/><b>Top-3: 99.51%</b>", table_body_style),
            Paragraph("<b>6.86 MB ONNX</b><br/><font color='#2E7D32'><b>PASSED</b></font> (Exceeds Target)", table_body_style)
        ],
        [
            Paragraph("<b>Task B: Loose Pills</b><br/><font color='#555'>Unpackaged tablets (PharmAIA)</font>", table_body_style),
            Paragraph("26 Alphabet Classes<br/>13,722 train / 513 raw test", table_body_style),
            Paragraph("Top-1 >= 55%<br/>Top-3 >= 80%", table_body_style),
            Paragraph("<b>Top-1: 81.87%</b><br/><b>Top-3: 95.91%</b>", table_body_style),
            Paragraph("<b>6.83 MB ONNX</b><br/><font color='#2E7D32'><b>PASSED</b></font> (Exceeds Target)", table_body_style)
        ],
        [
            Paragraph("<b>Hardware Acceleration</b><br/><font color='#555'>RTX 4050 Laptop GPU</font>", table_body_style),
            Paragraph("CUDA 12.4 + cuDNN 9.1<br/>AMP FP16 Tensor Cores", table_body_style),
            Paragraph("Latency < 50 ms<br/>GPU Peak Util: 99%", table_body_style),
            Paragraph("<b>~3.2 ms / image</b><br/>Zero GPU bottleneck", table_body_style),
            Paragraph("<font color='#2E7D32'><b>PASSED</b></font><br/>Full Hardware Offload", table_body_style)
        ],
        [
            Paragraph("<b>Edge Web Deployment</b><br/><font color='#555'>In-Browser WebAssembly/WebGL</font>", table_body_style),
            Paragraph("ONNX Runtime Web<br/>Client-side zero backend", table_body_style),
            Paragraph("Latency < 100 ms<br/>Offline support", table_body_style),
            Paragraph("<b>< 35 ms / image</b><br/>Instant user feedback", table_body_style),
            Paragraph("<font color='#2E7D32'><b>PASSED</b></font><br/>Ready for Web App", table_body_style)
        ],
        [
            Paragraph("<b>Unit & Integration Tests</b><br/><font color='#555'>Dates, GS1, GTIN, quality</font>", table_body_style),
            Paragraph("8 Test Suites<br/>Full vitest runner", table_body_style),
            Paragraph("100% Pass Rate<br/>Zero regressions", table_body_style),
            Paragraph("<b>76 / 76 Passed</b><br/>1.28s test duration", table_body_style),
            Paragraph("<font color='#2E7D32'><b>PASSED</b></font><br/>Production Ready", table_body_style)
        ]
    ]

    t_res = Table(results_data, colWidths=[140, 140, 120, 140, 160])
    t_res.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#FF6115")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E0E0E0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAFA")]),
        ('PADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t_res)
    story.append(Spacer(1, 10))

    # Summary box
    summary_box = [
        [
            Paragraph(
                "<b>Working Prototype Highlights:</b><br/>"
                "• <b>Live Browser Viewfinder:</b> Captures packaging and loose pills using mobile rear cameras with auto-focus hints.<br/>"
                "• <b>Edge ONNX Model:</b> Runs the 6.86 MB model locally in the browser with no server roundtrip or privacy concerns.<br/>"
                "• <b>Multi-Verification Synergy:</b> Combines visual prediction with GS1 DataMatrix batch decoding, GTIN lookup, and salt duplicate detection.<br/>"
                "• <b>Ready for Presentation:</b> Complete working prototype running on Next.js 16, fully documented in CHANGELOG.md.",
                callout_body
            )
        ]
    ]
    t_sum = Table(summary_box, colWidths=[700])
    t_sum.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8F9FA")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#FF6115")),
        ('PADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(t_sum)

    # Build the document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF successfully generated at: {PDF_PATH}")
    print(f"File size: {PDF_PATH.stat().st_size / 1024:.1f} KB")

if __name__ == "__main__":
    build_pdf()
