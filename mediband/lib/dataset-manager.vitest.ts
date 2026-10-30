import { describe, it, expect } from 'vitest';
import {
  generateImageId,
  buildDatasetFilePath,
  createDatasetRecord,
  convertRecordsToCSV,
} from './dataset-manager';
import { DatasetImageRecord } from '@/types';

describe('Dataset Manager', () => {
  it('generates unique image IDs with proper prefix and timestamp', () => {
    const pkgId = generateImageId('packaging');
    const pillId = generateImageId('loose_pill');

    expect(pkgId).toMatch(/^img_pkg_\d{8}_\d{6}_[a-z0-9]+$/);
    expect(pillId).toMatch(/^img_pill_\d{8}_\d{6}_[a-z0-9]+$/);
    expect(pkgId).not.toBe(generateImageId('packaging'));
  });

  it('builds structured relative dataset file paths', () => {
    const pathPkg = buildDatasetFilePath('img_pkg_123', 'packaging');
    const pathPill = buildDatasetFilePath('img_pill_456', 'loose_pill', 'png');

    expect(pathPkg).toBe('MediBand_Dataset/packaging/img_pkg_123.jpg');
    expect(pathPill).toBe('MediBand_Dataset/loose_pills/img_pill_456.png');
  });

  it('creates dataset record preserving null medicine_id when unknown', () => {
    const record = createDatasetRecord({
      recognitionType: 'packaging',
      source: 'camera',
      imageQuality: {
        resolution: { width: 1920, height: 1080 },
        megapixels: 2.07,
        brightness: 55,
        blurScore: 82,
        glareScore: 1.2,
        isAcceptable: true,
        warnings: [],
      },
    });

    expect(record.medicine_id).toBeNull();
    expect(record.recognition_type).toBe('packaging');
    expect(record.file_path).toContain('MediBand_Dataset/packaging/');
    expect(record.source).toBe('camera');
  });

  it('formats CSV with headers, escaped commas, and quotes correctly', () => {
    const sampleRecord: DatasetImageRecord = {
      image_id: 'img_pkg_test01',
      medicine_id: 'med_ind_dolo650',
      recognition_type: 'packaging',
      capture_timestamp: '2026-10-30T12:00:00.000Z',
      image_view: 'strip_front',
      source: 'camera',
      file_path: 'MediBand_Dataset/packaging/img_pkg_test01.jpg',
      notes: 'Captured under desk lamp, clear foil text',
      image_quality: {
        resolution: { width: 1280, height: 720 },
        megapixels: 0.92,
        brightness: 62.4,
        blurScore: 95.1,
        glareScore: 3.5,
        isAcceptable: true,
        warnings: [],
      },
    };

    const csv = convertRecordsToCSV([sampleRecord]);
    const lines = csv.split('\n');

    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('image_id,medicine_id,recognition_type');
    expect(lines[1]).toContain('img_pkg_test01');
    expect(lines[1]).toContain('med_ind_dolo650');
    expect(lines[1]).toContain('packaging');
    expect(lines[1]).toContain('1280');
    expect(lines[1]).toContain('720');
    expect(lines[1]).toContain('"Captured under desk lamp, clear foil text"');
  });
});
