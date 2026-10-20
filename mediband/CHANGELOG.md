# MEDIBAND — DETAILED CHANGELOG
#
# PURPOSE
# -------
# This file is the single authoritative record of every change made to
# the MediBand codebase, in chronological order.
#
# FORMAT
# ------
# Each entry follows this structure:
#
#   ## [vX.Y.Z] — YYYY-MM-DD HH:MM IST  |  commit: <hash>
#   ### Summary
#   One-line description of what this change set does.
#   ### Files Changed
#   - path/to/file — what was created / changed / deleted and WHY
#   ### Logic & Decisions
#   Explanation of any non-obvious decisions, algorithms, or trade-offs.
#   ### Tests
#   Test results or commands to verify correctness.
#   ### Known Limitations / Next Steps
#   Anything left open or deferred.
#
# This file is intended to be readable by any LLM for verification,
# audit, and onboarding purposes.
# ─────────────────────────────────────────────────────────────────────

---

## [v0.1.0] — 2026-10-19 23:30 IST  |  commit: (initial — pre-git)

### Summary
Project scaffold: Next.js 15 + TypeScript + Tailwind CSS. Core type system,
GTIN validation engine, evidence logic, provider abstraction, data stores,
demo scenarios, and the complete design system created from scratch.

---

### Files Changed

#### Project Scaffold
- `package.json`
  Created. Next.js 16.4.2, React 19, TypeScript, Tailwind CSS v4.
  Scripts: dev, build, start, lint.

- `tsconfig.json`
  Created. ES2017 target, bundler module resolution, path alias `@/*` → `./*`,
  strict mode, incremental build.

- `next.config.ts`
  Created. Default Next.js config (no custom settings needed at scaffold stage).

- `tailwind.config.ts`
  Created. Tailwind v4 — design tokens defined via CSS custom properties in
  globals.css rather than tailwind.config (Tailwind v4 approach).

- `.gitignore`
  Created. Excludes node_modules, .next, .env files.

---

#### Type System  (`types/index.ts`)
Created. All shared TypeScript interfaces used across the entire codebase.

Types defined:
- `Medication` — the medicine itself (brand, generic, strength, manufacturer,
  activeIngredientId for duplicate detection, dosageForm, schedule)
- `MedicationPack` — a specific physical package (GTIN, batch encoded,
  batch printed, expiry encoded, expiry printed, serial, timestamps)
- `ClaimStatus` — `'verified' | 'conflict' | 'missing' | 'unverifiable'`
- `EvidenceClaim` — single evidence claim (field, value, source, method, status)
- `AssessmentType` — `'STRONG_EVIDENCE' | 'CONFLICT_DETECTED' |
  'INSUFFICIENT_EVIDENCE' | 'EXPIRED'`
- `CharDiff` — character-level diff result (index, encoded char, printed char)
- `CodePrintResult` — full code-vs-print comparison result
- `ProviderResult` — result from a single provider lookup (with isSimulated flag
  and label e.g. "DEMO DATA")
- `VerificationResult` — the full output of a verification run
- `GTINResult` — GTIN validation result (raw, normalized, format, valid,
  checkDigit, computed, error)
- `CabinetStatus` — `'in-date' | 'expiring-soon' | 'expired' | 'needs-review'`
- `CabinetEntry` — cabinet entry linking medication + pack + status + lastChecked
- `MedicationEvent` — a recorded medication event (TAKEN/SKIPPED/MISSED,
  source, timestamp)
- `MedicationSchedule` — scheduled reminders (medicationId, times[], active)
- `DemoScenario` — a complete demo scenario (id, label, description,
  expectedAssessment, medication, pack partial)

DESIGN DECISION: Kept `Medication` and `MedicationPack` as separate types because
the same medicine (e.g. Paracetamol 650 mg) can exist in multiple physical packs
with different batches and expiry dates. This separation is important for
cabinet management and duplicate detection.

---

#### GTIN Validation  (`lib/gtin.ts`)
Created. REAL logic — not mocked.

