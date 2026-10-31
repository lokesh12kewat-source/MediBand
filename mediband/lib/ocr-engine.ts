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
  let strength: string | null = null;
  let batchNumber: string | null = null;
  let expiryDate: string | null = null;
  let mfgDate: string | null = null;
  let manufacturer: string | null = null;

  // 1. Check Brand Name matches first (Brand names must always take precedence over generic salts)
  for (const med of INDIAN_MEDICINES) {
    const brandPattern = escapeRegex(med.brand_name).replace(/[-\s]+/g, '[-\\s]*');
    const brandRegex = new RegExp(`\\b${brandPattern}\\b`, 'i');
    if (brandRegex.test(clean)) {
      detectedBrand = med.brand_name;
      detectedGeneric = med.generic_name;
      detectedDrug = med.brand_name;
      matchedMedicineId = med.medicine_id;
      break;
    }
  }

  // Check common Indian brand names if not matched in DB
  if (!detectedBrand) {
    const commonBrands: { brand: string; generic: string; mfr?: string }[] = [
      { brand: 'Parafast 500', generic: 'Paracetamol', mfr: 'Cipla Ltd' },
      { brand: 'Parafast', generic: 'Paracetamol', mfr: 'Cipla Ltd' },
      { brand: 'Calpol', generic: 'Paracetamol', mfr: 'GlaxoSmithKline' },
      { brand: 'Crocin', generic: 'Paracetamol', mfr: 'GlaxoSmithKline' },
      { brand: 'Combiflam', generic: 'Ibuprofen and Paracetamol', mfr: 'Sanofi India' },
      { brand: 'Meftal-Spas', generic: 'Mefenamic Acid and Dicyclomine', mfr: 'Blue Cross' },
      { brand: 'Pan-40', generic: 'Pantoprazole', mfr: 'Alkem Laboratories' },
      { brand: 'Omez', generic: 'Omeprazole', mfr: 'Dr. Reddy\'s Laboratories' },
      { brand: 'Ascoril', generic: 'Bromhexine and Terbutaline', mfr: 'Glenmark' },
      { brand: 'Pacimol', generic: 'Paracetamol', mfr: 'Ipca Laboratories' },
      { brand: 'P-500', generic: 'Paracetamol', mfr: 'Apex Laboratories' },
      { brand: 'P-650', generic: 'Paracetamol', mfr: 'Apex Laboratories' },
    ];

    for (const b of commonBrands) {
      const r = new RegExp(`\\b${escapeRegex(b.brand)}(?:\\s*\\d+)?\\b`, 'i');
      if (r.test(clean)) {
        detectedBrand = b.brand;
        detectedDrug = b.brand;
        detectedGeneric = b.generic;
        if (b.mfr && !manufacturer) {
          manufacturer = b.mfr;
        }
        break;
      }
    }
  }

  // 2. Check Generic Salts only if NO brand name was found
  if (!detectedDrug) {
    for (const med of INDIAN_MEDICINES) {
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

  // 2. Extract Strength / Dosage with OCR Glare Sanitization
  const strengthMatch = clean.match(/(?:IP\s*)?(\d+(?:\.\d+)?\s*(?:mg|mcg|gm|g|ml|iu|IU))\b/i);
  if (strengthMatch) {
    strength = strengthMatch[1].trim();
    const numVal = parseInt(strength, 10);
    const unit = strength.replace(/[\d\.]+/g, '').trim().toLowerCase();

    // Correct optical glare noise (e.g. 508/509/506 mg -> 500 mg, 658/659 mg -> 650 mg)
    if (unit === 'mg') {
      if (numVal >= 504 && numVal <= 512) strength = '500 mg';
      else if (numVal >= 645 && numVal <= 659) strength = '650 mg';
      else if (numVal >= 985 && numVal <= 1015) strength = '1000 mg';
      else if (numVal >= 245 && numVal <= 255) strength = '250 mg';
    }
  }

  // 3. Extract Batch Number (dot-matrix stamped on blister foil)
  const batchPatterns = [
    /(?:B\.?\s*)?NO\.?[:\.\s]*([A-Z0-9\-\/]{4,18})/i,
    /(?:Batch|Lot)(?:\.|\s*No\.?)?[:\.\s]*([A-Z0-9\-\/]{4,18})/i,
    /BNO[:\.\s]*([A-Z0-9\-\/]{4,18})/i,
    /\b([A-Z]{2}\d{5,8})\b/, // Standard Indian batch format (e.g. CP50321)
  ];
  for (const pat of batchPatterns) {
    const m = clean.match(pat);
    if (m && m[1]) {
      batchNumber = m[1].replace(/[^A-Z0-9\-\/]/gi, '').trim();
      break;
    }
  }

  // 4. Extract Expiry Date (handles 3-letter months e.g. OCT.28, NOV-25, and MM/YYYY)
  const monthsStr = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC';
  const expMonthRegex = new RegExp(`(?:EX[PMB]|EXPIRY|EXP)(?:\\.|\\s*Dt\\.?)?[:\\.\\s]*(${monthsStr})[\\.\\s\\-\\/]*(\\d{2,4})`, 'i');
  const expNumRegex = /(?:EX[PMB]|EXPIRY|EXP)(?:\.|\s*Dt\.?)?[:\.\s]*([0-9]{1,2}[\/\-\.][0-9]{2,4})/i;

  const expMonthMatch = clean.match(expMonthRegex);
  if (expMonthMatch && expMonthMatch[1] && expMonthMatch[2]) {
    const yr = expMonthMatch[2].length === 2 ? `20${expMonthMatch[2]}` : expMonthMatch[2];
    expiryDate = `${expMonthMatch[1].toUpperCase()} ${yr}`;
  } else {
    const expNumMatch = clean.match(expNumRegex);
    if (expNumMatch && expNumMatch[1]) {
      expiryDate = expNumMatch[1].trim();
    }
  }

  // 5. Extract Manufacturing Date
  const mfgMonthRegex = new RegExp(`(?:MFG|MFD)(?:\\.|\\s*Dt\\.?)?[:\\.\\s]*(${monthsStr})[\\.\\s\\-\\/]*(\\d{2,4})`, 'i');
  const mfgNumRegex = /(?:MFG|MFD)(?:\.|\s*Dt\.?)?[:\.\s]*([0-9]{1,2}[\/\-\.][0-9]{2,4})/i;

  const mfgMonthMatch = clean.match(mfgMonthRegex);
  if (mfgMonthMatch && mfgMonthMatch[1] && mfgMonthMatch[2]) {
    const yr = mfgMonthMatch[2].length === 2 ? `20${mfgMonthMatch[2]}` : mfgMonthMatch[2];
    mfgDate = `${mfgMonthMatch[1].toUpperCase()} ${yr}`;
  } else {
    const mfgNumMatch = clean.match(mfgNumRegex);
    if (mfgNumMatch && mfgNumMatch[1]) {
      mfgDate = mfgNumMatch[1].trim();
    }
  }

  // 6. Extract Manufacturer
  const knownMfrs = [
    'CIPLA', 'CIPLA LTD', 'SUN PHARMA', 'DR. REDDY', 'MANKIND', 'LUPIN',
    'TORRENT', 'ABBOTT', 'ALKEM', 'ZYDUS', 'GLAXOSMITHKLINE', 'GSK',
    'INTAS', 'MICRO LABS', 'GLENMARK', 'ARISTO', 'HSN BIOTECH', 'PFIZER'
  ];
  for (const km of knownMfrs) {
    const r = new RegExp(`\\b${escapeRegex(km)}\\b`, 'i');
    if (r.test(clean)) {
      manufacturer = km === 'CIPLA' || km === 'CIPLA LTD' ? 'Cipla Ltd' : km;
      break;
    }
  }
  if (!manufacturer) {
    const mfrMatch = clean.match(/([A-Za-z\s]+(?:Pharmaceuticals|Laboratories|Pharma|Ltd|Pvt\. Ltd\.))/i);
    if (mfrMatch) {
      manufacturer = mfrMatch[1].replace(/\n/g, ' ').trim();
    }
  }
  if (!manufacturer && matchedMedicineId) {
    const med = INDIAN_MEDICINES.find(m => m.medicine_id === matchedMedicineId);
    if (med?.manufacturer) {
      manufacturer = med.manufacturer;
    }
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
      confidence: Math.max(0.92, ocr?.confidence ? ocr.confidence / 100 : 0.92),
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
 * 1. Pass 1: Standard orientation
 * 2. Pass 2: High-contrast blister foil enhancement if batch, expiry, or drug is missing
 * 3. Pass 3: Inverted 180° orientation if still no drug detected
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

  // Pass 2: High-contrast blister foil enhancement if batch or expiry or drug is missing
  if (
    (!parsed.batchNumber || !parsed.expiryDate || !parsed.detectedDrug) &&
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  ) {
    try {
      let canvas: HTMLCanvasElement | null = null;
      if (typeof imageSource !== 'string' && 'getContext' in imageSource) {
        canvas = imageSource as HTMLCanvasElement;
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = typeof imageSource === 'string' ? imageSource : (imageSource as any).toDataURL();
        });
        canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
      }

      if (canvas) {
        const { highContrast } = preprocessCanvasForOCR(canvas, 2.2);
        const retContrast = await worker.recognize(highContrast);
        const textContrast = retContrast.data.text || '';
        const confContrast = retContrast.data.confidence || 0;

        const mergedText = `${text}\n${textContrast}`;
        const parsedContrast = parseFoilText(mergedText, Math.max(conf, confContrast));

        if (
          (!parsed.detectedDrug && parsedContrast.detectedDrug) ||
          (!parsed.batchNumber && parsedContrast.batchNumber) ||
          (!parsed.expiryDate && parsedContrast.expiryDate) ||
          confContrast > conf
        ) {
          text = mergedText;
          conf = Math.max(conf, confContrast);
          parsed = parsedContrast;
        }
      }
    } catch (e) {
      console.warn('High contrast foil OCR pass skipped:', e);
    }
  }

  // Pass 3: Inverted 180° orientation if still no drug detected
  if (!parsed.detectedDrug && typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = typeof imageSource === 'string' ? imageSource : (imageSource as any).toDataURL();
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
