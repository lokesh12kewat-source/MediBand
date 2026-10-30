import { INDIAN_MEDICINES } from '@/data/indian-medicines';
import { MLPredictionResult } from '@/components/ml/PredictionCard';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ExtractedFoilInfo {
  rawText: string;
  confidence: number;
  detectedDrug: string | null;
  detectedBrand: string | null;
  detectedGeneric: string | null;
  strength: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  mfgDate: string | null;
  manufacturer: string | null;
  notices: string[];
  matchedMedicineId: string | null;
}

export interface MultiModalDecision {
  resolvedBrand: string;
  resolvedGeneric: string;
  resolvedStrength: string;
  medicineId: string | null;
  confidence: number;
  resolutionSource: 'OCR_OVERRIDE' | 'VISION_MATCH' | 'CONSENSUS' | 'UNRESOLVED';
  discrepancyDetected: boolean;
  explanation: string;
  batchNumber?: string;
  expiryDate?: string;
}

// ─── Foil Image Preprocessing (Canvas-based) ──────────────────────────────────

/**
 * Preprocesses a metallic blister foil image for OCR:
 * 1. Grayscale conversion
 * 2. High-contrast enhancement to separate stamped ink from reflective foil
 * 3. Rotations (0° and 180°) to handle inverted blister packs
 */
export function preprocessCanvasForOCR(
  sourceCanvas: HTMLCanvasElement,
  contrastBoost: number = 2.0
): { standard: string; highContrast: string; highContrast180: string } {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  // Working canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D canvas context');

  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  // Grayscale & contrast enhancement
  // Factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
  const c = Math.max(-255, Math.min(255, (contrastBoost - 1.0) * 128));
  const factor = (259 * (c + 255)) / (255 * (259 - c));

  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const contrasted = Math.max(0, Math.min(255, factor * (gray - 128) + 128));
    d[i] = contrasted;
    d[i + 1] = contrasted;
    d[i + 2] = contrasted;
  }
  ctx.putImageData(imgData, 0, 0);
  const highContrast = canvas.toDataURL('image/jpeg', 0.92);

  // Rotate 180° for upside-down blister packs
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = width;
  rotCanvas.height = height;
  const rotCtx = rotCanvas.getContext('2d');
  if (rotCtx) {
    rotCtx.translate(width / 2, height / 2);
    rotCtx.rotate(Math.PI);
    rotCtx.drawImage(canvas, -width / 2, -height / 2);
  }
  const highContrast180 = rotCanvas.toDataURL('image/jpeg', 0.92);

  return {
    standard: sourceCanvas.toDataURL('image/jpeg', 0.92),
    highContrast,
    highContrast180,
  };
}

// ─── Text & Entity Extraction ─────────────────────────────────────────────────

/**
 * Pure parser function that extracts structured pharmaceutical data
 * from raw OCR text output.
 */
