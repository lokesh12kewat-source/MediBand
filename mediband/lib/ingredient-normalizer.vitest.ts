/**
 * lib/ingredient-normalizer.vitest.ts — Vitest tests for ingredient normalizer & duplicate detection
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeIngredientId,
  extractIngredientIds,
  findDuplicateIngredients,
} from './ingredient-normalizer';
import { Medication } from '@/types';

describe('normalizeIngredientId', () => {
  it('"PARACETAMOL 500mg" and "paracetamol" normalize to the same canonical ID', () => {
    expect(normalizeIngredientId('PARACETAMOL 500mg')).toBe('ING_PARACETAMOL');
    expect(normalizeIngredientId('paracetamol')).toBe('ING_PARACETAMOL');
    expect(normalizeIngredientId('PARACETAMOL 500mg')).toBe(normalizeIngredientId('paracetamol'));
  });

  it('Synonyms: acetaminophen maps to ING_PARACETAMOL', () => {
    expect(normalizeIngredientId('acetaminophen')).toBe('ING_PARACETAMOL');
  });

  it('Salt stripping: "Cetirizine hydrochloride" -> ING_CETIRIZINE', () => {
    expect(normalizeIngredientId('Cetirizine hydrochloride')).toBe('ING_CETIRIZINE');
  });

  it('Salt stripping: "Atorvastatin calcium" -> ING_ATORVASTATIN', () => {
    expect(normalizeIngredientId('Atorvastatin calcium')).toBe('ING_ATORVASTATIN');
  });

  it('Salt stripping protection: "Sodium chloride" and "Potassium chloride" stay distinct', () => {
    const na = normalizeIngredientId('Sodium chloride');
    const k = normalizeIngredientId('Potassium chloride');
    expect(na).not.toBe(k);
    expect(na).toBe('ING_SODIUM_CHLORIDE');
    expect(k).toBe('ING_POTASSIUM_CHLORIDE');
  });
});

describe('extractIngredientIds (combination products)', () => {
  it('splits and normalizes multi-ingredient string "Paracetamol + Ibuprofen"', () => {
    const ids = extractIngredientIds('Paracetamol + Ibuprofen');
    expect(ids).toEqual(['ING_IBUPROFEN', 'ING_PARACETAMOL']);
  });

  it('handles slash delimiter: "Amoxicillin / Clavulanate"', () => {
    const ids = extractIngredientIds('Amoxicillin / Clavulanate');
    expect(ids).toEqual(['ING_AMOXICILLIN', 'ING_CLAVULANATE']);
  });
});

describe('findDuplicateIngredients', () => {
  it('"Paracetamol 650" and "Paracetamol + Ibuprofen" produce a duplicate group for Paracetamol', () => {
    const medA: Medication = {
      id: 'med-a',
      brandName: 'ExampleMed 650',
      genericName: 'Paracetamol',
      strength: '650 mg',
      manufacturer: 'Acme',
      activeIngredientId: 'ING_PARACETAMOL',
    };
    const medB: Medication = {
      id: 'med-b',
      brandName: 'ComboPlus',
      genericName: 'Paracetamol + Ibuprofen',
      strength: '500 mg / 150 mg',
      manufacturer: 'Acme',
      activeIngredientId: 'ING_PARACETAMOL',
    };

    const dups = findDuplicateIngredients([medA, medB]);
    expect(dups.length).toBe(1);
    expect(dups[0].ingredientId).toBe('ING_PARACETAMOL');
    expect(dups[0].medications.map(m => m.id)).toEqual(['med-a', 'med-b']);
  });

  it('"Sodium chloride" and "Potassium chloride" do NOT produce a duplicate group', () => {
    const medNa: Medication = {
      id: 'med-na',
      brandName: 'Saline Solution',
      genericName: 'Sodium chloride',
      strength: '0.9%',
      manufacturer: 'Lab',
      activeIngredientId: 'ING_SODIUM_CHLORIDE',
    };
    const medK: Medication = {
      id: 'med-k',
      brandName: 'Potassium Additive',
      genericName: 'Potassium chloride',
      strength: '15%',
      manufacturer: 'Lab',
      activeIngredientId: 'ING_POTASSIUM_CHLORIDE',
    };

    const dups = findDuplicateIngredients([medNa, medK]);
    expect(dups.length).toBe(0);
  });
});
