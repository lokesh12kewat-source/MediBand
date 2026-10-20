// ─── Core Medication Types ─────────────────────────────────────────────────────

export interface Medication {
  id: string;
  brandName: string;
  genericName: string;
  strength: string;
  manufacturer: string;
  activeIngredientId: string;       // primary ingredient ID — for backward compat
  activeIngredients?: string[];     // all ingredient IDs — supports combo products (e.g. Co-amoxiclav)
  dosageForm?: string;              // e.g. "tablet", "capsule"
  regulatorySchedule?: string[];    // regulatory schedule info (renamed from schedule)
}

export interface MedicationPack {
  id: string;
  medicationId: string;
  gtin: string;
  batchEncoded: string;
  batchPrinted: string;
  expiryEncoded: string;   // MM/YYYY
  expiryPrinted: string;   // MM/YYYY
  serial?: string;
  addedAt: string;         // ISO timestamp
  verificationId?: string;
  evidenceRecordId?: string;
  quantity?: { remaining: number; unit: string };
  notes?: string;
  openedAt?: string;
  inUseExpiryDays?: number;
}

// ─── Evidence Claim Types ──────────────────────────────────────────────────────

export type ClaimSourceKind =
  | 'PACK_CODE'       // from machine-readable code (QR, DataMatrix, barcode)
  | 'PACK_PRINT'      // from OCR of printed text
  | 'COMPUTED'        // derived/calculated (e.g. GTIN check digit) — never counts as independent evidence
  | 'EXTERNAL_RECORD'; // from a provider lookup

export type ClaimStatus =
  | 'matches'         // value confirmed from this source
  | 'conflict'        // value disagrees with another source
  | 'missing'         // source present but value absent
  | 'unverifiable'    // cannot be checked with available data
  | 'format_valid';   // structural check passed (e.g. check digit) — not evidence of identity

export interface EvidenceClaim {
  id: string;
  field: string;
  value: string;
  source: string;
  sourceKind: ClaimSourceKind;
  lineage: string;       // root of trust, e.g. 'pack-qr', 'pack-print', 'registry:demo'
  method: string;
  status: ClaimStatus;
  simulated: boolean;
  retrievedAt: string;   // ISO timestamp
  cropRef?: string;
}

// ─── Assessment Types ──────────────────────────────────────────────────────────

/** Consistency of code-vs-print and available records */
export type ConsistencyAssessment =
  | 'NO_INCONSISTENCY_FOUND'
  | 'INCONSISTENCY_DETECTED'
  | 'INSUFFICIENT_EVIDENCE';

/** Shelf life based on expiry date */
export type ShelfLifeAssessment =
  | 'IN_DATE'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'UNKNOWN';

/** Legacy combined assessment — kept for backward compat */
export type AssessmentType =
  | 'STRONG_EVIDENCE'
  | 'CONFLICT_DETECTED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'EXPIRED';

// ─── Diff Types ────────────────────────────────────────────────────────────────

/** Alignment-based diff op (replaces old CharDiff index-by-index approach) */
export type DiffOp =
  | { op: 'equal'; a: string; b: string }
  | { op: 'sub';   a: string; b: string }
  | { op: 'ins';   b: string }
  | { op: 'del';   a: string };

// ─── Code / Print Result ───────────────────────────────────────────────────────

export type ComparisonKind =
  | 'MATCH'
  | 'CONFLICT'
  | 'LIKELY_OCR_CONFUSION'
  | 'FORMAT_VARIATION'
  | 'MISSING'
  | 'BOTH_MISSING';

export interface CodePrintResult {
  batchMatch: boolean | null;
  expiryMatch: boolean | null;
  batchKind?: ComparisonKind;
  expiryKind?: ComparisonKind;
  encodedBatch: string;
  printedBatch: string;
  encodedExpiry: string;
  printedExpiry: string;
  batchDiff?: DiffOp[];
  expiryDiff?: DiffOp[];
  batchDiffCount?: number;
  expiryDiffCount?: number;
}

// ─── Provider Types ────────────────────────────────────────────────────────────

export type ProviderStatus =
  | 'NOT_QUERIED'    // no query made (e.g. no GTIN to look up)
  | 'UNAVAILABLE'    // provider could not be reached
  | 'NOT_FOUND'      // queried but no record found
  | 'FOUND';         // record found