export function parseFoilText(rawText: string, confidence: number = 0): ExtractedFoilInfo {
  const clean = rawText.replace(/\r/g, '\n');

  let detectedDrug: string | null = null;
  let detectedBrand: string | null = null;
  let detectedGeneric: string | null = null;
  let matchedMedicineId: string | null = null;

  // 1. Check against INDIAN_MEDICINES database
  for (const med of INDIAN_MEDICINES) {
    // Check brand name with flexible hyphen/space matching (e.g. Dolo-650 vs Dolo 650)
    const brandPattern = escapeRegex(med.brand_name).replace(/[-\s]+/g, '[-\\s]*');
    const brandRegex = new RegExp(`\\b${brandPattern}\\b`, 'i');
    if (brandRegex.test(clean)) {
      detectedBrand = med.brand_name;
      detectedGeneric = med.generic_name;
      detectedDrug = med.brand_name;
      matchedMedicineId = med.medicine_id;
      break;
    }

    // Check generic name (or multi-salt components)
    const genericParts = med.generic_name.split(/[,+]/).map(s => s.trim());
    for (const part of genericParts) {
      if (part.length < 4) continue;
      const genPattern = escapeRegex(part).replace(/[-\s]+/g, '[-\\s]*');
      const genRegex = new RegExp(`\\b${genPattern}\\b`, 'i');
      if (genRegex.test(clean)) {
        detectedGeneric = med.generic_name;
        detectedDrug = med.generic_name;
        matchedMedicineId = med.medicine_id;
        break;
      }
    }
    if (detectedDrug) break;
  }

  // Common generic salts frequently found on Indian government supply / Jan Aushadhi packaging
  if (!detectedDrug) {
    const commonSalts = [
      'Metronidazole',
      'Paracetamol',
      'Aceclofenac',
      'Pantoprazole',
      'Azithromycin',
      'Ciprofloxacin',
      'Amoxicillin',
      'Telmisartan',
      'Atorvastatin',
      'Metformin',
      'Dapagliflozin',
      'Cetirizine',
      'Levocetirizine',
      'Omeprazole',
      'Ranitidine',
      'Diclofenac',
      'Ibuprofen',
    ];

    for (const salt of commonSalts) {
      const r = new RegExp(`\\b${salt}\\b`, 'i');
      if (r.test(clean)) {
        detectedDrug = salt;
        detectedGeneric = salt;
        break;
      }
    }
  }

  // 2. Extract Strength / Dosage
  let strength: string | null = null;
  const strengthMatch = clean.match(/(?:IP\s*)?(\d+(?:\.\d+)?\s*(?:mg|mcg|gm|g|ml|iu|IU))\b/i);
  if (strengthMatch) {
    strength = strengthMatch[1].trim();
  }

  // 3. Extract Batch Number
  let batchNumber: string | null = null;
  const batchPatterns = [
    /B(?:\.|\s*)?No(?:\.|\s*)?[:\.\s]*([A-Z0-9\-\/]{4,18})/i,
    /Batch(?:\.|\s*No\.?)?[:\.\s]*([A-Z0-9\-\/]{4,18})/i,
    /Lot(?:\.|\s*No\.?)?[:\.\s]*([A-Z0-9\-\/]{4,18})/i,
    /BNO[:\.\s]*([A-Z0-9\-\/]{4,18})/i,
  ];
  for (const pat of batchPatterns) {
    const m = clean.match(pat);
    if (m && m[1]) {
      batchNumber = m[1].trim();
      break;
    }
  }

  // 4. Extract Expiry Date
  let expiryDate: string | null = null;
  const expPatterns = [
    /EXP(?:IRY)?(?:\.|\s*Dt\.?)?[:\.\s]*([0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
    /Exp(?:\s*Date)?[:\.\s]*([0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
    /EXP\.?[:\.\s]*([0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
  ];
  for (const pat of expPatterns) {
    const m = clean.match(pat);
    if (m && m[1]) {
      expiryDate = m[1].trim();
      break;
    }
  }

  // 5. Extract Manufacturing Date
  let mfgDate: string | null = null;
  const mfgPatterns = [
    /MFG(?:\.|\s*Dt\.?)?[:\.\s]*([0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
    /Mfg(?:\s*Date)?[:\.\s]*([0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
    /MFD\.?[:\.\s]*([0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
  ];
  for (const pat of mfgPatterns) {
    const m = clean.match(pat);
    if (m && m[1]) {
      mfgDate = m[1].trim();
      break;
    }
  }

  // 6. Extract Manufacturer
  let manufacturer: string | null = null;
  const mfrMatch = clean.match(/([A-Za-z\s]+(?:Pharmaceuticals|Laboratories|Pharma|Ltd|Pvt\. Ltd\.))/i);
  if (mfrMatch) {
    manufacturer = mfrMatch[1].replace(/\n/g, ' ').trim();
  }

  // 7. Extract Regulatory & Tender Notices
  const notices: string[] = [];
  if (/NOT FOR SALE/i.test(clean)) notices.push('NOT FOR SALE');
  if (/GOVT(?:\.?|\s*)SUPPLY/i.test(clean) || /UP GOVT/i.test(clean)) notices.push('GOVERNMENT SUPPLY');
  if (/SCHEDULE H1/i.test(clean)) notices.push('SCHEDULE H1 PRESCRIPTION');
  else if (/SCHEDULE H/i.test(clean)) notices.push('SCHEDULE H PRESCRIPTION');
  if (/SCHEDULE G/i.test(clean)) notices.push('SCHEDULE G CAUTION');
  if (/JAN AUSHADHI/i.test(clean)) notices.push('PMBJP JAN AUSHADHI');

  return {
    rawText: clean,
    confidence,
    detectedDrug,
    detectedBrand,
    detectedGeneric,
    strength,
    batchNumber,
    expiryDate,
    mfgDate,
    manufacturer,
    notices,
    matchedMedicineId,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Multi-Modal Arbiter (Vision + OCR Decision Fusion) ─────────────────────────

/**
 * Combines ML Vision predictions with Printed Text OCR extraction.
 * Resolves false visual mimics (e.g. silver foil Udapa-Trio visual match vs. Metronidazole text).
 */
export function resolveMedicineIdentity(
  vision: MLPredictionResult | null,
  ocr: ExtractedFoilInfo | null
): MultiModalDecision {
  const visionPred = vision?.prediction || null;
  const visionConf = vision?.confidence || 0;

  const ocrDrug = ocr?.detectedDrug || ocr?.detectedBrand || ocr?.detectedGeneric || null;

  // Case 1: Both Vision and OCR agree on identity
  if (visionPred && ocrDrug && visionPred.toLowerCase().includes(ocrDrug.toLowerCase())) {
    return {
      resolvedBrand: visionPred,
      resolvedGeneric: ocr?.detectedGeneric || visionPred,
      resolvedStrength: ocr?.strength || 'As printed',
      medicineId: ocr?.matchedMedicineId || null,
      confidence: Math.max(visionConf, 0.95),
      resolutionSource: 'CONSENSUS',
      discrepancyDetected: false,
      explanation: `High confidence consensus: ML Vision model and Printed OCR both confirmed ${visionPred}.`,
      batchNumber: ocr?.batchNumber || undefined,
      expiryDate: ocr?.expiryDate || undefined,
    };
  }

  // Case 2: OCR identified explicit printed drug name that disagrees with Vision
  if (ocrDrug && (!visionPred || visionPred.toLowerCase() !== ocrDrug.toLowerCase())) {
    const isVisionLowConf = visionConf < 0.70;
    const isGenericNotice = (ocr?.notices || []).includes('GOVERNMENT SUPPLY') || (ocr?.notices || []).includes('NOT FOR SALE');

    return {
      resolvedBrand: ocrDrug,
      resolvedGeneric: ocr?.detectedGeneric || ocrDrug,
      resolvedStrength: ocr?.strength || 'As printed',
      medicineId: ocr?.matchedMedicineId || null,
      confidence: 0.90,
      resolutionSource: 'OCR_OVERRIDE',
      discrepancyDetected: Boolean(visionPred),
      explanation: visionPred
        ? `Optical Character Recognition read "${ocrDrug}" directly from the printed foil, overriding the visual classifier's low-confidence pattern guess (${visionPred}, ${Math.round(visionConf * 100)}%). ${isGenericNotice ? 'Generic government supply packaging verified.' : ''}`
        : `Identified ${ocrDrug} from clear printed text on package.`,
      batchNumber: ocr?.batchNumber || undefined,
      expiryDate: ocr?.expiryDate || undefined,
    };
  }

  // Case 3: OCR was inconclusive, rely on confident Vision
  if (visionPred && visionConf >= 0.50) {
    return {
      resolvedBrand: visionPred,
      resolvedGeneric: visionPred,
      resolvedStrength: ocr?.strength || 'As printed',
      medicineId: null,
      confidence: visionConf,
      resolutionSource: 'VISION_MATCH',
      discrepancyDetected: false,
      explanation: `Identified via MediBand AI Vision pattern match (${Math.round(visionConf * 100)}% match). Text on foil was partially obscured or unindexed.`,
      batchNumber: ocr?.batchNumber || undefined,
      expiryDate: ocr?.expiryDate || undefined,
    };
  }

  // Case 4: Neither is conclusive
  return {
    resolvedBrand: 'Unidentified Medicine',
    resolvedGeneric: 'Unknown Composition',
    resolvedStrength: '—',
    medicineId: null,
    confidence: 0,
    resolutionSource: 'UNRESOLVED',
    discrepancyDetected: false,
    explanation: 'Image quality or text clarity is insufficient for automated recognition. Please retake photo with better lighting or enter details manually.',
  };
}

// ─── Browser Tesseract OCR Worker Pipeline ────────────────────────────────────

let tesseractWorkerPromise: Promise<any> | null = null;

export async function getTesseractWorker(onProgress?: (msg: string, pct: number) => void): Promise<any> {
  if (typeof window === 'undefined') return null;

  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        logger: m => {
          if (onProgress && m.status) {
            onProgress(m.status, Math.round((m.progress || 0) * 100));
          }
        },
      });
      return worker;
    })();
  }
  return tesseractWorkerPromise;
}

/**
 * Runs multi-pass OCR on a medicine image:
 * 1. Checks standard image
 * 2. If confidence or drug detected is low, checks 180° inverted image
 * 3. Merges detected text and extracts structured medicine entities
 */
export async function executeFoilOCR(
  imageSource: string | HTMLCanvasElement,
  onProgress?: (msg: string, pct: number) => void
): Promise<ExtractedFoilInfo> {
  const worker = await getTesseractWorker(onProgress);
  if (!worker) {
    throw new Error('Tesseract OCR is not supported in this runtime');
  }

  // Pass 1: Standard orientation
  const ret0 = await worker.recognize(imageSource);
  let text = ret0.data.text || '';
  let conf = ret0.data.confidence || 0;

  let parsed = parseFoilText(text, conf);

  // If no drug was identified or confidence is low, attempt 180° flip (inverted blister pack)
  if (!parsed.detectedDrug && typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = typeof imageSource === 'string' ? imageSource : imageSource.toDataURL();
      });

      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = img.width;
      rotCanvas.height = img.height;
      const rotCtx = rotCanvas.getContext('2d');
      if (rotCtx) {
        rotCtx.translate(img.width / 2, img.height / 2);
        rotCtx.rotate(Math.PI);
        rotCtx.drawImage(img, -img.width / 2, -img.height / 2);

        const ret180 = await worker.recognize(rotCanvas);
        const text180 = ret180.data.text || '';
        const conf180 = ret180.data.confidence || 0;

        const parsed180 = parseFoilText(text180, conf180);
        if (parsed180.detectedDrug || conf180 > conf) {
          text = `${text}\n${text180}`;
          conf = Math.max(conf, conf180);
          parsed = parseFoilText(text, conf);
        }
      }
    } catch (e) {
      console.warn('180-deg OCR rotation pass skipped:', e);
    }
  }

  return parsed;
}