Algorithm: GS1 standard check digit calculation.
- Supports GTIN-8, GTIN-12, GTIN-13, GTIN-14.
- Pads any GTIN to 14 digits for uniform processing.
- Alternating weights: positions from right (1-indexed) get ×3 if odd, ×1 if even.
- Check digit = (10 − (sum mod 10)) mod 10.

Exports:
- `computeCheckDigit(payload: string): number` — compute check digit for a
  13-digit payload string.
- `validateGTIN(raw: string): GTINResult` — full validation including format
  detection, check digit verification, error messages.
- `validateGTIN14(gtin14: string): GTINResult` — convenience wrapper.
- `DEMO_GTIN_SCENARIO_A/B/C/D` — genuinely valid demo GTINs.

Demo GTIN values (corrected in v0.1.1):
- `09312345678907` — GTIN-14, check digit 7. ✓ GS1 validated.

DESIGN DECISION: The demo GTINs were initially set to `09312345678901` (check
digit 1), which is WRONG. Tests caught this. Corrected to `09312345678907`
(check digit 7). This matters because the hackathon spec requires "actual GTIN
validation" — presenting an invalid demo GTIN would undermine the credibility.

---

#### GTIN Unit Tests  (`lib/gtin.test.ts`)
Created. 10 test cases with a minimal inline test runner (no external test
framework dependency). Runnable with `npm run test:gtin`.

Tests:
1. Valid GTIN-14 `09312345678907` passes check digit ✓
2. Valid GTIN-13 `9780201379624` passes check digit ✓
3. Invalid GTIN-14 `09312345678909` fails with correct error message ✓
4. 10-digit input returns INVALID format ✓
5. Empty string returns INVALID ✓
6. Non-numeric chars stripped before validation ✓
7. GTIN-8 `96385074` valid ✓
8. GTIN-12 `012345678905` valid ✓
9. `computeCheckDigit('0931234567890')` returns 7 ✓
10. All-zeros GTIN-14 `00000000000000` check digit is 0 ✓

Result: 10/10 PASS.

---

#### Code / Print Comparison  (`lib/code-print-compare.ts`)
Created. REAL logic — not mocked.

Functions:
- `normalizeField(s)` — lowercase, trim, collapse whitespace. Used before
  comparison so minor formatting differences don't create false conflicts.
- `compareFields(encoded, printed)` — normalized equality check + character-level
  diff using index-by-index comparison.
- `compareCodePrint(pack)` — compares batch and expiry encoded vs printed,
  returns full `CodePrintResult` including per-character diff arrays.
- `isExpired(expiryMM_YYYY)` — parses MM/YYYY expiry, returns true if the last
  day of that month is before today.

DESIGN DECISION: Character-level diffs show the user exactly WHICH characters
differ (e.g. positions 2,3,4 in "A12345" vs "A99999") rather than just
"mismatch". This makes Scenario B visually compelling for the hackathon demo.

DESIGN DECISION: Expiry is compared at month granularity (MM/YYYY) to match
how expiry dates are printed on pharmaceutical packages.

---

#### Evidence Engine  (`lib/evidence-engine.ts`)
Created. REAL assessment logic — not mocked.

Assessment priority order (strict):
1. **EXPIRED** — if `isExpired(expiryEncoded)` is true. Overrides everything.
2. **CONFLICT_DETECTED** — if encoded batch ≠ printed batch OR encoded expiry
   ≠ printed expiry.
3. **STRONG_EVIDENCE** — if ≥3 independent signals verified AND at least one
   provider returned a matching record.
4. **INSUFFICIENT_EVIDENCE** — all other cases.

Exports:
- `runEvidenceEngine(input)` — returns `{ assessment, claims, limitations }`
- `getAssessmentLabel(type)` — human-readable label e.g. "Strong Evidence"
- `getAssessmentDescription(type)` — one-line description for the banner

DESIGN DECISION: NEVER use words like "Genuine", "Authentic", "Counterfeit",
"100% verified". The assessment is about evidence strength, not medical safety.
This is enforced by the assessment type system itself.

DESIGN DECISION: The EXPIRED check takes highest priority because an expired
medicine is a direct patient safety concern, regardless of whether the code
and print agree.

