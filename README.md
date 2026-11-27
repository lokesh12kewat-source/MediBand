# MediBand

> **Evidence-Backed Medication Verification, Blister Foil OCR & On-Device Deep Learning Platform**

MediBand is a clinical-grade medication identification and safety adherence platform. Unlike black-box AI tools, MediBand operates on an **Evidence Ledger architecture** — synthesizing multi-modal blister foil OCR, client-side WebAssembly ONNX neural networks, and GS1 code comparison to provide verified, tamper-evident drug validation.

---

## ⚡ Quick Start for Teammates & Developers

### 1. Clone & Setup
```bash
git clone https://github.com/lokesh12kewat-source/MediBand.git
cd MediBand
```

### 2. Install & Launch
You can launch directly from the root launcher or inside `mediband/`:

```bash
# Option A: One-click Windows Launcher
START.bat

# Option B: Run via npm from root
npm run dev

# Option C: Direct Next.js execution
cd mediband
npm install --legacy-peer-deps
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** to view the application.

### 3. Run Automated Tests
MediBand maintains 100% passing test coverage across 93 unit and integration test suites:
```bash
# From repository root or inside mediband/
npm test
```
To run TypeScript compiler verification:
```bash
cd mediband && npx tsc --noEmit
```

---

## 🔬 Core System Architecture

```
                                  [ Camera / Blister Foil Upload ]
                                                │
                    ┌───────────────────────────┴───────────────────────────┐
                    ▼                                                       ▼
      [ Multi-Modal Blister Foil OCR ]                            [ Deep Learning Vision Pipeline ]
         lib/ocr-engine.ts                                           lib/onnx-client.ts
         ├── Adaptive 2.2x Contrast Boost                            ├── Step-down canvas halving (288x288)
         ├── Specular Glare Sanitization                             ├── ONNX Runtime WebAssembly (SIMD/Wasm)
         ├── Dot-Matrix Batch & Expiry Matcher                       ├── Model B7: Packaging Classifier (53 classes)
         └── Pharmaceutical Brand Prioritization                     └── Model LP: Loose Pill Classifier
                    │                                                       │
                    └───────────────────────────┬───────────────────────────┘
                                                ▼
                                    [ Decision Fusion Arbiter ]
                                                │
                                                ▼
                                    [ Evidence Ledger Engine ]
                                       lib/evidence-engine.ts
                                       ├── Multi-source consistency verification
                                       ├── Levenshtein alignment-based diffs
                                       ├── Two-tier shelf-life & expiry validator
                                       └── GS1 GTIN format & check-digit audit
                                                │
                                                ▼
                                    [ AI Safety & Adherence ]
                                       store/cabinet-store.ts
                                       ├── Active ingredient conflict detector
                                       ├── Cumulative dosage threshold alerts
                                       └── Tamper-evident Medicine Passport
