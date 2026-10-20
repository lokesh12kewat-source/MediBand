import {
  AssessmentType,
  EvidenceClaim,
  GTINResult,
  CodePrintResult,
  ProviderResult,
  VerificationResult,
  MedicationPack,
  Medication,
} from '@/types';
import { isExpired } from './code-print-compare';

export interface EvidenceEngineInput {
  gtinResult: GTINResult;
  codePrint: CodePrintResult;
  providerResults: ProviderResult[];
  pack: Partial<MedicationPack>;
  medication: Partial<Medication>;
  scanScenario?: 'A' | 'B' | 'C' | 'D';
}

const LIMITATIONS = [
  'A matching machine-readable code does not prove that the physical contents or packaging are genuine.',
  'Package data alone cannot verify the physical contents of the container.',
  'A database match does not prove that a package has not been altered.',
  'This system cannot independently inspect the physical medicine.',
  'Self-consistency of a package does not rule out sophisticated duplication.',
];

/**
 * Evidence Engine — Real Assessment Logic
 *
 * Priority order:
 * 1. EXPIRED — if expiry date has passed (overrides all other assessments)
 * 2. CONFLICT_DETECTED — if encoded ≠ printed for batch or expiry
 * 3. STRONG_EVIDENCE — if ≥3 independent signals agree AND registry match
 * 4. INSUFFICIENT_EVIDENCE — otherwise
 */
