/**
 * Copy-Lint — Safety Language Check
 *
 * Flags unsafe or unsupported medical/authenticity claims.
 * Used during development and in demo-mode warnings.
 */

export const UNSAFE_TERMS: { term: string; reason: string }[] = [
  { term: 'genuine', reason: 'MediBand cannot certify genuineness from package scanning alone.' },
  { term: 'counterfeit', reason: 'MediBand cannot identify counterfeits from package scanning alone.' },
  { term: 'authentic', reason: 'Use "No inconsistency detected" instead of "authentic".' },
  { term: '100% verified', reason: 'No system can offer 100% verification.' },
  { term: 'guaranteed safe', reason: 'MediBand does not make safety guarantees.' },
  { term: 'diagnosis', reason: 'MediBand does not diagnose conditions.' },
  { term: 'prescription', reason: 'MediBand does not prescribe medication.' },
  { term: 'stop taking', reason: 'MediBand does not advise stopping medication.' },
  { term: 'do not take', reason: 'MediBand does not advise on whether to take medication.' },
  { term: 'unsafe', reason: 'Use "Expired" or "Conflict Detected" instead of "unsafe".' },
  { term: 'fake', reason: 'Use "Conflict Detected" or "Insufficient Evidence" instead of "fake".' },
  { term: 'real medicine', reason: 'MediBand cannot verify physical contents.' },
  { term: 'proven safe', reason: 'MediBand cannot prove safety.' },
];

export interface LintResult {
  term: string;
  reason: string;
  found: boolean;
  positions?: number[];
}

/**
 * Scan text for unsafe language and return lint results.
 */
export function lintCopy(text: string): LintResult[] {
  const lower = text.toLowerCase();
  const results: LintResult[] = [];

  for (const { term, reason } of UNSAFE_TERMS) {
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