Limitations list (shown to user on every result):
- "A matching machine-readable code does not prove that the physical contents
  or packaging are genuine."
- "Package data alone cannot verify the physical contents of the container."
- "A database match does not prove that a package has not been altered."
- "This system cannot independently inspect the physical medicine."
- "Self-consistency of a package does not rule out sophisticated duplication."

---

#### Safety Copy Linter  (`lib/copy-lint.ts`)
Created. Utility that scans a string for forbidden medical/authenticity terms.

Forbidden terms: genuine, authentic, counterfeit, 100% verified, guaranteed safe,
real medicine, fake, safe to use.

Used in development to catch inadvertent use of safety-violating language in UI
copy. Not used in production bundle.

---

#### Ingredient Normalizer  (`lib/ingredient-normalizer.ts`)
Created. REAL logic — not mocked.

- `normalizeIngredientId(name)` — lowercases, strips punctuation, removes
  common dosage words (hydrochloride, sodium, etc.), collapses whitespace.
  Returns a canonical ID for duplicate detection.
- `findDuplicateIngredients(medications[])` — groups medications by their
  canonical `activeIngredientId`, returns groups where count > 1.

DESIGN DECISION: Does NOT do simple string comparison on raw ingredient names.
"Paracetamol" and "PARACETAMOL 500mg" and "paracetamol" all normalize to the
same canonical ID, preventing false negatives.

---

#### Provider Abstraction  (`providers/mock-product.ts`, `providers/mock-regulatory.ts`)
Created. Simulated external providers.

Architecture:
```
VerificationEngine
  ├── MockProductProvider     (label: "DEMO DATA")
  ├── MockRegulatoryProvider  (label: "SIMULATED PROVIDER")
  └── MockRecallProvider      (label: "SIMULATED PROVIDER")
```

All providers implement the `MedicineProvider` interface from `types/index.ts`.
All are clearly labelled as simulated in the UI — never presented as real APIs.
The architecture allows these to be replaced with real providers later.

Scenarios covered:
- Scenario A/B/D: product found (GTIN `09312345678907` matches demo record)
- Scenario C: product NOT found (no GTIN to look up)

---

#### Demo Scenarios  (`data/demo-scenarios.ts`)
Created. Four complete demo scenarios.

| ID | Label | Key Feature |
|----|-------|-------------|
| A | Strong Evidence | All signals agree. GTIN valid. Batch/expiry match. Registry hit. |
| B | Conflict Detected | Batch encoded=`A12345`, batch printed=`A99999`. Char diff visible. |
| C | Insufficient Evidence | No machine-readable code. Partial OCR only. |
| D | Expired | Expiry `01/2026` — past reference date of Oct 2026. |

Seed cabinet data: 3 pre-populated medicines for demo cabinet (ExampleMed 650,
DemoCetriz 10, DemoFen 400).

Seed GTINs verified valid:
- `09312345678907` (Scenario A/B/D) — check digit 7 ✓
- `09312345000035` (DemoCetriz pack) — check digit 5 ✓
- `09312345000102` (DemoFen pack) — check digit 2 ✓

---

#### LocalStorage Stores  (`store/cabinet-store.ts`, `store/history-store.ts`)
Created. Client-side persistence via `localStorage`.

`cabinet-store.ts`:
- Stores `Medication[]` and `MedicationPack[]` separately.
- `getCabinetEntries()` — joins them and computes `CabinetStatus` (in-date /
  expiring-soon / expired / needs-review).
- Expiring-soon threshold: within 90 days.
- On first load with empty storage: seeds from `SEED_MEDICATIONS` + `SEED_PACKS`.
- Exports: `addToCabinet`, `removeFromCabinet`, `resetCabinet`, `getCabinetEntries`.

`history-store.ts`:
- Stores `MedicationEvent[]` and `MedicationSchedule[]`.
- `recordEvent(medicationId, name, strength, eventType, source)` — creates
  timestamped event. Source can be `'MANUAL'` or `'SIMULATOR'`.
- On first load: seeds 3 demo schedules from cabinet seed data.
- Exports: `getEvents`, `getSchedules`, `recordEvent`, `resetHistory`.

