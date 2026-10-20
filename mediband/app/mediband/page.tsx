'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getSchedules,
  recordEvent,
  undoLastEvent,
  lastTakenAt,
  getEvents,
  initHistory,
} from '@/store/history-store';
import { MedicationSchedule, MedicationEvent } from '@/types';
import { SCHEDULE_DISCLAIMER } from '@/lib/copy';

const UNDO_WINDOW_MS = 30000; // 30-second undo window from spec
const RE_DOSE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes re-dose warning window

function getTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatLastTaken(timestamp?: string): string {
  if (!timestamp) return 'Never recorded';
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function MediBandPage() {
  const [time, setTime] = useState(getTime());
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([]);
  const [recentEvents, setRecentEvents] = useState<MedicationEvent[]>([]);

  // Confirm state: id of schedule pending confirmation
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Re-dose warning message if taken recently
  const [redoseWarning, setRedoseWarning] = useState<string | null>(null);

  // Undo state: id of the last recorded event (for undo) + countdown
  const [undoEventId, setUndoEventId] = useState<string | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const undoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Debounce double-tap guard
  const lastClickRef = useRef<number>(0);

  useEffect(() => {
    const interval = setInterval(() => setTime(getTime()), 10000);
    return () => clearInterval(interval);
  }, []);

  function reloadData() {
    initHistory();
    setSchedules(getSchedules().filter(s => s.active));
    setRecentEvents(getEvents().slice(0, 5));
  }

  useEffect(() => {
    reloadData();
  }, []);

  function requestTaken(schedule: MedicationSchedule) {
    const now = Date.now();
    // Debounce double-taps (ignore clicks within 500ms)
    if (now - lastClickRef.current < 500) return;
    lastClickRef.current = now;

    // Check re-dose safeguard: was it taken within the last 10 minutes?
    const last = lastTakenAt(schedule.medicationId);
    if (last) {
      const elapsed = now - new Date(last.timestamp).getTime();
      if (elapsed < RE_DOSE_WINDOW_MS) {
        const timeStr = formatLastTaken(last.timestamp);
        setRedoseWarning(`Already marked taken at ${timeStr}. Record again?`);
        setConfirmId(schedule.id);
        return;
      }
    }

    setRedoseWarning(null);
    setConfirmId(schedule.id);
  }

  function cancelConfirm() {
    setConfirmId(null);
    setRedoseWarning(null);
  }

  function confirmTaken(schedule: MedicationSchedule) {
    setConfirmId(null);
    setRedoseWarning(null);

    const eventId = recordEvent(
      schedule.medicationId,
      schedule.medicationName,
      schedule.strength,
      'TAKEN',
      'SIMULATOR',
    );
    reloadData();

    // Start 30-second undo window
    setUndoEventId(eventId);
    setUndoCountdown(Math.ceil(UNDO_WINDOW_MS / 1000));

    if (undoTimer.current) clearInterval(undoTimer.current);
    undoTimer.current = setInterval(() => {
      setUndoCountdown(prev => {
        if (prev <= 1) {
          clearInterval(undoTimer.current!);
          setUndoEventId(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function handleUndo() {
    if (!undoEventId) return;
    undoLastEvent(undoEventId);
    if (undoTimer.current) clearInterval(undoTimer.current);
    setUndoEventId(null);
    setUndoCountdown(0);
    reloadData();
  }

  const primarySchedule = schedules[0];
  const primaryLastTaken = primarySchedule ? lastTakenAt(primarySchedule.medicationId) : null;

  return (
    <div className="page-content" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>MediBand</h1>
        <p style={{ fontSize: '0.875rem' }}>Simulated wearable device & adherence tracker.</p>
      </div>

      {/* Undo banner (30s) */}
      {undoEventId && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            background: 'var(--status-strong-bg)',
            border: '1px solid var(--status-strong)',
            borderRadius: 8,
            gap: '1rem',
          }}
          role="status"
        >
          <span style={{ fontSize: '0.8125rem', color: 'var(--status-strong)', fontWeight: 600 }}>
            ✓ Dose recorded — undo available for {undoCountdown}s
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleUndo}
            style={{ fontSize: '0.75rem', borderColor: 'var(--status-strong)', color: 'var(--status-strong)' }}
            id="undo-taken-btn"
          >
            Undo
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '2rem' }}>
        {/* Device simulator */}
        <div style={{ flexShrink: 0 }}>
          <DeviceSimulator
            time={time}
            schedule={primarySchedule}
            lastTakenStr={formatLastTaken(primaryLastTaken?.timestamp)}
            confirmPending={confirmId === primarySchedule?.id}
            redoseWarning={confirmId === primarySchedule?.id ? redoseWarning : null}
            onTaken={() => primarySchedule && requestTaken(primarySchedule)}
            onConfirm={() => primarySchedule && confirmTaken(primarySchedule)}
            onCancel={cancelConfirm}
          />
        </div>

        {/* Schedule info & Adherence safeguards */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title">Active schedule</div>
            {schedules.length === 0 ? (
              <p style={{ fontSize: '0.8125rem' }}>No active schedules.</p>
            ) : (
              schedules.map(sched => {
                const last = lastTakenAt(sched.medicationId);
                return (
                  <div key={sched.id} style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        {sched.medicationName} · {sched.strength}
                      </div>
                      <span className="demo-tag" style={{ fontSize: '0.65rem' }}>
                        Source: {sched.source}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      {sched.times.map(t => (
                        <span
                          key={t}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.2rem 0.5rem',
                            background: 'var(--orange-pale)',
                            color: 'var(--orange)',
                            borderRadius: 4,
                            fontWeight: 600,
                          }}
                        >
                          {formatTime(t)}
                        </span>
                      ))}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                      Last taken: <strong>{formatLastTaken(last?.timestamp)}</strong>
                    </div>
                  </div>
                );
              })
            )}

            <p style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginTop: '0.5rem', lineHeight: 1.4 }}>
              ℹ {SCHEDULE_DISCLAIMER}
            </p>
          </div>

          {/* Quick mark-taken buttons with confirmation & re-dose warning */}
          {schedules.map(sched => (
            <div key={sched.id} style={{ marginBottom: '0.625rem' }}>
              {confirmId === sched.id ? (
                <div
                  style={{
                    padding: '0.875rem',
                    background: redoseWarning ? '#FFF1F2' : 'var(--orange-pale)',
                    border: `1px solid ${redoseWarning ? '#F43F5E' : 'var(--orange)'}`,
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: redoseWarning ? '#BE123C' : 'inherit' }}>
                    {redoseWarning ? `⚠ ${redoseWarning}` : `Confirm: ${sched.medicationName} ${sched.strength}?`}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                    MediBand does not prescribe doses. Only record if you have taken this dose.
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => confirmTaken(sched)}
                      id={`confirm-taken-${sched.id}`}
                    >
                      ✓ Yes, taken
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={cancelConfirm}
                      id={`cancel-taken-${sched.id}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-ghost btn-sm btn-full"
                  onClick={() => requestTaken(sched)}
                  id={`taken-${sched.id}`}
                  style={{ justifyContent: 'space-between' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>◯ Mark as taken:</span>
                    <strong>{sched.medicationName}</strong>
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--ink-faint)' }}>Tap to log</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent events from simulator */}
      {recentEvents.length > 0 && (
        <div className="card">
          <div className="card-title">Recent adherence events</div>
          {recentEvents.map(event => (
            <div
              key={event.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{event.medicationName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>
                  {new Date(event.timestamp).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                  {event.scheduledFor && ` · Scheduled for ${event.scheduledFor}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                <span className={`timeline-event-type ${event.eventType === 'TAKEN' ? 'event-taken' : 'event-missed'}`}>
                  {event.eventType === 'TAKEN' ? '✓ TAKEN' : event.eventType}
                </span>
                {event.source === 'SIMULATOR' && <span className="demo-tag">Band</span>}
              </div>
            </div>
          ))}
          <Link
            href="/history"
            style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--orange)', fontWeight: 500 }}
          >
            View full medication history →
          </Link>
        </div>
      )}

      {/* Future hardware note */}
      <div style={{ marginTop: '1.5rem', padding: '0.875rem 1rem', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '0.375rem' }}>
          Future hardware
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)', lineHeight: 1.55 }}>
          Production MediBand: ESP32-S3 · BLE · OLED display · Vibration alert · Physical button. Web BLE integration planned for next phase.
        </div>
      </div>
    </div>
  );
}

