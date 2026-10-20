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
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 shadow-sm">
      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full pulse-dot" />
      LIVE ENGINE
    </span>
  );
}

function KpiCard({
  label,
  value,
  unit,
  sub,
  subColor = 'text-gray-400',
  icon: Icon,
  accent = '#14b8a6',
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  subColor?: string;
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  accent?: string;
}) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{label}</p>
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: `${accent}18` }}
          >
            <Icon size={16} style={{ color: accent }} />
          </div>
        )}
      </div>
      <p className="text-2xl md:text-3xl font-extrabold text-gray-800 leading-none">
        {value ?? '—'}
        {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </p>
      {sub && (
        <p className={`text-xs mt-2 font-medium flex items-center gap-1 ${subColor}`}>{sub}</p>
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
    <div>
      {/* ── Atmospheric Hero Section (Delhi Grid Intelligence style) ── */}
      <div className="hero-section">
        <div className="hero-bg" />
        <div className="hero-overlay" />
        <div className="hero-content">
          {/* Top Label */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <LiveBadge />
            <span className="text-white/70 text-xs tracking-widest uppercase font-semibold">
              Evidence & Adherence Intelligence
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-4xl md:text-6xl font-black text-white mb-3 leading-tight"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              textShadow: '0 2px 24px rgba(0,0,0,0.4)',
            }}
          >
            Personal Medicine
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg, #34d399, #14b8a6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Evidence Intelligence
            </span>
          </h1>

          <p className="text-white/75 text-base max-w-xl mx-auto mb-8 font-normal leading-relaxed">
            Real-time code-print verification, duplicate ingredient detection & smart adherence
            monitoring for your medicine cabinet.
          </p>

          {/* Quick CTAs inside Hero */}
          <div className="flex items-center justify-center gap-3 mb-10 flex-wrap">
            <Link
              href="/scan"
              className="btn btn-primary"
              style={{
                padding: '0.8rem 1.6rem',
                fontSize: '0.95rem',
                borderRadius: '999px',
                boxShadow: '0 6px 20px rgba(13, 148, 136, 0.45)',
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

          {/* ── 4 KPI Cards Row (Floating across bottom of hero) ── */}
          <div className="max-w-6xl mx-auto flex gap-3.5 justify-center flex-wrap px-4">
            <KpiCard
              label="Cabinet Medicines"
              value={entries.length}
              unit="packs"
              sub={
                <>
                  <TrendingUp size={12} /> Stored in Cabinet
                </>
              }
              subColor="text-teal-600"
              icon={Package}
              accent="#14b8a6"
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
              subColor="text-emerald-600"
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
              subColor={
                expiringSoon > 0 || expired > 0 ? 'text-amber-600' : 'text-emerald-600'
              }
              icon={AlertTriangle}
              accent="#f59e0b"
            />

            <KpiCard
              label="Next Schedule"
              value={nextDue ? formatTime(nextDue.time) : 'All Set'}
              sub={nextDue ? nextDue.name : 'No pending doses'}
              subColor="text-sky-600"
              icon={Clock}
              accent="#60a5fa"
            />
          </div>
        </div>
      </div>

      {/* ── Body Page Content ── */}
      <div className="page-content" style={{ marginTop: '-20px' }}>
        {/* Duplicate Ingredient Warning */}
        <DuplicateWarning entries={entries} />

        {/* Next Medication Scheduled Card */}
        {nextDue && (
          <div
            className="card mb-4"
            style={{ borderLeft: '4px solid var(--teal)', background: '#ffffff' }}
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(20, 184, 166, 0.12)' }}
                >
                  <Activity size={20} className="text-teal-600" />
                </div>
                <div>
                  <div className="card-title mb-0" style={{ color: 'var(--teal)' }}>
                    Upcoming Scheduled Dose
                  </div>
                  <div className="font-bold text-gray-900 text-lg">{nextDue.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Due at {formatTime(nextDue.time)} today
                  </div>
                </div>
              </div>
              <Link
                href="/mediband"
                className="btn btn-primary btn-sm"
                id="dashboard-open-mediband"
              >
                Open Smart Band
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}

        {/* Quick Action Banner */}
        <div
          className="card mb-4"
          style={{
            background: 'linear-gradient(135deg, #f0fdfa 0%, #e6fffa 100%)',
            border: '1px solid #99f6e4',
          }}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <span className="demo-tag mb-1">Evidence Workflow</span>
              <h3 className="font-bold text-gray-900 mt-1">Have a new medicine pack?</h3>
              <p className="text-xs text-gray-600 mt-0.5">
                Scan or enter GS1 DataMatrix / Barcode to run code-print consistency and reference
                registry checks.
              </p>
            </div>
            <Link href="/scan" className="btn btn-primary btn-sm">
              <ScanLine size={15} />
              Start Evidence Check
            </Link>
          </div>
        </div>

        {/* Recent Activity Card */}
        {recentEvents.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="card-title mb-0">Recent Activity</div>
              <Link
                href="/history"
                className="text-xs text-teal-600 font-semibold hover:underline flex items-center gap-1"
              >
                Full History <ArrowRight size={12} />
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {recentEvents.map(event => (
                <div
                  key={event.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-teal-500" />
                    <div>
                      <div className="text-sm font-semibold text-gray-800">
                        {event.medicationName}
                      </div>
                      <div className="text-xs text-gray-400">
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
      className="card mb-4"
      style={{
        borderLeft: '4px solid var(--status-insufficient)',
        background: '#fffbeb',
        borderColor: '#fde68a',
      }}
    >
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div
            className="card-title mb-1"
            style={{ color: 'var(--status-insufficient)', letterSpacing: '0.05em' }}
          >
            ⚠ Duplicate Active Ingredient Warning
          </div>
          {duplicates.map(([id, names]) => (
            <div key={id} className="mt-1">
              <p className="text-xs text-amber-900 font-medium">
                <strong>{names.join(', ')}</strong> share the same active ingredient.
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Always check with a pharmacist or clinician before taking multiple medicines
                together.
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
