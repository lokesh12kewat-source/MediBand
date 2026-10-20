'use client';

import { CabinetEntry, Medication, MedicationPack, CabinetStatus } from '@/types';
import { daysUntilExpiry } from '@/lib/code-print-compare';
import { SEED_MEDICATIONS, SEED_PACKS } from '@/data/demo-scenarios';

const MEDS_KEY    = 'mediband_medications_v1';
const PACKS_KEY   = 'mediband_packs_v1';
const SEEDED_KEY  = 'mediband_cabinet_seeded_v1';

// ─── Storage helpers ──────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

// ─── Seeding — only runs once per browser (flag guards it) ───────────────────

function isSeeded(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SEEDED_KEY) === 'true';
}

function markSeeded(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SEEDED_KEY, 'true');
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

// ─── Cabinet Status ───────────────────────────────────────────────────────────

function getStatus(pack: MedicationPack): CabinetStatus {
  const expiry = pack.expiryEncoded || pack.expiryPrinted;
  if (!expiry) return 'needs-review';
  const days = daysUntilExpiry(expiry);
  if (days < 0) return 'expired';
  if (days <= 90) return 'expiring-soon';
  return 'in-date';
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

// ─── Cabinet Entries ──────────────────────────────────────────────────────────

export function getCabinetEntries(): CabinetEntry[] {
  const meds  = getMedications();
  const packs = getPacks();
  return packs
    .map(pack => {
      const medication = meds.find(m => m.id === pack.medicationId);
      if (!medication) return null;
      return {
        medicationId: pack.medicationId,
        packId: pack.id,
        medication,
        pack,
        status: getStatus(pack),
        lastVerified: pack.addedAt,
        verificationId: pack.verificationId,
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
