'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCabinetEntries } from '@/store/cabinet-store';
import { getEvents, getNextDueSchedule } from '@/store/history-store';
import { CabinetEntry, MedicationEvent } from '@/types';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function DashboardPage() {
  const [entries, setEntries] = useState<CabinetEntry[]>([]);
  const [recentEvents, setRecentEvents] = useState<MedicationEvent[]>([]);
  const [nextDue, setNextDue] = useState<{ name: string; time: string } | null>(null);

  useEffect(() => {
    const allEntries = getCabinetEntries();
    setEntries(allEntries);

    const events = getEvents().slice(0, 5);
    setRecentEvents(events);

    const next = getNextDueSchedule();
    if (next) {
      setNextDue({ name: next.schedule.medicationName, time: next.time });
    }
  }, []);

  const inDate = entries.filter(e => e.status === 'in-date').length;
  const expiringSoon = entries.filter(e => e.status === 'expiring-soon').length;
  const expired = entries.filter(e => e.status === 'expired').length;
  const needsReview = entries.filter(e => e.status === 'needs-review').length;

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>{greeting()}</h1>
        <p style={{ fontSize: '0.95rem' }}>Your medication overview</p>
      </div>

      {/* Overview Stats */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title">Medicine Cabinet</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <StatItem value={entries.length} label="Medicines" />
          {expiringSoon > 0 && <StatItem value={expiringSoon} label="Expiring soon" accent="var(--status-insufficient)" />}
          {expired > 0 && <StatItem value={expired} label="Expired" accent="var(--status-expired)" />}
          {needsReview > 0 && <StatItem value={needsReview} label="Needs review" accent="var(--status-conflict)" />}
          {expiringSoon === 0 && expired === 0 && needsReview === 0 && (
            <StatItem value="All clear" label="Status" accent="var(--status-strong)" isText />
          )}
        </div>
      </div>

      {/* Duplicate Ingredient Warning */}
      <DuplicateWarning entries={entries} />

      {/* Next Medication */}
      {nextDue && (
        <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--orange)' }}>
          <div className="card-title">Next medication</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>{nextDue.name}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', marginTop: '2px' }}>
                Due at {formatTime(nextDue.time)}
              </div>
            </div>
            <Link href="/mediband" className="btn btn-primary btn-sm" id="dashboard-open-mediband">
              Open Band
            </Link>
          </div>
        </div>
      )}

      {/* CTA */}
      <Link href="/scan" className="btn btn-primary btn-full" style={{ marginBottom: '1.5rem', padding: '0.875rem' }} id="dashboard-scan-cta">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 4V2.5A1.5 1.5 0 012.5 1H4"/>
          <path d="M12 1h1.5A1.5 1.5 0 0115 2.5V4"/>
          <path d="M15 12v1.5A1.5 1.5 0 0113.5 15H12"/>
          <path d="M4 15H2.5A1.5 1.5 0 011 13.5V12"/>
          <line x1="1" y1="8" x2="15" y2="8"/>
        </svg>
        Scan Medicine
      </Link>

      {/* Recent Activity */}
      {recentEvents.length > 0 && (
        <div className="card">
          <div className="card-title">Recent activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {recentEvents.map(event => (
              <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{event.medicationName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>{formatEventTime(event.timestamp)}</div>
                </div>
                <span className={`badge ${event.eventType === 'TAKEN' ? 'badge-indate' : 'badge-conflict'}`}>
                  {event.eventType === 'TAKEN' ? '✓ Taken' : event.eventType.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
          <Link href="/history" style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--orange)', fontWeight: 500 }}>
            View full history →
          </Link>
        </div>
      )}
    </div>
  );
}

function StatItem({
  value,
  label,
  accent,
  isText,
}: {
  value: number | string;
  label: string;
  accent?: string;
  isText?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: isText ? '1.1rem' : '1.75rem', fontWeight: 700, color: accent ?? 'var(--ink)', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

function DuplicateWarning({ entries }: { entries: CabinetEntry[] }) {
  const ingredientMap = new Map<string, string[]>();
  for (const e of entries) {
    const id = e.medication.activeIngredientId;
    if (!ingredientMap.has(id)) ingredientMap.set(id, []);
    ingredientMap.get(id)!.push(e.medication.brandName);
  }

  const duplicates = [...ingredientMap.entries()].filter(([, names]) => names.length > 1);
  if (duplicates.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--status-insufficient)' }}>
      <div className="card-title" style={{ color: 'var(--status-insufficient)' }}>⚠ Possible duplicate active ingredient</div>
      {duplicates.map(([id, names]) => (
        <div key={id}>
          <p style={{ fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
            <strong>{names.join(', ')}</strong> appear to contain the same active ingredient.
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
            Please confirm with a doctor or pharmacist before taking both.
          </p>
        </div>
      ))}
    </div>
  );
}
