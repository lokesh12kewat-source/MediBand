import packagingB7Config from '@/public/models/packaging_b7.json';
import packagingLegacyMeta from '@/data/ml_classes.json';
import loosePillMeta from '@/data/ml_loose_pill_classes.json';
import { MLPredictionResult } from '@/components/ml/PredictionCard';

// ─── Mathematical Helpers (Pure Functions for Testing) ─────────────────────────

export function normalizePixels(
  rgba: Uint8ClampedArray | number[],
  width: number = 288,
  height: number = 288,
  mean: number[] = [0.485, 0.456, 0.406],
  std: number[] = [0.229, 0.224, 0.225]
): Float32Array {
  const channelSize = width * height;
  const floatData = new Float32Array(3 * channelSize);

  for (let i = 0; i < channelSize; i++) {
    const r = rgba[i * 4] / 255.0;
    const g = rgba[i * 4 + 1] / 255.0;
    const b = rgba[i * 4 + 2] / 255.0;

    floatData[i] = (r - mean[0]) / std[0];                   // R plane
    floatData[channelSize + i] = (g - mean[1]) / std[1];     // G plane
    floatData[2 * channelSize + i] = (b - mean[2]) / std[2]; // B plane
  }

  return floatData;
}

/**
 * Temperature-calibrated softmax computation:
 * Divides logits by the calibration temperature before exponentiation.
 */
export function softmax(logits: Float32Array | number[], temperature: number = 1.0): number[] {
  const temp = temperature > 0 ? temperature : 1.0;
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    const scaled = logits[i] / temp;
    if (scaled > max) max = scaled;
  }
  let sum = 0;
  const exp = new Float64Array(logits.length);
  for (let i = 0; i < logits.length; i++) {
    const val = Math.exp((logits[i] / temp) - max);
    exp[i] = val;
    sum += val;
  }
  const result = new Array(logits.length);
  for (let i = 0; i < logits.length; i++) {
    result[i] = sum > 0 ? exp[i] / sum : 0;
  }
  return result;
}

export function extractTopK(
  probabilities: number[],
  idxToClass: Record<string, string>,
  k: number = 3,
  confidenceThreshold: number = 0.50
): {
  prediction: string | null;
  confidence: number;
  top3: Array<{ label: string; confidence: number }>;
} {
  const indexed = probabilities.map((p, idx) => ({
    label: idxToClass[String(idx)] ?? `Class_${idx}`,
    confidence: p,
  }));

  indexed.sort((a, b) => b.confidence - a.confidence);

  const top1 = indexed[0];
  const isConfident = top1 && top1.confidence >= confidenceThreshold;

  return {
    prediction: isConfident ? top1.label : null,
    confidence: top1 ? top1.confidence : 0,
    top3: indexed.slice(0, k),
  };
}

/**
 * Phase 4 Letterbox Preprocessing Helper:
 * Computes destination drawing coordinates and dimensions so arbitrary aspect-ratio
 * medicine packages fit into the target square without loss.
 */
export function computeLetterboxCoords(
  srcWidth: number,
  srcHeight: number,
  targetSize: number = 224
): { dx: number; dy: number; dw: number; dh: number; scale: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { dx: 0, dy: 0, dw: targetSize, dh: targetSize, scale: 1 };
  }
  const scale = Math.min(targetSize / srcWidth, targetSize / srcHeight);
  const dw = Math.round(srcWidth * scale);
  const dh = Math.round(srcHeight * scale);
  const dx = Math.round((targetSize - dw) / 2);
  const dy = Math.round((targetSize - dh) / 2);

  return { dx, dy, dw, dh, scale };
}

// ─── Browser ONNX Runtime Web Loader ──────────────────────────────────────────

let ortLoaderPromise: Promise<any> | null = null;

export async function getOrt(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).ort) return (window as any).ort;

  if (!ortLoaderPromise) {
    ortLoaderPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="ort"]');
      if (existing) {
        existing.addEventListener('load', () => resolve((window as any).ort));
        existing.addEventListener('error', () => reject(new Error('Failed to load onnxruntime-web')));
        return;
      }
      const script = document.createElement('script');
      // Vendored local copy in public/ort/
      script.src = '/ort/ort.min.js';
      script.async = true;
      script.onload = () => resolve((window as any).ort);
      script.onerror = () => {
        // Fallback to CDN if local server is unavailable
        const cdnScript = document.createElement('script');
        cdnScript.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js';
        cdnScript.async = true;
        cdnScript.onload = () => resolve((window as any).ort);
        cdnScript.onerror = () => {
          ortLoaderPromise = null;
          reject(new Error('Failed to load ONNX Runtime Web locally or from CDN'));
        };
        document.head.appendChild(cdnScript);
      };
      document.head.appendChild(script);
    });
  }
  return ortLoaderPromise;
}

const sessionCache: Record<string, any> = {};

