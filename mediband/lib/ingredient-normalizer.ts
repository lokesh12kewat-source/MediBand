import { Medication } from '@/types';

/**
 * Ingredient Normalizer
 *
 * Normalizes active ingredient names to a canonical ID for duplicate detection.
 * Does NOT simply compare strings — maps known synonyms to a canonical form.
 */

const INGREDIENT_MAP: Record<string, string> = {
  // Paracetamol / Acetaminophen
  'paracetamol': 'ING_PARACETAMOL',
  'acetaminophen': 'ING_PARACETAMOL',
  'para': 'ING_PARACETAMOL',

  // Ibuprofen
  'ibuprofen': 'ING_IBUPROFEN',
  'advil': 'ING_IBUPROFEN',
  'nurofen': 'ING_IBUPROFEN',

  // Cetirizine
  'cetirizine': 'ING_CETIRIZINE',
  'cetirizine hydrochloride': 'ING_CETIRIZINE',
  'zyrtec': 'ING_CETIRIZINE',

  // Amoxicillin
  'amoxicillin': 'ING_AMOXICILLIN',
  'amoxycillin': 'ING_AMOXICILLIN',

  // Omeprazole
  'omeprazole': 'ING_OMEPRAZOLE',
  'losec': 'ING_OMEPRAZOLE',

  // Metformin
  'metformin': 'ING_METFORMIN',
  'metformin hydrochloride': 'ING_METFORMIN',

  // Atorvastatin
  'atorvastatin': 'ING_ATORVASTATIN',
  'atorvastatin calcium': 'ING_ATORVASTATIN',
};

export function normalizeIngredientId(ingredient: string): string {
  const key = ingredient.trim().toLowerCase();
  return INGREDIENT_MAP[key] ?? `ING_CUSTOM_${key.replace(/\s+/g, '_').toUpperCase()}`;
}

export interface DuplicateGroup {
  ingredientId: string;
  ingredientName: string;
  medications: Medication[];
}

/**
 * Find medications in a list that share the same active ingredient.
 */
export function findDuplicateIngredients(medications: Medication[]): DuplicateGroup[] {
  const groups: Map<string, Medication[]> = new Map();

  for (const med of medications) {
    const id = med.activeIngredientId;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(med);
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [id, meds] of groups) {
    if (meds.length > 1) {
      duplicates.push({
        ingredientId: id,
        ingredientName: meds[0].genericName,
        medications: meds,
      });
    }
  }

  return duplicates;
}
