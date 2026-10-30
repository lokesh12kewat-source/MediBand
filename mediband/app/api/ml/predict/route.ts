import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Prefer Python 3.11 with RTX 4050 CUDA PyTorch environment
const PYTHON_PATH = 'C:\\Users\\OMEN\\AppData\\Local\\Programs\\Python\\Python311\\python.exe';
const INFER_SCRIPT = path.join(process.cwd(), 'ml', 'infer.py');

export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;
  try {
    const body = await req.json();
    const { dataUrl, recognitionType } = body as {
      dataUrl?: string;
      recognitionType?: 'packaging' | 'loose_pill';
    };

    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return NextResponse.json(
        { success: false, error: 'Valid base64 image dataUrl required' },
        { status: 400 }
      );
    }

    const mode = recognitionType === 'loose_pill' ? 'loose_pill' : 'packaging';

    // Decode base64 to temp file
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { success: false, error: 'Malformed image data' },
        { status: 400 }
      );
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const tempFileName = `mediband_infer_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    tempFilePath = path.join(os.tmpdir(), tempFileName);
    fs.writeFileSync(tempFilePath, buffer);

    // Execute Python GPU inference engine
    const { stdout, stderr } = await execFileAsync(PYTHON_PATH, [INFER_SCRIPT, tempFilePath, mode], {
      timeout: 10000,
    });

    if (stderr && stderr.trim().length > 0) {
      console.warn('Inference stderr:', stderr);
    }

    // Parse JSON from output
    const jsonStart = stdout.indexOf('{');
    const jsonEnd = stdout.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`Invalid output from inference: ${stdout}`);
    }

    const result = JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('ML inference error:', errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // ignore cleanup error
      }
    }
  }
}
