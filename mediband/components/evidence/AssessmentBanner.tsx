'use client';

import { AssessmentType } from '@/types';
import { getAssessmentLabel, getAssessmentDescription } from '@/lib/evidence-engine';

const CONFIG: Record<AssessmentType, { cls: string; icon: string; color: string }> = {
  STRONG_EVIDENCE:       { cls: 'assessment-banner--strong',      icon: '●', color: 'var(--status-strong)' },
  CONFLICT_DETECTED:     { cls: 'assessment-banner--conflict',    icon: '▲', color: 'var(--status-conflict)' },
  INSUFFICIENT_EVIDENCE: { cls: 'assessment-banner--insufficient', icon: '◐', color: 'var(--status-insufficient)' },
  EXPIRED:               { cls: 'assessment-banner--expired',     icon: '○', color: 'var(--status-expired)' },
};

export default function AssessmentBanner({ assessment }: { assessment: AssessmentType }) {
  const { cls, icon, color } = CONFIG[assessment];
  const label = getAssessmentLabel(assessment);
  const description = getAssessmentDescription(assessment);

  return (
    <div className={`assessment-banner ${cls}`} role="status" aria-label={`Assessment: ${label}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
        <span style={{ fontSize: '1rem', color }}>{icon}</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--ink-secondary)', lineHeight: 1.55 }}>
        {description}
      </div>
      {assessment === 'STRONG_EVIDENCE' && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
          Multiple independent signals agree. No inconsistency detected.
        </div>
      )}
      {assessment === 'CONFLICT_DETECTED' && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color }}>
          This check alone cannot establish authenticity.
        </div>
      )}
    </div>
  );
}
