import { describe, it, expect, beforeEach } from 'vitest';
import { INDIAN_MEDICINES, getMedicineById } from '../data/indian-medicines';
import { extractIngredientIds, getMedicationIngredients } from './ingredient-normalizer';
import { addMedication, addPack, getCabinetEntries, getMedications, clearCabinetStore } from '../store/cabinet-store';
import { recordEvent, getEvents, clearHistoryStore } from '../store/history-store';
import { Medication, MedicationPack } from '@/types';

describe('AI Vision Safety & Cabinet Workflow', () => {
  beforeEach(() => {
    clearCabinetStore();
    clearHistoryStore();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('1. Detects active ingredient overlap between Dolo-650 and Calpol 500', () => {
    const dolo = getMedicineById('med_ind_dolo650');
    const calpol = getMedicineById('med_ind_calpol500');

    expect(dolo).toBeDefined();
    expect(calpol).toBeDefined();

    const doloIngredients = extractIngredientIds(dolo!.generic_name);
    const calpolIngredients = extractIngredientIds(calpol!.generic_name);

    expect(doloIngredients).toContain('ING_PARACETAMOL');
    expect(calpolIngredients).toContain('ING_PARACETAMOL');

    // Both share Paracetamol
    const shared = doloIngredients.filter(id => calpolIngredients.includes(id));
    expect(shared).toEqual(['ING_PARACETAMOL']);
  });

  it('2. Does not detect false conflicts between Shelcal 500 and Dolo-650', () => {
    const dolo = getMedicineById('med_ind_dolo650');
    const shelcal = getMedicineById('med_ind_shelcal500');

    expect(dolo).toBeDefined();
    expect(shelcal).toBeDefined();

    const doloIngredients = extractIngredientIds(dolo!.generic_name);
    const shelcalIngredients = extractIngredientIds(shelcal!.generic_name);

    const shared = doloIngredients.filter(id => shelcalIngredients.includes(id));
    expect(shared).toHaveLength(0);
  });

  it('3. Successfully ingests a vision-predicted medicine into user cabinet', () => {
    const med: Medication = {
      id: 'med_ind_shelcal500',
      brandName: 'Shelcal 500',
      genericName: 'Calcium and Vitamin D3',
      strength: '500 mg + 250 IU',
      dosageForm: 'Film-coated Tablet',
      manufacturer: 'Torrent Pharmaceuticals Ltd',
      activeIngredients: extractIngredientIds('Calcium and Vitamin D3'),
    };

    const pack: MedicationPack = {
      id: 'pack-shelcal-test-1',
      medicationId: med.id,
      batchNumber: 'SH12345',
      expiryPrinted: '12/2027',
      quantity: { remaining: 15, unit: 'tablets' },
      verificationStatus: 'verified',
    };

    addMedication(med);
    addPack(pack);

    const cabinet = getCabinetEntries();
    expect(cabinet.length).toBeGreaterThan(0);

    const entry = cabinet.find(c => c.medication.id === 'med_ind_shelcal500');
    expect(entry).toBeDefined();
    expect(entry?.medication.brandName).toBe('Shelcal 500');
    expect(entry?.pack.quantity?.remaining).toBe(15);
  });

  it('4. Successfully logs adherence dose taken for predicted medicine', () => {
    const eventId = recordEvent(
      'med_ind_dolo650',
      'Dolo 650',
      '650 mg',
      'TAKEN',
      'USER'
    );

    expect(eventId).toMatch(/^evt-/);
    const events = getEvents();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].medicationName).toBe('Dolo 650');
    expect(events[0].eventType).toBe('TAKEN');
  });
});