export async function getInferenceSession(
  mode: 'packaging' | 'loose_pill',
  useLegacy: boolean = false
): Promise<any> {
  const cacheKey = `${mode}_${useLegacy ? 'legacy' : 'default'}`;
  if (sessionCache[cacheKey]) return sessionCache[cacheKey];

  const ort = await getOrt();
  if (!ort) throw new Error('ONNX Runtime Web is not available in this environment');

  ort.env.wasm.wasmPaths = '/ort/';

  let modelPath: string;
  if (mode === 'loose_pill') {
    modelPath = '/models/mediband_loose_pill_model.onnx';
  } else if (useLegacy) {
    modelPath = '/models/mediband_packaging_model.onnx';
  } else {
    modelPath = packagingB7Config.model_path || '/models/mediband_packaging_b7.onnx';
  }

  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

  sessionCache[cacheKey] = session;
  return session;
}

// ─── Image Element Preprocessing ──────────────────────────────────────────────

/**
 * Step-Down Halving Preprocessing for B7 (Target 288x288):
 * Iteratively halves the dimensions on intermediate canvases with imageSmoothingQuality = 'high'
 * until both width and height are under 2x target size (576 px), then performs a final draw to 288x288.
 */
export function drawImageWithStepDown(
  img: HTMLImageElement,
  targetSize: number = 288
): ImageData {
  let curW = img.naturalWidth || img.width;
  let curH = img.naturalHeight || img.height;

  if (curW <= 0 || curH <= 0) {
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d rendering context');
    return ctx.getImageData(0, 0, targetSize, targetSize);
  }

  let srcCanvas = document.createElement('canvas');
  srcCanvas.width = curW;
  srcCanvas.height = curH;
  let srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('Failed to get 2d rendering context');
  srcCtx.drawImage(img, 0, 0);

  const threshold = 2 * targetSize;

  while (curW > threshold || curH > threshold) {
    const nextW = Math.max(targetSize, Math.floor(curW / 2));
    const nextH = Math.max(targetSize, Math.floor(curH / 2));
    const stepCanvas = document.createElement('canvas');
    stepCanvas.width = nextW;
    stepCanvas.height = nextH;
    const stepCtx = stepCanvas.getContext('2d');
    if (!stepCtx) throw new Error('Failed to get 2d rendering context');
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(srcCanvas, 0, 0, nextW, nextH);

    srcCanvas = stepCanvas;
    curW = nextW;
    curH = nextH;
  }

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetSize;
  finalCanvas.height = targetSize;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) throw new Error('Failed to get 2d rendering context');
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(srcCanvas, 0, 0, targetSize, targetSize);

  return finalCtx.getImageData(0, 0, targetSize, targetSize);
}

export function drawImageTo224Canvas(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d rendering context');

  ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 224, 224);
  return ctx.getImageData(0, 0, 224, 224);
}

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image from data URL'));
    img.src = dataUrl;
  });
}

// ─── In-Browser Inference Pipeline ─────────────────────────────────────────────

export interface InferenceOptions {
  useLegacy?: boolean;
}

export async function runClientInference(
  dataUrl: string,
  mode: 'packaging' | 'loose_pill',
  options?: InferenceOptions
): Promise<MLPredictionResult> {
  const t0 = performance.now();
  const useLegacy = options?.useLegacy ?? false;

  const [ort, session, img] = await Promise.all([
    getOrt(),
    getInferenceSession(mode, useLegacy),
    loadImage(dataUrl),
  ]);

  const isB7 = mode === 'packaging' && !useLegacy;
  const inputSize = isB7 ? (packagingB7Config.input_size || 288) : 224;

  const imageData = isB7
    ? drawImageWithStepDown(img, inputSize)
    : drawImageTo224Canvas(img);

  const mean = isB7 ? packagingB7Config.normalization.mean : [0.485, 0.456, 0.406];
  const std = isB7 ? packagingB7Config.normalization.std : [0.229, 0.224, 0.225];

  const normalized = normalizePixels(imageData.data, inputSize, inputSize, mean, std);

  const inputTensor = new ort.Tensor('float32', normalized, [1, 3, inputSize, inputSize]);
  const feeds = { input_image: inputTensor };
  const results = await session.run(feeds);
  const output = results.logits;

  const logitsFloat = output.data as Float32Array;
  const rawLogits = Array.from(logitsFloat);

  const temp = isB7 ? (packagingB7Config.temperature || 1.0) : 1.0;
  const probabilities = softmax(rawLogits, temp);

  const idxToClass: Record<string, string> = {};
  if (isB7) {
    packagingB7Config.class_labels.forEach((name: string, idx: number) => {
      idxToClass[String(idx)] = name;
    });
  } else if (mode === 'packaging') {
    Object.assign(idxToClass, packagingLegacyMeta.idx_to_class);
  } else {
    Object.assign(idxToClass, loosePillMeta.idx_to_class);
  }

  // Use precision_98 threshold for B7 model, fallback to 0.50
  const threshold = isB7
    ? (packagingB7Config.thresholds?.precision_98 ?? 0.6120)
    : 0.50;

  const { prediction, confidence, top3 } = extractTopK(
    probabilities,
    idxToClass,
    3,
    threshold
  );

  const inferenceMs = Math.round(performance.now() - t0);

  return {
    mode,
    device: isB7 ? 'Browser WebAssembly (Client-Side B7 288px)' : 'Browser WebAssembly (Client-Side ONNX)',
    prediction,
    confidence,
    top3,
    inferenceMs,
    rawLogits,
    calibratedProbabilities: probabilities,
  };
}
