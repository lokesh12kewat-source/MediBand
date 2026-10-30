'use client';

import { CabinetEntry, Medication, MedicationPack, CabinetStatus } from '@/types';
import { parseExpiry } from '@/lib/dates';
import { SEED_MEDICATIONS, SEED_PACKS } from '@/data/demo-scenarios';

const MEDS_KEY    = 'mediband_medications_v1';
const PACKS_KEY   = 'mediband_packs_v1';
const SEEDED_KEY  = 'mediband_cabinet_seeded_v1';

// ─── Storage helpers ──────────────────────────────────────────────────────────

const memoryStore: Record<string, string> = {};

function load<T>(key: string, fallback: T): T {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    }
    const raw = memoryStore[key];
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  try {
    const serialized = JSON.stringify(data);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, serialized);
    } else {
      memoryStore[key] = serialized;
    }
  } catch { /* quota */ }
}

// ─── Seeding — only runs once per browser (flag guards it) ───────────────────

function isSeeded(): boolean {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem(SEEDED_KEY) === 'true';
  }
  return memoryStore[SEEDED_KEY] === 'true';
}

function markSeeded(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(SEEDED_KEY, 'true');
  } else {
    memoryStore[SEEDED_KEY] = 'true';
  }
}

export function clearCabinetStore(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem(MEDS_KEY);
    localStorage.removeItem(PACKS_KEY);
    localStorage.removeItem(SEEDED_KEY);
  }
  delete memoryStore[MEDS_KEY];
  delete memoryStore[PACKS_KEY];
  delete memoryStore[SEEDED_KEY];
}

/**
 * Seed demo data on first visit only.
 * Call this in a useEffect — NEVER during render.
 * Deleting all items does NOT reseed; use resetCabinet() for that.
 */
export function initCabinet(): void {
  if (isSeeded()) return;
  save(MEDS_KEY, SEED_MEDICATIONS);
  save(PACKS_KEY, SEED_PACKS);
  markSeeded();
}

// ─── Expiry & In-Use Calculation ──────────────────────────────────────────────

export function getEffectiveExpiryInfo(pack: MedicationPack, now: Date = new Date()) {
  const printedStr = pack.expiryEncoded || pack.expiryPrinted;
  const parsedPrinted = printedStr ? parseExpiry(printedStr) : null;

  let printedDate: Date | null = null;
  if (parsedPrinted) {
    const day = parsedPrinted.day ?? new Date(parsedPrinted.year, parsedPrinted.month, 0).getDate();
    printedDate = new Date(parsedPrinted.year, parsedPrinted.month - 1, day, 23, 59, 59);
  }

  let inUseDate: Date | null = null;
  let inUseDateStr: string | undefined = undefined;
  if (pack.openedAt && pack.inUseExpiryDays) {
    const opened = new Date(pack.openedAt);
    inUseDate = new Date(opened.getTime() + pack.inUseExpiryDays * 24 * 60 * 60 * 1000);
    inUseDateStr = inUseDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  if (!printedDate && !inUseDate) {
    return {
      status: 'needs-review' as CabinetStatus,
      effectiveExpiry: '—',
      inUseExpiryDate: undefined,
      isEarlierInUse: false,
      daysRemaining: 9999,
    };
  }

  let chosenDate: Date;
  let effectiveExpiryStr: string;
  let isEarlierInUse = false;

  if (printedDate && inUseDate) {
    if (inUseDate < printedDate) {
      chosenDate = inUseDate;
      effectiveExpiryStr = inUseDateStr!;
      isEarlierInUse = true;
    } else {
      chosenDate = printedDate;
      effectiveExpiryStr = printedStr;
    }
  } else if (inUseDate) {
    chosenDate = inUseDate;
    effectiveExpiryStr = inUseDateStr!;
    isEarlierInUse = true;
  } else {
    chosenDate = printedDate!;
    effectiveExpiryStr = printedStr;
  }

  const daysRemaining = Math.floor((chosenDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  let status: CabinetStatus = 'in-date';
  if (daysRemaining < 0) {
    status = 'expired';
  } else if (daysRemaining <= 90) {
    status = 'expiring-soon';
  }

  return {
    status,
    effectiveExpiry: effectiveExpiryStr,
    inUseExpiryDate: inUseDateStr,
    isEarlierInUse,
    daysRemaining,
  };
}

// ─── Medications ──────────────────────────────────────────────────────────────

export function getMedications(): Medication[] {
  return load<Medication[]>(MEDS_KEY, []);
}

export function saveMedications(meds: Medication[]): void {
  save(MEDS_KEY, meds);
}

export function addMedication(med: Medication): void {
  const meds = getMedications();
  if (!meds.find(m => m.id === med.id)) {
    saveMedications([...meds, med]);
  }
}

// ─── Packs ────────────────────────────────────────────────────────────────────

export function getPacks(): MedicationPack[] {
  return load<MedicationPack[]>(PACKS_KEY, []);
}

export function savePacks(packs: MedicationPack[]): void {
  save(PACKS_KEY, packs);
}

export function addPack(pack: MedicationPack): void {
  const packs = getPacks();
  if (!packs.find(p => p.id === pack.id)) {
    savePacks([...packs, pack]);
  } else {
    savePacks(packs.map(p => p.id === pack.id ? pack : p));
  }
}

export function updatePack(packId: string, updates: Partial<MedicationPack>): void {
  const packs = getPacks();
  const updated = packs.map(p => p.id === packId ? { ...p, ...updates } : p);
  savePacks(updated);
}

export function markPackOpened(packId: string, inUseExpiryDays: number = 30): void {
  updatePack(packId, {
    openedAt: new Date().toISOString(),
    inUseExpiryDays,
  });
}

export function updatePackQuantity(packId: string, remaining: number, unit: string = 'tablets'): void {
  updatePack(packId, {
    quantity: { remaining, unit },
  });
}

export function updatePackNotes(packId: string, notes: string): void {
  updatePack(packId, { notes });
}

// ─── Cabinet Entries ──────────────────────────────────────────────────────────

export function getCabinetEntries(): CabinetEntry[] {
  const meds  = getMedications();
  const packs = getPacks();
  return packs
    .map(pack => {
      const medication = meds.find(m => m.id === pack.medicationId);
      if (!medication) return null;
      const info = getEffectiveExpiryInfo(pack);
      return {
        medicationId: pack.medicationId,
        packId: pack.id,
        medication,
        pack,
        status: info.status,
        lastVerified: pack.addedAt,
        verificationId: pack.verificationId,
        evidenceRecordId: pack.evidenceRecordId,
        inUseExpiryDate: info.inUseExpiryDate,
        effectiveExpiry: info.effectiveExpiry,
        isEarlierInUse: info.isEarlierInUse,
        daysRemaining: info.daysRemaining,
      } as CabinetEntry;
    })
    .filter(Boolean) as CabinetEntry[];
}

export function addToCabinet(medication: Medication, pack: MedicationPack): void {
  addMedication(medication);
  addPack(pack);
}

export function removeFromCabinet(packId: string): void {
  savePacks(getPacks().filter(p => p.id !== packId));
}

// ─── Reset (explicit — reseeds and marks seeded) ──────────────────────────────

export function resetCabinet(): void {
  save(MEDS_KEY, SEED_MEDICATIONS);
  save(PACKS_KEY, SEED_PACKS);
  markSeeded();
}
