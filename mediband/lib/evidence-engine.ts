/**
 * lib/evidence-engine.ts — Evidence Assessment Engine
 *
 * Produces two independent assessments:
 *   1. ConsistencyAssessment — code-vs-print and provider agreement
 *   2. ShelfLifeAssessment   — based on expiry date
 *
 * Key rules:
 * - GTIN check digit is COMPUTED, status format_valid — never counts as independent evidence.
 * - Independence is measured by distinct `lineage` among non-COMPUTED, non-simulated claims
 *   with status 'matches'.
 * - allSimulated = true if every EXTERNAL_RECORD claim with 'matches' status is simulated.
 * - Injectable `now` for deterministic tests.
 */

import {
  AssessmentType,
  ConsistencyAssessment,
  ShelfLifeAssessment,
  EvidenceClaim,
  GTINResult,
  CodePrintResult,
  ProviderResult,
  VerificationResult,
  MedicationPack,
  Medication,
  ClaimStatus,
  ClaimSourceKind,
} from '@/types';
import { isExpired, daysUntilExpiry } from './code-print-compare';
import { LIMITATIONS } from './copy';

// ─── Input ─────────────────────────────────────────────────────────────────────

export interface EvidenceEngineInput {
  gtinResult: GTINResult;
  codePrint: CodePrintResult;
  providerResults: ProviderResult[];
  pack: Partial<MedicationPack>;
  medication: Partial<Medication>;
  scanScenario?: 'A' | 'B' | 'C' | 'D';
  now?: Date;  // injectable clock for tests
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function newClaim(
  field: string,
  value: string,
  source: string,
  sourceKind: ClaimSourceKind,
  lineage: string,
  method: string,
  status: ClaimStatus,
  simulated: boolean,
): EvidenceClaim {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `claim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    field,
    value,
    source,
    sourceKind,
    lineage,
    method,
    status,
    simulated,
    retrievedAt: new Date().toISOString(),
  };
}

// ─── Main Engine ───────────────────────────────────────────────────────────────

export function runEvidenceEngine(input: EvidenceEngineInput): {
  assessment: AssessmentType;
  consistencyAssessment: ConsistencyAssessment;
  shelfLifeAssessment: ShelfLifeAssessment;
  allSimulated: boolean;
  claims: EvidenceClaim[];
  limitations: string[];
} {
  const claims: EvidenceClaim[] = [];
  const { gtinResult, codePrint, providerResults, pack, medication } = input;
  const now = input.now ?? new Date();

  // ── GTIN — COMPUTED, format_valid only ───────────────────────────────────
  claims.push(newClaim(
    'GTIN format',
    gtinResult.valid
      ? `${gtinResult.normalized} (${gtinResult.format})`
      : gtinResult.raw || '—',
    'Machine-readable code',
    'COMPUTED',
    'computed',
    'GS1 check digit algorithm',
    gtinResult.valid ? 'format_valid' : gtinResult.raw ? 'conflict' : 'missing',
    false,
  ));

  // ── Brand name — from OCR (PACK_PRINT) ──────────────────────────────────
  claims.push(newClaim(
    'Brand name',
    medication.brandName || '—',
    'OCR (printed pack)',
    'PACK_PRINT',
    'pack-print',
    'Text extraction from package',
    medication.brandName ? 'matches' : 'missing',
    false,
  ));

  // ── Generic name — from OCR ───────────────────────────────────────────────
  claims.push(newClaim(
    'Generic name',
    medication.genericName || '—',
    'OCR (printed pack)',
    'PACK_PRINT',
    'pack-print',
    'Text extraction from package',
    medication.genericName ? 'matches' : 'missing',
    false,
  ));

  // ── Strength — from OCR ───────────────────────────────────────────────────
  claims.push(newClaim(
    'Strength',
    medication.strength || '—',
    'OCR (printed pack)',
    'PACK_PRINT',
    'pack-print',
    'Text extraction from package',
    medication.strength ? 'matches' : 'missing',
    false,
  ));

  // ── Batch — encoded vs printed ────────────────────────────────────────────
  if (codePrint.encodedBatch) {
    claims.push(newClaim(
      'Batch (encoded)',
      codePrint.encodedBatch,
      'DataMatrix / Barcode',
      'PACK_CODE',
      'pack-qr',
      'Machine-readable code extraction',
      'matches',
      false,
    ));

    const batchStatus: ClaimStatus =
      codePrint.batchMatch === true  ? 'matches' :
      codePrint.batchMatch === false ? 'conflict' :
      'missing';

    claims.push(newClaim(
      'Batch (printed)',
      codePrint.printedBatch || '—',
      'OCR (printed pack)',
      'PACK_PRINT',
      'pack-print',
      'Text extraction from package',
      codePrint.printedBatch ? batchStatus : 'missing',
      false,
    ));

    if (codePrint.batchMatch !== null) {
      claims.push(newClaim(
        'Batch consistency',
        codePrint.batchMatch ? 'Code and print agree' : `Differ (${codePrint.batchDiffCount ?? '?'} difference${(codePrint.batchDiffCount ?? 0) !== 1 ? 's' : ''})`,
        'Comparison engine',
        'COMPUTED',
        'computed',
        'Encoded vs printed field comparison',
        codePrint.batchMatch ? 'matches' : 'conflict',
        false,
      ));
    }
  } else {
    claims.push(newClaim(
      'Batch',
      '—',
      'DataMatrix / OCR',
      'PACK_CODE',
      'pack-qr',
      'Not extracted',
      'missing',
      false,
    ));
  }

  // ── Expiry — encoded vs printed ───────────────────────────────────────────
  if (codePrint.encodedExpiry) {
    claims.push(newClaim(
      'Expiry (encoded)',
      codePrint.encodedExpiry,
      'DataMatrix / Barcode',
      'PACK_CODE',
      'pack-qr',
      'Machine-readable code extraction',
      'matches',
      false,
    ));

    if (codePrint.printedExpiry) {
      const expiryStatus: ClaimStatus =
        codePrint.expiryMatch === true  ? 'matches' :
        codePrint.expiryMatch === false ? 'conflict' :
        'missing';

      claims.push(newClaim(
        'Expiry (printed)',
        codePrint.printedExpiry,
        'OCR (printed pack)',
        'PACK_PRINT',
        'pack-print',
        'Text extraction from package',
        expiryStatus,
        false,
      ));
    }
  } else {
    claims.push(newClaim(
      'Expiry',
      '—',
      'DataMatrix / OCR',
      'PACK_CODE',
      'pack-qr',
      'Not extracted',
      'missing',
      false,
    ));
  }

  // ── Registry / Provider Claims ────────────────────────────────────────────
  for (const pr of providerResults) {
    const isFound = pr.status === 'FOUND';
    claims.push(newClaim(
      `Reference (${pr.providerName})`,
      isFound ? `Record found [${pr.label}]` :
      pr.status === 'NOT_QUERIED' ? 'Not queried — no machine-readable code' :
      pr.status === 'UNAVAILABLE' ? 'Source unavailable' :
      'No record in demo registry',
      `${pr.providerName} [${pr.label}]`,
      'EXTERNAL_RECORD',
      `registry:${pr.providerId}`,
      'GTIN lookup',
      isFound ? 'matches' :
      pr.status === 'NOT_QUERIED' ? 'unverifiable' :
      'missing',
      pr.simulated,
    ));
  }

  // ─── Shelf Life Assessment ────────────────────────────────────────────────
  const expiryToCheck = codePrint.encodedExpiry || codePrint.printedExpiry || pack.expiryEncoded || '';
  let shelfLifeAssessment: ShelfLifeAssessment = 'UNKNOWN';

  if (expiryToCheck) {
    if (isExpired(expiryToCheck, now)) {
      shelfLifeAssessment = 'EXPIRED';
    } else {
      const days = daysUntilExpiry(expiryToCheck, now);
      shelfLifeAssessment = days <= 90 ? 'EXPIRING_SOON' : 'IN_DATE';
    }
  }

  // ─── Consistency Assessment ───────────────────────────────────────────────
  // 1. Any code-print mismatch → INCONSISTENCY_DETECTED
  let consistencyAssessment: ConsistencyAssessment;

  if (codePrint.batchMatch === false || codePrint.expiryMatch === false) {
    consistencyAssessment = 'INCONSISTENCY_DETECTED';
  } else {
    // Count independent non-simulated lineages with status 'matches'
    // Exclude COMPUTED claims entirely
    const matchingClaims = claims.filter(
      c => c.status === 'matches' && c.sourceKind !== 'COMPUTED' && !c.simulated,
    );
    const distinctLineages = new Set(matchingClaims.map(c => c.lineage));

    // Check if any external (non-simulated) record matched
    const hasExternalMatch = claims.some(
      c => c.sourceKind === 'EXTERNAL_RECORD' && c.status === 'matches' && !c.simulated,
    );

    if (distinctLineages.size >= 2 && hasExternalMatch) {
      consistencyAssessment = 'NO_INCONSISTENCY_FOUND';
    } else {
      consistencyAssessment = 'INSUFFICIENT_EVIDENCE';
    }
  }

  // ─── allSimulated flag ────────────────────────────────────────────────────
  const externalMatchingClaims = claims.filter(
    c => c.sourceKind === 'EXTERNAL_RECORD' && c.status === 'matches',
  );
  const allSimulated = externalMatchingClaims.length > 0
    ? externalMatchingClaims.every(c => c.simulated)
    : true; // no external matches → treat as all-simulated

  // ─── Legacy combined assessment ───────────────────────────────────────────
  let assessment: AssessmentType;
  if (shelfLifeAssessment === 'EXPIRED') {
    assessment = 'EXPIRED';
  } else if (consistencyAssessment === 'INCONSISTENCY_DETECTED') {
    assessment = 'CONFLICT_DETECTED';
  } else if (consistencyAssessment === 'NO_INCONSISTENCY_FOUND') {
    assessment = 'STRONG_EVIDENCE';
  } else {
    assessment = 'INSUFFICIENT_EVIDENCE';
  }

  return {
    assessment,
    consistencyAssessment,
    shelfLifeAssessment,
    allSimulated,
    claims,
    limitations: [...LIMITATIONS],
  };
}

// ─── Label helpers ─────────────────────────────────────────────────────────────

export function getConsistencyLabel(a: ConsistencyAssessment): string {
  switch (a) {
    case 'NO_INCONSISTENCY_FOUND': return 'No inconsistencies found';
    case 'INCONSISTENCY_DETECTED': return 'Inconsistency detected';
    case 'INSUFFICIENT_EVIDENCE':  return 'Insufficient evidence';
  }
}

export function getShelfLifeLabel(a: ShelfLifeAssessment): string {
  switch (a) {
    case 'IN_DATE':       return 'In date';
    case 'EXPIRING_SOON': return 'Expiring soon';
    case 'EXPIRED':       return 'Expired';
    case 'UNKNOWN':       return 'Shelf life unknown';
  }
}

/** @deprecated — use getConsistencyLabel + getShelfLifeLabel */
export function getAssessmentLabel(assessment: AssessmentType): string {
  switch (assessment) {
    case 'STRONG_EVIDENCE':       return 'No inconsistencies found';
    case 'CONFLICT_DETECTED':     return 'Inconsistency detected';
    case 'INSUFFICIENT_EVIDENCE': return 'Insufficient evidence';
    case 'EXPIRED':               return 'Expired';
  }
}

/** @deprecated — use separate labels */
export function getAssessmentDescription(assessment: AssessmentType): string {
  switch (assessment) {
    case 'STRONG_EVIDENCE':
      return 'All checked fields are self-consistent and a reference record was found.';
    case 'CONFLICT_DETECTED':
      return 'The code and the printed text do not agree.';
    case 'INSUFFICIENT_EVIDENCE':
      return 'There is not enough information to make a reliable assessment.';
    case 'EXPIRED':
      return 'The package expiry date has passed.';
  }
}
