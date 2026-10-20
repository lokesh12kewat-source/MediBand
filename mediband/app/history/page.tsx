'use client';

import { useEffect, useState } from 'react';
import { getEvents, initHistory } from '@/store/history-store';
import { MedicationEvent } from '@/types';

function groupByDate(events: MedicationEvent[]): { date: string; events: MedicationEvent[] }[] {
  const map = new Map<string, MedicationEvent[]>();
  for (const event of events) {
    const d = new Date(event.timestamp);
    const key = d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(event);
  }
  return [...map.entries()].map(([date, events]) => ({ date, events }));
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function HistoryPage() {
  const [groups, setGroups] = useState<{ date: string; events: MedicationEvent[] }[]>([]);

  useEffect(() => {
    initHistory();
    const events = getEvents();
    setGroups(groupByDate(events));
  }, []);

  return (
    <div className="page-content">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Medication History</h1>
        <p style={{ fontSize: '0.875rem' }}>Your recorded medication events.</p>
      </div>

      {groups.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No events yet</div>
          <p style={{ fontSize: '0.875rem' }}>Record a TAKEN event from the MediBand simulator.</p>
        </div>
      ) : (
        groups.map(group => (
          <div key={group.date} style={{ marginBottom: '1.25rem' }}>
            <div className="timeline-date">{group.date}</div>
            {group.events.map(event => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function EventRow({ event }: { event: MedicationEvent }) {
  const typeConfig: Record<string, { label: string; cls: string }> = {
    TAKEN:   { label: '✓ TAKEN', cls: 'event-taken' },
    SKIPPED: { label: 'SKIPPED', cls: 'event-skipped' },
    MISSED:  { label: 'MISSED', cls: 'event-missed' },
  };
  const { label, cls } = typeConfig[event.eventType] ?? { label: event.eventType, cls: '' };

  return (
    <div className="timeline-event">
      <div>
        <div className="timeline-event-time">{formatTime(event.timestamp)}</div>
        <div className="timeline-event-med">{event.medicationName}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>{event.strength}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span className={`timeline-event-type ${cls}`}>{label}</span>
        {event.source === 'SIMULATOR' && (
          <span className="demo-tag">Band</span>
        )}
      </div>
    </div>
  );
}
