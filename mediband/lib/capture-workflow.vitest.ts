import { describe, it, expect } from 'vitest';
import { analyzePixelData } from './image-quality';
import {
  generateImageId,
  buildDatasetFilePath,
  createDatasetRecord,
  convertRecordsToCSV,
} from './dataset-manager';
import { INDIAN_MEDICINES, getMedicineById, searchMedicines } from '../data/indian-medicines';
import { DatasetImageRecord } from '@/types';

describe('Complete Camera & Dataset Capture Workflow', () => {
  it('1. Verifies Indian medicine metadata schema integrity', () => {
    expect(INDIAN_MEDICINES.length).toBeGreaterThanOrEqual(10);

    for (const med of INDIAN_MEDICINES) {
      expect(med.medicine_id).toMatch(/^med_ind_/);
      expect(med.brand_name.length).toBeGreaterThan(0);
      expect(med.generic_name.length).toBeGreaterThan(0);
      expect(med.strength.length).toBeGreaterThan(0);
      expect(med.dosage_form.length).toBeGreaterThan(0);
      expect(med.manufacturer.length).toBeGreaterThan(0);
      expect(med.product_identifier.length).toBeGreaterThan(0);
      expect(['approved', 'reference_listed', 'common_market']).toContain(med.reference_status);
    }

    const dolo = getMedicineById('med_ind_dolo650');
    expect(dolo).toBeDefined();
    expect(dolo?.brand_name).toBe('Dolo 650');

    const searchResults = searchMedicines('paracetamol');
    expect(searchResults.length).toBeGreaterThanOrEqual(2);
  });

  it('2. Evaluates packaging capture workflow with image quality analysis', () => {
    // Simulate capturing a medicine blister strip (1280x720) with high contrast text
    const width = 1280;
    const height = 720;
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const val = (x % 32 < 16) ? 180 : 70; // high contrast texture
        pixels[idx] = val;
        pixels[idx + 1] = val;
        pixels[idx + 2] = val;
        pixels[idx + 3] = 255;
      }
    }

    const quality = analyzePixelData(pixels, width, height);
    expect(quality.isAcceptable).toBe(true);
    expect(quality.resolution.width).toBe(1280);
    expect(quality.resolution.height).toBe(720);
    expect(quality.warnings.length).toBe(0);

    // Create packaging dataset record with Dolo 650 association
    const record = createDatasetRecord({
      recognitionType: 'packaging',
      imageView: 'strip_front',
      imageQuality: quality,
      medicineId: 'med_ind_dolo650',
      source: 'camera',
      notes: 'Captured front foil showing batch and manufacturing license',
    });

    expect(record.recognition_type).toBe('packaging');
    expect(record.image_id).toMatch(/^img_pkg_/);
    expect(record.file_path).toBe(`MediBand_Dataset/packaging/${record.image_id}.jpg`);
    expect(record.medicine_id).toBe('med_ind_dolo650');
    expect(record.image_view).toBe('strip_front');
    expect(record.notes).toBe('Captured front foil showing batch and manufacturing license');
  });

  it('3. Evaluates loose pill capture workflow without inventing unknown medicine ID', () => {
    // Simulate capturing a loose capsule (800x600)
    const width = 800;
    const height = 600;
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const val = ((x + y) % 20 < 10) ? 200 : 90;
        pixels[idx] = val;
        pixels[idx + 1] = val;
        pixels[idx + 2] = val;
        pixels[idx + 3] = 255;
      }
    }

    const quality = analyzePixelData(pixels, width, height);
    expect(quality.isAcceptable).toBe(true);

    // Unknown loose pill: never invent medicine_id
    const record = createDatasetRecord({
      recognitionType: 'loose_pill',
      imageView: 'top',
      imageQuality: quality,
      medicineId: null, // unknown / unlabeled
      source: 'camera',
      notes: 'Round white tablet with central score line on matte surface',
    });

    expect(record.recognition_type).toBe('loose_pill');
    expect(record.image_id).toMatch(/^img_pill_/);
    expect(record.file_path).toBe(`MediBand_Dataset/loose_pills/${record.image_id}.jpg`);
    expect(record.medicine_id).toBeNull();
    expect(record.image_view).toBe('top');
  });

  it('4. Converts mixed packaging and loose pill dataset into standard CSV export', () => {
    const records: DatasetImageRecord[] = [
      createDatasetRecord({
        imageId: 'img_pkg_20261030_001',
        recognitionType: 'packaging',
        imageView: 'blister_foil',
        imageQuality: {
          resolution: { width: 1920, height: 1080 },
          megapixels: 2.07,
          brightness: 60,
          blurScore: 85,
          glareScore: 1.5,
          isAcceptable: true,
          warnings: [],
        },
        medicineId: 'med_ind_augmentin625',
        source: 'camera',
      }),
      createDatasetRecord({
        imageId: 'img_pill_20261030_002',
        recognitionType: 'loose_pill',
        imageView: 'side',
        imageQuality: {
          resolution: { width: 1280, height: 720 },
          megapixels: 0.92,
          brightness: 52,
          blurScore: 78,
          glareScore: 0.8,
          isAcceptable: true,
          warnings: [],
        },
        medicineId: null, // unknown
        source: 'upload',
      }),
    ];

    const csv = convertRecordsToCSV(records);
    const lines = csv.trim().split('\n');

    expect(lines.length).toBe(3); // header + 2 rows
    expect(lines[0]).toBe(
      'image_id,medicine_id,recognition_type,capture_timestamp,image_view,source,file_path,resolution_width,resolution_height,megapixels,brightness_pct,blur_score,glare_score_pct,is_acceptable,quality_warnings,notes'
    );
    expect(lines[1]).toContain('img_pkg_20261030_001');
    expect(lines[1]).toContain('med_ind_augmentin625');
    expect(lines[1]).toContain('packaging');
    expect(lines[1]).toContain('MediBand_Dataset/packaging/img_pkg_20261030_001.jpg');

    expect(lines[2]).toContain('img_pill_20261030_002');
    expect(lines[2]).toContain('unlabeled');
    expect(lines[2]).toContain('loose_pill');
    expect(lines[2]).toContain('MediBand_Dataset/loose_pills/img_pill_20261030_002.jpg');
  });
});
