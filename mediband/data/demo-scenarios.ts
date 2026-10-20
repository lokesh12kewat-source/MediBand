import { DemoScenario, Medication, MedicationPack } from '@/types';
import { DEMO_GTIN_SCENARIO_A } from '@/lib/gtin';

// ─── Shared Demo Medicine ─────────────────────────────────────────────────────

export const DEMO_MEDICATION: Medication = {
  id: 'med-examplemed-650',
  brandName: 'ExampleMed 650',
  genericName: 'Paracetamol',
  strength: '650 mg',
  manufacturer: 'Demo Pharmaceuticals',
  activeIngredientId: 'ING_PARACETAMOL',
  dosageForm: 'Tablet',
  schedule: ['08:00', '20:00'],
};

// ─── Scenario A — Strong Evidence ─────────────────────────────────────────────

export const SCENARIO_A: DemoScenario = {
  id: 'A',
  label: 'Strong Evidence',
  description: 'All signals agree. GTIN valid, product identified, batch and expiry consistent.',
  expectedAssessment: 'STRONG_EVIDENCE',
  medication: DEMO_MEDICATION,
  pack: {
    gtin: DEMO_GTIN_SCENARIO_A,
    batchEncoded: 'A12345',
    batchPrinted: 'A12345',
    expiryEncoded: '05/2028',
    expiryPrinted: '05/2028',
    serial: 'SN-00012345',
  },
};

// ─── Scenario B — Conflict Detected ───────────────────────────────────────────

export const SCENARIO_B: DemoScenario = {
  id: 'B',
  label: 'Conflict Detected',
  description: 'Batch mismatch: machine-readable code says A12345, printed text says A99999.',
  expectedAssessment: 'CONFLICT_DETECTED',
  medication: DEMO_MEDICATION,
  pack: {
    gtin: DEMO_GTIN_SCENARIO_A,
    batchEncoded: 'A12345',
    batchPrinted: 'A99999',   // ← conflict
    expiryEncoded: '05/2028',
    expiryPrinted: '05/2028',
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
    // Strength unknown from partial scan
    strength: '',
    genericName: '',
  },
  pack: {
    gtin: '',                  // unreadable code
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
  description: 'Package expiry date (01/2026) has passed. Demo reference date: 19 Oct 2026.',
  expectedAssessment: 'EXPIRED',
  medication: DEMO_MEDICATION,
  pack: {
    gtin: DEMO_GTIN_SCENARIO_A,
    batchEncoded: 'B00001',
    batchPrinted: 'B00001',
    expiryEncoded: '01/2026',  // ← expired
    expiryPrinted: '01/2026',
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
    schedule: ['22:00'],
  },
  {
    id: 'med-demofen-400',
    brandName: 'DemoFen 400',
    genericName: 'Ibuprofen',
    strength: '400 mg',
    manufacturer: 'Demo Pharmaceuticals',
    activeIngredientId: 'ING_IBUPROFEN',
    dosageForm: 'Tablet',
    schedule: [],
  },
];

export const SEED_PACKS: MedicationPack[] = [
  {
    id: 'pack-a',
    medicationId: 'med-examplemed-650',
    gtin: DEMO_GTIN_SCENARIO_A,
    batchEncoded: 'A12345',
    batchPrinted: 'A12345',
    expiryEncoded: '05/2028',
    expiryPrinted: '05/2028',
    serial: 'SN-00012345',
    addedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    verificationId: 'vr-scenario-a',
  },
  {
    id: 'pack-b',
    medicationId: 'med-democetriz-10',
    gtin: '09312345000035', // Valid GTIN-14
    batchEncoded: 'C55001',
    batchPrinted: 'C55001',
    expiryEncoded: '03/2027',
    expiryPrinted: '03/2027',
    addedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'pack-c',
    medicationId: 'med-demofen-400',
    gtin: '09312345000102', // Valid GTIN-14
    batchEncoded: 'D10023',
    batchPrinted: 'D10023',
    expiryEncoded: '12/2026',
    expiryPrinted: '12/2026',
    addedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];
