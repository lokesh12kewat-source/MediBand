/**
 * GTIN Validation Unit Tests
 * Run with: npx ts-node lib/gtin.test.ts
 * (Or integrate with Jest once configured)
 */

import { validateGTIN, computeCheckDigit } from './gtin';

interface TestResult {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true, expected: 'pass', actual: 'pass' });
  } catch (e) {
    results.push({
      name,
      passed: false,
      expected: 'pass',
      actual: e instanceof Error ? e.message : String(e),
    });
  }
}

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('Valid GTIN-14: 09312345678907 passes check digit', () => {
  const result = validateGTIN('09312345678907');
  expect(result.valid).toBe(true);
  expect(result.format).toBe('GTIN-14');
  expect(result.checkDigit).toBe(result.computed);
});

test('Valid GTIN-13: 9780201379624 passes check digit', () => {
  // ISBN-13 / EAN-13 known valid
  const result = validateGTIN('9780201379624');
  expect(result.valid).toBe(true);
  expect(result.format).toBe('GTIN-13');
});

test('Invalid GTIN-14: wrong check digit fails', () => {
  // 09312345678909 — correct would be 09312345678907
  const result = validateGTIN('09312345678909');
  expect(result.valid).toBe(false);
  expect(result.error).toBe(`Check digit mismatch: got 9, expected 7`);
});

test('Invalid length: 10 digits returns INVALID format', () => {
  const result = validateGTIN('1234567890');
  expect(result.valid).toBe(false);
  expect(result.format).toBe('INVALID');
});

test('Empty string returns INVALID', () => {
  const result = validateGTIN('');
  expect(result.valid).toBe(false);
  expect(result.format).toBe('INVALID');
});

test('Non-numeric characters are stripped before validation', () => {
  // Should strip spaces/hyphens but still validate
  const result = validateGTIN('093123456789 01');
  // After stripping: '09312345678901'
  expect(result.normalized).toBe('09312345678901');
});

test('GTIN-8 valid: 96385074', () => {
  // Known valid EAN-8
  const result = validateGTIN('96385074');
  expect(result.format).toBe('GTIN-8');
  expect(result.valid).toBe(true);
});

test('GTIN-12 valid: 012345678905', () => {
  // Known valid UPC-A
  const result = validateGTIN('012345678905');
  expect(result.format).toBe('GTIN-12');
  expect(result.valid).toBe(true);
});

test('computeCheckDigit produces correct value for known payload', () => {
  // For GTIN-14 '09312345678907': payload = '0931234567890', check = 7
  const check = computeCheckDigit('0931234567890');
  expect(check).toBe(7);
});

test('All-zeros GTIN-14 (00000000000000) has check digit 0', () => {
  const result = validateGTIN('00000000000000');
  expect(result.valid).toBe(true);
  expect(result.checkDigit).toBe(0);
});

// ─── Report ───────────────────────────────────────────────────────────────────

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

console.log('\n╔═══════════════════════════════════════╗');
console.log('║        GTIN Validation Test Suite     ║');
console.log('╚═══════════════════════════════════════╝\n');

results.forEach(r => {
  const icon = r.passed ? '✓' : '✗';
  console.log(`  ${icon} ${r.name}`);
  if (!r.passed) {
    console.log(`    → ${r.actual}`);
  }
});

console.log(`\n  ${passed}/${results.length} tests passed${failed > 0 ? `, ${failed} failed` : ''}\n`);

if (failed > 0) {
  process.exit(1);
}
