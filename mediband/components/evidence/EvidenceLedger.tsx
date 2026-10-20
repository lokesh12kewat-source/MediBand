'use client';

import { useState } from 'react';
import { EvidenceClaim, ProviderResult, ClaimStatus } from '@/types';

const STATUS_ICON: Record<ClaimStatus, string> = {
  verified: '✓',
  conflict: '✗',
  missing: '—',
  unverifiable: '?',
};

const STATUS_CLASS: Record<ClaimStatus, string> = {
  verified: 'claim-status--verified',
  conflict: 'claim-status--conflict',
  missing: 'claim-status--missing',
  unverifiable: 'claim-status--unverifiable',
};

export default function EvidenceLedger({
  claims,
  providerResults,
}: {
  claims: EvidenceClaim[];
  providerResults: ProviderResult[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          marginBottom: expanded ? '1rem' : 0,
        }}
        aria-expanded={expanded}
        id="evidence-ledger-toggle"
      >
        <div className="card-title" style={{ marginBottom: 0 }}>Evidence Ledger</div>
        <span style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {expanded && (
        <>
          <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--ink-faint)' }}>
            Why do we believe this?
          </div>

          {/* Claims Table */}
          <div style={{ marginBottom: '1rem' }}>
            {/* Header Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', padding: '0.375rem 0', borderBottom: '2px solid var(--border)', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Field</span>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Value · Source</span>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Status</span>
            </div>

            {claims.map((claim, i) => (
              <ClaimRow key={i} claim={claim} />
            ))}
          </div>

          {/* Provider Results */}
          {providerResults.length > 0 && (
            <>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '0.5rem', marginTop: '0.75rem' }}>
                Provider lookups
              </div>
              {providerResults.map((pr, i) => (
                <ProviderRow key={i} provider={pr} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ClaimRow({ claim }: { claim: EvidenceClaim }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', padding: '0.625rem 0', borderBottom: '1px solid var(--border)', alignItems: 'start' }}>
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--ink)' }}>{claim.field}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)', marginTop: '1px' }}>{claim.method}</div>
      </div>
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)' }}>{claim.value || '—'}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)', marginTop: '1px' }}>{claim.source}</div>
      </div>
      <div className={`claim-status ${STATUS_CLASS[claim.status]}`}>
        <span style={{ fontWeight: 700 }}>{STATUS_ICON[claim.status]}</span>
        <span style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
          {claim.status === 'verified' ? 'Verified' :
           claim.status === 'conflict' ? 'Conflict' :
           claim.status === 'missing' ? 'Missing' :
           'Unverifiable'}
        </span>
      </div>
    </div>
  );
}

function ProviderRow({ provider }: { provider: ProviderResult }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--surface-muted)', borderRadius: 8, marginBottom: '0.375rem', gap: '0.75rem' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>{provider.providerName}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)', marginTop: '1px' }}>
          {provider.found ? 'Record found' : 'No record'}
        </div>
      </div>
      <span className="demo-tag">{provider.label}</span>
      <span className={`claim-status ${provider.found ? 'claim-status--verified' : 'claim-status--missing'}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600 }}>
        {provider.found ? '✓' : '—'}
      </span>
    </div>
  );
}
