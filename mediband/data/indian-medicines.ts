import { MedicineMetadata } from '@/types';

/**
 * Common Indian Medicines Reference Metadata
 *
 * NOTE: Batch number and expiry date are intentionally kept separate
 * from this product metadata file, as they vary between physical packages.
 */
export const INDIAN_MEDICINES: MedicineMetadata[] = [
  {
    medicine_id: 'med_ind_dolo650',
    brand_name: 'Dolo 650',
    generic_name: 'Paracetamol',
    strength: '650 mg',
    dosage_form: 'Tablet',
    manufacturer: 'Micro Labs Ltd',
    product_identifier: '08901148245582',
    reference_status: 'approved',
  },
  {
    medicine_id: 'med_ind_augmentin625',
    brand_name: 'Augmentin 625 Duo',
    generic_name: 'Amoxicillin and Potassium Clavulanate',
    strength: '500 mg + 125 mg',
    dosage_form: 'Tablet',
    manufacturer: 'GlaxoSmithKline Pharmaceuticals Ltd',
    product_identifier: '08901117208150',
    reference_status: 'reference_listed',
  },
  {
    medicine_id: 'med_ind_pantocid40',
    brand_name: 'Pantocid 40',
    generic_name: 'Pantoprazole Sodium',
    strength: '40 mg',
    dosage_form: 'Gastro-resistant Tablet',
    manufacturer: 'Sun Pharmaceutical Industries Ltd',
    product_identifier: '08901036012351',
    reference_status: 'approved',
  },
  {
    medicine_id: 'med_ind_azithral500',
    brand_name: 'Azithral 500',
    generic_name: 'Azithromycin',
    strength: '500 mg',
    dosage_form: 'Tablet',
    manufacturer: 'Alembic Pharmaceuticals Ltd',
    product_identifier: '08901083049102',
    reference_status: 'approved',
  },
  {
    medicine_id: 'med_ind_shelcal500',
    brand_name: 'Shelcal 500',
    generic_name: 'Calcium with Vitamin D3',
    strength: '500 mg + 250 IU',
    dosage_form: 'Tablet',
    manufacturer: 'Torrent Pharmaceuticals Ltd',
    product_identifier: '08901148002017',
    reference_status: 'common_market',
  },
  {
    medicine_id: 'med_ind_telma40',
    brand_name: 'Telma 40',
    generic_name: 'Telmisartan',
    strength: '40 mg',
    dosage_form: 'Tablet',
    manufacturer: 'Glenmark Pharmaceuticals Ltd',
    product_identifier: '08901123019208',
    reference_status: 'approved',
  },
  {
    medicine_id: 'med_ind_glycomet500',
    brand_name: 'Glycomet 500',
    generic_name: 'Metformin Hydrochloride',
    strength: '500 mg',
    dosage_form: 'Tablet',
    manufacturer: 'USV Pvt Ltd',
    product_identifier: '08901117004127',
    reference_status: 'reference_listed',
  },
  {
    medicine_id: 'med_ind_pan40',
    brand_name: 'Pan 40',
    generic_name: 'Pantoprazole Sodium',
    strength: '40 mg',
    dosage_form: 'Gastro-resistant Tablet',
    manufacturer: 'Alkem Laboratories Ltd',
    product_identifier: '08901036021483',
    reference_status: 'approved',
  },
  {
    medicine_id: 'med_ind_montair_lc',
    brand_name: 'Montair-LC',
    generic_name: 'Montelukast Sodium and Levocetirizine Dihydrochloride',
    strength: '10 mg + 5 mg',
    dosage_form: 'Tablet',
    manufacturer: 'Cipla Ltd',
    product_identifier: '08901117032199',
    reference_status: 'approved',
  },
  {
    medicine_id: 'med_ind_combiflam',
    brand_name: 'Combiflam',
    generic_name: 'Ibuprofen and Paracetamol',
    strength: '400 mg + 325 mg',
    dosage_form: 'Tablet',
    manufacturer: 'Sanofi India Ltd',
    product_identifier: '08901088012491',
    reference_status: 'common_market',
  },
  {
    medicine_id: 'med_ind_becosules',
    brand_name: 'Becosules',
    generic_name: 'Vitamin B-Complex with Vitamin C',
    strength: 'Standard Formula',
    dosage_form: 'Capsule',
    manufacturer: 'Pfizer Ltd (India)',
    product_identifier: '08901088049183',
    reference_status: 'common_market',
  },
  {
    medicine_id: 'med_ind_calpol500',
    brand_name: 'Calpol 500',
    generic_name: 'Paracetamol',
    strength: '500 mg',
    dosage_form: 'Tablet',
    manufacturer: 'GlaxoSmithKline Pharmaceuticals Ltd',
    product_identifier: '08901117001096',
    reference_status: 'reference_listed',
  },
];

export function getMedicineById(id: string): MedicineMetadata | undefined {
  return INDIAN_MEDICINES.find(m => m.medicine_id === id);
}

export function searchMedicines(query: string): MedicineMetadata[] {
  const q = query.toLowerCase().trim();
  if (!q) return INDIAN_MEDICINES;
  return INDIAN_MEDICINES.filter(
    m =>
      m.brand_name.toLowerCase().includes(q) ||
      m.generic_name.toLowerCase().includes(q) ||
      m.manufacturer.toLowerCase().includes(q)
  );
}