export interface ProviderResult {
  providerId: string;
  providerName: string;
  label: string;       // 'DEMO DATA' | 'SIMULATED PROVIDER'
  simulated: boolean;
  status: ProviderStatus;
  retrievedAt: string;
  sourceVersion?: string;
  scope: string;       // what this provider can and cannot tell you
  record?: unknown;
  error?: string;
  // legacy fields — kept for backward compat
  found: boolean;
  isSimulated: boolean;
  data?: Record<string, string>;
}

// ─── Verification / Evidence Report ───────────────────────────────────────────

export interface VerificationResult {
  id: string;
  packId: string;
  medicationId: string;
  timestamp: string;
  // New separate assessments
  consistencyAssessment: ConsistencyAssessment;
  shelfLifeAssessment: ShelfLifeAssessment;
  allSimulated: boolean;        // true if ALL matching external claims are simulated
  // Legacy combined assessment (derived from the two above)
  assessment: AssessmentType;
  claims: EvidenceClaim[];
  codePrint: CodePrintResult;
  providerResults: ProviderResult[];
  limitations: string[];
  scenarioId?: string;
}

// ─── GTIN Types ────────────────────────────────────────────────────────────────

export interface GTINResult {
  raw: string;
  normalized: string;
  format: 'GTIN-8' | 'GTIN-12' | 'GTIN-13' | 'GTIN-14' | 'INVALID';
  valid: boolean;
  checkDigit: number;
  computed: number;
  error?: string;
}

// ─── Medicine Cabinet Types ────────────────────────────────────────────────────

export type CabinetStatus = 'in-date' | 'expiring-soon' | 'expired' | 'needs-review';

export interface CabinetEntry {
  medicationId: string;
  packId: string;
  medication: Medication;
  pack: MedicationPack;
  status: CabinetStatus;
  lastVerified?: string;
  verificationId?: string;
  evidenceRecordId?: string;
  inUseExpiryDate?: string;
  effectiveExpiry?: string;
  isEarlierInUse?: boolean;
  daysRemaining?: number;
}

// ─── Medication Events ─────────────────────────────────────────────────────────

export type EventType = 'TAKEN' | 'SKIPPED' | 'MISSED';
export type EventSource = 'USER' | 'SIMULATOR';

export interface MedicationEvent {
  id: string;
  medicationId: string;
  medicationName: string;
  strength: string;
  packId?: string;
  eventType: EventType;
  timestamp: string;
  source: EventSource;
  scheduledFor?: string;  // ISO — for computing late/missed
}

// ─── Schedule ──────────────────────────────────────────────────────────────────

export type ScheduleSource = 'LABEL' | 'PRESCRIPTION' | 'USER_ENTERED' | 'DEMO';

export interface MedicationSchedule {
  id: string;
  medicationId: string;
  medicationName: string;
  strength: string;
  times: string[];         // ["08:00", "20:00"]
  active: boolean;
  source: ScheduleSource;
  confirmedByUser: boolean;
}

// ─── Provider Interfaces ───────────────────────────────────────────────────────

export interface ProductRecord {
  gtin: string;
  brandName: string;
  genericName: string;
  strength: string;
  manufacturer: string;
  activeIngredientId: string;
  dosageForm?: string;
}

export interface ProductProvider {
  name: string;
  isSimulated: boolean;
  lookup(gtin: string): Promise<ProductRecord | null>;
}

export interface RegulatoryResult {
  registered: boolean;
  registrationNumber?: string;
  notes?: string;
}

export interface RegulatoryProvider {
  name: string;
  isSimulated: boolean;
  check(gtin: string, batch: string): Promise<RegulatoryResult>;
}

export interface RecallResult {
  recalled: boolean;
  recallNumber?: string;
  reason?: string;
}

export interface RecallProvider {
  name: string;
  isSimulated: boolean;
  check(gtin: string, batch: string): Promise<RecallResult>;
}

// ─── Demo Scenarios ────────────────────────────────────────────────────────────

export type ScenarioId = 'A' | 'B' | 'C' | 'D';

export interface DemoScenario {
  id: ScenarioId;
  label: string;
  description: string;
  medication: Medication;
  pack: Partial<MedicationPack>;
  expectedAssessment: AssessmentType;
}

// ─── Reconciliation ────────────────────────────────────────────────────────────

export type ReconciliationStatus =
  | 'same-product'
  | 'same-ingredient-different-brand'
  | 'different-strength'
  | 'not-found'
  | 'not-on-list';

export interface ReconciliationItem {
  medication: Medication;
  status: ReconciliationStatus;
  matchedWith?: Medication;
}
