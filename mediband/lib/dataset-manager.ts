import { DatasetImageRecord, ImageQualityAssessment, ImageView, RecognitionType } from '@/types';

export const DATASET_STORAGE_KEY = 'mediband_dataset_records_v1';

/**
 * Generates a unique, chronological Image ID.
 * Format: img_[pkg|pill]_[YYYYMMDD_HHMMSS]_[randomHex]
 */
export function generateImageId(type: RecognitionType): string {
  const prefix = type === 'packaging' ? 'img_pkg' : 'img_pill';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${randomSuffix}`;
}

/**
 * Determines relative storage path inside MediBand_Dataset
 */
export function buildDatasetFilePath(imageId: string, type: RecognitionType, extension: string = 'jpg'): string {
  const folder = type === 'packaging' ? 'packaging' : 'loose_pills';
  return `MediBand_Dataset/${folder}/${imageId}.${extension}`;
}

/**
 * Creates a structured dataset record
 */
export function createDatasetRecord(params: {
  imageId?: string;
  medicineId?: string | null;
  recognitionType: RecognitionType;
  imageView?: ImageView;
  imageQuality: ImageQualityAssessment;
  source: 'camera' | 'upload';
  dataUrl?: string;
  notes?: string;
}): DatasetImageRecord {
  const type = params.recognitionType;
  const imageId = params.imageId || generateImageId(type);
  const filePath = buildDatasetFilePath(imageId, type);

  return {
    image_id: imageId,
    // Never invent medicine IDs; keep null if unknown/unassigned
    medicine_id: params.medicineId && params.medicineId.trim().length > 0 ? params.medicineId.trim() : null,
    recognition_type: type,
    capture_timestamp: new Date().toISOString(),
    image_view: params.imageView || 'unspecified',
    image_quality: params.imageQuality,
    source: params.source,
    file_path: filePath,
    notes: params.notes?.trim() || undefined,
    dataUrl: params.dataUrl,
  };
}

/**
 * Retrieves all dataset records from browser storage
 */
export function getStoredDatasetRecords(): DatasetImageRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DATASET_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DatasetImageRecord[];
  } catch (err) {
    console.error('Failed to load dataset records from localStorage:', err);
    return [];
  }
}

/**
 * Saves a new dataset record to browser storage
 */
export function saveDatasetRecord(record: DatasetImageRecord): DatasetImageRecord[] {
  if (typeof window === 'undefined') return [record];
  try {
    const records = getStoredDatasetRecords();
    const updated = [record, ...records];
    localStorage.setItem(DATASET_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save dataset record to localStorage:', err);
    return getStoredDatasetRecords();
  }
}

/**
 * Clears or deletes a record from browser storage
 */
export function deleteDatasetRecord(imageId: string): DatasetImageRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const records = getStoredDatasetRecords();
    const updated = records.filter(r => r.image_id !== imageId);
    localStorage.setItem(DATASET_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to delete dataset record:', err);
    return getStoredDatasetRecords();
  }
}

/**
 * Converts dataset records to CSV format matching MediBand dataset specifications.
 */
export function convertRecordsToCSV(records: DatasetImageRecord[]): string {
  const headers = [
    'image_id',
    'medicine_id',
    'recognition_type',
    'capture_timestamp',
    'image_view',
    'source',
    'file_path',
    'resolution_width',
    'resolution_height',
    'megapixels',
    'brightness_pct',
    'blur_score',
    'glare_score_pct',
    'is_acceptable',
    'quality_warnings',
    'notes',
  ];

  const escapeCSV = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = records.map(r => {
    const q = r.image_quality;
    return [
      escapeCSV(r.image_id),
      escapeCSV(r.medicine_id || 'unlabeled'),
      escapeCSV(r.recognition_type),
      escapeCSV(r.capture_timestamp),
      escapeCSV(r.image_view),
      escapeCSV(r.source),
      escapeCSV(r.file_path),
      escapeCSV(q?.resolution?.width ?? ''),
      escapeCSV(q?.resolution?.height ?? ''),
      escapeCSV(q?.megapixels ?? ''),
      escapeCSV(q?.brightness ?? ''),
      escapeCSV(q?.blurScore ?? ''),
      escapeCSV(q?.glareScore ?? ''),
      escapeCSV(q?.isAcceptable ? 'TRUE' : 'FALSE'),
      escapeCSV(q?.warnings?.join('; ') || 'NONE'),
      escapeCSV(r.notes || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Initiates browser download of the CSV export
 */
export function downloadDatasetCSV(records: DatasetImageRecord[], filename?: string): void {
  if (typeof window === 'undefined') return;
  const csvContent = convertRecordsToCSV(records);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const name = filename || `mediband_dataset_export_${dateStr}.csv`;

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', name);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
