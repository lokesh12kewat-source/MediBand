/**
 * lib/verification-engine.ts — Full Verification Pipeline
 *
 * Orchestrates: GTIN validation → code/print comparison → provider lookups
 * → evidence engine → VerificationResult.
 *
 * Provider architecture:
 *   Verification Engine
 *     ├── Mock Product Provider     [DEMO DATA]
 *     ├── Mock Regulatory Provider  [SIMULATED PROVIDER]
 *     └── Mock Recall Provider      [SIMULATED PROVIDER]
 */

import { VerificationResult, DemoScenario, ProviderResult, ProviderStatus } from '@/types';
import { validateGTIN } from '@/lib/gtin';
import { compareCodePrint } from '@/lib/code-print-compare';
import { runEvidenceEngine } from '@/lib/evidence-engine';
import { mockProductProvider } from '@/providers/mock-product';
import { mockRegulatoryProvider } from '@/providers/mock-regulatory';
import { mockRecallProvider } from '@/providers/mock-recall';

function generateId(): string {
  return `vr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeProviderResult(
  providerId: string,
  name: string,
  label: string,
  simulated: boolean,
  status: ProviderStatus,
  scope: string,
  data?: Record<string, string>,
  error?: string,
): ProviderResult {
  return {
    providerId,
    providerName: name,
    label,
    simulated,
    status,
    retrievedAt: new Date().toISOString(),
    scope,
    record: data,
    error,
    // legacy fields
    found: status === 'FOUND',
    isSimulated: simulated,
    data,
  };
}

export async function runVerification(
  scenario: DemoScenario,
  packId: string,
  now?: Date,
): Promise<VerificationResult> {
  const { medication, pack } = scenario;
  const hasCode = !!(pack.gtin);

  // 1. GTIN validation (real GS1 algorithm)
  const gtinResult = validateGTIN(pack.gtin ?? '');

  // 2. Code ↔ Print comparison (real alignment diff + date parsing)
  const codePrint = compareCodePrint(
    pack.batchEncoded ?? '',
    pack.batchPrinted ?? '',
    pack.expiryEncoded ?? '',
    pack.expiryPrinted ?? '',
  );

  // 3. Provider lookups (all simulated)
  const providerResults: ProviderResult[] = [];

  // 3a. Product registry
  if (hasCode) {
    const productRecord = await mockProductProvider.lookup(pack.gtin!);
    providerResults.push(makeProviderResult(
      'mock-product',
      mockProductProvider.name,
      'DEMO DATA',
      true,
      productRecord ? 'FOUND' : 'NOT_FOUND',
      'Matches GTIN against a demo product registry. Cannot verify physical contents.',
      productRecord ? {
        brand: productRecord.brandName,
        generic: productRecord.genericName,
        strength: productRecord.strength,
        manufacturer: productRecord.manufacturer,
      } : undefined,
    ));
  } else {
    // Scenario C: no code → NOT_QUERIED
    providerResults.push(makeProviderResult(
      'mock-product',
      mockProductProvider.name,
      'DEMO DATA',
      true,
      'NOT_QUERIED',
      'No machine-readable code — product lookup not performed.',
    ));
  }

  // 3b. Regulatory check
  if (hasCode) {
    const regResult = await mockRegulatoryProvider.check(pack.gtin!, pack.batchEncoded ?? '');
    providerResults.push(makeProviderResult(
      'mock-regulatory',
      mockRegulatoryProvider.name,
      'SIMULATED PROVIDER',
      true,
      regResult.registered ? 'FOUND' : 'NOT_FOUND',
      'Simulated regulatory registration check. Does not reflect any real regulatory database.',
      regResult.registrationNumber
        ? { registrationNumber: regResult.registrationNumber }
        : undefined,
    ));
  } else {
    providerResults.push(makeProviderResult(
      'mock-regulatory',
      mockRegulatoryProvider.name,
      'SIMULATED PROVIDER',
      true,
      'NOT_QUERIED',
      'No machine-readable code — regulatory check not performed.',
    ));
  }

  // 3c. Recall check
  if (hasCode) {
    const recallResult = await mockRecallProvider.check(pack.gtin!, pack.batchEncoded ?? '');
    providerResults.push(makeProviderResult(
      'mock-recall',
      mockRecallProvider.name,
      'SIMULATED PROVIDER',
      true,
      'FOUND', // not recalled = found in recall DB as "no recall"
      'Simulated recall check. Does not reflect any real recall database.',
      recallResult.recalled
        ? { recalled: 'yes', reason: recallResult.reason ?? '' }
        : { recalled: 'no' },
    ));
  } else {
    providerResults.push(makeProviderResult(
      'mock-recall',
      mockRecallProvider.name,
      'SIMULATED PROVIDER',
      true,
      'NOT_QUERIED',
      'No machine-readable code — recall check not performed.',
    ));
  }

  // 4. Evidence engine (real assessment logic)
  const {
    assessment,
    consistencyAssessment,
    shelfLifeAssessment,
    allSimulated,
    claims,
    limitations,
  } = runEvidenceEngine({
    gtinResult,
    codePrint,
    providerResults,
    pack,
    medication,
    scanScenario: scenario.id,
    now,
  });

  return {
    id: generateId(),
    packId,
    medicationId: medication.id,
    timestamp: new Date().toISOString(),
    assessment,
    consistencyAssessment,
    shelfLifeAssessment,
    allSimulated,
    claims,
    codePrint,
    providerResults,
    limitations,
    scenarioId: scenario.id,
  };
}
