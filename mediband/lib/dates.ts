/**
 * lib/dates.ts — Structured expiry date parsing.
 *
 * Supports: MM/YYYY, MM/YY, MM-YYYY, YYYY-MM, MMM YYYY, MMM-YY, YYMMDD (GS1 AI 17).
 * DD=00 in YYMMDD means last day of that month (GS1 rule).
 * Unparseable input → null (never a conflict, only unverifiable/missing).
 */

export interface ParsedExpiry {
  year: number;
  month: number;   // 1-12
  day?: number;    // undefined = last day of month
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function resolveDay(year: number, month: number, day: number | undefined): number {
  if (!day || day === 0) return lastDayOfMonth(year, month);
  return day;
}

/**
 * Parse an expiry date string into a structured form.
 * Returns null if the format is not recognised.
 */
export function parseExpiry(input: string): ParsedExpiry | null {
  if (!input || !input.trim()) return null;
  const s = input.trim().toUpperCase();

  // MM/YYYY or MM-YYYY
  let m = s.match(/^(\d{2})[/\-](\d{4})$/);
  if (m) return { month: parseInt(m[1], 10), year: parseInt(m[2], 10) };

  // MM/YY or MM-YY → 20YY
  m = s.match(/^(\d{2})[/\-](\d{2})$/);
  if (m) return { month: parseInt(m[1], 10), year: 2000 + parseInt(m[2], 10) };

  // YYYY-MM
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };

  // YYMMDD — GS1 AI 17 format (DD=00 means last day of month)
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const year = 2000 + parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (month < 1 || month > 12) return null;
    return { year, month, day: day === 0 ? undefined : day };
  }

  // MMM YYYY or MMM-YYYY
  m = s.match(/^([A-Z]{3})[\s\-](\d{4})$/);
  if (m) {
    const mo = MONTH_NAMES[m[1].toLowerCase()];
    if (!mo) return null;
    return { month: mo, year: parseInt(m[2], 10) };
  }

  // MMM YY or MMM-YY → 20YY
  m = s.match(/^([A-Z]{3})[\s\-](\d{2})$/);
  if (m) {
    const mo = MONTH_NAMES[m[1].toLowerCase()];
    if (!mo) return null;
    return { month: mo, year: 2000 + parseInt(m[2], 10) };
  }

  return null;
}

/**
 * Compare two expiry strings by parsed year + month.
 * Returns true only if both parse successfully and represent the same month.
 */
export function expiriesEqual(a: string, b: string): boolean {
  const pa = parseExpiry(a);
  const pb = parseExpiry(b);
  if (!pa || !pb) return false;
  return pa.year === pb.year && pa.month === pb.month;
}

/**
 * Check if a parsed expiry is in the past relative to `now`.
 */
export function isExpiryPast(parsed: ParsedExpiry, now: Date = new Date()): boolean {
  const day = resolveDay(parsed.year, parsed.month, parsed.day);
  const expiryEnd = new Date(parsed.year, parsed.month - 1, day, 23, 59, 59);
  return expiryEnd < now;
}

/**
 * Days remaining until expiry. Negative = already expired.
 */
export function daysUntilExpiryParsed(parsed: ParsedExpiry, now: Date = new Date()): number {
  const day = resolveDay(parsed.year, parsed.month, parsed.day);
  const expiryEnd = new Date(parsed.year, parsed.month - 1, day, 23, 59, 59);
  return Math.floor((expiryEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
