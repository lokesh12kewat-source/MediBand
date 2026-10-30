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
  ChevronRight,
  Zap,
  ShieldCheck,
  BarChart3,
  Database,
  Pill,
} from 'lucide-react';

function KpiCard({
  label,
  value,
  unit,
  sub,
  subColor = '#64748B',
  icon: Icon,
  accent = '#FF6115',
  bgAccent = '#FFF0E8',
  href,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  subColor?: string;
  icon?: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;
  accent?: string;
  bgAccent?: string;
  href?: string;
}) {
  const content = (
    <div className="kpi-card-light">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
        {Icon && (
          <div
            className="kpi-icon-box"
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: bgAccent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={22} color={accent} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="kpi-label-light">{label}</div>
          <div className="kpi-value-light">
            {value ?? '—'}
            {unit && <span className="kpi-unit-light">{unit}</span>}
          </div>
          {sub && (
            <div className="kpi-sub-light" style={{ color: subColor }}>
              {sub}
            </div>
          )}
        </div>
      </div>
      <div className="kpi-chevron-btn">
        <ChevronRight size={15} color="#94A3B8" />
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </Link>
    );
  }
  return content;
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
      {/* ── Atmospheric Clean Light Theme Hero Section ── */}
      <section className="hero-section-light">
        <div className="hero-container">
          {/* Main Hero Top Row (Two Columns: Text & Live CTAs + 3D Medicine & Smart Scanner Visual) */}
          <div className="hero-main-row">
            {/* Left Column: Headlines & Actions */}
            <div className="hero-text-col">
              {/* Top Engine Badge */}
              <div className="hero-badge-wrap-light">
                <div className="hero-live-badge-light">
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
                <span className="hero-label-light">
                  EVIDENCE & ADHERENCE INTELLIGENCE
                </span>
              </div>

              {/* Headline */}
              <h1 className="hero-title-light">
                Personal Medicine
                <br />
                <span className="hero-title-orange-light">Evidence Intelligence</span>
              </h1>

              {/* Description */}
              <p className="hero-description-light">
                Real-time code-print verification, duplicate ingredient detection and smart adherence
                monitoring for your medicine cabinet.
              </p>

              {/* Action Buttons */}
              <div className="hero-actions-light">
                <Link
                  href="/scan"
                  className="btn-scan-orange"
                  id="dashboard-scan-cta"
                >
                  <ScanLine size={18} />
                  <span>Scan Medicine Pack</span>
                  <ArrowRight size={16} />
                </Link>

                <Link
                  href="/cabinet"
                  className="btn-view-cabinet"
                >
                  <Archive size={17} color="#475569" />
                  <span>View Cabinet ({entries.length})</span>
                </Link>
              </div>
            </div>

            {/* Right Column: 3D Medicine Box & MediBand Scanner Visual */}
            <div className="hero-artwork-col">
              <img
                src="/hero_3d_artwork.png"
                alt="MediBand 3D Smart Scanner & Medicine Authentication"
                className="hero-artwork-img"
              />
            </div>
          </div>

          {/* ── 4 Floating Light KPI Cards Row ── */}
          <div className="kpi-grid-light">
            <KpiCard
              label="CABINET MEDICINES"
              value={entries.length}
              unit="packs"
              sub={
                <>
                  <TrendingUp size={13} />
                  <span>Stored in Cabinet</span>
                </>
              }
              subColor="#FF6115"
              icon={Package}
              accent="#FF6115"
              bgAccent="#FFF0E8"
              href="/cabinet"
            />

            <KpiCard
              label="IN DATE"
              value={inDate}
              unit="verified"
              sub={
                <>
                  <CheckCircle2 size={13} />
                  <span>Shelf Life Valid</span>
                </>
              }
              subColor="#10B981"
              icon={CheckCircle2}
              accent="#10B981"
              bgAccent="#ECFDF5"
              href="/cabinet"
            />

            <KpiCard
              label="ATTENTION NEEDED"
              value={expiringSoon + expired + needsReview}
              unit="items"
              sub={
                <>
                  <Clock size={13} />
                  <span>
                    {expiringSoon > 0
                      ? `${expiringSoon} Expiring Soon`
                      : expired > 0
                      ? `${expired} Expired`
                      : 'Shelf Life Clear'}
                  </span>
                </>
              }
              subColor="#D97706"
              icon={AlertTriangle}
              accent="#F59E0B"
              bgAccent="#FEF3C7"
              href="/cabinet"
            />

            <KpiCard
              label="NEXT SCHEDULE"
              value={nextDue ? formatTime(nextDue.time) : '8:00 AM'}
              sub={
                <>
                  <Pill size={13} />
                  <span>{nextDue ? nextDue.name : 'ExampleMed 650'}</span>
                </>
              }
              subColor="#0284C7"
              icon={Clock}
              accent="#0284C7"
              bgAccent="#E0F2FE"
              href="/cabinet"
            />
          </div>

          {/* ── 4-Pillar Feature Bar ── */}
          <div className="hero-feature-bar">
            <div className="hero-feature-item">
              <div className="hero-feature-icon" style={{ background: '#FFF0E8', color: '#FF6115' }}>
                <Zap size={19} />
              </div>
              <div>
                <div className="hero-feature-title">Instant Verification</div>
                <div className="hero-feature-sub">Scan &amp; verify in seconds</div>
              </div>
            </div>

            <div className="hero-feature-item">
              <div className="hero-feature-icon" style={{ background: '#ECFDF5', color: '#10B981' }}>
                <ShieldCheck size={19} />
              </div>
              <div>
                <div className="hero-feature-title">Duplicate Detection</div>
                <div className="hero-feature-sub">Avoid harmful interactions</div>
              </div>
            </div>

            <div className="hero-feature-item">
              <div className="hero-feature-icon" style={{ background: '#FFF0E8', color: '#FF6115' }}>
                <BarChart3 size={19} />
              </div>
              <div>
                <div className="hero-feature-title">Adherence Monitoring</div>
                <div className="hero-feature-sub">Never miss a dose</div>
              </div>
            </div>

            <div className="hero-feature-item" style={{ borderRight: 'none' }}>
              <div className="hero-feature-icon" style={{ background: '#E0F2FE', color: '#0284C7' }}>
                <Database size={19} />
              </div>
              <div>
                <div className="hero-feature-title">Trusted Sources</div>
                <div className="hero-feature-sub">Government &amp; regulatory databases</div>
              </div>
            </div>
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