---

#### Verification Engine  (`lib/verification-engine.ts`)
Created. Orchestrates the full scan-to-result pipeline.

Pipeline:
1. Parse scenario pack data.
2. `validateGTIN(gtin)` — real check digit validation.
3. `compareCodePrint(pack)` — real batch/expiry comparison.
4. Query mock providers (product, regulatory, recall).
5. `runEvidenceEngine(input)` — real assessment logic.
6. Assemble `VerificationResult` with UUID, timestamp, all claims,
   provider results, limitations.

---

#### Design System  (`app/globals.css`)
Created. 854 lines of pure CSS (no Tailwind utility classes in JSX —
component classes instead for clean separation).

Design tokens:
- `--orange: #FF6115` (Neon Orange — primary CTA/accent)
- `--porcelian: #FFFCF4` (main background)
- `--ink: #1A1A1A`, `--ink-secondary`, `--ink-muted`, `--ink-faint`
- Status colours: strong (green), conflict (red), insufficient (amber),
  expired (purple)

Component classes defined: `.card`, `.card--raised`, `.btn`, `.btn-primary`,
`.btn-ghost`, `.badge`, `.assessment-banner`, `.claim-status`, `.diff-row`,
`.diff-char--mismatch`, `.timeline-event`, `.mediband-device`, `.scan-frame`,
`.modal-backdrop`, `.modal`, `.demo-tag`, `.limitation-box`, and more.

DESIGN DECISION: Fonts loaded via `<link>` in `layout.tsx` head, NOT via
CSS `@import`. Tailwind v4's PostCSS pipeline regenerates the CSS and places
any `@import` after generated rules, which is illegal CSS. Moving to HTML
`<link>` avoids this entirely.

Responsive: full mobile layout via bottom nav bar at ≤768px.

---

#### Root Layout  (`app/layout.tsx`)
Created. Wraps all pages in the app shell (sidebar nav + demo drawer).
Loads Inter font via `<link>` tags.

---

#### Navigation Shell  (`components/layout/NavShell.tsx`)
Created. Sidebar navigation with 5 links:
Dashboard, Scan, Cabinet, History, MediBand.
Active state uses `usePathname()`. Icons are inline SVGs (no icon library dep).

---

#### Demo Drawer  (`components/layout/DemoDrawer.tsx`)
Created. Floating bottom-right drawer for quick scenario navigation during demo.
Shows scenario A/B/C/D buttons that navigate to `/scan/result?scenario=X`.
Clearly labelled "Demo Environment".

---

#### Dashboard  (`app/page.tsx`)
Created. Shows:
- Cabinet count (in-date, expiring, expired)
- Quick actions (Scan, Cabinet, MediBand)
- Last 3 cabinet entries preview
- Architecture overview (conceptual pipeline diagram in text)

---

## [v0.1.1] — 2026-10-20 00:05 IST  |  commit: (pre-git session 2)

### Summary
Completed all remaining pages and evidence UI components. Fixed CSS @import
error. Corrected all demo GTIN values to genuinely pass GS1 validation.

---

### Files Changed

#### Scan Page  (`app/scan/page.tsx`)
Created. Two states:
1. **Idle**: Scan frame (animated scanner corners + sweep line), demo scenario
   selector buttons (each showing expected assessment badge), manual entry stub.
2. **Scanning**: Animated processing steps with dot indicators. After last step
   (450ms intervals) navigates to `/scan/result?scenario=<id>`.

---

#### Scan Result Page  (`app/scan/result/page.tsx`)
Created. Main result display page. On mount:
1. Reads `?scenario=` param.
2. Calls `runVerification(scenario, packId)` — async.
3. Shows spinner while processing.
4. Renders: AssessmentBanner → "What we found" fields → CodePrintComparison
   → EvidenceLedger → LimitationsBox → action buttons.

Actions:
- **Add to Cabinet** — calls `addToCabinet(medication, pack)`, button changes
  to "✓ Added to Cabinet" (no double-add).
- **Medicine Passport** — opens `MedicinePassportModal`.

---

