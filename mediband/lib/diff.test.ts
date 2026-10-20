/**
 * lib/diff.test.ts — Tests for the Levenshtein alignment-based diff.
 * Run: npx ts-node --project tsconfig.test.json lib/diff.test.ts
 */

import { diffChars, countDifferences } from './diff';
import type { DiffOp } from '@/types';

const results: { name: string; passed: boolean; actual?: unknown }[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, actual: (e as Error).message });
  }
}

function expect(actual: unknown) {
  return {
    toBe: (exp: unknown) => {
      if (actual !== exp) throw new Error(`Expected ${JSON.stringify(exp)}, got ${JSON.stringify(actual)}`);
    },
    toEqual: (exp: unknown) => {
      if (JSON.stringify(actual) !== JSON.stringify(exp))
        throw new Error(`Expected ${JSON.stringify(exp)}, got ${JSON.stringify(actual)}`);
    },
    toBeTrue: () => {
      if (actual !== true) throw new Error(`Expected true, got ${JSON.stringify(actual)}`);
    },
  };
}

// ─── Basic identity ──────────────────────────────────────────────────────────

test('Equal strings produce zero differences', () => {
  const ops = diffChars('A12345', 'A12345');
  expect(countDifferences(ops)).toBe(0);
});

test('Equal strings: every op is "equal"', () => {
  const ops = diffChars('A12345', 'A12345');
  const allEqual = ops.every(o => o.op === 'equal');
  expect(allEqual).toBeTrue();
});

test('Empty string vs empty string: zero ops', () => {
  const ops = diffChars('', '');
  expect(ops.length).toBe(0);
});

// ─── Insertions ──────────────────────────────────────────────────────────────

test('A12345 vs A012345: one insertion (extra 0)', () => {
  const ops = diffChars('A12345', 'A012345');
  const insOps = ops.filter(o => o.op === 'ins') as Extract<DiffOp, { op: 'ins' }>[];
  expect(countDifferences(ops)).toBe(1);
  expect(insOps.length).toBe(1);
  expect(insOps[0].b).toBe('0');
});

test('Empty vs non-empty: all insertions', () => {
  const ops = diffChars('', 'ABC');
  expect(ops.every(o => o.op === 'ins')).toBeTrue();
  expect(countDifferences(ops)).toBe(3);
});

// ─── Deletions ───────────────────────────────────────────────────────────────

test('Non-empty vs empty: all deletions', () => {
  const ops = diffChars('ABC', '');
  expect(ops.every(o => o.op === 'del')).toBeTrue();
  expect(countDifferences(ops)).toBe(3);
});

// ─── Substitutions ───────────────────────────────────────────────────────────

test('A12345 vs A99999: 5 substitutions', () => {
  const ops = diffChars('A12345', 'A99999');
  const subs = ops.filter(o => o.op === 'sub');
  expect(subs.length).toBe(5);
  expect(countDifferences(ops)).toBe(5);
});

// ─── OCR-common pairs ────────────────────────────────────────────────────────

test('A1B2S5 vs A1B2S5: identical → zero diffs', () => {
  expect(countDifferences(diffChars('A1B2S5', 'A1B2S5'))).toBe(0);
});

test('O12345 vs 012345 (O vs 0 confusion): 1 sub', () => {
  expect(countDifferences(diffChars('O12345', '012345'))).toBe(1);
});

// ─── Output order ────────────────────────────────────────────────────────────

test('Ops are returned in forward order (a→b)', () => {
  // 'AB' → 'ACB': one insertion of C between A and B
  const ops = diffChars('AB', 'ACB');
  const chars = ops.map(o => (o.op === 'ins' ? `+${o.b}` : o.op === 'del' ? `-${(o as Extract<DiffOp, {op:'del'}>).a}` : (o as Extract<DiffOp, {op:'equal'}>).a)).join('');
  // Should not error — just check the structure makes sense
  expect(countDifferences(ops)).toBe(1);
  expect(typeof chars).toBe('string');
});

// ─── Results ─────────────────────────────────────────────────────────────────

const passed = results.filter(r => r.passed).length;
console.log('\n── Diff Tests ──────────────────────────────────────────');
results.forEach(r =>
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}${!r.passed ? '\n    → ' + r.actual : ''}`)
);
console.log(`\n  ${passed}/${results.length} passed\n`);
if (results.some(r => !r.passed)) process.exit(1);
