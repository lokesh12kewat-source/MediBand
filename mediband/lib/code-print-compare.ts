import { CharDiff, CodePrintResult } from '@/types';

/**
 * Code ↔ Print Consistency Comparison — Real Logic
 *
 * Compares machine-readable (encoded) values against OCR-extracted (printed)
 * values. Returns structured comparison with character-level diffs.
 */

/**
 * Compare two strings character by character and return diff positions.
 */
export function charDiff(encoded: string, printed: string): CharDiff[] {
  const maxLen = Math.max(encoded.length, printed.length);
  const diffs: CharDiff[] = [];
  for (let i = 0; i < maxLen; i++) {
    const e = encoded[i] ?? '?';
    const p = printed[i] ?? '?';
    if (e !== p) {
      diffs.push({ index: i, encoded: e, printed: p });
    }
  }
  return diffs;
}

/**
 * Normalize a batch string for comparison.
 * Trims whitespace, uppercases.
 */
function normalizeBatch(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * Normalize an expiry string for comparison.
 * Accepts MM/YYYY or MM/YY formats.
 * Returns MM/YYYY.
 */
function normalizeExpiry(s: string): string {
  const t = s.trim().replace(/\s/g, '');
  // Handle MM/YY → MM/20YY
  const match = t.match(/^(\d{2})\/(\d{2})$/);
  if (match) {
    return `${match[1]}/20${match[2]}`;
  }
  return t;
}

/**
 * Compare encoded (machine-readable) vs printed values for a pack.
 */
export function compareCodePrint(
  encodedBatch: string,
  printedBatch: string,
  encodedExpiry: string,
  printedExpiry: string,
): CodePrintResult {
  const normEncodedBatch = normalizeBatch(encodedBatch);
  const normPrintedBatch = normalizeBatch(printedBatch);
  const normEncodedExpiry = normalizeExpiry(encodedExpiry);
  const normPrintedExpiry = normalizeExpiry(printedExpiry);

  const batchHasData = normEncodedBatch !== '' && normPrintedBatch !== '';
  const expiryHasData = normEncodedExpiry !== '' && normPrintedExpiry !== '';

  const batchMatch = batchHasData ? normEncodedBatch === normPrintedBatch : null;
  const expiryMatch = expiryHasData ? normEncodedExpiry === normPrintedExpiry : null;

  const result: CodePrintResult = {
    batchMatch,
    expiryMatch,
    encodedBatch: normEncodedBatch,
    printedBatch: normPrintedBatch,
    encodedExpiry: normEncodedExpiry,
    printedExpiry: normPrintedExpiry,
  };

  if (batchHasData && !batchMatch) {
    result.batchDiff = charDiff(normEncodedBatch, normPrintedBatch);
  }
  if (expiryHasData && !expiryMatch) {
    result.expiryDiff = charDiff(normEncodedExpiry, normPrintedExpiry);
  }

  return result;
}

/**
 * Check if an expiry date (MM/YYYY) has passed relative to a reference date.
 */
export function isExpired(expiry: string, referenceDate: Date = new Date()): boolean {
  const normalized = normalizeExpiry(expiry);
  const match = normalized.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);
  // Expiry is end-of-month
  const expiryDate = new Date(year, month, 0); // last day of month
  return expiryDate < referenceDate;
}

/**
 * Calculate days until expiry (negative = already expired).
 */
export function daysUntilExpiry(expiry: string, referenceDate: Date = new Date()): number {
  const normalized = normalizeExpiry(expiry);
  const match = normalized.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return 0;
  const month = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);
  const expiryDate = new Date(year, month, 0);
  const diffMs = expiryDate.getTime() - referenceDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
