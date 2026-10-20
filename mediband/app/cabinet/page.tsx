'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getCabinetEntries,
  removeFromCabinet,
  initCabinet,
  markPackOpened,
  updatePackQuantity,
  updatePackNotes,
} from '@/store/cabinet-store';
import { getEvidenceForPack, getEvidenceRecord } from '@/store/evidence-store';
import { findDuplicateIngredients } from '@/lib/ingredient-normalizer';
import { runVerification } from '@/lib/verification-engine';
import { CabinetEntry, CabinetStatus, VerificationResult } from '@/types';
import { SCENARIO_A, SCENARIO_B, SCENARIO_D } from '@/data/demo-scenarios';
import MedicinePassportModal from '@/components/passport/MedicinePassportModal';

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
  const [passportData, setPassportData] = useState<{
    entry: CabinetEntry;
    result: VerificationResult;
  } | null>(null);

  function reload() {
    initCabinet();
    setEntries(getCabinetEntries());
  }

  useEffect(() => {
    reload();
  }, []);

  const duplicates = findDuplicateIngredients(entries.map(e => e.medication));

  function handleRemove(packId: string) {
    removeFromCabinet(packId);
    reload();
  }

  async function handleOpenPassport(entry: CabinetEntry) {
    // 1. Check if stored evidence record exists
    let record: VerificationResult | null = null;
    if (entry.pack.evidenceRecordId) {
      record = getEvidenceRecord(entry.pack.evidenceRecordId);
    }
    if (!record) {
      record = getEvidenceForPack(entry.pack.id);
    }

    // 2. Fallback: run simulated verification for demo packs
    if (!record) {
      const scenario =
        entry.medication.id === 'med-examplemed-650' ? SCENARIO_A :
        entry.medication.id === 'med-democetriz-10' ? SCENARIO_B : SCENARIO_D;

      record = await runVerification({
        ...scenario,
        medication: entry.medication,
        pack: entry.pack,
      }, entry.pack.id);
    }

    setPassportData({ entry, result: record });
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
                <MedicineCard
                  key={entry.packId}
                  entry={entry}
                  onRemove={() => handleRemove(entry.packId)}
                  onOpenPassport={() => handleOpenPassport(entry)}
                  onReload={reload}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Passport Modal */}
      {passportData && (
        <MedicinePassportModal
          medication={passportData.entry.medication}
          pack={passportData.entry.pack}
          result={passportData.result}
          onClose={() => setPassportData(null)}
        />
      )}
    </div>
  );
}

function MedicineCard({
  entry,
  onRemove,
  onOpenPassport,
  onReload,
}: {
  entry: CabinetEntry;
  onRemove: () => void;
  onOpenPassport: () => void;
  onReload: () => void;
}) {
  const { medication, pack, status } = entry;
  const { label, cls } = STATUS_CONFIG[status];

  // In-line editing states
  const [editingQty, setEditingQty] = useState(false);
  const [qtyValue, setQtyValue] = useState(pack.quantity?.remaining ?? 0);
  const [qtyUnit, setQtyUnit] = useState(pack.quantity?.unit ?? 'tablets');

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(pack.notes ?? '');

  function saveQty() {
    updatePackQuantity(pack.id, Number(qtyValue), qtyUnit);
    setEditingQty(false);
    onReload();
  }

  function saveNotes() {
    updatePackNotes(pack.id, notesValue);
    setEditingNotes(false);
    onReload();
  }

  function handleMarkOpened() {
    markPackOpened(pack.id, 30); // default 30 days in-use expiry
    onReload();
  }

  return (
    <div className="card--raised" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>{medication.brandName}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--ink-secondary)' }}>
            {medication.genericName} · {medication.strength}
          </div>
        </div>
        <span className={`badge ${cls}`}>{label}</span>
      </div>

      {/* Grid Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
        <MetaItem label="Batch" value={pack.batchEncoded || pack.batchPrinted} />
        
        {/* Effective Expiry (earlier of printed or in-use) */}
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '1px' }}>
            Effective Expiry
          </div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            {entry.effectiveExpiry || pack.expiryEncoded || pack.expiryPrinted || '—'}
            {entry.isEarlierInUse && (
              <span className="badge badge-expiring" style={{ fontSize: '0.6rem', padding: '1px 5px', marginLeft: '6px' }}>
                In-use limit
              </span>
            )}
          </div>
        </div>

        <MetaItem label="Manufacturer" value={medication.manufacturer} />
        {pack.gtin && <MetaItem label="GTIN" value={pack.gtin.slice(-8) + '…'} mono />}
      </div>

      {/* Opened & In-Use Status */}
      <div style={{ padding: '0.5rem 0.625rem', background: 'var(--surface-muted)', borderRadius: 6, fontSize: '0.75rem' }}>
        {pack.openedAt ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: 'var(--ink-faint)' }}>Opened: </span>
              <span style={{ fontWeight: 500 }}>
                {new Date(pack.openedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              {pack.inUseExpiryDays && (
                <span style={{ color: 'var(--ink-muted)', marginLeft: '6px' }}>
                  ({pack.inUseExpiryDays}d in-use limit: {entry.inUseExpiryDate})
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--ink-muted)' }}>Pack unopened</span>
            <button
              onClick={handleMarkOpened}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.7rem', padding: '2px 8px', height: 'auto' }}
              id={`open-${entry.packId}`}
            >
              Mark as opened
            </button>
          </div>
        )}
      </div>

      {/* Quantity & Notes Editing */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
        {/* Quantity */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.375rem 0.5rem' }}>
          {editingQty ? (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                type="number"
                value={qtyValue}
                onChange={e => setQtyValue(Number(e.target.value))}
                style={{ width: '45px', padding: '2px 4px', fontSize: '0.75rem', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <input
                type="text"
                value={qtyUnit}
                onChange={e => setQtyUnit(e.target.value)}
                style={{ width: '55px', padding: '2px 4px', fontSize: '0.75rem', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <button onClick={saveQty} className="btn btn-primary btn-sm" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>✓</button>
              <button onClick={() => setEditingQty(false)} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>Qty:</strong> {pack.quantity ? `${pack.quantity.remaining} ${pack.quantity.unit}` : 'Unset'}
              </span>
              <button onClick={() => setEditingQty(true)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: '0.7rem' }}>
                Edit
              </button>
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.375rem 0.5rem' }}>
          {editingNotes ? (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                type="text"
                value={notesValue}
                onChange={e => setNotesValue(e.target.value)}
                placeholder="Add note..."
                style={{ flex: 1, padding: '2px 4px', fontSize: '0.75rem', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <button onClick={saveNotes} className="btn btn-primary btn-sm" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>✓</button>
              <button onClick={() => setEditingNotes(false)} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                <strong>Note:</strong> {pack.notes || 'None'}
              </span>
              <button onClick={() => setEditingNotes(true)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: '0.7rem' }}>
                {pack.notes ? 'Edit' : '+ Add'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.625rem' }}>
        <button
          onClick={onOpenPassport}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '0.75rem', color: 'var(--teal)' }}
          id={`passport-${entry.packId}`}
        >
          Medicine Passport
        </button>
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
          href="/scan"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '0.75rem' }}
        >
          Re-scan
        </Link>
      </div>
    </div>
  );
}

function MetaItem({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '1px' }}>{label}</div>
      <div style={{ fontSize: '0.8125rem', fontWeight: 500, fontFamily: mono ? 'monospace' : 'inherit' }}>{value || '—'}</div>
    </div>
  );
}
