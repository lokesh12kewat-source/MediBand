import { Medication } from '@/types';

/**
 * lib/ingredient-normalizer.ts
 *
 * Normalizes active ingredient names to canonical IDs for duplicate detection.
 * Handles:
 * - Synonym mapping (paracetamol = acetaminophen, albuterol = salbutamol)
 * - Dosage stripping ("paracetamol 500mg" -> paracetamol)
 * - Salt-word stripping from an explicit list, provided it does not leave a bare anion
 *   (e.g., cetirizine hydrochloride -> cetirizine, but sodium chloride and potassium chloride stay distinct)
 * - Multi-ingredient combination products ("Paracetamol + Ibuprofen" -> [ING_IBUPROFEN, ING_PARACETAMOL])
 */

// ─── Salt & Anion Tokens ──────────────────────────────────────────────────────

const SALT_TOKENS = new Set([
  'hydrochloride',
  'hcl',
  'sodium',
  'potassium',
  'calcium',
  'maleate',
  'tartrate',
  'succinate',
  'fumarate',
  'mesylate',
  'besylate',
  'acetate',
  'phosphate',
  'sulfate',
  'sulphate',
  'nitrate',
  'citrate',
  'gluconate',
  'dipivoxil',
  'hemihydrate',
  'monohydrate',
  'dihydrate',
  'trihydrate',
  'hydrate',
]);

const BARE_ANIONS = new Set([
  'chloride',
  'bromide',
  'iodide',
  'fluoride',
  'oxide',
  'hydroxide',
  'carbonate',
  'bicarbonate',
  'sulfide',
  'sulphide',
  'nitrite',
  'sulfite',
]);

// ─── Synonym Map ──────────────────────────────────────────────────────────────

const SYNONYM_MAP: Record<string, string> = {
  // Paracetamol / Acetaminophen
  paracetamol: 'ING_PARACETAMOL',
  acetaminophen: 'ING_PARACETAMOL',
  para: 'ING_PARACETAMOL',
  apap: 'ING_PARACETAMOL',

  // Ibuprofen
  ibuprofen: 'ING_IBUPROFEN',
  advil: 'ING_IBUPROFEN',
  nurofen: 'ING_IBUPROFEN',

  // Cetirizine
  cetirizine: 'ING_CETIRIZINE',
  zyrtec: 'ING_CETIRIZINE',

  // Amoxicillin
  amoxicillin: 'ING_AMOXICILLIN',
  amoxycillin: 'ING_AMOXICILLIN',

  // Clavulanate (for Co-amoxiclav)
  clavulanate: 'ING_CLAVULANATE',
  'clavulanic acid': 'ING_CLAVULANATE',

  // Omeprazole
  omeprazole: 'ING_OMEPRAZOLE',
  losec: 'ING_OMEPRAZOLE',
  prilosec: 'ING_OMEPRAZOLE',

  // Metformin
  metformin: 'ING_METFORMIN',

  // Atorvastatin
  atorvastatin: 'ING_ATORVASTATIN',
  lipitor: 'ING_ATORVASTATIN',

  // Salbutamol / Albuterol
  salbutamol: 'ING_SALBUTAMOL',
  albuterol: 'ING_SALBUTAMOL',
  ventolin: 'ING_SALBUTAMOL',

  // Aspirin
  aspirin: 'ING_ASPIRIN',
  'acetylsalicylic acid': 'ING_ASPIRIN',

  // Amlodipine
  amlodipine: 'ING_AMLODIPINE',
  norvasc: 'ING_AMLODIPINE',
};

/** Friendly display names for canonical IDs */
const CANONICAL_NAMES: Record<string, string> = {
  ING_PARACETAMOL: 'Paracetamol',
  ING_IBUPROFEN: 'Ibuprofen',
  ING_CETIRIZINE: 'Cetirizine',
  ING_AMOXICILLIN: 'Amoxicillin',
  ING_CLAVULANATE: 'Clavulanate',
  ING_OMEPRAZOLE: 'Omeprazole',
  ING_METFORMIN: 'Metformin',
  ING_ATORVASTATIN: 'Atorvastatin',
  ING_SALBUTAMOL: 'Salbutamol',
  ING_ASPIRIN: 'Aspirin',
  ING_AMLODIPINE: 'Amlodipine',
};

