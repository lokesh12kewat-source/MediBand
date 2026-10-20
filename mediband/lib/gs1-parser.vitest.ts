/**
 * lib/gs1-parser.vitest.ts — Vitest tests for GS1 element string parser.
 */

import { describe, it, expect } from 'vitest';
import { parseGS1 } from './gs1-parser';

const DEMO_GTIN = '09312345678907';

describe('parseGS1 — parenthesised form', () => {
  it('GTIN + batch + expiry + serial', () => {
    const r = parseGS1(`(01)${DEMO_GTIN}(10)A12345(17)271200(21)SN001`);
    expect(r.gtin).toBe(DEMO_GTIN);
    expect(r.batch).toBe('A12345');
    expect(r.expiry).toBe('271200');
    expect(r.serial).toBe('SN001');
    expect(r.warnings.length).toBe(0);
  });

  it('GTIN only', () => {
    const r = parseGS1(`(01)${DEMO_GTIN}`);
    expect(r.gtin).toBe(DEMO_GTIN);
    expect(r.batch).toBeUndefined();
  });

  it('unknown AI collected in unknown[]', () => {
    const r = parseGS1(`(01)${DEMO_GTIN}(30)999`);
    expect(r.unknown).toContain('30');
  });

  it('batch truncated at 20 chars', () => {
    const r = parseGS1(`(01)${DEMO_GTIN}(10)${'X'.repeat(25)}`);
    expect(r.batch!.length).toBe(20);
  });
});

describe('parseGS1 — GS-delimited form', () => {
  it('GTIN + batch + expiry', () => {
    const gs = '\x1d';
    const r = parseGS1(`01${DEMO_GTIN}${gs}10A12345${gs}17271200`);
    expect(r.gtin).toBe(DEMO_GTIN);
    expect(r.batch).toBe('A12345');
    expect(r.expiry).toBe('271200');
  });

  it('serial number parsed', () => {
    const gs = '\x1d';
    const r = parseGS1(`01${DEMO_GTIN}${gs}21SN-DEMO-001`);
    expect(r.gtin).toBe(DEMO_GTIN);
    expect(r.serial).toBe('SN-DEMO-001');
  });
});

describe('parseGS1 — GS1 Digital Link URL', () => {
  it('full URL with batch', () => {
    const r = parseGS1(`https://id.gs1.org/01/${DEMO_GTIN}/10/A12345`);
    expect(r.gtin).toBe(DEMO_GTIN);
    expect(r.batch).toBe('A12345');
  });

  it('full URL with expiry', () => {
    const r = parseGS1(`https://id.gs1.org/01/${DEMO_GTIN}/17/271200/10/A12345`);
    expect(r.expiry).toBe('271200');
    expect(r.batch).toBe('A12345');
  });

  it('path-only digital link', () => {
    const r = parseGS1(`/01/${DEMO_GTIN}/10/A12345/17/271200`);
    expect(r.gtin).toBe(DEMO_GTIN);
    expect(r.batch).toBe('A12345');
    expect(r.expiry).toBe('271200');
  });
});

describe('parseGS1 — edge cases', () => {
  it('empty string returns warning', () => {
    const r = parseGS1('');
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.gtin).toBeUndefined();
  });

  it('raw map contains all seen AIs', () => {
    const r = parseGS1(`(01)${DEMO_GTIN}(10)A12345`);
    expect(r.raw['01']).toBe(DEMO_GTIN);
    expect(r.raw['10']).toBe('A12345');
  });
});
