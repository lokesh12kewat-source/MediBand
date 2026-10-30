import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const csvPath = path.join(process.cwd(), 'MediBand_Dataset', 'exports', 'dataset_metadata.csv');

    if (!fs.existsSync(csvPath)) {
      const defaultHeader =
        'image_id,medicine_id,recognition_type,capture_timestamp,image_view,source,file_path,resolution_width,resolution_height,megapixels,brightness_pct,blur_score,glare_score_pct,is_acceptable,quality_warnings,notes\n';
      return new NextResponse(defaultHeader, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="mediband_dataset_metadata.csv"',
        },
      });
    }

    const fileContent = fs.readFileSync(csvPath, 'utf8');
    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="mediband_dataset_metadata.csv"',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
