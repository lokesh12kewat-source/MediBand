/**
 * lib/code-print-compare.ts — Code vs Print Comparison
 *
 * Uses alignment-based diff (Levenshtein) instead of index-by-index.
 * Classifies mismatches as CONFLICT, LIKELY_OCR_CONFUSION, or FORMAT_VARIATION.
 * Uses structured date parsing for expiry comparison.
 * Missing data is NEVER treated as a match.
 */

import { CodePrintResult, ComparisonKind, DiffOp } from '@/types';
import { diffChars, countDifferences } from './diff';
import { parseExpiry, expiriesEqual, isExpiryPast, daysUntilExpiryParsed } from './dates';

export type { DiffOp };

// ─── OCR Confusion Map ─────────────────────────────────────────────────────────
// Character pairs that OCR commonly confuses. Bidirectional.

const OCR_CONFUSION_PAIRS: [string, string][] = [
  ['O', '0'], ['I', '1'], ['I', 'L'], ['1', 'L'],
  ['B', '8'], ['S', '5'], ['Z', '2'], ['G', '6'],
];

function isOCRConfusionPair(a: string, b: string): boolean {
  return OCR_CONFUSION_PAIRS.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x),
  );
}

// ─── Comparison Classification ─────────────────────────────────────────────────

/**
 * Classify the relationship between encoded and printed values.
 * Missing data is never a match.
 */
export function classifyComparison(encoded: string, printed: string): ComparisonKind {
  const e = encoded.trim();
  const p = printed.trim();

  if (!e && !p) return 'BOTH_MISSING';
  if (!e || !p) return 'MISSING';

  const normE = e.toUpperCase().replace(/\s+/g, '');
  const normP = p.toUpperCase().replace(/\s+/g, '');

  if (normE === normP) {
    // Check if only a case / whitespace difference
    if (e !== p) return 'FORMAT_VARIATION';
    return 'MATCH';
  }

  // Check if all differing chars are OCR confusion pairs
  if (normE.length === normP.length) {
    let allConfusion = true;
    for (let i = 0; i < normE.length; i++) {
      if (normE[i] === normP[i]) continue;
      if (!isOCRConfusionPair(normE[i], normP[i])) {
        allConfusion = false;
        break;
      }
    }
    if (allConfusion) return 'LIKELY_OCR_CONFUSION';
  }

  return 'CONFLICT';
}

// ─── Batch Normalization ───────────────────────────────────────────────────────

function normalizeBatch(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '');
}

// ─── Main Comparison ──────────────────────────────────────────────────────────

export function compareCodePrint(
  encodedBatch: string,
  printedBatch: string,
  encodedExpiry: string,
  printedExpiry: string,
): CodePrintResult {
  const normEB = normalizeBatch(encodedBatch);
  const normPB = normalizeBatch(printedBatch);

  // Batch: use structural string comparison
  const batchKind = classifyComparison(normEB, normPB);
  const batchMatch: boolean | null =
    batchKind === 'BOTH_MISSING' ? null :
    batchKind === 'MISSING'      ? null :
    batchKind === 'MATCH' || batchKind === 'FORMAT_VARIATION' ? true :
    false;

  // Expiry: use structured date comparison
  const parsedEE = parseExpiry(encodedExpiry);
  const parsedPE = parseExpiry(printedExpiry);

  let expiryKind: ComparisonKind;
  let expiryMatch: boolean | null;

  if (!parsedEE && !parsedPE) {
    expiryKind = 'BOTH_MISSING';
    expiryMatch = null;
  } else if (!parsedEE || !parsedPE) {
    expiryKind = 'MISSING';
    expiryMatch = null;
  } else if (expiriesEqual(encodedExpiry, printedExpiry)) {
    expiryKind = 'MATCH';
    expiryMatch = true;
  } else {
    expiryKind = 'CONFLICT';
    expiryMatch = false;
  }

  const result: CodePrintResult = {
    batchMatch,
    expiryMatch,
    batchKind,
    expiryKind,
    encodedBatch: normEB,
    printedBatch: normPB,
    encodedExpiry: encodedExpiry.trim(),
    printedExpiry: printedExpiry.trim(),
  };

  // Compute alignment diff for conflicting/confused batches
  if (normEB && normPB && batchMatch === false) {
    const ops = diffChars(normEB, normPB);
    result.batchDiff = ops;
    result.batchDiffCount = countDifferences(ops);
  }

  // Compute display diff for conflicting expiry strings
  if (encodedExpiry && printedExpiry && expiryMatch === false) {
    const ops = diffChars(encodedExpiry.trim(), printedExpiry.trim());
    result.expiryDiff = ops;
    result.expiryDiffCount = countDifferences(ops);
  }

  return result;
}

// ─── Expiry Helpers ────────────────────────────────────────────────────────────

/**
 * Check if an expiry string (any supported format) is past a reference date.
 * Wraps the structured parser. Returns false if unparseable.
 */
export function isExpired(expiry: string, referenceDate: Date = new Date()): boolean {
  const parsed = parseExpiry(expiry);
  if (!parsed) return false;
  return isExpiryPast(parsed, referenceDate);
}

/**
 * Days until expiry. Negative = expired. Returns 0 if unparseable.
 */
export function daysUntilExpiry(expiry: string, referenceDate: Date = new Date()): number {
  const parsed = parseExpiry(expiry);
  if (!parsed) return 0;
  return daysUntilExpiryParsed(parsed, referenceDate);
}
