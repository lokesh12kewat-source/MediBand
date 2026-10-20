import { ProductProvider, ProductRecord } from '@/types';

/**
 * Mock Product Provider — DEMO DATA
 *
 * Simulates a product registry lookup.
 * Clearly labelled as simulated. Does NOT represent any real regulatory database.
 */

const MOCK_PRODUCTS: ProductRecord[] = [
  {
    gtin: '09312345678901',
    brandName: 'ExampleMed 650',
    genericName: 'Paracetamol',
    strength: '650 mg',
    manufacturer: 'Demo Pharmaceuticals',
    activeIngredientId: 'ING_PARACETAMOL',
    dosageForm: 'tablet',
  },
  {
    gtin: '09312345000003',
    brandName: 'DemoCetriz 10',
    genericName: 'Cetirizine',
    strength: '10 mg',
    manufacturer: 'Demo Pharmaceuticals',
    activeIngredientId: 'ING_CETIRIZINE',
    dosageForm: 'tablet',
  },
  {
    gtin: '09312345000010',
    brandName: 'DemoFen 400',
    genericName: 'Ibuprofen',
    strength: '400 mg',
    manufacturer: 'Demo Pharmaceuticals',
    activeIngredientId: 'ING_IBUPROFEN',
    dosageForm: 'tablet',
  },
];

export const mockProductProvider: ProductProvider = {
  name: 'Demo Product Registry',
  isSimulated: true,

  async lookup(gtin: string): Promise<ProductRecord | null> {
    // Simulate a short network delay
    await new Promise(r => setTimeout(r, 200));
    return MOCK_PRODUCTS.find(p => p.gtin === gtin) ?? null;
  },
};
