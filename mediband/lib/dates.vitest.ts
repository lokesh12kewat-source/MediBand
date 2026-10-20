/**
 * lib/dates.vitest.ts — Vitest tests for structured expiry date parsing.
 */

import { describe, it, expect } from 'vitest';
import { parseExpiry, expiriesEqual, isExpiryPast, daysUntilExpiryParsed } from './dates';

describe('parseExpiry', () => {
  it('MM/YYYY: 08/2027', () => {
    const p = parseExpiry('08/2027');
    expect(p?.month).toBe(8);
    expect(p?.year).toBe(2027);
  });

  it('MM-YYYY: 08-2027', () => {
    const p = parseExpiry('08-2027');
    expect(p?.month).toBe(8);
    expect(p?.year).toBe(2027);
  });

  it('MM/YY: 08/27 → 2027', () => {
    expect(parseExpiry('08/27')?.year).toBe(2027);
  });

  it('YYYY-MM: 2027-08', () => {
    const p = parseExpiry('2027-08');
    expect(p?.month).toBe(8);
    expect(p?.year).toBe(2027);
  });

  it('MMM YYYY: AUG 2027', () => {
    const p = parseExpiry('AUG 2027');
    expect(p?.month).toBe(8);
    expect(p?.year).toBe(2027);
  });

  it('MMM YYYY: lowercase "aug 2027"', () => {
    const p = parseExpiry('aug 2027');
    expect(p?.month).toBe(8);
  });

  it('GS1 YYMMDD: 270800 → day undefined (last of month)', () => {
    const p = parseExpiry('270800');
    expect(p?.year).toBe(2027);
    expect(p?.month).toBe(8);
    expect(p?.day).toBeUndefined();
  });

  it('GS1 YYMMDD: 270815 → day 15', () => {
    expect(parseExpiry('270815')?.day).toBe(15);
  });

  it('empty string → null', () => {
    expect(parseExpiry('')).toBeNull();
  });

  it('garbage → null', () => {
    expect(parseExpiry('not-a-date-at-all')).toBeNull();
  });

  it('invalid month in YYMMDD → null', () => {
    expect(parseExpiry('271300')).toBeNull();
  });
});

describe('expiriesEqual', () => {
  it('08/2027 equals AUG 2027', () => {
    expect(expiriesEqual('08/2027', 'AUG 2027')).toBe(true);
  });

  it('270800 equals 08/2027 (GS1 vs printed)', () => {
    expect(expiriesEqual('270800', '08/2027')).toBe(true);
  });

  it('08/2027 not equal to 09/2027', () => {
    expect(expiriesEqual('08/2027', '09/2027')).toBe(false);
  });

  it('unparseable → false', () => {
    expect(expiriesEqual('garbage', '08/2027')).toBe(false);
  });
});

describe('isExpiryPast / daysUntilExpiryParsed', () => {
  it('past expiry is past', () => {
    expect(isExpiryPast({ year: 2020, month: 1 })).toBe(true);
  });

  it('far-future expiry is not past', () => {
    expect(isExpiryPast({ year: 2099, month: 12 })).toBe(false);
  });

  it('injectable now works', () => {
    const p = { year: 2025, month: 6 };
    const afterJune = new Date('2025-07-01');
    expect(isExpiryPast(p, afterJune)).toBe(true);
  });

  it('future → positive days', () => {
    expect(daysUntilExpiryParsed({ year: 2099, month: 12 })).toBeGreaterThan(0);
  });

  it('past → negative days', () => {
    expect(daysUntilExpiryParsed({ year: 2020, month: 1 })).toBeLessThan(0);
  });
});
