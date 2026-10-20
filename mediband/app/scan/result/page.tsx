'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getScenario } from '@/data/demo-scenarios';
import { runVerification } from '@/lib/verification-engine';
import { addToCabinet } from '@/store/cabinet-store';
import { VerificationResult, DemoScenario, MedicationPack } from '@/types';
import EvidenceLedger from '@/components/evidence/EvidenceLedger';
import AssessmentBanner from '@/components/evidence/AssessmentBanner';
import MedicinePassportModal from '@/components/passport/MedicinePassportModal';
import CodePrintComparison from '@/components/evidence/CodePrintComparison';
import LimitationsBox from '@/components/evidence/LimitationsBox';

function generateId() {
  return `pack-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function ScanResultPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [scenario, setScenario] = useState<DemoScenario | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [addedToCabinet, setAddedToCabinet] = useState(false);
  const [showPassport, setShowPassport] = useState(false);

  useEffect(() => {
    const sid = searchParams.get('scenario') ?? 'A';
    const demo = getScenario(sid);
    if (!demo) { router.push('/scan'); return; }
    setScenario(demo);

    const packId = generateId();
    runVerification(demo, packId).then(r => {
      setResult(r);
      setLoading(false);
    });
  }, [searchParams, router]);

  function handleAddToCabinet() {
    if (!scenario || !result) return;
    const pack: MedicationPack = {
      id: result.packId,
      medicationId: scenario.medication.id,
      gtin: scenario.pack.gtin ?? '',
      batchEncoded: scenario.pack.batchEncoded ?? '',
      batchPrinted: scenario.pack.batchPrinted ?? '',
      expiryEncoded: scenario.pack.expiryEncoded ?? '',
      expiryPrinted: scenario.pack.expiryPrinted ?? '',
      serial: scenario.pack.serial,
      addedAt: new Date().toISOString(),
      verificationId: result.id,
    };
    addToCabinet(scenario.medication, pack);
    setAddedToCabinet(true);
  }

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--orange)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <div style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>Processing evidence…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!scenario || !result) return null;

  const medication = scenario.medication;
  const pack = scenario.pack;

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => router.push('/scan')} style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', cursor: 'pointer', fontSize: '0.875rem', marginBottom: '0.75rem', padding: 0 }}>
          ← Back to Scan
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <h1 style={{ fontSize: '1.375rem' }}>Scan Result</h1>
          <span className="demo-tag">Demo · Scenario {scenario.id}</span>
        </div>
        <p style={{ fontSize: '0.875rem' }}>
          {new Date(result.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>

      {/* Assessment Banner */}
      <AssessmentBanner assessment={result.assessment} />

      {/* What We Found */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title">What we found</div>
        <div style={{ display: 'grid', gap: '0.875rem' }}>
          <FieldRow label="Product" value={medication.brandName || '—'} />
          <FieldRow label="Generic" value={medication.genericName || <MissingTag />} />
          <FieldRow label="Strength" value={medication.strength || <MissingTag />} />
          <FieldRow label="Manufacturer" value={medication.manufacturer} />
          <FieldRow label="GTIN" value={pack.gtin || <MissingTag />} />
          <FieldRow label="Batch" value={pack.batchEncoded || <MissingTag />} />
          <FieldRow label="Expiry" value={pack.expiryEncoded || <MissingTag />} />
          {pack.serial && <FieldRow label="Serial" value={pack.serial} />}
        </div>
      </div>

      {/* Code vs Print Comparison */}
      {(result.codePrint.encodedBatch || result.codePrint.printedBatch) && (
        <CodePrintComparison codePrint={result.codePrint} />
      )}

      {/* Evidence Ledger */}
      <EvidenceLedger claims={result.claims} providerResults={result.providerResults} />

      {/* Limitations */}
      <LimitationsBox limitations={result.limitations} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
        {!addedToCabinet ? (
          <button
            className="btn btn-primary"
            onClick={handleAddToCabinet}
            id="add-to-cabinet-btn"
          >
            Add to Cabinet
          </button>
        ) : (
          <span className="btn" style={{ background: 'var(--status-strong-bg)', color: 'var(--status-strong)', cursor: 'default' }}>
            ✓ Added to Cabinet
          </span>
        )}
        <button
          className="btn btn-ghost"
          onClick={() => setShowPassport(true)}
          id="view-passport-btn"
        >
          Medicine Passport
        </button>
      </div>

      {/* Passport Modal */}
      {showPassport && result && (
        <MedicinePassportModal
          medication={medication}
          pack={pack as MedicationPack}
          result={result}
          onClose={() => setShowPassport(false)}
        />
      )}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.875rem', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function MissingTag() {
  return (
    <span style={{ fontSize: '0.75rem', color: 'var(--status-insufficient)', fontWeight: 600 }}>
      — Insufficient evidence
    </span>
  );
}
