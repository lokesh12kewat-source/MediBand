/**
 * lib/copy.ts — Single source of truth for all user-facing safety strings.
 *
 * Components import from here; no inline safety strings in JSX.
 * See docs/SAFETY.md for rationale.
 *
 * ALLOWED_PHRASES — deliberate uses of words that sound similar to forbidden terms:
 * (none at this time — all safety strings use the approved wordings below)
 */

// ─── Limitation statements ─────────────────────────────────────────────────────
// Required disclosure on every result page. Must not use forbidden terms.

export const LIMITATIONS: readonly string[] = [
  'A matching machine-readable code does not show that the contents or packaging are what they claim to be.',
  'Package data alone cannot verify the physical contents of the container.',
  'A database match does not show that a package has not been altered.',
  'This system cannot independently inspect the physical medicine.',
  'Self-consistency of a package does not rule out sophisticated duplication.',
];

// ─── Passport footer ───────────────────────────────────────────────────────────

export const PASSPORT_DISCLAIMER =
  'This passport records what was checked. It is not a certificate that the medicine is what it claims to be.';

// ─── Conflict / inconsistency banner extra line ────────────────────────────────

export const CONFLICT_EXTRA =
  'The code and the printed text do not agree. This can be caused by a misread, a print variation or a changed pack. Re-scan, and check the pack with a pharmacist.';

// ─── Demo / prototype notice ───────────────────────────────────────────────────

export const DEMO_NOTICE =
  'Prototype. Data stays in this browser (localStorage), unencrypted. Do not enter real health information.';

// ─── Schedule disclaimer ───────────────────────────────────────────────────────

export const SCHEDULE_DISCLAIMER =
  'This schedule was entered by you. MediBand does not recommend doses.';

// ─── Assessment labels ─────────────────────────────────────────────────────────

export const ASSESSMENT_LABELS = {
  NO_INCONSISTENCY_FOUND: 'No inconsistencies found',
  INCONSISTENCY_DETECTED:  'Inconsistency detected',
  INSUFFICIENT_EVIDENCE:   'Insufficient evidence',
  IN_DATE:                 'In date',
  EXPIRING_SOON:           'Expiring soon',
  EXPIRED:                 'Expired',
  UNKNOWN:                 'Unknown shelf life',
} as const;

// ─── Scope notices (always shown in assessment banner) ─────────────────────────

export const SCOPE_CHECKED =
  'Checked: machine-readable code format, code-vs-print field consistency, and available reference records.';

export const SCOPE_NOT_CHECKED =
  'Not checked: contents of the pack, storage conditions, whether the pack was altered after printing.';
