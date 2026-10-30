import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DatasetImageRecord } from '@/types';
import { convertRecordsToCSV } from '@/lib/dataset-manager';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { record, dataUrl } = body as { record: DatasetImageRecord; dataUrl?: string };

    if (!record || !record.image_id || !record.recognition_type) {
      return NextResponse.json({ success: false, error: 'Invalid record payload' }, { status: 400 });
    }

    const baseDir = path.join(process.cwd(), 'MediBand_Dataset');
    const folderName = record.recognition_type === 'packaging' ? 'packaging' : 'loose_pills';
    const targetFolder = path.join(baseDir, folderName);
    const annotationsFolder = path.join(baseDir, 'annotations');
    const exportsFolder = path.join(baseDir, 'exports');

    // Ensure directories exist
    fs.mkdirSync(targetFolder, { recursive: true });
    fs.mkdirSync(annotationsFolder, { recursive: true });
    fs.mkdirSync(exportsFolder, { recursive: true });

    // 1. Save image file if dataUrl provided
    if (dataUrl && dataUrl.startsWith('data:image/')) {
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const imageFilePath = path.join(targetFolder, `${record.image_id}.${ext}`);
        fs.writeFileSync(imageFilePath, buffer);
      }
    }

    // 2. Update annotations/metadata.json
    const metaJsonPath = path.join(annotationsFolder, 'metadata.json');
    let allRecords: DatasetImageRecord[] = [];
    if (fs.existsSync(metaJsonPath)) {
      try {
        const fileContent = fs.readFileSync(metaJsonPath, 'utf8');
        allRecords = JSON.parse(fileContent);
      } catch {
        allRecords = [];
      }
    }
    // Remove dataUrl from persisted metadata file to keep json lightweight
    const { dataUrl: _omitted, ...cleanRecord } = record;
    allRecords.unshift(cleanRecord as DatasetImageRecord);
    fs.writeFileSync(metaJsonPath, JSON.stringify(allRecords, null, 2), 'utf8');

    // 3. Update exports/dataset_metadata.csv
    const csvPath = path.join(exportsFolder, 'dataset_metadata.csv');
    const csvContent = convertRecordsToCSV(allRecords);
    fs.writeFileSync(csvPath, csvContent, 'utf8');

    return NextResponse.json({
      success: true,
      image_id: record.image_id,
      file_path: record.file_path,
      total_records: allRecords.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error saving dataset item to disk:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const metaJsonPath = path.join(process.cwd(), 'MediBand_Dataset', 'annotations', 'metadata.json');
    if (!fs.existsSync(metaJsonPath)) {
      return NextResponse.json({ success: true, count: 0, records: [] });
    }
    const content = fs.readFileSync(metaJsonPath, 'utf8');
    const records = JSON.parse(content);
    return NextResponse.json({ success: true, count: records.length, records });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