export function runEvidenceEngine(input: EvidenceEngineInput): {
  assessment: AssessmentType;
  claims: EvidenceClaim[];
  limitations: string[];
} {
  const claims: EvidenceClaim[] = [];
  const { gtinResult, codePrint, providerResults, pack, medication } = input;

  // ── GTIN Claim ────────────────────────────────────────────────────────────
  claims.push({
    field: 'GTIN',
    value: gtinResult.valid ? `${gtinResult.normalized} (${gtinResult.format})` : gtinResult.raw || '—',
    source: 'Machine-readable code',
    method: 'GS1 check digit algorithm',
    status: gtinResult.valid ? 'verified' : gtinResult.raw ? 'conflict' : 'missing',
  });

  // ── Brand Claim ───────────────────────────────────────────────────────────
  if (medication.brandName) {
    claims.push({
      field: 'Brand name',
      value: medication.brandName,
      source: 'OCR',
      method: 'Text extraction from package',
      status: 'verified',
    });
  } else {
    claims.push({
      field: 'Brand name',
      value: '—',
      source: 'OCR',
      method: 'Text extraction from package',
      status: 'missing',
    });
  }

  // ── Generic / Active Ingredient Claim ─────────────────────────────────────
  if (medication.genericName) {
    claims.push({
      field: 'Generic name',
      value: medication.genericName,
      source: 'OCR',
      method: 'Text extraction from package',
      status: 'verified',
    });
  } else {
    claims.push({
      field: 'Generic name',
      value: '—',
      source: 'OCR',
      method: 'Text extraction from package',
      status: 'missing',
    });
  }

  // ── Strength Claim ────────────────────────────────────────────────────────
  if (medication.strength) {
    claims.push({
      field: 'Strength',
      value: medication.strength,
      source: 'OCR',
      method: 'Text extraction from package',
      status: 'verified',
    });
  } else {
    claims.push({
      field: 'Strength',
      value: '—',
      source: 'OCR',
      method: 'Text extraction from package',
      status: 'missing',
    });
  }

  // ── Batch Claim ───────────────────────────────────────────────────────────
  if (codePrint.encodedBatch) {
    const batchStatus = codePrint.batchMatch === true
      ? 'verified'
      : codePrint.batchMatch === false
        ? 'conflict'
        : 'unverifiable';

    claims.push({
      field: 'Batch (encoded)',
      value: codePrint.encodedBatch,
      source: 'DataMatrix / Barcode',
      method: 'Machine-readable code extraction',
      status: batchStatus === 'verified' ? 'verified' : batchStatus === 'conflict' ? 'conflict' : 'missing',
    });

    claims.push({
      field: 'Batch (printed)',
      value: codePrint.printedBatch || '—',
      source: 'OCR',
      method: 'Text extraction from package',
      status: codePrint.printedBatch ? batchStatus : 'missing',
    });

    if (codePrint.batchMatch !== null) {
      claims.push({
        field: 'Batch consistency',
        value: codePrint.batchMatch ? 'Match' : 'Mismatch',
        source: 'Comparison engine',
        method: 'Encoded vs printed comparison',
        status: codePrint.batchMatch ? 'verified' : 'conflict',
      });
    }
  } else {
    claims.push({
      field: 'Batch',
      value: '—',
      source: 'DataMatrix / OCR',
      method: 'Not extracted',
      status: 'missing',
    });
  }

  // ── Expiry Claim ──────────────────────────────────────────────────────────
  if (codePrint.encodedExpiry) {
    const expiryStatus = codePrint.expiryMatch === true
      ? 'verified'
      : codePrint.expiryMatch === false
        ? 'conflict'
        : 'unverifiable';

    claims.push({
      field: 'Expiry (encoded)',
      value: codePrint.encodedExpiry,
      source: 'DataMatrix / Barcode',
      method: 'Machine-readable code extraction',
      status: expiryStatus === 'verified' ? 'verified' : expiryStatus === 'conflict' ? 'conflict' : 'missing',
    });

    if (codePrint.printedExpiry) {
      claims.push({
        field: 'Expiry (printed)',
        value: codePrint.printedExpiry,
        source: 'OCR',
        method: 'Text extraction from package',
        status: expiryStatus === 'verified' ? 'verified' : 'conflict',
      });
    }
  } else {
    claims.push({
      field: 'Expiry',
      value: '—',
      source: 'DataMatrix / OCR',
      method: 'Not extracted',
      status: 'missing',
    });
  }

  // ── Registry Claim ────────────────────────────────────────────────────────
  const registryResult = providerResults.find(p => p.providerName.toLowerCase().includes('product'));
  if (registryResult) {
    claims.push({
      field: 'Reference product',
      value: registryResult.found ? 'Demo record found' : 'Not found in demo registry',
      source: registryResult.providerName,
      method: `GTIN lookup [${registryResult.label}]`,
      status: registryResult.found ? 'verified' : 'missing',
    });
  }

  // ── Assessment Logic ──────────────────────────────────────────────────────

  // 1. EXPIRED — check both encoded and printed expiry
  const expiryToCheck = codePrint.encodedExpiry || codePrint.printedExpiry;
  if (expiryToCheck && isExpired(expiryToCheck)) {
    return { assessment: 'EXPIRED', claims, limitations: LIMITATIONS };
  }

  // 2. CONFLICT — any mismatch in encoded vs printed
  if (codePrint.batchMatch === false || codePrint.expiryMatch === false) {
    return { assessment: 'CONFLICT_DETECTED', claims, limitations: LIMITATIONS };
  }

  // 3. Count independent signals that agree
  let agreingSignals = 0;
  if (gtinResult.valid) agreingSignals++;
  if (medication.brandName) agreingSignals++;
  if (medication.genericName) agreingSignals++;
  if (codePrint.batchMatch === true) agreingSignals++;
  if (registryResult?.found) agreingSignals++;

  const hasMissingCritical =
    !medication.brandName ||
    !medication.genericName ||
    !codePrint.encodedBatch ||
    !codePrint.encodedExpiry;

  // 4. STRONG_EVIDENCE — multiple signals agree, registry found, no missing critical info
  if (agreingSignals >= 3 && registryResult?.found && !hasMissingCritical) {
    return { assessment: 'STRONG_EVIDENCE', claims, limitations: LIMITATIONS };
  }

  // 5. INSUFFICIENT_EVIDENCE
  return { assessment: 'INSUFFICIENT_EVIDENCE', claims, limitations: LIMITATIONS };
}

export function getAssessmentLabel(assessment: AssessmentType): string {
  switch (assessment) {
    case 'STRONG_EVIDENCE': return 'Strong Evidence';
    case 'CONFLICT_DETECTED': return 'Conflict Detected';
    case 'INSUFFICIENT_EVIDENCE': return 'Insufficient Evidence';
    case 'EXPIRED': return 'Expired';
  }
}

export function getAssessmentDescription(assessment: AssessmentType): string {
  switch (assessment) {
    case 'STRONG_EVIDENCE':
      return 'Multiple independent signals agree. No inconsistency detected.';
    case 'CONFLICT_DETECTED':
      return 'The machine-readable and printed package information do not agree.';
    case 'INSUFFICIENT_EVIDENCE':
      return 'There is not enough information to make a reliable assessment.';
    case 'EXPIRED':
      return 'The package expiry date has passed.';
  }
}
