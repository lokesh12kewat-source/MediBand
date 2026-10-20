/**
 * lib/dates.test.ts — Tests for structured expiry date parsing.
 * Run: npx ts-node --project tsconfig.test.json lib/dates.test.ts
 */

import { parseExpiry, expiriesEqual, isExpiryPast, daysUntilExpiryParsed } from './dates';

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
    toBeNull: () => {
      if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    },
    toBeTrue: () => {
      if (actual !== true) throw new Error(`Expected true, got ${JSON.stringify(actual)}`);
    },
    toBeFalse: () => {
      if (actual !== false) throw new Error(`Expected false, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan: (n: number) => {
      if ((actual as number) <= n) throw new Error(`Expected > ${n}, got ${JSON.stringify(actual)}`);
    },
    toBeLessThan: (n: number) => {
      if ((actual as number) >= n) throw new Error(`Expected < ${n}, got ${JSON.stringify(actual)}`);
    },
  };
}

// ─── MM/YYYY ─────────────────────────────────────────────────────────────────

test('parseExpiry MM/YYYY: 08/2027 → { month: 8, year: 2027 }', () => {
  const p = parseExpiry('08/2027');
  if (!p) throw new Error('Expected non-null');
  expect(p.month).toBe(8);
  expect(p.year).toBe(2027);
});

test('parseExpiry MM-YYYY: 08-2027 → { month: 8, year: 2027 }', () => {
  const p = parseExpiry('08-2027');
  if (!p) throw new Error('Expected non-null');
  expect(p.month).toBe(8);
  expect(p.year).toBe(2027);
});

// ─── MM/YY ───────────────────────────────────────────────────────────────────

test('parseExpiry MM/YY: 08/27 → { month: 8, year: 2027 }', () => {
  const p = parseExpiry('08/27');
  if (!p) throw new Error('Expected non-null');
  expect(p.month).toBe(8);
  expect(p.year).toBe(2027);
});

// ─── YYYY-MM ─────────────────────────────────────────────────────────────────

test('parseExpiry YYYY-MM: 2027-08 → { month: 8, year: 2027 }', () => {
  const p = parseExpiry('2027-08');
  if (!p) throw new Error('Expected non-null');
  expect(p.month).toBe(8);
  expect(p.year).toBe(2027);
});

// ─── MMM YYYY ────────────────────────────────────────────────────────────────

test('parseExpiry "AUG 2027" → { month: 8, year: 2027 }', () => {
  const p = parseExpiry('AUG 2027');
  if (!p) throw new Error('Expected non-null');
  expect(p.month).toBe(8);
  expect(p.year).toBe(2027);
});

test('parseExpiry "aug 2027" (lowercase) → { month: 8, year: 2027 }', () => {
  const p = parseExpiry('aug 2027');
  if (!p) throw new Error('Expected non-null');
  expect(p.month).toBe(8);
  expect(p.year).toBe(2027);
});

test('parseExpiry "AUG-27" → { month: 8, year: 2027 }', () => {
  const p = parseExpiry('AUG-27');
  if (!p) throw new Error('Expected non-null');
  expect(p.month).toBe(8);
  expect(p.year).toBe(2027);
});

// ─── GS1 YYMMDD ──────────────────────────────────────────────────────────────

test('parseExpiry GS1 "270800" → { year: 2027, month: 8, day: undefined }', () => {
  const p = parseExpiry('270800');
  if (!p) throw new Error('Expected non-null');
  expect(p.year).toBe(2027);
  expect(p.month).toBe(8);
  expect(p.day).toBe(undefined);
});

test('parseExpiry GS1 "270815" → { year: 2027, month: 8, day: 15 }', () => {
  const p = parseExpiry('270815');
  if (!p) throw new Error('Expected non-null');
  expect(p.year).toBe(2027);
  expect(p.month).toBe(8);
  expect(p.day).toBe(15);
});

// ─── expiriesEqual cross-format ───────────────────────────────────────────────

test('expiriesEqual: "08/2027" === "AUG 2027"', () => {
  expect(expiriesEqual('08/2027', 'AUG 2027')).toBeTrue();
});

test('expiriesEqual: "08/27" === "AUG-27"', () => {
  expect(expiriesEqual('08/27', 'AUG-27')).toBeTrue();
});

test('expiriesEqual: "270800" === "08/2027" (GS1 vs printed)', () => {
  expect(expiriesEqual('270800', '08/2027')).toBeTrue();
});

test('expiriesEqual: "08/2027" !== "09/2027"', () => {
  expect(expiriesEqual('08/2027', '09/2027')).toBeFalse();
});

test('expiriesEqual: unparseable inputs → false', () => {
  expect(expiriesEqual('not-a-date', '08/2027')).toBeFalse();
});

// ─── isExpiryPast ────────────────────────────────────────────────────────────

test('isExpiryPast: past month → true', () => {
  const past = { year: 2020, month: 1 };
  expect(isExpiryPast(past)).toBeTrue();
});

test('isExpiryPast: far future → false', () => {
  const future = { year: 2099, month: 12 };
  expect(isExpiryPast(future)).toBeFalse();
});

test('isExpiryPast with injectable now', () => {
  const p = { year: 2025, month: 6 };
  const past = new Date('2025-07-01');  // after June 2025
  expect(isExpiryPast(p, past)).toBeTrue();
});

// ─── daysUntilExpiryParsed ───────────────────────────────────────────────────

test('daysUntilExpiryParsed: future → positive number', () => {
  const future = { year: 2099, month: 12 };
  expect(daysUntilExpiryParsed(future)).toBeGreaterThan(0);
});

test('daysUntilExpiryParsed: past → negative number', () => {
  const past = { year: 2020, month: 1 };
  expect(daysUntilExpiryParsed(past)).toBeLessThan(0);
});

// ─── Null / unrecognised ─────────────────────────────────────────────────────

test('parseExpiry: empty string → null', () => {
  expect(parseExpiry('')).toBeNull();
});

test('parseExpiry: garbage string → null', () => {
  expect(parseExpiry('not-a-date-at-all')).toBeNull();
});

test('parseExpiry: invalid month in YYMMDD → null', () => {
  expect(parseExpiry('271300')).toBeNull();  // month 13
});

// ─── Results ─────────────────────────────────────────────────────────────────

const passed = results.filter(r => r.passed).length;
console.log('\n── Dates Tests ─────────────────────────────────────────');
results.forEach(r =>
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}${!r.passed ? '\n    → ' + r.actual : ''}`)
);
console.log(`\n  ${passed}/${results.length} passed\n`);
if (results.some(r => !r.passed)) process.exit(1);
