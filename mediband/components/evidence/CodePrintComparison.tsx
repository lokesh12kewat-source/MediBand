'use client';

import { CodePrintResult } from '@/types';

export default function CodePrintComparison({ codePrint }: { codePrint: CodePrintResult }) {
  const hasBatch = codePrint.encodedBatch || codePrint.printedBatch;
  const hasExpiry = codePrint.encodedExpiry || codePrint.printedExpiry;

  if (!hasBatch && !hasExpiry) return null;

  const hasConflict = codePrint.batchMatch === false || codePrint.expiryMatch === false;
  const allMatch = codePrint.batchMatch !== false && codePrint.expiryMatch !== false;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-title">Code ↔ Print Consistency</div>

      {/* Overall status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.625rem 0.875rem',
        borderRadius: 8,
        background: hasConflict ? 'var(--status-conflict-bg)' : 'var(--status-strong-bg)',
        marginBottom: '1rem',
        border: `1px solid ${hasConflict ? '#FECACA' : '#BBF7D0'}`,
      }}>
        <span style={{ fontWeight: 700, color: hasConflict ? 'var(--status-conflict)' : 'var(--status-strong)' }}>
          {hasConflict ? '✗' : '✓'}
        </span>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: hasConflict ? 'var(--status-conflict)' : 'var(--status-strong)' }}>
          {hasConflict ? 'Conflict detected' : 'No inconsistency detected'}
        </span>
      </div>

      {/* Batch comparison */}
      {hasBatch && (
        <ComparisonBlock
          label="Batch number"
          encoded={codePrint.encodedBatch}
          printed={codePrint.printedBatch}
          match={codePrint.batchMatch}
          diffs={codePrint.batchDiff}
          encodedSource="DataMatrix / Barcode"
          printedSource="OCR (printed)"
        />
      )}

      {/* Expiry comparison */}
      {hasExpiry && (
        <ComparisonBlock
          label="Expiry date"
          encoded={codePrint.encodedExpiry}
          printed={codePrint.printedExpiry}
          match={codePrint.expiryMatch}
          diffs={codePrint.expiryDiff}
          encodedSource="DataMatrix / Barcode"
          printedSource="OCR (printed)"
        />
      )}

      {/* Conflict message */}
      {hasConflict && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--status-conflict-bg)', borderRadius: 8, border: '1px solid #FECACA' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--status-conflict)', fontWeight: 600, marginBottom: '0.25rem' }}>
            The machine-readable and printed package information do not agree.
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
            This check alone cannot establish authenticity.
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonBlock({
  label,
  encoded,
  printed,
  match,
  diffs,
  encodedSource,
  printedSource,
}: {
  label: string;
  encoded: string;
  printed: string;
  match: boolean | null;
  diffs?: { index: number; encoded: string; printed: string }[];
  encodedSource: string;
  printedSource: string;
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
        {label}
      </div>
      <div className="diff-row">
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', marginBottom: '0.25rem', letterSpacing: '0.04em' }}>
            ENCODED ({encodedSource})
          </div>
          <div className="diff-code">
            {encoded ? renderDiffChars(encoded, diffs, 'encoded') : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', marginBottom: '0.25rem', letterSpacing: '0.04em' }}>
            PRINTED ({printedSource})
          </div>
          <div className="diff-code">
            {printed ? renderDiffChars(printed, diffs, 'printed') : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
          </div>
        </div>
      </div>
      {match !== null && (
        <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', fontWeight: 600, color: match ? 'var(--status-strong)' : 'var(--status-conflict)' }}>
          {match ? '✓ Match' : '✗ Mismatch'}
          {!match && diffs && diffs.length > 0 && (
            <span style={{ marginLeft: '0.5rem', fontWeight: 400, color: 'var(--ink-muted)' }}>
              ({diffs.length} character{diffs.length !== 1 ? 's' : ''} differ at position{diffs.length !== 1 ? 's' : ''} {diffs.map(d => d.index + 1).join(', ')})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function renderDiffChars(
  value: string,
  diffs: { index: number; encoded: string; printed: string }[] | undefined,
  side: 'encoded' | 'printed',
): React.ReactNode {
  if (!diffs || diffs.length === 0) return value;
  const diffIndexes = new Set(diffs.map(d => d.index));
  return (
    <>
      {value.split('').map((char, i) => (
        <span
          key={i}
          className={`diff-char${diffIndexes.has(i) ? ' diff-char--mismatch' : ''}`}
        >
          {char}
        </span>
      ))}
    </>
  );
}