```

---

## 📂 Key Modules & Implementation Files

| Component | Path | Description |
|---|---|---|
| **Evidence Engine** | [`mediband/lib/evidence-engine.ts`](mediband/lib/evidence-engine.ts) | Multi-tier evidence verification, GTIN audit, code-vs-print consistency comparison, and shelf-life assessment. |
| **Blister Foil OCR** | [`mediband/lib/ocr-engine.ts`](mediband/lib/ocr-engine.ts) | Multi-pass Tesseract OCR engine with automated glare compensation, dot-matrix regex (`EXP.OCT.28`, `CP50321`), and dosage sanitization. |
| **ONNX Inference Client** | [`mediband/lib/onnx-client.ts`](mediband/lib/onnx-client.ts) | Client-side WebAssembly inference engine with step-down halving canvas resizing, temperature calibration, and high-precision rejection. |
| **B7 Packaging Model** | [`mediband/public/models/mediband_packaging_b7.onnx`](mediband/public/models/mediband_packaging_b7.onnx) | Production-grade 288px PyTorch neural network trained across 53 Indian medicine packaging classes. |
| **Model Calibration** | [`mediband/public/models/packaging_b7.json`](mediband/public/models/packaging_b7.json) | Temperature-calibrated logits ($T = 0.5847$) and browser-verified 98% and 99% precision rejection thresholds. |
| **Loose Pill Model** | [`mediband/public/models/mediband_loose_pill_model.onnx`](mediband/public/models/mediband_loose_pill_model.onnx) | Client-side loose pill recognition model running in browser WebAssembly. |
| **Ingredient Safety** | [`mediband/lib/ingredient-normalizer.ts`](mediband/lib/ingredient-normalizer.ts) | Pharmacological active ingredient normalizer and multi-prescription conflict detector. |
| **Technical Audit** | [`MEDIBAND_ML_AUDIT.md`](MEDIBAND_ML_AUDIT.md) | Exhaustive 790-line technical audit document detailing dataset leakage removal, model screening batteries, and browser parity. |
| **Executive Slides** | [`MediBand_Tech_and_Methodology_PPT_Slide.pdf`](MediBand_Tech_and_Methodology_PPT_Slide.pdf) | High-fidelity executive deck presenting system methodology, validation gains, and clinical safety safeguards. |

---

## 📁 Repository Directory Structure

```
MediBand/
├── README.md                                 # Top-level documentation & quick-start guide
├── package.json                              # Root workspace proxy scripts (dev, test, build)
├── START.bat                                 # One-click Windows dev server launcher
├── MEDIBAND_ML_AUDIT.md                      # Comprehensive machine learning technical audit
├── MediBand_Technical_State_Audit.pdf        # Complete technical audit report in PDF format
├── MediBand_Tech_and_Methodology_PPT_Slide.pdf # One-page executive presentation deck
├── generate_ppt_one_page_pdf.py              # Script to build executive PDF presentations
└── mediband/                                 # Full Next.js 16 application source code
    ├── app/                                  # Next.js App Router (Dashboard, Scan, Cabinet, History)
    ├── components/                           # React UI components
    │   ├── evidence/                         # Evidence ledger, diff visualizer, assessment banner
    │   ├── layout/                           # NavShell, responsive top navigation bar
    │   ├── ml/                               # PredictionCard, confidence progress bars
    │   └── passport/                         # MedicinePassportModal and adherence logs
    ├── lib/                                  # Pure TypeScript business & verification logic
    │   ├── evidence-engine.ts                # Two-tier evidence assessment engine
    │   ├── ocr-engine.ts                     # Multi-pass blister foil OCR engine
    │   ├── onnx-client.ts                    # Calibrated ONNX WebAssembly client
    │   ├── ingredient-normalizer.ts          # Active ingredient conflict detector
    │   ├── code-print-compare.ts             # GS1 code vs OCR print comparison
    │   ├── gs1-parser.ts                     # Element string parser
    │   └── gtin.ts                           # Real GS1 GTIN validation algorithm
    ├── ml/                                   # Model training, calibration & benchmark suite
    │   ├── browser_test/                     # Real headless Edge browser parity harness
    │   ├── eval_common.py                    # Unified evaluation harness (Top-1, Top-3, ECE, F1)
    │   ├── reports/                          # Benchmark batteries (B0–B7), retrieval & parity logs
    │   └── run_battery_v2.py                 # Multi-model training battery
    └── public/
        ├── models/                           # Production ONNX models & calibration specs
        │   ├── mediband_packaging_b7.onnx    # 288px packaging model
        │   ├── packaging_b7.json             # Calibration temperature & thresholds
        │   └── mediband_loose_pill_model.onnx # Loose pill classifier
        └── ort/                              # ONNX Runtime WebAssembly binaries (SIMD)
```

---

## 🧪 Verification & Parity Guarantees

- **Browser / Python Parity**: Verified with sub-millilogit absolute deviation ($< 0.003$ max logit diff) between Python PyTorch, onnxruntime CPU, and in-browser WebAssembly canvas rendering with step-down halving.
- **Leak-Free Group Validation**: Trained on strict perceptual-hash ($d \le 10$) and source-ID grouped splits (`ml/data_splits_v3`), eliminating all train/test leakage.
- **Temperature Calibration**: Applied post-hoc temperature scaling ($T = 0.5847$) to guarantee calibrated confidence metrics and reliable out-of-distribution rejection.
- **Automated Vitest Suite**: 93 unit and integration tests passing (`capture-workflow`, `dataset-manager`, `dates`, `diff`, `gs1-parser`, `gtin`, `image-quality`, `ingredient-normalizer`, `ocr-engine`, `onnx-client`, `prediction-safety`).

---

## 📜 License & Compliance

MediBand is designed as a clinical safety assistance prototype. Consult [`mediband/docs/SAFETY.md`](mediband/docs/SAFETY.md) for full medical safety protocols and non-diagnostic adherence guidelines.
