# MediBand Application Core

**Evidence-backed medication identification, multi-modal blister foil OCR, and clinical adherence platform.**

MediBand does not ask patients or clinicians to blindly trust an AI answer. It presents a tamper-evident **Evidence Ledger** — detailing what was checked, what matched, what conflicted, and what remains unknown across optical, machine-readable, and deep learning vision channels.

---

## 🚀 Quick Start

From within the `mediband/` directory:

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start Next.js development server
npm run dev

# Run automated Vitest test suite (93 tests passing)
npm test

# Verify TypeScript types
npx tsc --noEmit
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🔬 Core System Architecture

```
Medicine Package / Blister Strip
      ↓
Live Camera / Image Upload (with automated image quality & glare checks)
      │
      ├───────────────────────────────────┬───────────────────────────────────┐
      ▼                                   ▼                                   ▼
GS1 Parser / Barcode Reader      Blister Foil OCR Engine         Deep Learning Vision Engine
(lib/gs1-parser.ts, lib/gtin.ts) (lib/ocr-engine.ts)             (lib/onnx-client.ts)
- GS1 DataMatrix & barcode       - Adaptive contrast boost (2.2x)- 288px Packaging Model B7
- Format & check-digit audit     - Glare dosage sanitization     - Loose Pill Classifier
- Expiry date extraction         - Dot-matrix batch/expiry regex - Step-down canvas halving
                                 - Brand vs generic priority     - Temperature-calibrated logits
      │                                   │                                   │
      └───────────────────────────────────┼───────────────────────────────────┘
                                          ▼
                               Decision Fusion Arbiter
                                          ↓
                               Evidence Ledger Engine
                               (lib/evidence-engine.ts)
                               - Code vs print Levenshtein diff
                               - Two-tier shelf-life & expiry check
                               - Conflict detection
                                          ↓
                            AI Safety & Adherence Engine
                               (store/cabinet-store.ts)
                               - Duplicate active ingredient warnings
                               - Cumulative dosage threshold alerts
                               - Tamper-evident Medicine Passport
```

---

## 🛡️ Safety Language & Clinical Boundaries

MediBand strictly adheres to safety boundaries. It never declares a medication "genuine", "authentic", or "fake" — instead, it objectively reports evidence consistency across physical print, packaging classification, and machine codes. A matching barcode or packaging prediction does not prove physical chemical authenticity.

See [`docs/SAFETY.md`](docs/SAFETY.md) for the full clinical rationale and safety protocols.

---

## 📂 Project Structure

```
mediband/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Dashboard with adherence tracking & KPI cards
│   ├── scan/                   # Live camera scanner, upload & preset verifications
│   │   └── result/             # Verification report & Evidence Ledger view
│   ├── cabinet/                # Medication inventory & ingredient conflict audit
│   ├── history/                # Dose event history & adherence logs
│   └── mediband/               # Wearable simulator & real-time telemetry
├── components/
│   ├── evidence/               # AssessmentBanner, EvidenceLedger, CodePrintComparison
│   ├── layout/                 # NavShell, responsive top navigation bar
│   ├── ml/                     # PredictionCard with calibrated confidence progress bars
│   └── passport/               # MedicinePassportModal and verification export
├── lib/                        # Pure TypeScript domain & engine logic
│   ├── evidence-engine.ts      # Two-tier evidence assessment & ledger compiler
│   ├── ocr-engine.ts           # Multi-pass blister foil OCR with glare compensation
│   ├── onnx-client.ts          # Calibrated ONNX WebAssembly inference client
│   ├── ingredient-normalizer.ts # Active ingredient conflict & deduplication engine
│   ├── code-print-compare.ts   # Code vs print comparison with OCR confusion matrix
│   ├── gs1-parser.ts           # GS1 element string parser (all formats)
│   ├── gtin.ts                 # Real GS1 GTIN validation algorithm
│   ├── dates.ts                # Structured expiry date parser
│   ├── diff.ts                 # Levenshtein alignment-based character diff
│   ├── image-quality.ts        # Blur, glare, and resolution pre-flight checks
│   └── copy.ts                 # Authoritative medical safety copy strings
├── ml/                         # Machine learning training & audit pipelines
│   ├── browser_test/           # Real headless browser parity test harness
│   ├── data_splits_v3/         # Leak-free perceptual hash & source-ID splits
│   ├── eval_common.py          # Unified Top-1, Top-3, ECE evaluation harness
│   ├── reports/                # Technical audit, battery reports, and parity logs
│   └── run_battery_v2.py       # Model training battery suite
├── public/
│   ├── models/                 # Deep learning model artifacts
│   │   ├── mediband_packaging_b7.onnx   # Production 288px packaging model
│   │   ├── packaging_b7.json            # Calibrated temperature & thresholds
│   │   └── mediband_loose_pill_model.onnx # Loose pill recognition model
│   └── ort/                    # ONNX Runtime WebAssembly binaries (SIMD)
├── store/                      # Persistent stores (cabinet, history, evidence)
└── data/                       # Indian medicine formulary & class definitions
```

---

## 🧪 Automated Test Suites

All 93 tests across 11 suites run with `npm test`:

| Test Suite | Tests | Scope |
|---|---|---|
| `lib/onnx-client.vitest.ts` | 8 | Step-down canvas halving, temperature calibration, and high-precision rejection |
| `lib/ocr-engine.vitest.ts` | 5 | Blister foil OCR, glare sanitization, and dot-matrix date/batch regexes |
| `lib/ingredient-normalizer.vitest.ts` | 9 | Active ingredient deduplication and drug conflict detection |
| `lib/evidence-engine.vitest.ts` | 8 | Two-tier evidence assessment and consistency ledger |
| `lib/gtin.vitest.ts` | 15 | GS1 GTIN checksum calculation and validation |
| `lib/gs1-parser.vitest.ts` | 11 | FNC1 / bracketed GS1 element string parsing |
| `lib/dates.vitest.ts` | 20 | Multi-format expiry and manufacture date parsing |
| `lib/diff.vitest.ts` | 8 | Levenshtein character alignment and diff coloring |
| `lib/image-quality.vitest.ts` | 5 | Glare detection, blur analysis, and resolution thresholds |
| `lib/capture-workflow.vitest.ts` | 4 | End-to-end scanner capture flow |
| `lib/prediction-safety.vitest.ts` | 4 | Prediction guardrails and fallback behavior |
