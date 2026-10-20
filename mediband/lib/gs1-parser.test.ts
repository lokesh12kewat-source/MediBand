/**
 * lib/gs1-parser.test.ts — Tests for the GS1 element string parser.
 * Run: npx ts-node --project tsconfig.test.json lib/gs1-parser.test.ts
 */

import { parseGS1 } from './gs1-parser';

const results: { name: string; passed: boolean; actual?: unknown }[] = [];

function test(name: string, fn: () => void) {
  try { fn(); results.push({ name, passed: true }); }
  catch (e) { results.push({ name, passed: false, actual: (e as Error).message }); }
}

function expect(actual: unknown) {
  return {
    toBe: (exp: unknown) => {
      if (actual !== exp) throw new Error(`Expected ${JSON.stringify(exp)}, got ${JSON.stringify(actual)}`);
    },
    toBeUndefined: () => {
      if (actual !== undefined) throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
    },
    toContain: (exp: string) => {
      if (typeof actual !== 'string' || !actual.includes(exp))
        throw new Error(`Expected "${actual}" to contain "${exp}"`);
    },
    toHaveLength: (n: number) => {
      if ((actual as unknown[]).length !== n)
        throw new Error(`Expected length ${n}, got ${(actual as unknown[]).length}`);
    },
    toBeTrue: () => {
      if (actual !== true) throw new Error(`Expected true, got ${JSON.stringify(actual)}`);
    },
  };
}

const DEMO_GTIN = '09312345678907';

// ─── Parenthesised form ───────────────────────────────────────────────────────

test('Parenthesised: GTIN + batch + expiry + serial', () => {
  const r = parseGS1(`(01)${DEMO_GTIN}(10)A12345(17)271200(21)SN001`);
  expect(r.gtin).toBe(DEMO_GTIN);
  expect(r.batch).toBe('A12345');
  expect(r.expiry).toBe('271200');
  expect(r.serial).toBe('SN001');
  expect(r.warnings).toHaveLength(0);
});

test('Parenthesised: GTIN only', () => {
  const r = parseGS1(`(01)${DEMO_GTIN}`);
  expect(r.gtin).toBe(DEMO_GTIN);
  expect(r.batch).toBeUndefined();
  expect(r.expiry).toBeUndefined();
});

test('Parenthesised: unknown AI collected but does not crash', () => {
  const r = parseGS1(`(01)${DEMO_GTIN}(30)999`);
  expect(r.gtin).toBe(DEMO_GTIN);
  expect(r.unknown).toHaveLength(1);
  expect(r.unknown[0]).toBe('30');
});

test('Parenthesised: fixed-length GTIN truncated at 14 chars', () => {
  // If scanner emits extra chars after GTIN before next AI
  const r = parseGS1(`(01)${DEMO_GTIN}00(10)A12345`);
  expect(r.gtin).toBe(DEMO_GTIN); // only first 14 chars
  expect(r.batch).toBe('A12345');
});

// ─── GS-delimited form ────────────────────────────────────────────────────────

test('GS-delimited: GTIN + batch + expiry', () => {
  const gs = '\x1d';
  const input = `01${DEMO_GTIN}${gs}10A12345${gs}17271200`;
  const r = parseGS1(input);
  expect(r.gtin).toBe(DEMO_GTIN);
  expect(r.batch).toBe('A12345');
  expect(r.expiry).toBe('271200');
});

test('GS-delimited: serial number parsed', () => {
  const gs = '\x1d';
  const input = `01${DEMO_GTIN}${gs}21SN-DEMO-001`;
  const r = parseGS1(input);
  expect(r.gtin).toBe(DEMO_GTIN);
  expect(r.serial).toBe('SN-DEMO-001');
});

// ─── GS1 Digital Link URL ─────────────────────────────────────────────────────

test('Digital Link URL: GTIN + batch', () => {
  const r = parseGS1(`https://id.gs1.org/01/${DEMO_GTIN}/10/A12345`);
  expect(r.gtin).toBe(DEMO_GTIN);
  expect(r.batch).toBe('A12345');
});

test('Digital Link URL: full path with expiry', () => {
  const r = parseGS1(`https://id.gs1.org/01/${DEMO_GTIN}/17/271200/10/A12345`);
  expect(r.gtin).toBe(DEMO_GTIN);
  expect(r.expiry).toBe('271200');
  expect(r.batch).toBe('A12345');
});

test('Digital Link path-only: /01/GTIN/10/batch', () => {
  const r = parseGS1(`/01/${DEMO_GTIN}/10/A12345/17/271200`);
  expect(r.gtin).toBe(DEMO_GTIN);
  expect(r.batch).toBe('A12345');
  expect(r.expiry).toBe('271200');
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

test('Empty string returns warnings', () => {
  const r = parseGS1('');
  expect(r.warnings).toHaveLength(1);
  expect(r.gtin).toBeUndefined();
});

test('raw map contains all seen AIs', () => {
  const r = parseGS1(`(01)${DEMO_GTIN}(10)A12345`);
  expect(r.raw['01']).toBe(DEMO_GTIN);
  expect(r.raw['10']).toBe('A12345');
});

test('Batch variable-length truncated at max 20 chars', () => {
  const longBatch = 'X'.repeat(25);
  const r = parseGS1(`(01)${DEMO_GTIN}(10)${longBatch}`);
  expect(r.batch!.length).toBe(20);
});

// ─── Results ─────────────────────────────────────────────────────────────────

const passed = results.filter(r => r.passed).length;
console.log('\n── GS1 Parser Tests ─────────────────────────────────────');
results.forEach(r =>
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}${!r.passed ? '\n    → ' + r.actual : ''}`)
);
console.log(`\n  ${passed}/${results.length} passed\n`);
if (results.some(r => !r.passed)) process.exit(1);
