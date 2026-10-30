'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCabinetEntries, initCabinet } from '@/store/cabinet-store';
import { getEvents, getNextDueSchedule, initHistory } from '@/store/history-store';
import { CabinetEntry, MedicationEvent } from '@/types';
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ScanLine,
  Archive,
  ArrowRight,
  TrendingUp,
  Activity,
  AlertCircle,
} from 'lucide-react';

function KpiCard({
  label,
  value,
  unit,
  sub,
  subColor = '#94a3b8',
  icon: Icon,
  accent = '#FF6115',
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  subColor?: string;
  icon?: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;
  accent?: string;
}) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="kpi-header">
        <span className="kpi-label">{label}</span>
        {Icon && (
          <div className="kpi-icon-wrap" style={{ background: `${accent}18` }}>
            <Icon size={16} color={accent} />
          </div>
        )}
      </div>
      <div className="kpi-value">
        {value ?? '—'}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {sub && (
        <div className="kpi-sub" style={{ color: subColor }}>
          {sub}
        </div>
      )}
    </div>
  );
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
    initCabinet();
    initHistory();

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
    <div style={{ width: '100%' }}>
      {/* ── Atmospheric Hero Section (Global World Map with MediBand Orange) ── */}
      <section className="hero-section">
        <div className="hero-bg" />
        <div className="hero-overlay" />
        <div className="hero-content">
          {/* Top Label */}
          <div className="hero-badge-wrap">
            <div className="hero-live-badge">
              <span
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#FF6115',
                }}
              />
              <span>LIVE ENGINE</span>
            </div>
            <span className="hero-label">Evidence & Adherence Intelligence</span>
          </div>

          {/* Headline */}
          <h1 className="hero-title">
            Personal Medicine
            <br />
            <span className="hero-title-gradient">Evidence Intelligence</span>
          </h1>

          <p className="hero-description">
            Real-time code-print verification, duplicate ingredient detection & smart adherence
            monitoring for your medicine cabinet.
          </p>

          {/* Quick Action CTAs */}
          <div className="hero-actions">
            <Link
              href="/scan"
              className="btn btn-primary"
              style={{
                padding: '0.8rem 1.6rem',
                fontSize: '0.95rem',
                borderRadius: '999px',
                boxShadow: '0 6px 20px rgba(255, 97, 21, 0.45)',
              }}
              id="dashboard-scan-cta"
            >
              <ScanLine size={18} />
              Scan Medicine Pack
            </Link>
            <Link
              href="/cabinet"
              className="btn btn-ghost"
              style={{
                padding: '0.8rem 1.4rem',
                fontSize: '0.95rem',
                borderRadius: '999px',
                color: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.35)',
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Archive size={18} />
              View Cabinet ({entries.length})
            </Link>
          </div>

          {/* ── 4 Floating KPI Cards Row ── */}
          <div className="kpi-grid">
            <KpiCard
              label="Cabinet Medicines"
              value={entries.length}
              unit="packs"
              sub={
                <>
                  <TrendingUp size={12} /> Stored in Cabinet
                </>
              }
              subColor="#EA580C"
              icon={Package}
              accent="#FF6115"
            />

            <KpiCard
              label="In Date"
              value={inDate}
              unit="verified"
              sub={
                <>
                  <CheckCircle2 size={12} /> Shelf Life Valid
                </>
              }
              subColor="#059669"
              icon={CheckCircle2}
              accent="#10b981"
            />

            <KpiCard
              label="Attention Needed"
              value={expiringSoon + expired + needsReview}
              unit="items"
              sub={
                expiringSoon > 0
                  ? `${expiringSoon} Expiring Soon`
                  : expired > 0
                  ? `${expired} Expired`
                  : 'All In Date & Clear'
              }
              subColor={expiringSoon > 0 || expired > 0 ? '#d97706' : '#059669'}
              icon={AlertTriangle}
              accent="#f59e0b"
            />

            <KpiCard
              label="Next Schedule"
              value={nextDue ? formatTime(nextDue.time) : 'All Set'}
              sub={nextDue ? nextDue.name : 'No pending doses'}
              subColor="#0284c7"
              icon={Clock}
              accent="#60a5fa"
            />
          </div>
        </div>
      </section>

      {/* ── Dashboard Content Body ── */}
      <div className="dashboard-body">
        {/* Duplicate Ingredient Warning */}
        <DuplicateWarning entries={entries} />

        {/* Next Medication Scheduled Card */}
        {nextDue && (
          <div
            className="card"
            style={{
              borderLeft: '4px solid var(--orange)',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(255, 97, 21, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Activity size={22} color="#FF6115" />
              </div>
              <div>
                <div className="card-title" style={{ color: 'var(--orange)', marginBottom: 2 }}>
                  Upcoming Scheduled Dose
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#1e293b' }}>
                  {nextDue.name}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                  Due at {formatTime(nextDue.time)} today
                </div>
              </div>
            </div>
            <Link
              href="/mediband"
              className="btn btn-primary btn-sm"
              id="dashboard-open-mediband"
              style={{ gap: 6 }}
            >
              Open Smart Band
              <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* Quick Action Banner */}
        <div
          className="card"
          style={{
            background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)',
            border: '1px solid #FED7AA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <span className="demo-tag" style={{ marginBottom: 6 }}>
              Evidence Workflow
            </span>
            <h3 style={{ fontWeight: 800, color: '#9A3412', margin: '4px 0 2px' }}>
              Have a new medicine pack?
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#C2410C', margin: 0 }}>
              Scan or enter GS1 DataMatrix / Barcode to run code-print consistency and reference
              registry checks.
            </p>
          </div>
          <Link href="/scan" className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <ScanLine size={15} />
            Start Evidence Check
          </Link>
        </div>

        {/* Recent Activity Card */}
        {recentEvents.length > 0 && (
          <div className="card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}
            >
              <div className="card-title" style={{ margin: 0 }}>
                Recent Activity
              </div>
              <Link
                href="/history"
                style={{
                  fontSize: '0.8rem',
                  color: '#FF6115',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Full History <ArrowRight size={12} />
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentEvents.map(event => (
                <div
                  key={event.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#FF6115',
                        display: 'inline-block',
                      }}
                    />
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>
                        {event.medicationName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {formatEventTime(event.timestamp)}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`badge ${
                      event.eventType === 'TAKEN' ? 'badge-indate' : 'badge-conflict'
                    }`}
                  >
                    {event.eventType === 'TAKEN' ? '✓ Recorded' : event.eventType.toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DuplicateWarning({ entries }: { entries: CabinetEntry[] }) {
  const ingredientMap = new Map<string, string[]>();
  for (const e of entries) {
    const id = e.medication.activeIngredientId;
    if (!id) continue;
    if (!ingredientMap.has(id)) ingredientMap.set(id, []);
    ingredientMap.get(id)!.push(e.medication.brandName);
  }

  const duplicates = [...ingredientMap.entries()].filter(([, names]) => names.length > 1);
  if (duplicates.length === 0) return null;

  return (
    <div
      className="card"
      style={{
        borderLeft: '4px solid var(--status-insufficient)',
        background: '#fffbeb',
        borderColor: '#fde68a',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <AlertCircle size={22} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <div
          className="card-title"
          style={{
            color: 'var(--status-insufficient)',
            letterSpacing: '0.05em',
            marginBottom: 4,
          }}
        >
          ⚠ Duplicate Active Ingredient Warning
        </div>
        {duplicates.map(([id, names]) => (
          <div key={id} style={{ marginTop: 4 }}>
            <p style={{ fontSize: '0.85rem', color: '#78350f', fontWeight: 600, margin: 0 }}>
              <strong>{names.join(', ')}</strong> share the same active ingredient.
            </p>
            <p style={{ fontSize: '0.78rem', color: '#92400e', margin: '2px 0 0' }}>
              Always check with a pharmacist or clinician before taking multiple medicines together.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