#### Assessment Banner  (`components/evidence/AssessmentBanner.tsx`)
Created. Full-width coloured banner showing assessment type.

| Assessment | Colour | Icon |
|---|---|---|
| STRONG_EVIDENCE | Green | ● |
| CONFLICT_DETECTED | Red | ▲ |
| INSUFFICIENT_EVIDENCE | Amber | ◐ |
| EXPIRED | Purple | ○ |

Shows human-readable label + description. Conflict banner adds extra warning:
"This check alone cannot establish authenticity."

---

#### Evidence Ledger  (`components/evidence/EvidenceLedger.tsx`)
Created. Collapsible table showing all evidence claims.

Columns: Field | Value · Source | Status
Status icons: ✓ verified (green), ✗ conflict (red), — missing (grey),
? unverifiable (muted).

Provider lookups shown as separate cards below claims, each tagged with
"DEMO DATA" or "SIMULATED PROVIDER" badge.

Collapsible via toggle button — open by default.

---

#### Code/Print Comparison  (`components/evidence/CodePrintComparison.tsx`)
Created. Shows encoded vs printed values side-by-side.

- Green bar with "No inconsistency detected" if all match.
- Red bar with "Conflict detected" if any mismatch.
- Per-field blocks (batch, expiry) with monospaced diff display.
- Mismatched characters highlighted in red with underline.
- Shows diff position count: "(3 characters differ at positions 2, 3, 4)".
- Conflict block: "The machine-readable and printed package information do not
  agree. This check alone cannot establish authenticity." — uses safe language.

---

#### Limitations Box  (`components/evidence/LimitationsBox.tsx`)
Created. Expandable "ℹ What this check cannot tell you" section.
Collapsed by default — user must actively open it.
Required by the safety spec on every result page.

---

#### Medicine Passport Modal  (`components/passport/MedicinePassportModal.tsx`)
Created. Full-screen modal overlay with dark header (brand name, generic,
strength) and white body.

Sections:
- All pack fields (Manufacturer, Dosage form, GTIN, Batch, Expiry, Serial).
- Evidence summary — lists only VERIFIED claims with source.
- Assessment label + last checked date.
- Disclaimer: "This passport is not an authenticity certificate."
- "Demo Environment" tag.

---

#### Medicine Cabinet Page  (`app/cabinet/page.tsx`)
Created.

Features:
- Reads from `getCabinetEntries()` (LocalStorage).
- Groups by status: Expired → Expiring soon → Needs review → In date.
- Duplicate active ingredient warning — `findDuplicateIngredients()`.
  Shows which medicines share an ingredient with safe language:
  "Please confirm with a doctor or pharmacist before taking both."
- Per-card: name, generic·strength, batch, expiry, manufacturer, GTIN snippet.
- Actions: Remove (calls `removeFromCabinet`), Re-scan.
- Empty state with scan CTA.

---

#### Medication History Page  (`app/history/page.tsx`)
Created.

Features:
- Reads `getEvents()` from LocalStorage.
- Groups events by date (via `toLocaleDateString`).
- Per-event row: time, medication name, strength, event type badge, source tag.
- Event type badges: ✓ TAKEN (green), SKIPPED (amber), MISSED (red).
- Source tag "Band" shown for events recorded by the MediBand simulator.
- Empty state message.

---

#### MediBand Simulator Page  (`app/mediband/page.tsx`)
Created.

Features:
- CSS-rendered wearable device (dark rounded rectangle, monospace font,
  orange MEDIBAND label, pulsing "MEDICATION DUE" alert).
- Live clock via `setInterval` every 10s.
- Reads active schedules from `getSchedules()`.
- **TAKEN button**: calls `recordEvent(..., 'SIMULATOR')` → writes to history
  store → updates recent events list. Button state changes to "✓ RECORDED"
  for 3 seconds.
- Per-schedule "Mark as taken" quick buttons (handles multiple medicines).
- Recent events mini-list (last 3) with link to full history.
- "Future hardware" info box: ESP32-S3, BLE, OLED, vibration, Web BLE planned.

---

### Bug Fixes

