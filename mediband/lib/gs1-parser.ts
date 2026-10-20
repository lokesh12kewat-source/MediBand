/**
 * lib/gs1-parser.ts — GS1 Element String Parser
 *
 * Parses GS1-encoded strings in three formats:
 *   1. Parenthesised form:   (01)09312345678907(10)A12345(17)271200
 *   2. GS-delimited form:    \x1d01 09312345678907 \x1d10 A12345 \x1d17 271200
 *   3. GS1 Digital Link URL: https://id.gs1.org/01/09312345678907/10/A12345
 *
 * Supported Application Identifiers (AIs):
 *   AI 01  — GTIN (14 digits)
 *   AI 10  — Batch / Lot number (variable length, max 20)
 *   AI 17  — Expiry date (YYMMDD)
 *   AI 21  — Serial number (variable length, max 20)
 *
 * DESIGN DECISION: Only the AIs that MediBand actually uses are parsed.
 * Unknown AIs are collected in `unknown` for debugging but not acted on.
 */

// ─── Output type ─────────────────────────────────────────────────────────────

export interface GS1ParseResult {
  /** GTIN (AI 01) — 14 digits */
  gtin?: string;
  /** Batch / lot number (AI 10) */
  batch?: string;
  /** Expiry date (AI 17) — raw YYMMDD string */
  expiry?: string;
  /** Serial number (AI 21) */
  serial?: string;
  /** Raw AI key→value pairs for all parsed AIs */
  raw: Record<string, string>;
  /** AIs encountered but not in the supported list */
  unknown: string[];
  /** Any parse errors or warnings */
  warnings: string[];
}

// ─── AI definitions ───────────────────────────────────────────────────────────

interface AIDefinition {
  ai: string;
  field: keyof Pick<GS1ParseResult, 'gtin' | 'batch' | 'expiry' | 'serial'>;
  fixedLength?: number;   // if set, value is exactly this many chars
  maxLength?: number;     // if set, value is variable up to this length (terminated by GS or end)
}

const KNOWN_AIS: AIDefinition[] = [
  { ai: '01', field: 'gtin',   fixedLength: 14 },
  { ai: '10', field: 'batch',  maxLength: 20 },
  { ai: '17', field: 'expiry', fixedLength: 6 },
  { ai: '21', field: 'serial', maxLength: 20 },
];

const KNOWN_AI_KEYS = new Set(KNOWN_AIS.map(a => a.ai));

// ─── Parenthesised form parser ────────────────────────────────────────────────
// e.g. (01)09312345678907(10)A12345(17)271200

