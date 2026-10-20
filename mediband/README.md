# MediBand

**Evidence-backed medication identification and adherence platform.**

MediBand doesn't ask you to blindly trust an AI answer. It shows you the evidence — what was checked, what matched, what conflicted, and what remains unknown.

---

## ⚠️ Prototype notice

This is a **hackathon MVP prototype**. All data is stored unencrypted in your browser's `localStorage`. Do not enter real health information.

All provider lookups (product registry, regulatory, recall) are **simulated**. No real external APIs are called.

---

## Core concept: the Evidence Ledger

Instead of saying _"This is Paracetamol 650 mg"_, MediBand shows you:

| Field | Value | Source | Status |
|---|---|---|---|
| GTIN | 09312345678907 | Machine code | Format valid |
| Brand | ExampleMed 650 | Machine code | Matches |
| Batch (code) | A12345 | Machine code | Matches |
| Batch (printed) | A12345 | Package print | Matches |
| Expiry | 04/2028 | Machine code | Matches |
| Registry | Demo record found | Demo registry | Matches |

And always includes: **What this check cannot tell you.**

---

## Safety language

MediBand never says a medicine is _genuine_, _authentic_, _counterfeit_, _safe_, or _fake_. It reports evidence strength and consistency. The distinction matters — a matching barcode does not prove the physical contents are what they claim to be.

See [`docs/SAFETY.md`](docs/SAFETY.md) for the full rationale.

---

## Quick start

```bash
# Install
npm install --legacy-peer-deps

# Dev server
npm run dev

# Type check
npx tsc --noEmit

# Unit tests (Vitest)
npm test

# Legacy ts-node tests (also available)
npm run test:gtin
```

Open [http://localhost:3000](http://localhost:3000).

---

## Demo scenarios

| Scenario | Key behaviour |
|---|---|
| **A** — No inconsistency found | All fields agree. GTIN valid. Registry demo hit. |
| **B** — Inconsistency detected | Batch code `A12345` vs printed `A99999`. Character diff shown. |
| **C** — Insufficient evidence | No machine-readable code. OCR only. |
| **D** — Expired + no inconsistency | Expiry ~9 months past. All fields self-consistent. |

Use the **Demo Drawer** (bottom-right) to jump between scenarios.

---

## Architecture

```
Medicine Package
      ↓
Scan (demo: scenario selector)
      ↓
GS1 Parser   ← lib/gs1-parser.ts
      ↓
GTIN Validation   ← lib/gtin.ts
      ↓
Code / Print Comparison   ← lib/code-print-compare.ts (alignment diff + date parsing)
      ↓
Provider Lookups   ← providers/ (all simulated)
      ↓
Evidence Engine   ← lib/evidence-engine.ts
      ↓
Verification Result
      ↓
Medicine Passport   ← localStorage via store/
      ↓
Cabinet + MediBand adherence tracker
```

---

## Project structure

```
mediband/
├── app/                    Next.js App Router pages
│   ├── page.tsx            Dashboard
│   ├── scan/               Scan + result pages
│   ├── cabinet/            Medicine cabinet
│   ├── history/            Medication event history
│   └── mediband/           Wearable simulator
├── components/
│   ├── evidence/           AssessmentBanner, EvidenceLedger, CodePrintComparison
│   ├── passport/           MedicinePassportModal
│   └── layout/             NavShell, DemoDrawer
├── lib/                    Pure TypeScript logic (no React)
│   ├── gtin.ts             GS1 GTIN validation (real algorithm)
│   ├── gs1-parser.ts       GS1 element string parser (all three formats)
│   ├── diff.ts             Levenshtein alignment-based character diff
│   ├── dates.ts            Structured expiry date parsing (7 formats)
│   ├── code-print-compare.ts  Code vs print comparison + OCR confusion
│   ├── evidence-engine.ts  Two-tier assessment (consistency + shelf life)
│   ├── verification-engine.ts  Full scan pipeline
│   ├── copy.ts             Single source of all safety strings
│   └── copy-lint.ts        Forbidden term scanner
├── providers/              Simulated external providers
├── store/                  localStorage stores (cabinet, history, evidence)
├── data/                   Demo scenarios + seed data
└── types/                  Shared TypeScript interfaces
```

---

## Tests

```
lib/gtin.test.ts        — 16 tests (ts-node)
lib/diff.test.ts        — 10 tests (ts-node)
lib/dates.test.ts       — 22 tests (ts-node)
lib/gs1-parser.test.ts  — 12 tests (ts-node)

lib/gtin.vitest.ts      — Vitest (npm test)
lib/diff.vitest.ts      — Vitest (npm test)
lib/dates.vitest.ts     — Vitest (npm test)
lib/gs1-parser.vitest.ts — Vitest (npm test)
```

---

## What this MVP does not do

- No real camera / barcode scanning (planned: `jsQR` + `DataMatrixReader`)
- No real external APIs (all providers are simulated)
- No user accounts or server-side storage
- No dosage recommendations — MediBand never suggests how much or when to take a medicine
- No claim that a matching code proves a medicine is genuine or safe

---

## CHANGELOG

See [`CHANGELOG.md`](CHANGELOG.md) for a full record of every change, including commit hashes, algorithm decisions, and test results. This file is intended to be readable by any LLM for verification and onboarding.

---

## License

Prototype — not for clinical use.