function DeviceSimulator({
  time,
  schedule,
  lastTakenStr,
  confirmPending,
  redoseWarning,
  onTaken,
  onConfirm,
  onCancel,
}: {
  time: string;
  schedule?: MedicationSchedule;
  lastTakenStr: string;
  confirmPending: boolean;
  redoseWarning: string | null;
  onTaken: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mediband-device" role="region" aria-label="MediBand device simulator">
      <div className="mediband-label">MEDIBAND</div>
      <div className="mediband-sublabel">SIMULATED</div>

      <div className="mediband-time" aria-live="polite">{time}</div>

      {schedule ? (
        <>
          <div className="mediband-med-name">{schedule.medicationName}</div>
          <div className="mediband-med-dose">{schedule.strength}</div>

          {/* Last taken display on device */}
          <div style={{ fontSize: '0.625rem', color: '#888', marginTop: '2px', marginBottom: '8px' }}>
            Last: {lastTakenStr}
          </div>

          {confirmPending ? (
            <>
              <div
                className="mediband-alert"
                aria-live="polite"
                style={{ fontSize: '0.52rem', color: redoseWarning ? '#FB7185' : 'var(--orange)' }}
              >
                {redoseWarning ? 'RE-DOSE? CONFIRM' : 'CONFIRM TAKEN?'}
              </div>
              <button
                className="mediband-btn"
                onClick={onConfirm}
                id="mediband-confirm-btn"
                aria-label="Confirm taken"
              >
                ✓ YES
              </button>
              <button
                onClick={onCancel}
                style={{
                  marginTop: '0.5rem',
                  background: 'none',
                  border: 'none',
                  color: '#aaa',
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                }}
              >
                CANCEL
              </button>
            </>
          ) : (
            <>
              <div className="mediband-alert" aria-live="polite">MEDICATION DUE</div>
              <button
                className="mediband-btn"
                onClick={onTaken}
                id="mediband-taken-btn"
                aria-label="Mark medication as taken"
              >
                ✓ TAKEN
              </button>
            </>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#555', marginTop: '0.5rem' }}>
          No schedule active
        </div>
      )}
    </div>
  );
}
