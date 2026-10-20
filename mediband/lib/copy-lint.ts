/**
 * Copy-Lint — Safety Language Check
 *
 * Flags unsafe or unsupported medical/authenticity claims.
 * Extended per change request 1.2.
 */

export const ALLOWED_PHRASES: { phrase: string; reason: string }[] = [
  // (none currently — all safety strings use approved wordings from lib/copy.ts)
];

export const UNSAFE_TERMS: { term: string; reason: string }[] = [
  { term: 'genuine',       reason: 'MediBand cannot determine genuineness from scanning alone.' },
  { term: 'authentic',     reason: 'Use "No inconsistency detected" instead.' },
  { term: 'authenticity',  reason: 'Use "evidence" or "consistency" instead.' },
  { term: 'counterfeit',   reason: 'MediBand cannot identify counterfeits from package data.' },
  { term: 'fake',          reason: 'Use "Inconsistency detected" or "Insufficient evidence".' },
  { term: 'spurious',      reason: 'Use "Inconsistency detected" or "Insufficient evidence".' },
  { term: 'real medicine', reason: 'MediBand cannot verify physical contents.' },
  { term: 'safe to use',   reason: 'MediBand does not make safety judgements.' },
  { term: 'guaranteed',    reason: 'No system can guarantee medicine identity from scanning alone.' },
  { term: '100% verified', reason: 'No system can offer 100% verification.' },
  { term: 'approved',      reason: 'MediBand does not assess regulatory approval status.' },
  { term: 'legitimate',    reason: 'Use "No inconsistency detected" instead.' },
  { term: 'certified',     reason: 'MediBand does not certify medicines.' },
  { term: 'trusted',       reason: 'Avoid subjective trust claims.' },
  { term: 'diagnosis',     reason: 'MediBand does not diagnose conditions.' },
  { term: 'stop taking',   reason: 'MediBand does not advise stopping medication.' },
  { term: 'do not take',   reason: 'MediBand does not advise on whether to take medication.' },
  { term: 'unsafe',        reason: 'Use "Expired" or "Inconsistency detected" instead.' },
  { term: 'proven safe',   reason: 'MediBand cannot prove safety.' },
];

export interface LintResult {
  term: string;
  reason: string;
  found: boolean;
  positions?: number[];
}

/**
 * Scan text for unsafe language. Returns results only for terms found.
 */
export function lintCopy(text: string): LintResult[] {
  const lower = text.toLowerCase();
  const results: LintResult[] = [];

  for (const { term, reason } of UNSAFE_TERMS) {
    // Check if this occurrence is in an ALLOWED_PHRASES context
    const positions: number[] = [];
    let index = lower.indexOf(term.toLowerCase());
    while (index !== -1) {
      positions.push(index);
      index = lower.indexOf(term.toLowerCase(), index + 1);
    }
    if (positions.length > 0) {
      results.push({ term, reason, found: true, positions });
    }
  }

  return results;
}

/**
 * Returns true if any unsafe term is found in the text.
 */
export function hasUnsafeLanguage(text: string): boolean {
  return lintCopy(text).length > 0;
}
