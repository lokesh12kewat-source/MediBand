import { GTINResult } from '@/types';

/**
 * GTIN Validation — Real Logic
 *
 * Supports GTIN-8, GTIN-12, GTIN-13, GTIN-14.
 * Uses the GS1 standard check digit algorithm (alternating ×3/×1 weights).
 */

type GTINFormat = 'GTIN-8' | 'GTIN-12' | 'GTIN-13' | 'GTIN-14' | 'INVALID';

const VALID_LENGTHS = [8, 12, 13, 14] as const;

function getFormat(len: number): GTINFormat {
  switch (len) {
    case 8:  return 'GTIN-8';
    case 12: return 'GTIN-12';
    case 13: return 'GTIN-13';
    case 14: return 'GTIN-14';
    default: return 'INVALID';
  }
}

/**
 * Compute the GS1 check digit for a GTIN string (without check digit).
 * Pads the payload to 13 digits on the left with zeros, then applies weights.
 */
export function computeCheckDigit(payload: string): number {
  // payload = all digits except last (check digit)
  const padded = payload.padStart(13, '0');
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = parseInt(padded[i], 10);
    // Positions 0,2,4,6,8,10,12 (0-indexed from left) get weight 3 for GTIN-14
    // GS1: odd positions (from right, 1-indexed) get ×3
    // from right: position = 13 - i (1-indexed)
    const weight = (13 - i) % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Validate a GTIN string.
 * Returns a detailed GTINResult.
 */
export function validateGTIN(raw: string): GTINResult {
  const stripped = raw.replace(/\D/g, '');

  if (stripped.length === 0) {
    return {
      raw,
      normalized: stripped,
      format: 'INVALID',
      valid: false,
      checkDigit: -1,
      computed: -1,
      error: 'Empty or non-numeric input',
    };
  }

  if (!VALID_LENGTHS.includes(stripped.length as typeof VALID_LENGTHS[number])) {
    return {
      raw,
      normalized: stripped,
      format: 'INVALID',
      valid: false,
      checkDigit: -1,
      computed: -1,
      error: `Invalid length: ${stripped.length} digits (expected 8, 12, 13, or 14)`,
    };
  }

  const format = getFormat(stripped.length);
  // Pad to 14 for uniform computation
  const padded14 = stripped.padStart(14, '0');
  const payload = padded14.slice(0, 13);
  const checkDigit = parseInt(padded14[13], 10);
  const computed = computeCheckDigit(payload);

  return {
    raw,
    normalized: stripped,
    format,
    valid: checkDigit === computed,
    checkDigit,
    computed,
    error: checkDigit !== computed
      ? `Check digit mismatch: got ${checkDigit}, expected ${computed}`
      : undefined,
  };
}

/**
 * Validate a 14-digit GTIN from a DataMatrix / barcode.
 * Convenience wrapper.
 */
export function validateGTIN14(gtin14: string): GTINResult {
  return validateGTIN(gtin14);
}

// ─── Demo GTINs (genuinely valid) ────────────────────────────────────────────
// These are computed values that pass real GS1 check digit validation.

export const DEMO_GTIN_SCENARIO_A = '09312345678907'; // Valid GTIN-14 (check digit = 7)
export const DEMO_GTIN_SCENARIO_B = '09312345678907'; // Same medicine, batch conflict
export const DEMO_GTIN_SCENARIO_C = '09312345678907'; // Partial scan
export const DEMO_GTIN_SCENARIO_D = '09312345678907'; // Expired pack

// Verify our demo GTIN is valid at module load (development assertion)
if (process.env.NODE_ENV !== 'production') {
  const check = validateGTIN(DEMO_GTIN_SCENARIO_A);
  if (!check.valid) {
    console.error('[GTIN] Demo GTIN failed validation:', check);
  }
}
