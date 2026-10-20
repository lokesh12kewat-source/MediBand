'use client';

/**
 * store/evidence-store.ts — Persisted evidence snapshot store.
 *
 * Stores VerificationResult snapshots in localStorage so the cabinet can
 * show evidence context for any pack, even after the scan session ends.
 *
 * Storage limit: keeps the last MAX_RECORDS records; oldest evicted first.
 * Data is NOT encrypted — never store real health data (shown in footer).
 */

import { VerificationResult } from '@/types';

const STORE_KEY  = 'mediband_evidence_v1';
const MAX_RECORDS = 50;

// ─── Storage helpers ──────────────────────────────────────────────────────────

function load(): VerificationResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VerificationResult[];
  } catch {
    return [];
  }
}

function persist(records: VerificationResult[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Evict oldest if over limit
    const trimmed = records.length > MAX_RECORDS
      ? records.slice(records.length - MAX_RECORDS)
      : records;
    localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  } catch { /* quota — silently skip */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Store a verification result. Overwrites if the same `id` already exists.
 */
export function addEvidenceRecord(result: VerificationResult): void {
  const records = load();
  const existing = records.findIndex(r => r.id === result.id);
  if (existing >= 0) {
    records[existing] = result;
    persist(records);
  } else {
    persist([...records, result]);
  }
}

/**
 * Retrieve a single record by its id.
 */
export function getEvidenceRecord(id: string): VerificationResult | null {
  return load().find(r => r.id === id) ?? null;
}

/**
 * Retrieve the most recent record linked to a pack id.
 * Packs reference the verification by `verificationId`.
 */
export function getEvidenceForPack(packId: string): VerificationResult | null {
  const records = load();
  // Walk backwards — most recent first
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].packId === packId) return records[i];
  }
  return null;
}

/**
 * Return all stored records, newest first.
 */
export function getAllEvidenceRecords(): VerificationResult[] {
  return load().slice().reverse();
}

/**
 * Delete all stored evidence records.
 */
export function clearEvidenceStore(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORE_KEY);
}
