'use client';

import { MedicationEvent, EventType, EventSource, MedicationSchedule } from '@/types';
import { DEMO_MEDICATION } from '@/data/demo-scenarios';

const EVENTS_KEY = 'mediband_events_v1';
const SCHEDULE_KEY = 'mediband_schedule_v1';

function generateId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

// ─── Seed Events (for demo) ───────────────────────────────────────────────────

function makeSeedEvents(): MedicationEvent[] {
  const now = new Date();
  const events: MedicationEvent[] = [];

  // Today at 8am
  const today8am = new Date(now);
  today8am.setHours(8, 0, 0, 0);
  if (today8am < now) {
    events.push({
      id: generateId(),
      medicationId: DEMO_MEDICATION.id,
      medicationName: DEMO_MEDICATION.brandName,
      strength: DEMO_MEDICATION.strength,
      eventType: 'TAKEN',
      timestamp: today8am.toISOString(),
      source: 'USER',
    });
  }

  // Yesterday 8pm
  const yest8pm = new Date(now);
  yest8pm.setDate(yest8pm.getDate() - 1);
  yest8pm.setHours(20, 5, 0, 0);
  events.push({
    id: generateId(),
    medicationId: DEMO_MEDICATION.id,
    medicationName: DEMO_MEDICATION.brandName,
    strength: DEMO_MEDICATION.strength,
    eventType: 'TAKEN',
    timestamp: yest8pm.toISOString(),
    source: 'USER',
  });

  // Yesterday 8am
  const yest8am = new Date(now);
  yest8am.setDate(yest8am.getDate() - 1);
  yest8am.setHours(8, 0, 0, 0);
  events.push({
    id: generateId(),
    medicationId: DEMO_MEDICATION.id,
    medicationName: DEMO_MEDICATION.brandName,
    strength: DEMO_MEDICATION.strength,
    eventType: 'TAKEN',
    timestamp: yest8am.toISOString(),
    source: 'USER',
  });

  // 2 days ago 8pm
  const two8pm = new Date(now);
  two8pm.setDate(two8pm.getDate() - 2);
  two8pm.setHours(20, 5, 0, 0);
  events.push({
    id: generateId(),
    medicationId: DEMO_MEDICATION.id,
    medicationName: DEMO_MEDICATION.brandName,
    strength: DEMO_MEDICATION.strength,
    eventType: 'TAKEN',
    timestamp: two8pm.toISOString(),
    source: 'USER',
  });

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ─── Default Schedule ─────────────────────────────────────────────────────────

const DEFAULT_SCHEDULES: MedicationSchedule[] = [
  {
    id: 'sched-examplemed',
    medicationId: DEMO_MEDICATION.id,
    medicationName: DEMO_MEDICATION.brandName,
    strength: DEMO_MEDICATION.strength,
    times: ['08:00', '20:00'],
    active: true,
  },
];

// ─── Events Store ─────────────────────────────────────────────────────────────

export function getEvents(): MedicationEvent[] {
  return loadFromStorage<MedicationEvent[]>(EVENTS_KEY, makeSeedEvents());
}

export function saveEvents(events: MedicationEvent[]): void {
  saveToStorage(EVENTS_KEY, events);
}

export function recordEvent(
  medicationId: string,
  medicationName: string,
  strength: string,
  eventType: EventType,
  source: EventSource = 'USER',
  packId?: string,
): MedicationEvent {
  const event: MedicationEvent = {
    id: generateId(),
    medicationId,
    medicationName,
    strength,
    packId,
    eventType,
    timestamp: new Date().toISOString(),
    source,
  };
  const events = getEvents();
  saveEvents([event, ...events]);
  return event;
}

// ─── Schedule Store ───────────────────────────────────────────────────────────

export function getSchedules(): MedicationSchedule[] {
  return loadFromStorage<MedicationSchedule[]>(SCHEDULE_KEY, DEFAULT_SCHEDULES);
}

export function getNextDueSchedule(): { schedule: MedicationSchedule; time: string } | null {
  const schedules = getSchedules().filter(s => s.active);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let earliest: { schedule: MedicationSchedule; time: string; minutes: number } | null = null;

  for (const sched of schedules) {
    for (const t of sched.times) {
      const [h, m] = t.split(':').map(Number);
      const mins = h * 60 + m;
      const diff = mins >= currentMinutes ? mins - currentMinutes : mins + 1440 - currentMinutes;
      if (earliest === null || diff < earliest.minutes) {
        earliest = { schedule: sched, time: t, minutes: diff };
      }
    }
  }

  return earliest ? { schedule: earliest.schedule, time: earliest.time } : null;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

export function resetHistory(): void {
  saveEvents(makeSeedEvents());
}