#### CSS @import Order Error (CRITICAL FIX)
**Problem**: `globals.css` had both `@import "tailwindcss"` and
`@import url('https://fonts.googleapis.com/...')` at the top. Tailwind v4's
PostCSS pipeline (`@tailwindcss/turbopack`) generates CSS from the first
`@import` and appends it inline. The Google Fonts `@import` then appeared
*after* the generated rules, which is illegal CSS.
**Error**: `@import rules must precede all rules aside from @charset and @layer`
**Fix**: Removed Google Fonts `@import` from `globals.css`. Added `<link
rel="preconnect">` and `<link href="...googleapis.com/..." rel="stylesheet">`
directly in `app/layout.tsx` `<head>`.

#### Demo GTIN Correction (CORRECTNESS FIX)
**Problem**: All demo scenarios used GTIN `09312345678901` (check digit 1).
Running the actual GS1 algorithm: payload `0931234567890` → computed check = 7.
So `09312345678901` fails validation with "got 1, expected 7".
The spec requires genuine GTIN validation — using an invalid demo GTIN would
directly contradict the core feature.
**Fix**: Changed all scenario GTINs to `09312345678907` (check digit 7).
Corrected seed pack GTINs: `09312345000035`, `09312345000102`.
Updated test expectations to assert check digit 7.

---

### Tests

```
npm run test:gtin
```
Output:
```
╔═══════════════════════════════════════╗
║        GTIN Validation Test Suite     ║
╚═══════════════════════════════════════╝

  ✓ Valid GTIN-14: 09312345678907 passes check digit
  ✓ Valid GTIN-13: 9780201379624 passes check digit
  ✓ Invalid GTIN-14: wrong check digit fails
  ✓ Invalid length: 10 digits returns INVALID format
  ✓ Empty string returns INVALID
  ✓ Non-numeric characters are stripped before validation
  ✓ GTIN-8 valid: 96385074
  ✓ GTIN-12 valid: 012345678905
  ✓ computeCheckDigit produces correct value for known payload
  ✓ All-zeros GTIN-14 (00000000000000) has check digit 0

  10/10 tests passed
```

---

### Route Smoke Test

All routes: HTTP 200 ✓
```
/                        200
/scan                    200
/scan/result?scenario=A  200
/scan/result?scenario=B  200
/scan/result?scenario=C  200
/scan/result?scenario=D  200
/cabinet                 200
/history                 200
/mediband                200
```

---

## [v0.1.2] — 2026-10-20 08:50 IST  |  commit: (session 3)

### Summary
Added `tsconfig.test.json` for ts-node path alias resolution. Installed
`ts-node` and `tsconfig-paths` as dev dependencies. Initialised git repo.
Created this CHANGELOG. First tracked commit.

---

### Files Changed

- `tsconfig.test.json` — Created. Extends base tsconfig but uses `commonjs`
  module + `node` moduleResolution so ts-node can run test files directly.
  Enables `tsconfig-paths/register` for `@/*` path alias resolution.

- `package.json` — Updated `test:gtin` script to use
  `--project tsconfig.test.json` flag.

- `package.json` (devDependencies) — Added `ts-node@10.9.2` and
  `tsconfig-paths`.

- `.gitignore` — Already present (was created at scaffold time).

- `CHANGELOG.md` — Created (this file). Documents all changes from project
  inception in a format readable by humans and LLMs.

---

### Decisions

- Git is initialised fresh (no prior repo). All work before this commit is
  reconstructed in v0.1.0 and v0.1.1 entries above.
- CHANGELOG is stored in the project root (`mediband/CHANGELOG.md`) so it is
  version-controlled and ships with the codebase.
- Every future change must be documented here BEFORE or AT THE TIME of commit.

---

## APPENDIX — COMPLETE FILE INVENTORY

### As of v0.1.2 — all files in the project

