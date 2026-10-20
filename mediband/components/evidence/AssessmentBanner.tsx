'use client';

import { ConsistencyAssessment, ShelfLifeAssessment } from '@/types';
import { getConsistencyLabel, getShelfLifeLabel } from '@/lib/evidence-engine';
import { SCOPE_CHECKED, SCOPE_NOT_CHECKED, CONFLICT_EXTRA } from '@/lib/copy';

interface Props {
  consistencyAssessment: ConsistencyAssessment;
  shelfLifeAssessment: ShelfLifeAssessment;
  allSimulated: boolean;
}

const CONSISTENCY_CONFIG: Record<ConsistencyAssessment, { cls: string; icon: string; color: string }> = {
  NO_INCONSISTENCY_FOUND: { cls: 'assessment-banner--strong',       icon: '●', color: 'var(--status-strong)' },
  INCONSISTENCY_DETECTED:  { cls: 'assessment-banner--conflict',    icon: '▲', color: 'var(--status-conflict)' },
  INSUFFICIENT_EVIDENCE:   { cls: 'assessment-banner--insufficient', icon: '◐', color: 'var(--status-insufficient)' },
};

const SHELF_CONFIG: Record<ShelfLifeAssessment, { label: string; color: string }> = {
  IN_DATE:       { label: 'In date',              color: 'var(--status-strong)' },
  EXPIRING_SOON: { label: 'Expiring soon',        color: 'var(--status-insufficient)' },
  EXPIRED:       { label: 'Expired',              color: 'var(--status-expired)' },
  UNKNOWN:       { label: 'Shelf life unknown',   color: 'var(--ink-muted)' },
};

export default function AssessmentBanner({ consistencyAssessment, shelfLifeAssessment, allSimulated }: Props) {
  const { cls, icon, color } = CONSISTENCY_CONFIG[consistencyAssessment];
  const consistencyLabel = getConsistencyLabel(consistencyAssessment);
  const { label: shelfLabel, color: shelfColor } = SHELF_CONFIG[shelfLifeAssessment];

  return (
    <div className={`assessment-banner ${cls}`} role="status" aria-label={`Assessment: ${consistencyLabel}`} style={{ marginBottom: '1.5rem' }}>

      {/* Primary: Consistency */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1rem', color }}>{icon}</span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color }}>
          {consistencyLabel}
        </span>
        {allSimulated && (
          <span className="demo-tag" style={{ marginLeft: '0.5rem' }}>
            DEMO DATA: simulated sources
          </span>
        )}
      </div>

      {/* Secondary: Shelf life — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Shelf life:
        </span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: shelfColor }}>
          {shelfLabel}
        </span>
      </div>

      {/* Conflict extra message */}
      {consistencyAssessment === 'INCONSISTENCY_DETECTED' && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--ink-secondary)', lineHeight: 1.55, marginBottom: '0.5rem' }}>
          {CONFLICT_EXTRA}
        </div>
      )}

      {/* Scope */}
      <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.04)', borderRadius: 6 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.55 }}>
          <strong>Checked:</strong> machine-readable code format, code-vs-print field consistency, and available reference records.
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.55, marginTop: '0.25rem' }}>
          <strong>Not checked:</strong> contents of the pack, storage conditions, whether the pack was altered after printing.
        </div>
      </div>
    </div>
  );
}
