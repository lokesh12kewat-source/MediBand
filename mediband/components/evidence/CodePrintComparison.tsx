'use client';

import { DiffOp, CodePrintResult, ComparisonKind } from '@/types';

const KIND_LABEL: Partial<Record<ComparisonKind, { text: string; color: string }>> = {
  LIKELY_OCR_CONFUSION: { text: 'Possible misread — please re-check', color: 'var(--status-insufficient)' },
  FORMAT_VARIATION:     { text: 'Format variation (case/spacing only)', color: 'var(--ink-muted)' },
};

export default function CodePrintComparison({ codePrint }: { codePrint: CodePrintResult }) {
  const hasBatch  = codePrint.encodedBatch || codePrint.printedBatch;
  const hasExpiry = codePrint.encodedExpiry || codePrint.printedExpiry;
  if (!hasBatch && !hasExpiry) return null;

  const hasConflict = codePrint.batchMatch === false || codePrint.expiryMatch === false;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-title">Code ↔ Print Consistency</div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.625rem 0.875rem', borderRadius: 8,
        background: hasConflict ? 'var(--status-conflict-bg)' : 'var(--status-strong-bg)',
        marginBottom: '1rem',
        border: `1px solid ${hasConflict ? '#FECACA' : '#BBF7D0'}`,
      }}>
        <span style={{ fontWeight: 700, color: hasConflict ? 'var(--status-conflict)' : 'var(--status-strong)' }}>
          {hasConflict ? '✗' : '✓'}
        </span>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: hasConflict ? 'var(--status-conflict)' : 'var(--status-strong)' }}>
          {hasConflict ? 'Inconsistency detected' : 'No inconsistency detected'}
        </span>
      </div>

      {hasBatch && (
        <ComparisonBlock
          label="Batch number"
          encoded={codePrint.encodedBatch}
          printed={codePrint.printedBatch}
          match={codePrint.batchMatch}
          kind={codePrint.batchKind}
          ops={codePrint.batchDiff}
          diffCount={codePrint.batchDiffCount}
          encodedSource="DataMatrix / Barcode"
          printedSource="OCR (printed)"
        />
      )}

      {hasExpiry && (
        <ComparisonBlock
          label="Expiry date"
          encoded={codePrint.encodedExpiry}
          printed={codePrint.printedExpiry}
          match={codePrint.expiryMatch}
          kind={codePrint.expiryKind}
          ops={codePrint.expiryDiff}
          diffCount={codePrint.expiryDiffCount}
          encodedSource="DataMatrix / Barcode"
          printedSource="OCR (printed)"
        />
      )}
    </div>
  );
}

function ComparisonBlock({
  label, encoded, printed, match, kind, ops, diffCount, encodedSource, printedSource,
}: {
  label: string;
  encoded: string;
  printed: string;
  match: boolean | null;
  kind?: ComparisonKind;
  ops?: DiffOp[];
  diffCount?: number;
  encodedSource: string;
  printedSource: string;
}) {
  const kindInfo = kind ? KIND_LABEL[kind] : undefined;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>{label}</div>
      <div className="diff-row">
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', marginBottom: '0.25rem', letterSpacing: '0.04em' }}>
            ENCODED ({encodedSource})
          </div>
          <div className="diff-code">
            {encoded ? renderOps(ops, encoded, 'a') : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', marginBottom: '0.25rem', letterSpacing: '0.04em' }}>
            PRINTED ({printedSource})
          </div>
          <div className="diff-code">
            {printed ? renderOps(ops, printed, 'b') : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
          </div>
        </div>
      </div>
      <div style={{ marginTop: '0.375rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {match !== null && (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: match ? 'var(--status-strong)' : 'var(--status-conflict)' }}>
            {match ? '✓ Match' : `✗ Mismatch${diffCount != null ? ` (${diffCount} difference${diffCount !== 1 ? 's' : ''})` : ''}`}
          </span>
        )}
        {kindInfo && (
          <span style={{ fontSize: '0.75rem', color: kindInfo.color }}>{kindInfo.text}</span>
        )}
      </div>
    </div>
  );
}

function renderOps(ops: DiffOp[] | undefined, fallback: string, side: 'a' | 'b'): React.ReactNode {
  if (!ops || ops.length === 0) return fallback;

  return (
    <>
      {ops.map((op, i) => {
        if (op.op === 'equal') {
          return <span key={i} className="diff-char">{side === 'a' ? op.a : op.b}</span>;
        }
        if (op.op === 'sub') {
          const ch = side === 'a' ? op.a : op.b;
          return <span key={i} className="diff-char diff-char--mismatch">{ch}</span>;
        }
        if (op.op === 'ins' && side === 'b') {
          return <span key={i} className="diff-char diff-char--mismatch">{op.b}</span>;
        }
        if (op.op === 'del' && side === 'a') {
          return <span key={i} className="diff-char diff-char--mismatch" style={{ textDecoration: 'line-through' }}>{op.a}</span>;
        }
        return null;
      })}
    </>
  );
}
