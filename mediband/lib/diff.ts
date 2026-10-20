/**
 * lib/diff.ts — Alignment-based string diffing (Levenshtein backtrack).
 *
 * More accurate than index-by-index comparison for detecting:
 * - insertions (one extra char in printed vs encoded)
 * - deletions
 * - substitutions
 *
 * Used by code-print-compare for batch and expiry fields.
 */

import { DiffOp } from '@/types';

export type { DiffOp };

/** Build the Levenshtein edit distance matrix */
function editMatrix(a: string, b: string): number[][] {
  const m = a.length;
  const n = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) {
    d[i] = [];
    for (let j = 0; j <= n; j++) {
      if (i === 0) d[i][j] = j;
      else if (j === 0) d[i][j] = i;
      else d[i][j] = 0;
    }
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        d[i][j] = d[i - 1][j - 1];
      } else {
        d[i][j] = 1 + Math.min(d[i - 1][j - 1], d[i - 1][j], d[i][j - 1]);
      }
    }
  }
  return d;
}

/**
 * Compute alignment-based diff from string `a` to string `b`.
 * Returns an array of DiffOp in order.
 */
export function diffChars(a: string, b: string): DiffOp[] {
  if (a === b) {
    return a.split('').map(ch => ({ op: 'equal' as const, a: ch, b: ch }));
  }
  const d = editMatrix(a, b);
  const ops: DiffOp[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ op: 'equal', a: a[i - 1], b: b[j - 1] });
      i--; j--;
    } else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      ops.push({ op: 'sub', a: a[i - 1], b: b[j - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || d[i][j] === d[i][j - 1] + 1)) {
      ops.push({ op: 'ins', b: b[j - 1] });
      j--;
    } else {
      ops.push({ op: 'del', a: a[i - 1] });
      i--;
    }
  }

  return ops.reverse();
}

/** Count ops that represent actual differences (non-equal) */
export function countDifferences(ops: DiffOp[]): number {
  return ops.filter(o => o.op !== 'equal').length;
}