function parseParenthesised(input: string): GS1ParseResult {
  const result: GS1ParseResult = { raw: {}, unknown: [], warnings: [] };
  const regex = /\((\d{2,4})\)([^(]*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    const ai = match[1];
    const value = match[2].trim();
    applyAI(result, ai, value);
  }

  return result;
}

// ─── GS-delimited form parser ─────────────────────────────────────────────────
// GS character = \x1d (ASCII 29)
// Fixed-length AIs are read without GS; variable-length AIs are terminated by GS or end.

function parseGSDelimited(input: string): GS1ParseResult {
  const result: GS1ParseResult = { raw: {}, unknown: [], warnings: [] };
  // Split on GS characters, then parse each segment
  const segments = input.split(/[\x1d\x1e\x04]/);

  for (const seg of segments) {
    if (!seg) continue;
    parseSegment(result, seg);
  }

  return result;
}

/**
 * Parse a single segment that starts with an AI (2+ digits) followed by value.
 * Fixed-length AIs are consumed without needing a GS terminator.
 */
function parseSegment(result: GS1ParseResult, seg: string): void {
  let remaining = seg;

  while (remaining.length > 0) {
    // Try to match a known AI
    let matched = false;
    for (const def of KNOWN_AIS) {
      if (remaining.startsWith(def.ai)) {
        const afterAI = remaining.slice(def.ai.length);
        let value: string;
        if (def.fixedLength) {
          value = afterAI.slice(0, def.fixedLength);
          remaining = afterAI.slice(def.fixedLength);
        } else {
          // Variable length — take all remaining (GS already stripped by split)
          value = afterAI.slice(0, def.maxLength);
          remaining = '';
        }
        applyAI(result, def.ai, value);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Try as unknown 2-digit AI
      const aiMatch = remaining.match(/^(\d{2,4})([\s\S]*)/);
      if (aiMatch) {
        result.raw[aiMatch[1]] = aiMatch[2];
        result.unknown.push(aiMatch[1]);
      } else {
        result.warnings.push(`Unrecognised segment: ${remaining.slice(0, 10)}`);
      }
      break;
    }
  }
}

// ─── GS1 Digital Link URL parser ─────────────────────────────────────────────
// e.g. https://id.gs1.org/01/09312345678907/10/A12345/17/271200
// Also handles path-only forms: /01/09312345678907/10/A12345

function parseDigitalLink(input: string): GS1ParseResult {
  const result: GS1ParseResult = { raw: {}, unknown: [], warnings: [] };

  let path = input;
  try {
    // If it looks like a URL, extract the pathname
    if (/^https?:\/\//i.test(input)) {
      path = new URL(input).pathname;
    }
  } catch {
    result.warnings.push('Could not parse as URL; treating as path');
  }

  // Remove leading slash and split
  const parts = path.replace(/^\//, '').split('/');
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const ai = parts[i];
    const value = parts[i + 1];
    if (/^\d{2,4}$/.test(ai)) {
      applyAI(result, ai, value);
    }
  }

  return result;
}

// ─── Apply a single AI → value pair to the result ────────────────────────────

function applyAI(result: GS1ParseResult, ai: string, rawValue: string): void {
  const def = KNOWN_AIS.find(a => a.ai === ai);
  result.raw[ai] = rawValue;

  if (!def) {
    if (!KNOWN_AI_KEYS.has(ai)) result.unknown.push(ai);
    return;
  }

  let value = rawValue;
  if (def.fixedLength) value = value.slice(0, def.fixedLength);
  if (def.maxLength)   value = value.slice(0, def.maxLength);

  result[def.field] = value;
}

// ─── Auto-detect format and parse ─────────────────────────────────────────────

function detectFormat(input: string): 'parenthesised' | 'gs-delimited' | 'digital-link' | 'unknown' {
  if (/^\((\d{2,4})\)/.test(input))      return 'parenthesised';
  if (/^https?:\/\//i.test(input))        return 'digital-link';
  if (/^\/\d{2,4}\//.test(input))         return 'digital-link';   // path-only digital link
  if (/[\x1d\x1e\x04]/.test(input))       return 'gs-delimited';
  if (/^\d{2,4}[A-Z0-9]/.test(input))     return 'gs-delimited';   // raw AI without GS chars
  return 'unknown';
}

/**
 * Parse a GS1-encoded string (any supported format) into structured fields.
 *
 * @param input  The raw string from a barcode, DataMatrix, or QR scan.
 * @returns      Parsed GS1 fields, unknown AIs, and any warnings.
 */
export function parseGS1(input: string): GS1ParseResult {
  if (!input || !input.trim()) {
    return { raw: {}, unknown: [], warnings: ['Empty input'] };
  }

  const fmt = detectFormat(input.trim());

  switch (fmt) {
    case 'parenthesised': return parseParenthesised(input);
    case 'digital-link':  return parseDigitalLink(input);
    case 'gs-delimited':  return parseGSDelimited(input);
    default: {
      // Try parenthesised anyway — many scanners produce this
      const attempt = parseParenthesised(input);
      if (Object.keys(attempt.raw).length > 0) return attempt;
      return { raw: {}, unknown: [], warnings: [`Unknown GS1 format: ${input.slice(0, 20)}`] };
    }
  }
}
