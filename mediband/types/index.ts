// ─── Core Medication Types ────────────────────────────────────────────────────

export interface Medication {
  id: string;
  brandName: string;
  genericName: string;
  strength: string;
  manufacturer: string;
  activeIngredientId: string; // normalized ID for duplicate detection
  dosageForm?: string;        // e.g. "tablet", "capsule"
  schedule?: string[];        // e.g. ["08:00", "20:00"]
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
}

// ─── Evidence Types ───────────────────────────────────────────────────────────

export type ClaimStatus = 'verified' | 'conflict' | 'missing' | 'unverifiable';

export interface EvidenceClaim {
  field: string;
  value: string;
  source: string;
  method: string;
  status: ClaimStatus;
}

export type AssessmentType =
  | 'STRONG_EVIDENCE'
  | 'CONFLICT_DETECTED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'EXPIRED';

export interface CharDiff {
  index: number;
  encoded: string;
  printed: string;
}

export interface CodePrintResult {
  batchMatch: boolean | null;
  expiryMatch: boolean | null;
  encodedBatch: string;
  printedBatch: string;
  encodedExpiry: string;
  printedExpiry: string;
  batchDiff?: CharDiff[];
  expiryDiff?: CharDiff[];
}

export interface ProviderResult {
  providerName: string;
  isSimulated: boolean;
  found: boolean;
  data?: Record<string, string>;
  label: string; // e.g. "DEMO DATA", "SIMULATED PROVIDER"
}

export interface VerificationResult {
  id: string;
  packId: string;
  medicationId: string;
  timestamp: string;
  assessment: AssessmentType;
  claims: EvidenceClaim[];
  codePrint: CodePrintResult;
  providerResults: ProviderResult[];
  limitations: string[];
  scenarioId?: string;
}

// ─── GTIN Types ───────────────────────────────────────────────────────────────

export interface GTINResult {
  raw: string;
  normalized: string;
  format: 'GTIN-8' | 'GTIN-12' | 'GTIN-13' | 'GTIN-14' | 'INVALID';
  valid: boolean;
  checkDigit: number;
  computed: number;
  error?: string;
}

// ─── Medicine Cabinet Types ───────────────────────────────────────────────────

export type CabinetStatus = 'in-date' | 'expiring-soon' | 'expired' | 'needs-review';

export interface CabinetEntry {
  medicationId: string;
  packId: string;
  medication: Medication;
  pack: MedicationPack;
  status: CabinetStatus;
  lastVerified?: string;
  verificationId?: string;
}

// ─── Medication Events ────────────────────────────────────────────────────────

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
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface MedicationSchedule {
  id: string;
  medicationId: string;
  medicationName: string;
  strength: string;
  times: string[]; // ["08:00", "20:00"]
  active: boolean;
}

// ─── Provider Interfaces ──────────────────────────────────────────────────────

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

// ─── Demo Scenarios ───────────────────────────────────────────────────────────

export type ScenarioId = 'A' | 'B' | 'C' | 'D';

export interface DemoScenario {
  id: ScenarioId;
  label: string;
  description: string;
  medication: Medication;
  pack: Partial<MedicationPack>;
  expectedAssessment: AssessmentType;
}

// ─── Reconciliation ───────────────────────────────────────────────────────────

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