/**
 * Strip dosage and strength expressions (e.g. "500mg", "650 mg", "10ml", "400").
 */
function cleanDosage(input: string): string {
  return input
    .replace(/\b\d+(\.\d+)?\s*(mg|g|mcg|ml|iu|%)\b/gi, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip salt tokens from an ingredient phrase, unless stripping would
 * leave only a bare anion or another salt token (e.g., sodium chloride).
 */
function stripSalts(phrase: string): string {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return phrase;

  // Filter out salt tokens
  const nonSalts = words.filter(w => !SALT_TOKENS.has(w));

  // If removing salt tokens leaves nothing, or leaves only a bare anion,
  // do NOT strip (keeps sodium chloride and potassium chloride distinct)
  if (nonSalts.length === 0 || (nonSalts.length === 1 && BARE_ANIONS.has(nonSalts[0]))) {
    return phrase;
  }

  return nonSalts.join(' ');
}

/**
 * Normalize a single ingredient name to a canonical ING_ id.
 */
export function normalizeIngredientId(rawIngredient: string): string {
  if (!rawIngredient || !rawIngredient.trim()) return 'ING_UNKNOWN';

  // 1. Lowercase and clean dosage
  let s = cleanDosage(rawIngredient.toLowerCase());

  // 2. Direct synonym match before salt stripping (in case full string is in map)
  if (SYNONYM_MAP[s]) {
    return SYNONYM_MAP[s];
  }

  // 3. Strip salts
  const stripped = stripSalts(s);
  if (SYNONYM_MAP[stripped]) {
    return SYNONYM_MAP[stripped];
  }

  // 4. Fallback canonical ID
  const cleanId = (stripped || s).replace(/[^a-z0-9]+/g, '_').toUpperCase().replace(/^_+|_+$/g, '');
  return `ING_${cleanId}`;
}

/**
 * Split a generic or brand name that might represent multiple combination ingredients
 * into individual normalized ingredient IDs. Returns a sorted, deduplicated array.
 * E.g. "Paracetamol + Ibuprofen" -> ["ING_IBUPROFEN", "ING_PARACETAMOL"]
 */
export function extractIngredientIds(nameOrGeneric: string): string[] {
  if (!nameOrGeneric || !nameOrGeneric.trim()) return [];

  // Split on '+', '/', ' and ', or ','
  const parts = nameOrGeneric.split(/\s*(?:\+|\/|\band\b|,)\s*/i).filter(Boolean);
  const ids = parts.map(p => normalizeIngredientId(p));
  return Array.from(new Set(ids)).sort();
}

/**
 * Return all canonical ingredient IDs for a medication.
 * Inspects `activeIngredients`, falls back to `extractIngredientIds(genericName)`,
 * then to `activeIngredientId`.
 */
export function getMedicationIngredients(medication: Medication): string[] {
  if (medication.activeIngredients && medication.activeIngredients.length > 0) {
    return [...medication.activeIngredients].sort();
  }
  if (medication.genericName) {
    const extracted = extractIngredientIds(medication.genericName);
    if (extracted.length > 0) return extracted;
  }
  if (medication.activeIngredientId) {
    return [normalizeIngredientId(medication.activeIngredientId)];
  }
  return [];
}

export interface DuplicateGroup {
  ingredientId: string;
  ingredientName: string;
  medications: Medication[];
}

/**
 * Find medications in a cabinet or list that share AT LEAST ONE active ingredient.
 * Handles combo products (e.g. Paracetamol + Ibuprofen shares Paracetamol with Paracetamol 650).
 */
export function findDuplicateIngredients(medications: Medication[]): DuplicateGroup[] {
  const byIngredient = new Map<string, Medication[]>();

  for (const med of medications) {
    const ingIds = getMedicationIngredients(med);
    for (const id of ingIds) {
      if (!byIngredient.has(id)) byIngredient.set(id, []);
      const list = byIngredient.get(id)!;
      if (!list.some(m => m.id === med.id)) {
        list.push(med);
      }
    }
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [id, meds] of byIngredient.entries()) {
    if (meds.length > 1) {
      const displayName =
        CANONICAL_NAMES[id] ||
        id.replace(/^ING_/, '').replace(/_/g, ' ').toLowerCase();

      duplicates.push({
        ingredientId: id,
        ingredientName: displayName,
        medications: meds,
      });
    }
  }

  return duplicates;
}
