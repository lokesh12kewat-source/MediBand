/**
 * lib/gtin.vitest.ts — Vitest tests for GTIN validation.
 */

import { describe, it, expect } from 'vitest';
import { validateGTIN, computeCheckDigit } from './gtin';
import { ALL_SCENARIOS, SEED_PACKS } from '../data/demo-scenarios';

describe('validateGTIN', () => {
  it('valid GTIN-14: 09312345678907', () => {
    expect(validateGTIN('09312345678907').valid).toBe(true);
  });

  it('valid GTIN-13: 9780201379624', () => {
    expect(validateGTIN('9780201379624').valid).toBe(true);
  });

  it('invalid GTIN-14: wrong check digit', () => {
    expect(validateGTIN('09312345678909').valid).toBe(false);
  });

  it('invalid length: 10 digits → INVALID format', () => {
    expect(validateGTIN('1234567890').format).toBe('INVALID');
  });

  it('empty string → INVALID', () => {
    expect(validateGTIN('').valid).toBe(false);
  });

  it('valid GTIN-8: 96385074', () => {
    expect(validateGTIN('96385074').valid).toBe(true);
  });

  it('valid GTIN-12: 012345678905', () => {
    expect(validateGTIN('012345678905').valid).toBe(true);
  });

  it('computeCheckDigit for 0931234567890 returns 7', () => {
    expect(computeCheckDigit('0931234567890')).toBe(7);
  });

  it('all-zeros GTIN-14 check digit is 0', () => {
    expect(validateGTIN('00000000000000').valid).toBe(true);
  });
});

describe('Data integrity — every GTIN in data/ must pass validateGTIN', () => {
  for (const scenario of ALL_SCENARIOS) {
    if (scenario.pack.gtin) {
      it(`Scenario ${scenario.id}: GTIN ${scenario.pack.gtin}`, () => {
        expect(validateGTIN(scenario.pack.gtin!).valid).toBe(true);
      });
    }
  }

  for (const pack of SEED_PACKS) {
    if (pack.gtin) {
      it(`Seed pack ${pack.id}: GTIN ${pack.gtin}`, () => {
        expect(validateGTIN(pack.gtin).valid).toBe(true);
      });
    }
  }
});
