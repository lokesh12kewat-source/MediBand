'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSchedules, recordEvent, getEvents } from '@/store/history-store';
import { MedicationSchedule, MedicationEvent } from '@/types';

function getTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function MediBandPage() {
  const [time, setTime] = useState(getTime());
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([]);
  const [recentEvents, setRecentEvents] = useState<MedicationEvent[]>([]);
  const [justTaken, setJustTaken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const interval = setInterval(() => setTime(getTime()), 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSchedules(getSchedules().filter(s => s.active));
    setRecentEvents(getEvents().slice(0, 3));
  }, []);

  function handleTaken(schedule: MedicationSchedule) {
    recordEvent(
      schedule.medicationId,
      schedule.medicationName,
      schedule.strength,
      'TAKEN',
      'SIMULATOR',
    );
    setJustTaken(prev => ({ ...prev, [schedule.id]: true }));
    setRecentEvents(getEvents().slice(0, 3));
    setTimeout(() => {
      setJustTaken(prev => ({ ...prev, [schedule.id]: false }));
    }, 3000);
  }

  const primarySchedule = schedules[0];

  return (
    <div className="page-content" style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>MediBand</h1>
        <p style={{ fontSize: '0.875rem' }}>Simulated wearable device.</p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '2rem' }}>
        {/* Device simulator */}
        <div style={{ flexShrink: 0 }}>
          <DeviceSimulator
            time={time}
            schedule={primarySchedule}
            taken={primarySchedule ? !!justTaken[primarySchedule.id] : false}
            onTaken={() => primarySchedule && handleTaken(primarySchedule)}
          />
        </div>

        {/* Schedule info */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-title">Active schedule</div>
            {schedules.length === 0 ? (
              <p style={{ fontSize: '0.8125rem' }}>No active schedules.</p>
            ) : (
              schedules.map(sched => (
                <div key={sched.id} style={{ marginBottom: '0.875rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '4px' }}>
                    {sched.medicationName} · {sched.strength}
                  </div>
                  <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                    {sched.times.map(t => (
                      <span key={t} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'var(--orange-pale)', color: 'var(--orange)', borderRadius: 4, fontWeight: 600 }}>
                        {formatTime(t)}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Manual record for any schedule */}
          {schedules.map(sched => (
            <div key={sched.id} style={{ marginBottom: '0.5rem' }}>
              <button
                className="btn btn-ghost btn-sm btn-full"
                onClick={() => handleTaken(sched)}
                id={`taken-${sched.id}`}
                disabled={!!justTaken[sched.id]}
                style={{ justifyContent: 'flex-start', gap: '0.5rem' }}
              >
                {justTaken[sched.id] ? '✓ Recorded' : '◯ Mark as taken'}
                <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>{sched.medicationName}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Recent events from simulator */}
      {recentEvents.length > 0 && (
        <div className="card">
          <div className="card-title">Recent events</div>
          {recentEvents.map(event => (
            <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{event.medicationName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>
                  {new Date(event.timestamp).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
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
          <Link href="/history" style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--orange)', fontWeight: 500 }}>
            View full history →
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
  taken,
  onTaken,
}: {
  time: string;
  schedule?: MedicationSchedule;
  taken: boolean;
  onTaken: () => void;
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
          {!taken ? (
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
          ) : (
            <>
              <div style={{ textAlign: 'center', fontSize: '0.65rem', color: '#4ADE80', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '1rem' }}>
                ✓ RECORDED
              </div>
              <button className="mediband-btn mediband-btn-taken" disabled>
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
