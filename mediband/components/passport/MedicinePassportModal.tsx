'use client';

import { Medication, MedicationPack, VerificationResult } from '@/types';
import { getAssessmentLabel } from '@/lib/evidence-engine';

interface Props {
  medication: Medication;
  pack: MedicationPack;
  result: VerificationResult;
  onClose: () => void;
}

export default function MedicinePassportModal({ medication, pack, result, onClose }: Props) {
  const assessmentLabel = getAssessmentLabel(result.assessment);
  const verifiedClaims = result.claims.filter(c => c.status === 'verified');

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Medicine Passport">
      <div className="modal" onClick={e => e.stopPropagation()}>
        {/* Passport Header */}
        <div className="passport-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
            <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
              Medication Passport
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
              aria-label="Close passport"
              id="close-passport-btn"
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.2, marginBottom: '0.25rem' }}>
            {medication.brandName}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>
            {medication.genericName} · {medication.strength}
          </div>
        </div>

        {/* Passport Body */}
        <div className="passport-body">
          {/* Fields */}
          <div style={{ display: 'grid', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <PassportField label="Manufacturer" value={medication.manufacturer} />
            <PassportField label="Dosage form" value={medication.dosageForm ?? '—'} />
            <PassportField label="GTIN" value={pack.gtin || '—'} mono />
            <PassportField label="Batch" value={pack.batchEncoded || '—'} mono />
            <PassportField label="Expiry" value={pack.expiryEncoded || '—'} />
            {pack.serial && <PassportField label="Serial" value={pack.serial} mono />}
          </div>

          <div className="section-divider" />

          {/* Evidence summary */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '0.75rem' }}>
              Evidence
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {verifiedClaims.map((claim, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--status-strong)', fontWeight: 700 }}>✓</span>
                  <span style={{ fontWeight: 500 }}>{claim.field}</span>
                  <span style={{ color: 'var(--ink-faint)', fontSize: '0.75rem' }}>{claim.source}</span>
                </div>
              ))}
              {verifiedClaims.length === 0 && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>
                  No claims independently verified.
                </div>
              )}
            </div>
          </div>

          <div className="section-divider" />

          {/* Assessment & timestamp */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)', marginBottom: '0.25rem' }}>Assessment</div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{assessmentLabel}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)', marginBottom: '0.25rem' }}>Last checked</div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                {new Date(result.timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1.25rem', padding: '0.75rem', background: 'var(--surface-muted)', borderRadius: 8, fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            This passport is not an authenticity certificate. It records the evidence gathered at the time of scanning.
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            <span className="demo-tag">Demo Environment</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PassportField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value}
      </span>
    </div>
  );
}