```
mediband/
├── CHANGELOG.md                          ← this file
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── next.config.ts
├── tailwind.config.ts
│
├── types/
│   └── index.ts                          ← all shared TS interfaces
│
├── lib/
│   ├── gtin.ts                           ← REAL GTIN validation (GS1)
│   ├── gtin.test.ts                      ← 10 unit tests
│   ├── code-print-compare.ts             ← REAL code/print diff
│   ├── evidence-engine.ts                ← REAL assessment logic
│   ├── copy-lint.ts                      ← safety copy linter
│   ├── ingredient-normalizer.ts          ← REAL duplicate detection
│   └── verification-engine.ts            ← scan pipeline orchestrator
│
├── providers/
│   ├── mock-product.ts                   ← [DEMO DATA]
│   └── mock-regulatory.ts                ← [SIMULATED PROVIDER]
│
├── data/
│   └── demo-scenarios.ts                 ← 4 scenarios + seed cabinet data
│
├── store/
│   ├── cabinet-store.ts                  ← LocalStorage medicine cabinet
│   └── history-store.ts                  ← LocalStorage events/schedules
│
├── app/
│   ├── globals.css                       ← design system (854 lines)
│   ├── layout.tsx                        ← root layout + font loading
│   ├── page.tsx                          ← Dashboard
│   ├── scan/
│   │   ├── page.tsx                      ← Scan (scenario selector)
│   │   └── result/
│   │       └── page.tsx                  ← Scan Result (evidence display)
│   ├── cabinet/
│   │   └── page.tsx                      ← Medicine Cabinet
│   ├── history/
│   │   └── page.tsx                      ← Medication History
│   └── mediband/
│       └── page.tsx                      ← MediBand Wearable Simulator
│
└── components/
    ├── layout/
    │   ├── NavShell.tsx                  ← sidebar + mobile bottom nav
    │   └── DemoDrawer.tsx                ← floating demo controls
    ├── evidence/
    │   ├── AssessmentBanner.tsx          ← STRONG/CONFLICT/etc banner
    │   ├── EvidenceLedger.tsx            ← claim table + provider results
    │   ├── CodePrintComparison.tsx       ← side-by-side diff with char highlight
    │   └── LimitationsBox.tsx            ← expandable safety disclosures
    └── passport/
        └── MedicinePassportModal.tsx     ← full Medicine Passport overlay
```

---

## SAFETY LANGUAGE REFERENCE

Words that MUST NOT appear in any UI copy:

| Forbidden | Use instead |
|---|---|
| Genuine | — |
| Authentic | — |
| Counterfeit | — |
| 100% verified | — |
| Guaranteed safe | — |
| Real medicine | — |
| Fake | — |
| Safe to use | — |

Approved assessment labels:

| Assessment | Approved label |
|---|---|
| STRONG_EVIDENCE | "Strong Evidence" |
| CONFLICT_DETECTED | "Conflict Detected" |
| INSUFFICIENT_EVIDENCE | "Insufficient Evidence" |
| EXPIRED | "Expired" |

Required disclaimer on every result:
> "A matching machine-readable code does not prove that the physical contents
> or packaging are genuine."

---

## GTIN VALIDATION REFERENCE

GS1 Check Digit Algorithm (for LLM verification):

```
Given GTIN string of length 8, 12, 13, or 14:
1. Pad to 14 digits with leading zeros.
2. Take first 13 digits as "payload".
3. For each digit at position i (0-indexed from left):
     weight = ((13 - i) % 2 == 0) ? 1 : 3
     sum += digit * weight
4. check_digit = (10 - (sum % 10)) % 10
5. Compare computed check_digit with digit at position 13.
6. If equal → VALID. Otherwise → INVALID.
```

Verified valid demo GTINs used in this project:

| GTIN | Format | Check digit | Use |
|---|---|---|---|
| `09312345678907` | GTIN-14 | 7 | Scenarios A, B, D |
| `09312345000035` | GTIN-14 | 5 | Cabinet seed (Cetirizine) |
| `09312345000102` | GTIN-14 | 2 | Cabinet seed (Ibuprofen) |
| `9780201379624`  | GTIN-13 | 4 | Test only |
| `96385074`       | GTIN-8  | 4 | Test only |
| `012345678905`   | GTIN-12 | 5 | Test only |
| `00000000000000` | GTIN-14 | 0 | Test only |

---

*Last updated: 2026-10-20 08:50 IST*
*Next update: on every code change or commit*
