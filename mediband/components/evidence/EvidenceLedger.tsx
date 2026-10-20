'use client';

import { EvidenceClaim, ProviderResult, ClaimStatus, ProviderStatus } from '@/types';

const STATUS_ICON: Record<ClaimStatus, string> = {
  matches:      '✓',
  conflict:     '✗',
  missing:      '—',
  unverifiable: '?',
  format_valid: '✓',
};

const STATUS_CLASS: Record<ClaimStatus, string> = {
  matches:      'claim-status--verified',
  conflict:     'claim-status--conflict',
  missing:      'claim-status--missing',
  unverifiable: 'claim-status--unverifiable',
  format_valid: 'claim-status--unverifiable',
};

const STATUS_LABEL: Record<ClaimStatus, string> = {
  matches:      'Matches',
  conflict:     'Conflict',
  missing:      'Missing',
  unverifiable: 'Unverifiable',
  format_valid: 'Format valid',
};

const PROVIDER_STATUS_ICON: Record<ProviderStatus, string> = {
  FOUND:       '✓',
  NOT_FOUND:   '—',
  NOT_QUERIED: '○',
  UNAVAILABLE: '!',
};

const PROVIDER_STATUS_LABEL: Record<ProviderStatus, string> = {
  FOUND:       'Record found',
  NOT_FOUND:   'No record found',
  NOT_QUERIED: 'Not queried',
  UNAVAILABLE: 'Source unavailable',
};

const PROVIDER_STATUS_CLASS: Record<ProviderStatus, string> = {
  FOUND:       'claim-status--verified',
  NOT_FOUND:   'claim-status--missing',
  NOT_QUERIED: 'claim-status--unverifiable',
  UNAVAILABLE: 'claim-status--unverifiable',
};

import { useState } from 'react';

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
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, marginBottom: expanded ? '1rem' : 0,
        }}
        aria-expanded={expanded}
        id="evidence-ledger-toggle"
      >
        <div className="card-title" style={{ marginBottom: 0 }}>Evidence Ledger</div>
        <span style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>

      {expanded && (
        <>
          <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--ink-faint)' }}>
            What was checked and what each source found.
          </div>

          {/* Claims */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', padding: '0.375rem 0', borderBottom: '2px solid var(--border)', marginBottom: '0.25rem' }}>
              {['Field', 'Value · Source', 'Result'].map(h => (
                <span key={h} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{h}</span>
              ))}
            </div>
            {claims.map((claim) => (
              <ClaimRow key={claim.id} claim={claim} />
            ))}
          </div>

          {/* Provider results */}
          {providerResults.length > 0 && (
            <>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '0.5rem', marginTop: '0.75rem' }}>
                Provider lookups
              </div>
              {providerResults.map((pr) => (
                <ProviderRow key={pr.providerId} provider={pr} />
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
        <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>{claim.field}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)', marginTop: '1px' }}>{claim.method}</div>
      </div>
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{claim.value || '—'}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)', marginTop: '1px' }}>{claim.source}</div>
        {claim.simulated && <span className="demo-tag" style={{ marginTop: '4px' }}>Simulated</span>}
      </div>
      <div className={`claim-status ${STATUS_CLASS[claim.status]}`}>
        <span style={{ fontWeight: 700 }}>{STATUS_ICON[claim.status]}</span>
        <span style={{ fontSize: '0.75rem' }}>{STATUS_LABEL[claim.status]}</span>
      </div>
    </div>
  );
}

function ProviderRow({ provider }: { provider: ProviderResult }) {
  const cls = PROVIDER_STATUS_CLASS[provider.status];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--surface-muted)', borderRadius: 8, marginBottom: '0.375rem', gap: '0.75rem' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>{provider.providerName}</div>
        {provider.scope && (
          <div style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', marginTop: '2px' }}>{provider.scope}</div>
        )}
      </div>
      <span className="demo-tag">{provider.label}</span>
      <div className={`claim-status ${cls}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>
        {PROVIDER_STATUS_ICON[provider.status]}
        <span style={{ fontSize: '0.7rem' }}>{PROVIDER_STATUS_LABEL[provider.status]}</span>
      </div>
    </div>
  );
}
