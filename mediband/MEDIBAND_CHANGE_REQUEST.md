# MediBand: Change Request for the Coding Agent

Paste this whole file to the agent. It is written as instructions to an agent working inside the MediBand repository (Next.js, TypeScript, localStorage prototype with simulated providers).

---

## 0. How to work

1. **Read the repo first.** This request was written from the changelog, not the source. Before changing anything, open the relevant files and confirm each issue exists as described. If an item is already correct, skip it and say so in the commit message.
2. **Work in phases (1 to 4).** One commit per numbered item or small group. Run `npm run lint`, a type check (`npx tsc --noEmit`), the tests, and `npm run build` after each phase. Do not start the next phase while any of these fail.
3. **Update `CHANGELOG.md`** with each phase (see section 4.2 for the new format).
4. **Do not** call any real external API, add real health data, or add any user-facing claim that a medicine is "genuine", "authentic", "safe", "real", "fake" or "counterfeit". Do not remove the limitations box from result pages.
5. If a task below conflicts with the code, prefer the intent stated in its heading and explain the deviation in the commit message.

### Product principles (non-negotiable)

- MediBand reports what was checked, against which source, and when. It never gives a verdict about whether a medicine is genuine or safe.
- A code being present, or a GTIN check digit being valid, is **not** evidence of authenticity.
- Simulated providers must always be visibly marked as simulated, including in the result banner.
- MediBand never invents or recommends a dosage or schedule.

---

## Phase 1: Correctness fixes (do first)

### 1.1 Fix invalid seed GTINs and add a data-validity test

Two seed GTINs fail the project's own GS1 check digit algorithm. Hand calculation:

- `09312345000035`: payload `0931234500003` gives weighted sum 54, so the check digit is **6**. Correct value: `09312345000036`.
- `09312345000102`: payload `0931234500010` gives weighted sum 46, so the check digit is **4**. Correct value: `09312345000104`.

Tasks:
- Re-compute all GTINs in `data/demo-scenarios.ts` and the seed packs with `validateGTIN`, and correct any that fail (confirm `09312345678907` still passes).
- Add a test that runs `validateGTIN` over **every** GTIN found in `data/` (all scenarios and all seed packs) and fails with the offending value.
- Update the GTIN reference table in the docs to match.
- Optional: demo GTINs currently use the `931` prefix. If you want an India-flavoured demo, use a `890` prefix and recompute check digits. Keep them clearly fictional.

### 1.2 Make the safety copy and the linter consistent

Current contradictions: `genuine` and `authentic` are forbidden terms, yet the required disclaimer says "...are genuine", the passport says "authenticity certificate", and the conflict banner says "cannot establish authenticity".

Tasks:
- Create `lib/copy.ts` as the **single source** of all user-facing safety strings. Components import from it; no inline safety strings in JSX.
- Reword to avoid forbidden terms:
  - Result disclaimer: `A matching machine-readable code does not show that the contents or packaging are what they claim to be.`
  - Passport footer: `This passport records what was checked. It is not a certificate that the medicine is what it claims to be.`
  - Conflict banner: `The code and the printed text do not agree. This can be caused by a misread, a print variation or a changed pack. Re-scan, and check the pack with a pharmacist.`
- Extend the forbidden list in `lib/copy-lint.ts`: genuine, authentic, authenticity, counterfeit, fake, spurious, real medicine, safe, safe to use, guaranteed, 100% verified, approved, legitimate, certified, trusted.
- Turn the linter into a **test**: scan all string literals and JSX text under `app/` and `components/` (and `lib/copy.ts`) and fail on any forbidden term. Support an explicit `ALLOWED_PHRASES` list for any deliberate defensive uses, each with a comment explaining why.
- Rename ledger status label "Verified" to "Matches" (UI text only). Reserve "verified" for nothing user-facing.

### 1.3 Rescope the top assessment (no unscoped green "Strong Evidence")

Problems: a valid GTIN check digit is counted as a verified signal; the "3 independent signals" all derive from the same QR; the top tier can be reached entirely on simulated data.

Tasks:
- Extend `EvidenceClaim` (in `types/index.ts`):

```ts
type ClaimSourceKind = 'PACK_CODE' | 'PACK_PRINT' | 'COMPUTED' | 'EXTERNAL_RECORD';
type ClaimStatus = 'matches' | 'conflict' | 'missing' | 'unverifiable' | 'format_valid';

interface EvidenceClaim {
  id: string;
  field: string;
  value: string;
  source: string;
  sourceKind: ClaimSourceKind;
  lineage: string;        // root of trust, e.g. 'pack-qr', 'pack-print', 'registry:demo'
  method: string;
  status: ClaimStatus;
  simulated: boolean;
  retrievedAt: string;    // ISO timestamp
  cropRef?: string;       // reference to the label crop, if any
}
```

