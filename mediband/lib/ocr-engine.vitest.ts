import { describe, it, expect } from 'vitest';
import { parseFoilText, resolveMedicineIdentity, ExtractedFoilInfo } from './ocr-engine';
import { MLPredictionResult } from '@/components/ml/PredictionCard';

describe('OCR Engine - Foil Text Parsing & Multi-Modal Arbiter', () => {
  it('1. Extracts exact drug name, strength, batch, expiry, and tenders from user Metronidazole foil', () => {
    const rawFoilOCR = `
      METRONIDAZOLE
      TABLETS IP 400 mg
      SCHEDULE H PRESCRIPTION DRUG-CAUTION
      Not to be sold by retail without the prescription
      Vivek Pharmaceuticals Pvt. Ltd.
      EPIP, Bari Brahmana, Jammu - 181 133
      UP GOVT. SUPPLY
      NOT FOR SALE
      B.No. MZT125054 MFG.02/2025 EXP.01/2028
    `;

    const parsed = parseFoilText(rawFoilOCR, 88);

    expect(parsed.detectedDrug).toBe('Metronidazole');
    expect(parsed.strength).toBe('400 mg');
    expect(parsed.batchNumber).toBe('MZT125054');
    expect(parsed.expiryDate).toBe('01/2028');
    expect(parsed.mfgDate).toBe('02/2025');
    expect(parsed.manufacturer).toContain('Vivek Pharmaceuticals');
    expect(parsed.notices).toContain('NOT FOR SALE');
    expect(parsed.notices).toContain('GOVERNMENT SUPPLY');
    expect(parsed.notices).toContain('SCHEDULE H PRESCRIPTION');
  });

  it('2. Extracts brand, generic, and batch details from standard commercial strips', () => {
    const doloOCR = `
      Dolo-650
      Paracetamol Tablets IP 650 mg
      Manufactured by: Micro Labs Limited
      Batch No: DL9821A
      EXP: 09/2027
    `;

    const parsed = parseFoilText(doloOCR, 92);
    expect(parsed.detectedBrand).toBe('Dolo 650');
    expect(parsed.strength).toBe('650 mg');
    expect(parsed.batchNumber).toBe('DL9821A');
    expect(parsed.expiryDate).toBe('09/2027');
  });

  it('3. Multi-Modal Arbiter overrides false visual pattern (Udapa-Trio 52%) with explicit OCR text', () => {
    // Simulated Vision hallucination on silver foil
    const vision: MLPredictionResult = {
      mode: 'packaging',
      device: 'Browser WASM',
      prediction: 'Udapa-Trio',
      confidence: 0.52,
      top3: [
        { label: 'Udapa-Trio', confidence: 0.52 },
        { label: 'Acemiz', confidence: 0.05 },
        { label: 'M-Strong', confidence: 0.05 },
      ],
      inferenceMs: 29,
    };

    // Simulated OCR extraction from the same foil
    const ocr: ExtractedFoilInfo = {
      rawText: 'METRONIDAZOLE TABLETS IP 400 mg B.No. MZT125054 EXP.01/2028 UP GOVT. SUPPLY NOT FOR SALE',
      confidence: 85,
      detectedDrug: 'Metronidazole',
      detectedBrand: null,
      detectedGeneric: 'Metronidazole',
      strength: '400 mg',
      batchNumber: 'MZT125054',
      expiryDate: '01/2028',
      mfgDate: '02/2025',
      manufacturer: 'Vivek Pharmaceuticals Pvt. Ltd.',
      notices: ['NOT FOR SALE', 'GOVERNMENT SUPPLY'],
      matchedMedicineId: 'med_ind_metronidazole',
    };

    const decision = resolveMedicineIdentity(vision, ocr);

    expect(decision.resolutionSource).toBe('OCR_OVERRIDE');
    expect(decision.resolvedBrand).toBe('Metronidazole');
    expect(decision.resolvedStrength).toBe('400 mg');
    expect(decision.discrepancyDetected).toBe(true);
    expect(decision.explanation).toContain('Udapa-Trio');
    expect(decision.explanation).toContain('Metronidazole');
    expect(decision.batchNumber).toBe('MZT125054');
    expect(decision.expiryDate).toBe('01/2028');
  });

  it('4. Multi-Modal Arbiter produces consensus when Vision and OCR agree', () => {
    const vision: MLPredictionResult = {
      mode: 'packaging',
      device: 'RTX 4050 GPU',
      prediction: 'Dolo-650',
      confidence: 0.98,
      top3: [{ label: 'Dolo-650', confidence: 0.98 }],
      inferenceMs: 14,
    };

    const ocr: ExtractedFoilInfo = {
      rawText: 'Dolo-650 Paracetamol 650mg',
      confidence: 90,
      detectedDrug: 'Dolo-650',
      detectedBrand: 'Dolo-650',
      detectedGeneric: 'Paracetamol',
      strength: '650 mg',
      batchNumber: 'DL1234',
      expiryDate: '10/2027',
      mfgDate: '10/2024',
      manufacturer: 'Micro Labs Limited',
      notices: [],
      matchedMedicineId: 'med_ind_dolo650',
    };

    const decision = resolveMedicineIdentity(vision, ocr);

    expect(decision.resolutionSource).toBe('CONSENSUS');
    expect(decision.resolvedBrand).toBe('Dolo-650');
    expect(decision.discrepancyDetected).toBe(false);
    expect(decision.confidence).toBeGreaterThanOrEqual(0.95);
  });
});
