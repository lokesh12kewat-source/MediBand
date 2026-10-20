# MediBand Safety Language Guide

## Why careful language matters

MediBand checks whether what is encoded in a machine-readable code is consistent with what is printed on a package, and whether that code appears in available reference records. This is useful. But it has hard limits.

**A matching barcode does not prove that a medicine is genuine.**

A barcode or DataMatrix code can, in principle, be copied. A sophisticated duplicated package could carry a valid code that passes every automated check. MediBand can detect inconsistencies; it cannot rule out sophisticated duplication.

This means MediBand must never:
- claim that a medicine is _genuine_, _authentic_, _real_, or _not counterfeit_
- claim that a medicine is _safe_ or _safe to use_
- claim that a check is _guaranteed_ or _100% verified_

---

## Approved assessment vocabulary

| Situation | Approved phrasing |
|---|---|
| Code and print agree, record found | **No inconsistency found** |
| Code and print disagree | **Inconsistency detected** |
| Not enough data to assess | **Insufficient evidence** |
| Expiry date passed | **Expired** |
| Expiry within 90 days | **Expiring soon** |
| Claim from a single source confirmed | **Matches** (not "Verified") |
| Structural check passed (GTIN check digit) | **Format valid** (not evidence of identity) |

---

## Forbidden terms

The following terms must not appear in any user-facing string.

They are enforced by `lib/copy-lint.ts` which is run as a test.

| Forbidden | Reason |
|---|---|
| genuine | Implies physical contents, not just code consistency |
| authentic / authenticity | Same |
| counterfeit | Same — MediBand cannot determine this |
| fake | Same |
| spurious | Same |
| real medicine | Same |
| safe / safe to use | MediBand does not assess clinical safety |
| guaranteed | No check can be guaranteed |
| 100% verified | No check is 100% |
| approved | Reserved for regulatory bodies |
| legitimate | Same scope problem as genuine |
| certified | MediBand issues no certificate |
| trusted | Implies a level of assurance MediBand cannot provide |

---

## Required disclosures

Every scan result page **must** show the limitations section (`LimitationsBox`).

The following statements are required (from `lib/copy.ts`):

1. A matching machine-readable code does not show that the contents or packaging are what they claim to be.
2. Package data alone cannot verify the physical contents of the container.
3. A database match does not show that a package has not been altered.
4. This system cannot independently inspect the physical medicine.
5. Self-consistency of a package does not rule out sophisticated duplication.

---

## Simulated provider labelling

Every simulated provider **must** be visibly labelled in the UI as simulated.

- Use the `DEMO DATA` label for demo product registry entries.
- Use the `SIMULATED PROVIDER` label for simulated regulatory or recall checks.
- The assessment banner **must** show `DEMO DATA: simulated sources` when all evidence comes from simulated sources.

---

## Evidence independence rules

The consistency assessment uses these rules:

1. **GTIN check digit** is `COMPUTED` / `format_valid`. It is never counted as independent evidence. It only proves the string is internally self-consistent.

2. **Independence** is measured by distinct `lineage` values (e.g. `pack-qr`, `pack-print`, `registry:demo`) among claims where `status === 'matches'` and `sourceKind !== 'COMPUTED'` and `simulated !== true`.

3. **`NO_INCONSISTENCY_FOUND`** requires ≥2 distinct non-simulated lineages, at least one of which is `EXTERNAL_RECORD`. Since all providers are simulated in the MVP, the result will always be `INSUFFICIENT_EVIDENCE` — this is correct.

4. **`INCONSISTENCY_DETECTED`** if batch or expiry comparison returns `CONFLICT` or `LIKELY_OCR_CONFUSION`.

---

## Adherence safeguards

MediBand never recommends a dose or schedule. Schedules recorded in the app are always clearly labelled with their origin (`DEMO`, `SCAN`, or `USER_ENTERED`). Taking a dose requires a two-step confirmation (tap → confirm), followed by an 8-second undo window.

The schedule disclaimer (`lib/copy.ts → SCHEDULE_DISCLAIMER`) is displayed on the MediBand page:

> _This schedule was entered by you. MediBand does not recommend doses._