- A valid GTIN check digit produces a `COMPUTED` claim with status `format_valid`. It **never** counts toward independent evidence.
- Count independent signals by **distinct `lineage`** among claims with status `matches`, excluding `COMPUTED` and `simulated` claims.
- Rename assessment labels (keep enum names if renaming is invasive, but change displayed text):
  - top tier: `No inconsistencies found` (requires at least 2 distinct lineages that match, one of them an `EXTERNAL_RECORD`)
  - `Inconsistency detected`
  - `Insufficient evidence`
- The banner always lists **scope**: "Checked: ..." and "Not checked: contents of the pack, storage conditions, whether the pack was altered after printing."
- If every matching external claim is simulated, the banner itself shows a persistent `DEMO DATA: simulated sources` chip. Do not rely on the ledger alone for this.
- Update the evidence-engine tests accordingly.

### 1.4 Separate shelf life from code/print consistency

Problem: `EXPIRED` currently overrides `CONFLICT_DETECTED`, hiding a conflict on an expired pack.

Tasks:
- Compute two independent results and show both in the UI:

```ts
type ConsistencyAssessment = 'NO_INCONSISTENCY_FOUND' | 'INCONSISTENCY_DETECTED' | 'INSUFFICIENT_EVIDENCE';
type ShelfLifeAssessment = 'IN_DATE' | 'EXPIRING_SOON' | 'EXPIRED' | 'UNKNOWN';
```

- Banner: primary line = consistency result; a second, always-visible line = shelf life. An expired pack with a mismatch must show both.
- Keep scenario D ("expired") demonstrable: its consistency result may be "No inconsistencies found" with shelf life "Expired".

### 1.5 Fix cabinet reseeding on empty

Problem: seeding happens whenever storage is empty, so deleting everything brings demo data back.

Tasks:
- Add a `mediband.cabinet.seeded` flag (and the same for history). Seed only when the flag is absent; set it after seeding.
- "Reset demo data" explicitly clears and reseeds, then sets the flag.
- Test: add seed data, remove all items, reload, and expect an empty cabinet.

### 1.6 Remove date time bombs

Tasks:
- Seeds and scenarios must use dates relative to now (for example `monthsFromNow(18)` helper) unless the scenario is deliberately expired.
- Add an injectable clock: `isExpired(expiry, now = new Date())`, and thread `now` through the evidence engine and cabinet status. Tests pass a fixed `now`.
- Scenario D uses a date safely in the past; "expiring soon" seeds use `now + 30 to 60 days`.

---

## Phase 2: Evidence logic correctness

### 2.1 Alignment-based character diff

`compareFields` diffs index by index, so one inserted character marks everything after it as different.

- Implement `diffChars(a: string, b: string): DiffOp[]` using Levenshtein alignment (or Myers). `DiffOp = { op: 'equal' | 'sub' | 'ins' | 'del'; a?: string; b?: string }`.
- Update `CodePrintComparison` to render from `DiffOp[]` (highlight `sub`, `ins`, `del`) and summarise as "N differences".
- Tests: `A12345` vs `A012345` yields one insertion; `A12345` vs `A99999` yields substitutions at the expected positions.

### 2.2 Structured date parsing

Printed dates vary and GS1 AI (17) is `YYMMDD`.

- Create `lib/dates.ts` with `parseExpiry(input: string): { year: number; month: number; day?: number } | null`. Support: `MM/YYYY`, `MM/YY`, `MM-YYYY`, `YYYY-MM`, `MMM YYYY` / `MMM-YY` (English month names), and `YYMMDD`.
- `day = 00` means last day of that month. Resolve a missing day to end of month.
- Compare expiry by parsed year and month, not by string. Unparseable input becomes a `missing` or `unverifiable` claim, never a conflict.
- Tests: `08/27`, `AUG 2027`, `08-2027`, and `270800` (YYMMDD with DD=00) all compare equal.

### 2.3 Distinguish OCR confusion from substantive mismatch

- Add a confusion map (O/0, I/1/l, B/8, S/5, Z/2, G/6).
- If two strings differ only by confusion pairs, classify the field as `LIKELY_OCR_CONFUSION`. UI: neutral/amber "Possible misread, please re-check", not red "Inconsistency detected". Keep both values visible.
- Batch comparison is case-sensitive after trimming and whitespace collapse. A case-only difference is reported as `FORMAT_VARIATION` with a note, not as a conflict.

### 2.4 Missing is never a match

- If either side of a comparison is empty or undefined, the claim status is `missing`. If both are missing, produce no claim.
- Tests for: encoded present and printed missing; printed present and encoded missing; both missing.

