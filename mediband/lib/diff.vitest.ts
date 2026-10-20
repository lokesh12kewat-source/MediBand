/**
 * lib/diff.vitest.ts — Vitest tests for alignment-based char diff.
 */

import { describe, it, expect } from 'vitest';
import { diffChars, countDifferences } from './diff';
import type { DiffOp } from '@/types';

describe('diffChars', () => {
  it('equal strings → zero differences', () => {
    expect(countDifferences(diffChars('A12345', 'A12345'))).toBe(0);
  });

  it('equal strings → all ops are equal', () => {
    expect(diffChars('A12345', 'A12345').every(o => o.op === 'equal')).toBe(true);
  });

  it('empty vs empty → zero ops', () => {
    expect(diffChars('', '').length).toBe(0);
  });

  it('A12345 vs A012345 → one insertion', () => {
    const ops = diffChars('A12345', 'A012345');
    const ins = ops.filter(o => o.op === 'ins') as Extract<DiffOp, { op: 'ins' }>[];
    expect(countDifferences(ops)).toBe(1);
    expect(ins[0].b).toBe('0');
  });

  it('empty vs non-empty → all insertions', () => {
    const ops = diffChars('', 'ABC');
    expect(ops.every(o => o.op === 'ins')).toBe(true);
  });

  it('non-empty vs empty → all deletions', () => {
    const ops = diffChars('ABC', '');
    expect(ops.every(o => o.op === 'del')).toBe(true);
  });

  it('A12345 vs A99999 → 5 substitutions', () => {
    const ops = diffChars('A12345', 'A99999');
    expect(ops.filter(o => o.op === 'sub').length).toBe(5);
  });

  it('O12345 vs 012345 → 1 substitution (O vs 0 OCR confusion)', () => {
    expect(countDifferences(diffChars('O12345', '012345'))).toBe(1);
  });
});
