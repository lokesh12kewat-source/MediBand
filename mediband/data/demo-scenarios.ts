import { DemoScenario, Medication, MedicationPack } from '@/types';
import { DEMO_GTIN_SCENARIO_A } from '@/lib/gtin';

// ─── Date helpers (relative to now — no time bombs) ───────────────────────────

export function monthsFromNow(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Shared Demo Medicine ─────────────────────────────────────────────────────

export const DEMO_MEDICATION: Medication = {
  id: 'med-examplemed-650',
  brandName: 'ExampleMed 650',
  genericName: 'Paracetamol',
  strength: '650 mg',
  manufacturer: 'Demo Pharmaceuticals',
  activeIngredientId: 'ING_PARACETAMOL',
  dosageForm: 'Tablet',
  regulatorySchedule: [],
};

// ─── Scenario A — No Inconsistency ────────────────────────────────────────────

export const SCENARIO_A: DemoScenario = {
  id: 'A',
  label: 'No Inconsistencies Found',
  description: 'All signals agree. GTIN valid, product identified, batch and expiry consistent.',
  expectedAssessment: 'STRONG_EVIDENCE',
  medication: DEMO_MEDICATION,
  pack: {
    gtin: DEMO_GTIN_SCENARIO_A,
    batchEncoded: 'A12345',
    batchPrinted: 'A12345',
    expiryEncoded: monthsFromNow(18),
    expiryPrinted: monthsFromNow(18),
    serial: 'SN-00012345',
  },
};

// ─── Scenario B — Inconsistency Detected ──────────────────────────────────────

export const SCENARIO_B: DemoScenario = {
  id: 'B',
  label: 'Inconsistency Detected',
  description: 'Batch mismatch: machine-readable code says A12345, printed text says A99999.',
  expectedAssessment: 'CONFLICT_DETECTED',
  medication: DEMO_MEDICATION,
  pack: {
    gtin: DEMO_GTIN_SCENARIO_A,
    batchEncoded: 'A12345',
    batchPrinted: 'A99999',   // ← conflict
    expiryEncoded: monthsFromNow(18),
    expiryPrinted: monthsFromNow(18),
  },
};

// ─── Scenario C — Insufficient Evidence ───────────────────────────────────────

export const SCENARIO_C: DemoScenario = {
  id: 'C',
  label: 'Insufficient Evidence',
  description: 'Partial scan. Machine-readable code unreadable. Batch and expiry unknown.',
  expectedAssessment: 'INSUFFICIENT_EVIDENCE',
  medication: {
    ...DEMO_MEDICATION,
    strength: '',
    genericName: '',
  },
  pack: {
    gtin: '',
    batchEncoded: '',
    batchPrinted: '',
    expiryEncoded: '',
    expiryPrinted: '',
  },
};

// ─── Scenario D — Expired ─────────────────────────────────────────────────────

export const SCENARIO_D: DemoScenario = {
  id: 'D',
  label: 'Expired',
  description: 'Package expiry date has passed. Batch/expiry are self-consistent.',
  expectedAssessment: 'EXPIRED',
  medication: DEMO_MEDICATION,
  pack: {
    gtin: DEMO_GTIN_SCENARIO_A,
    batchEncoded: 'B00001',
    batchPrinted: 'B00001',
    expiryEncoded: monthsAgo(9),  // safely expired ~9 months ago
    expiryPrinted: monthsAgo(9),
  },
};

export const ALL_SCENARIOS: DemoScenario[] = [
  SCENARIO_A,
  SCENARIO_B,
  SCENARIO_C,
  SCENARIO_D,
];

export function getScenario(id: string): DemoScenario | undefined {
  return ALL_SCENARIOS.find(s => s.id === id);
}

// ─── Cabinet Seed Data ─────────────────────────────────────────────────────────

export const SEED_MEDICATIONS: Medication[] = [
  DEMO_MEDICATION,
  {
    id: 'med-democetriz-10',
    brandName: 'DemoCetriz 10',
    genericName: 'Cetirizine',
    strength: '10 mg',
    manufacturer: 'Demo Pharmaceuticals',
    activeIngredientId: 'ING_CETIRIZINE',
    dosageForm: 'Tablet',
    regulatorySchedule: [],
  },
  {
    id: 'med-demofen-400',
    brandName: 'DemoFen 400',
    genericName: 'Ibuprofen',
    strength: '400 mg',
    manufacturer: 'Demo Pharmaceuticals',
    activeIngredientId: 'ING_IBUPROFEN',
    dosageForm: 'Tablet',
    regulatorySchedule: [],
  },
];

export const SEED_PACKS: MedicationPack[] = [
  {
    id: 'pack-a',
    medicationId: 'med-examplemed-650',
    gtin: DEMO_GTIN_SCENARIO_A,
    batchEncoded: 'A12345',
    batchPrinted: 'A12345',
    expiryEncoded: monthsFromNow(18),
    expiryPrinted: monthsFromNow(18),
    serial: 'SN-00012345',
    addedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    verificationId: 'vr-scenario-a',
    quantity: { remaining: 24, unit: 'tablets' },
    notes: 'Take with full glass of water',
    openedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    inUseExpiryDays: 90,
  },
  {
    id: 'pack-b',
    medicationId: 'med-democetriz-10',
    gtin: '09312345000036', // Valid GTIN-14 (wsum=54, cd=6)
    batchEncoded: 'C55001',
    batchPrinted: 'C55001',
    expiryEncoded: monthsFromNow(2),  // expiring soon (~45 days)
    expiryPrinted: monthsFromNow(2),
    addedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    quantity: { remaining: 10, unit: 'tablets' },
    notes: 'Evening dose for seasonal allergy',
  },
  {
    id: 'pack-c',
    medicationId: 'med-demofen-400',
    gtin: '09312345000104', // Valid GTIN-14 (wsum=46, cd=4)
    batchEncoded: 'D10023',
    batchPrinted: 'D10023',
    expiryEncoded: monthsFromNow(14),
    expiryPrinted: monthsFromNow(14),
    addedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    quantity: { remaining: 30, unit: 'tablets' },
  },
];