### 2.5 Provider result states

Replace boolean found/not-found with:

```ts
type ProviderStatus = 'NOT_QUERIED' | 'UNAVAILABLE' | 'NOT_FOUND' | 'FOUND';

interface ProviderResult {
  providerId: string;
  label: string;           // 'DEMO DATA' | 'SIMULATED PROVIDER'
  simulated: boolean;
  status: ProviderStatus;
  retrievedAt: string;
  sourceVersion?: string;
  scope: string;           // what this provider can and cannot tell you
  record?: unknown;
  error?: string;
}
```

- Scenario C (no machine-readable code) must produce `NOT_QUERIED`, not `NOT_FOUND`.
- Add a demo scenario or toggle where a provider returns `UNAVAILABLE`. The UI must show "Source unavailable" in neutral grey, not as a negative result.
- The architecture diagram lists `MockRecallProvider` but the file inventory has no such file. Create `providers/mock-recall.ts` (simulated, same interface) or remove it from the diagram.

---

## Phase 3: Product gaps

### 3.1 Cabinet fields from the spec

Add to `CabinetEntry` / pack storage: `quantity?: { remaining: number; unit: string }`, `notes?: string`, `openedAt?: string`, `inUseExpiryDays?: number`, plus a computed `inUseExpiryDate`. Show the earlier of printed expiry and in-use expiry. UI for editing quantity and notes; opened-date button ("Mark as opened").

### 3.2 Persist the evidence snapshot (medication passport)

`addToCabinet(medication, pack)` appears to drop the verification result, so the passport cannot show what was checked.

- Create `store/evidence-store.ts` holding immutable `EvidenceRecord`s: full claims, provider results, assessments, `createdAt`, app version.
- Link each cabinet pack to its latest `evidenceRecordId`.
- The passport reads from the record. "Re-check" creates a **new** record; never overwrite old ones. Show "Checked on <date>" and the sources.
- Principle: stored history is a record of past checks, not a source of truth. Each new scan is evaluated fresh.

### 3.3 Duplicate-ingredient detection with ingredient sets

Current logic assigns one ID per medication, so a combination product (for example paracetamol + ibuprofen) never matches a plain paracetamol pack.

- Change the model to `activeIngredients: string[]` (normalised, sorted). Keep `normalizeIngredientId` as the per-ingredient normaliser.
- Add a small synonym map (paracetamol = acetaminophen, etc.).
- Salt-word stripping: strip only from an explicit list of salt tokens, and never when the result would be a bare anion (so `sodium chloride` and `potassium chloride` stay distinct).
- `findDuplicateIngredients` groups medications that **share at least one** ingredient and names the shared ingredient(s). Keep the existing cautious wording.
- Tests: "Paracetamol 650" and "Paracetamol + Ibuprofen" produce a duplicate group; "Sodium chloride" and "Potassium chloride" do not; "PARACETAMOL 500mg" and "paracetamol" do.

### 3.4 Adherence safeguards

- `MedicationEvent`: add `scheduledFor?: string` so late and missed can be computed.
- Selector `lastTakenAt(medicationId)`. If a TAKEN is recorded within a window (default 10 minutes, configurable) of a previous TAKEN for the same medication, show a confirm dialog ("Already marked taken at HH:MM. Record again?"). Debounce double-taps.
- Undo for the most recent event (30 seconds).
- `MedicationSchedule`: add `source: 'LABEL' | 'PRESCRIPTION' | 'USER_ENTERED' | 'DEMO'` and `confirmedByUser: boolean`. No default doses anywhere. Show: "This schedule was entered by you. MediBand does not recommend doses."
- On the band simulator, show "Last taken: <time>" for the due medication.

### 3.5 Naming

- Rename `Medication.schedule` (regulatory schedule) to `regulatorySchedule` to avoid confusion with `MedicationSchedule`.
- User-facing copy: prefer "check" or "evidence" over "verification". Internal rename of `VerificationResult` to `EvidenceReport` is optional.

### 3.6 GS1 element string parser

- Create `lib/gs1-parser.ts` and tests. Support:
  - Parenthesised form: `(01)09312345678907(17)270800(10)A12345(21)SN001`
  - Raw form with GS (ASCII 29) separators after variable-length fields
  - GS1 Digital Link URLs: `.../01/<gtin>/10/<batch>/17/<yymmdd>/21/<serial>`
- AIs: 01 (GTIN, 14 digits), 10 (batch, up to 20), 17 (expiry YYMMDD), 21 (serial, up to 20). Return `{ gtin, batch, expiry, serial, errors[] }` and run `validateGTIN` on the GTIN.
- Never fetch URLs found inside a QR. Parse them as strings only.

### 3.7 Real decode path and manual entry

