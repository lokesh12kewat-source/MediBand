import { VerificationResult, DemoScenario, ProviderResult } from '@/types';
import { validateGTIN } from '@/lib/gtin';
import { compareCodePrint } from '@/lib/code-print-compare';
import { runEvidenceEngine } from '@/lib/evidence-engine';
import { mockProductProvider } from '@/providers/mock-product';
import { mockRegulatoryProvider } from '@/providers/mock-regulatory';

function generateId(): string {
  return `vr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Run the full verification pipeline for a demo scenario.
 *
 * Provider architecture:
 *   Verification Engine
 *       ├── Mock Product Provider [DEMO DATA]
 *       ├── Mock Regulatory Provider [SIMULATED PROVIDER]
 *       └── (future: real providers)
 */
export async function runVerification(
  scenario: DemoScenario,
  packId: string,
): Promise<VerificationResult> {
  const { medication, pack } = scenario;

  // 1. GTIN validation (real logic)
  const gtinResult = validateGTIN(pack.gtin ?? '');

  // 2. Code ↔ Print comparison (real logic)
  const codePrint = compareCodePrint(
    pack.batchEncoded ?? '',
    pack.batchPrinted ?? '',
    pack.expiryEncoded ?? '',
    pack.expiryPrinted ?? '',
  );

  // 3. Provider lookups (mock / simulated)
  const providerResults: ProviderResult[] = [];

  // Product registry
  const productRecord = await mockProductProvider.lookup(pack.gtin ?? '');
  providerResults.push({
    providerName: mockProductProvider.name,
    isSimulated: mockProductProvider.isSimulated,
    found: productRecord !== null,
    data: productRecord
      ? {
          brand: productRecord.brandName,
          generic: productRecord.genericName,
          strength: productRecord.strength,
          manufacturer: productRecord.manufacturer,
        }
      : undefined,
    label: 'DEMO DATA',
  });

  // Regulatory check (scenario C has no GTIN — skip)
  if (pack.gtin) {
    const regResult = await mockRegulatoryProvider.check(pack.gtin, pack.batchEncoded ?? '');
    providerResults.push({
      providerName: mockRegulatoryProvider.name,
      isSimulated: mockRegulatoryProvider.isSimulated,
      found: regResult.registered,
      data: regResult.registrationNumber
        ? { registrationNumber: regResult.registrationNumber }
        : undefined,
      label: 'SIMULATED PROVIDER',
    });
  }

  // 4. Evidence engine (real assessment logic)
  const { assessment, claims, limitations } = runEvidenceEngine({
    gtinResult,
    codePrint,
    providerResults,
    pack,
    medication,
    scanScenario: scenario.id,
  });

  return {
    id: generateId(),
    packId,
    medicationId: medication.id,
    timestamp: new Date().toISOString(),
    assessment,
    claims,
    codePrint,
    providerResults,
    limitations,
    scenarioId: scenario.id,
  };
}
