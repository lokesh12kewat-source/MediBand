import { ImageQualityAssessment } from '@/types';

export interface QualityCheckOptions {
  minWidth?: number;
  minHeight?: number;
  minMegapixels?: number;
  darknessThreshold?: number; // 0 - 255 (default 40)
  glareThreshold?: number;    // 0 - 255 (default 245)
  glarePercentageLimit?: number; // percent of clipped pixels (default 8)
  blurSharpnessThreshold?: number; // minimum Laplacian variance score (default 35)
}

const DEFAULT_OPTIONS: Required<QualityCheckOptions> = {
  minWidth: 640,
  minHeight: 480,
  minMegapixels: 0.3,
  darknessThreshold: 40,
  glareThreshold: 245,
  glarePercentageLimit: 8.0,
  blurSharpnessThreshold: 35.0,
};

/**
 * Evaluates image quality from RGBA pixel data.
 * Pure mathematical functions for brightness, glare, resolution, and Laplacian sharpness.
 */
export function analyzePixelData(
  pixels: Uint8ClampedArray | number[],
  width: number,
  height: number,
  options: QualityCheckOptions = {}
): ImageQualityAssessment {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const totalPixels = width * height;
  const megapixels = Number(((width * height) / 1_000_000).toFixed(2));
  const warnings: string[] = [];

  // 1. Resolution Check
  if (width < opts.minWidth || height < opts.minHeight || megapixels < opts.minMegapixels) {
    warnings.push(
      `Low resolution (${width}×${height}, ${megapixels} MP). Recommended at least ${opts.minWidth}×${opts.minHeight}.`
    );
  }

  if (totalPixels === 0) {
    return {
      resolution: { width, height },
      megapixels: 0,
      brightness: 0,
      blurScore: 0,
      glareScore: 0,
      isAcceptable: false,
      warnings: ['Empty or zero-dimension image'],
    };
  }

  // 2. Grayscale & Luminance extraction
  // Convert to grayscale: Y = 0.299 R + 0.587 G + 0.114 B
  const gray = new Float32Array(totalPixels);
  let totalLuminance = 0;
  let glarePixelsCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = lum;
    totalLuminance += lum;

    if (lum >= opts.glareThreshold) {
      glarePixelsCount++;
    }
  }

  const avgLuminance = totalLuminance / totalPixels;
  const brightnessPercent = Number(((avgLuminance / 255) * 100).toFixed(1));
  const glarePercent = Number(((glarePixelsCount / totalPixels) * 100).toFixed(1));

  // 3. Darkness Check
  if (avgLuminance < opts.darknessThreshold) {
    warnings.push(
      `Image is too dark (average brightness ${brightnessPercent}%). Ensure adequate direct lighting.`
    );
  }

  // 4. Glare Check
  if (glarePercent > opts.glarePercentageLimit) {
    warnings.push(
      `Excessive glare detected (${glarePercent}% specular saturation). Angle the medicine pack away from reflection.`
    );
  }

  // 5. Blur Detection via Discrete Laplacian Kernel [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
  // Compute variance of Laplacian on a downsampled or interior grid
  let laplacianSum = 0;
  let laplacianSqSum = 0;
  let sampleCount = 0;

  // Stride of 2 for fast evaluation on large resolutions
  const stride = width > 1200 ? 2 : 1;

  for (let y = 1; y < height - 1; y += stride) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x += stride) {
      const center = gray[rowOffset + x];
      const top = gray[rowOffset - width + x];
      const bottom = gray[rowOffset + width + x];
      const left = gray[rowOffset + x - 1];
      const right = gray[rowOffset + x + 1];

      const lap = top + bottom + left + right - 4 * center;
      laplacianSum += lap;
      laplacianSqSum += lap * lap;
      sampleCount++;
    }
  }

  const mean = sampleCount > 0 ? laplacianSum / sampleCount : 0;
  const variance = sampleCount > 0 ? laplacianSqSum / sampleCount - mean * mean : 0;
  const blurScore = Number(variance.toFixed(1));

  // If variance is below threshold, image edges are smoothed/blurred
  if (blurScore < opts.blurSharpnessThreshold) {
    warnings.push(
      `Image appears blurry or out of focus (sharpness score ${blurScore}). Hold the camera steady and tap to focus.`
    );
  }

  const isAcceptable = warnings.length === 0;

  return {
    resolution: { width, height },
    megapixels,
    brightness: brightnessPercent,
    blurScore,
    glareScore: glarePercent,
    isAcceptable,
    warnings,
  };
}

/**
 * Analyzes an HTMLCanvasElement in browser environment
 */
export function analyzeCanvas(
  canvas: HTMLCanvasElement,
  options: QualityCheckOptions = {}
): ImageQualityAssessment {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      resolution: { width: canvas.width, height: canvas.height },
      megapixels: 0,
      brightness: 0,
      blurScore: 0,
      glareScore: 0,
      isAcceptable: false,
      warnings: ['Unable to acquire 2D rendering context from canvas'],
    };
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return analyzePixelData(imgData.data, canvas.width, canvas.height, options);
}

/**
 * Analyzes an HTMLImageElement by drawing it to an offscreen canvas
 */
export async function analyzeImageElement(
  img: HTMLImageElement,
  options: QualityCheckOptions = {}
): Promise<ImageQualityAssessment> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      resolution: { width: canvas.width, height: canvas.height },
      megapixels: 0,
      brightness: 0,
      blurScore: 0,
      glareScore: 0,
      isAcceptable: false,
      warnings: ['Unable to create 2D canvas context'],
    };
  }
  ctx.drawImage(img, 0, 0);
  return analyzeCanvas(canvas, options);
}