The scan flow is currently scenario-driven. Add a real path alongside it:

- `components/scan/LiveScanner.tsx` using `@zxing/browser` (or the native `BarcodeDetector` with a fallback) to decode QR, DataMatrix and EAN/GTIN from the camera, plus an image-upload fallback.
- A manual GTIN field that runs the real validator live (valid, invalid, wrong length), without needing a camera.
- Decoded payload goes through the GS1 parser, then validation, then the evidence pipeline.
- Because OCR is out of scope for now, add "What is printed on the pack?" fields (batch, expiry) that the user types. These drive the real code-versus-print comparison.
- Unknown GTINs against the mock providers produce `NOT_FOUND` honestly.
- Keep the four scenarios as demo shortcuts, labelled "Demo".

### 3.8 Label simulated behaviour

The scanning progress animation is fake. Label it ("Simulated scan") so it does not imply processing that is not happening.

---

## Phase 4: Housekeeping and quality

### 4.1 README.md (replace the create-next-app boilerplate)

Include: one-paragraph purpose; a notice that this is a prototype with simulated providers, not medical advice; how to run and test; the scenario table; a short architecture diagram (capture, decode, validate, compare, providers, evidence engine, UI); safety principles; known limitations; roadmap. Link to `docs/SAFETY.md`.

### 4.2 CHANGELOG and docs structure

- Convert `CHANGELOG.md` to Keep a Changelog format (Added / Changed / Fixed). Generate entries from git history using conventional commits where possible.
- Mark the pre-git entries (v0.1.0, v0.1.1) as "reconstructed". Do not invent commit hashes.
- Move out of the changelog:
  - the full file tree (delete; it duplicates the repo),
  - the GTIN algorithm and valid-GTIN table to `docs/gtin.md`,
  - the safety language rules to `docs/SAFETY.md` (generated from `lib/copy.ts` where possible),
  - architecture decisions to `docs/decisions/NNNN-title.md`.
- Fix the inconsistencies: v0.1.0 says Next.js 15 while `package.json` says 16.4.2; the architecture lists a recall provider with no file (see 2.5).

### 4.3 Tooling

- Replace the hand-rolled test runner with **Vitest**. Remove `ts-node`, `tsconfig-paths` and `tsconfig.test.json` if Vitest handles the `@/*` alias. Provide `npm test`.
- Add tests for: the evidence-engine decision table, `compareCodePrint` (insertions, OCR confusion, date formats, missing fields), the ingredient normaliser (combination products, salts), the GS1 parser, the copy linter, the seed-data GTIN check, and cabinet seeding.
- Add `.github/workflows/ci.yml`: install, lint, `tsc --noEmit`, test, build.
- Tailwind: if no utility classes are used in JSX, remove Tailwind, its PostCSS plugin and `tailwind.config.ts`, keep `globals.css` as plain CSS, and confirm the build. If you keep it, delete `tailwind.config.ts` (v4 configures via CSS).

### 4.4 Frontend quality and privacy

- Read `localStorage` inside `useEffect` (or a `useHydrated` hook) in all client components, never during render, to avoid hydration mismatches.
- Contrast: `#FF6115` on `#FFFCF4` is roughly 3:1, below WCAG AA for text. Use the dark ink colour for text on orange buttons and keep orange as an accent. Check status colours too, and keep icons alongside colour.
- Add a footer notice: `Prototype. Data stays in this browser (localStorage), unencrypted. Do not enter real health information.`
- Label every demo or simulated element visibly.

---

## Acceptance checklist

- [ ] Every GTIN in `data/` passes `validateGTIN`, enforced by a test.
- [ ] No forbidden term appears in UI copy, enforced by a test; required disclaimers use approved wording from `lib/copy.ts`.
- [ ] A valid check digit never counts as independent evidence; independence is by lineage.
- [ ] Banner shows consistency and shelf life separately, lists scope, and shows a `DEMO DATA` chip on simulated results.
- [ ] Expired plus mismatched pack displays both findings.
- [ ] Deleting all cabinet items does not reseed demo data.
- [ ] Tests pass with a fixed clock; no seed or scenario flips state with the passage of time.
- [ ] Alignment diff, flexible date parsing and OCR-confusion classification are implemented with tests.
- [ ] Missing data is never reported as a match; provider states distinguish not queried, unavailable, not found, found.
- [ ] Passport shows a persisted evidence record; re-check creates a new record.
- [ ] Combination products trigger duplicate-ingredient warnings; distinct salts do not.
- [ ] TAKEN logging warns on re-dose within the window, supports undo, and schedules show their source.
- [ ] Real decode path and manual GTIN entry work end to end with the GS1 parser.
- [ ] README replaced; changelog restructured; CI passes lint, types, tests and build.
