'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCabinetEntries, removeFromCabinet, initCabinet } from '@/store/cabinet-store';
import { findDuplicateIngredients } from '@/lib/ingredient-normalizer';
import { CabinetEntry, CabinetStatus } from '@/types';

const STATUS_CONFIG: Record<CabinetStatus, { label: string; cls: string }> = {
  'in-date':       { label: 'In date', cls: 'badge-indate' },
  'expiring-soon': { label: 'Expiring soon', cls: 'badge-expiring' },
  'expired':       { label: 'Expired', cls: 'badge-expired' },
  'needs-review':  { label: 'Needs review', cls: 'badge-insufficient' },
};

const CATEGORY_ORDER: CabinetStatus[] = ['expired', 'expiring-soon', 'needs-review', 'in-date'];
const CATEGORY_LABELS: Record<CabinetStatus, string> = {
  'expired':       'Expired',
  'expiring-soon': 'Expiring soon',
  'needs-review':  'Needs review',
  'in-date':       'In date',
};

export default function CabinetPage() {
  const [entries, setEntries] = useState<CabinetEntry[]>([]);

  function reload() {
    initCabinet();
    setEntries(getCabinetEntries());
  }

  useEffect(reload, []);

  const duplicates = findDuplicateIngredients(entries.map(e => e.medication));

  function handleRemove(packId: string) {
    removeFromCabinet(packId);
    reload();
  }

  const grouped = CATEGORY_ORDER
    .map(status => ({
      status,
      items: entries.filter(e => e.status === status),
    }))
    .filter(g => g.items.length > 0);

  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Medicine Cabinet</h1>
          <p style={{ fontSize: '0.875rem' }}>{entries.length} medicine{entries.length !== 1 ? 's' : ''} stored</p>
        </div>
        <Link href="/scan" className="btn btn-primary btn-sm" id="cabinet-scan-btn">
          + Scan
        </Link>
      </div>

      {/* Duplicate Warning */}
      {duplicates.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--status-insufficient)' }}>
          <div className="card-title" style={{ color: 'var(--status-insufficient)' }}>
            ⚠ Possible duplicate active ingredient
          </div>
          {duplicates.map(dup => (
            <div key={dup.ingredientId} style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                {dup.ingredientName}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--ink-secondary)', marginBottom: '0.375rem' }}>
                {dup.medications.map(m => m.brandName).join(', ')} appear to contain the same active ingredient.
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                Please confirm with a doctor or pharmacist before taking both.
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Medicine Groups */}
      {grouped.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>💊</div>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Cabinet is empty</div>
          <p style={{ fontSize: '0.875rem' }}>Scan a medicine to add it to your cabinet.</p>
          <Link href="/scan" className="btn btn-primary" style={{ marginTop: '1rem' }} id="cabinet-empty-scan-btn">
            Scan Medicine
          </Link>
        </div>
      ) : (
        grouped.map(({ status, items }) => (
          <div key={status} style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '0.625rem' }}>
              {CATEGORY_LABELS[status]} · {items.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {items.map(entry => (
                <MedicineCard key={entry.packId} entry={entry} onRemove={() => handleRemove(entry.packId)} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function MedicineCard({ entry, onRemove }: { entry: CabinetEntry; onRemove: () => void }) {
  const { medication, pack, status } = entry;
  const { label, cls } = STATUS_CONFIG[status];

  return (
    <div className="card--raised" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>{medication.brandName}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--ink-secondary)' }}>
            {medication.genericName} · {medication.strength}
          </div>
        </div>
        <span className={`badge ${cls}`}>{label}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
        <MetaItem label="Batch" value={pack.batchEncoded} />
        <MetaItem label="Expiry" value={pack.expiryEncoded} />
        <MetaItem label="Manufacturer" value={medication.manufacturer} />
        {pack.gtin && <MetaItem label="GTIN" value={pack.gtin.slice(-8) + '…'} mono />}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.625rem' }}>
        <button
          onClick={onRemove}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '0.75rem' }}
          id={`remove-${entry.packId}`}
          aria-label={`Remove ${medication.brandName} from cabinet`}
        >
          Remove
        </button>
        <Link
          href={`/scan?scenario=A`}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '0.75rem' }}
        >
          Re-scan
        </Link>
      </div>
    </div>
  );
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '1px' }}>{label}</div>
      <div style={{ fontSize: '0.8125rem', fontWeight: 500, fontFamily: mono ? 'monospace' : 'inherit' }}>{value || '—'}</div>
    </div>
  );
}
