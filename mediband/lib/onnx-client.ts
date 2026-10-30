import packagingMeta from '@/data/ml_classes.json';
import loosePillMeta from '@/data/ml_loose_pill_classes.json';
import { MLPredictionResult } from '@/components/ml/PredictionCard';

// ─── Mathematical Helpers (Pure Functions for Testing) ─────────────────────────

export function normalizePixels(
  rgba: Uint8ClampedArray | number[],
  width: number = 224,
  height: number = 224
): Float32Array {
  const channelSize = width * height;
  const floatData = new Float32Array(3 * channelSize);

  // Standard ImageNet normalization parameters
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

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

export function softmax(logits: Float32Array | number[]): number[] {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > max) max = logits[i];
  }
  let sum = 0;
  const exp = new Float64Array(logits.length);
  for (let i = 0; i < logits.length; i++) {
    const val = Math.exp(logits[i] - max);
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

// ─── Browser ONNX Runtime Web Loader ──────────────────────────────────────────

let ortLoaderPromise: Promise<any> | null = null;

export async function getOrt(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).ort) return (window as any).ort;

  if (!ortLoaderPromise) {
    ortLoaderPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="onnxruntime-web"]');
      if (existing) {
        existing.addEventListener('load', () => resolve((window as any).ort));
        existing.addEventListener('error', () => reject(new Error('Failed to load onnxruntime-web')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js';
      script.async = true;
      script.onload = () => resolve((window as any).ort);
      script.onerror = () => {
        ortLoaderPromise = null;
        reject(new Error('Failed to load ONNX Runtime Web from CDN'));
      };
      document.head.appendChild(script);
    });
  }
  return ortLoaderPromise;
}

const sessionCache: Record<string, any> = {};

export async function getInferenceSession(mode: 'packaging' | 'loose_pill'): Promise<any> {
  if (sessionCache[mode]) return sessionCache[mode];

  const ort = await getOrt();
  if (!ort) throw new Error('ONNX Runtime Web is not available in this environment');

  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';

  const modelPath =
    mode === 'packaging'
      ? '/models/mediband_packaging_model.onnx'
      : '/models/mediband_loose_pill_model.onnx';

  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

  sessionCache[mode] = session;
  return session;
}

// ─── Image Element Preprocessing ──────────────────────────────────────────────

export function drawImageTo224Canvas(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d rendering context');

  // Fill white background for transparent PNGs
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 224, 224);

  // Resize and center crop
  const scale = Math.max(224 / img.width, 224 / img.height);
  const sw = 224 / scale;
  const sh = 224 / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 224, 224);
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

export async function runClientInference(
  dataUrl: string,
  mode: 'packaging' | 'loose_pill'
): Promise<MLPredictionResult> {
  const t0 = performance.now();

  const [ort, session, img] = await Promise.all([
    getOrt(),
    getInferenceSession(mode),
    loadImage(dataUrl),
  ]);

  const imageData = drawImageTo224Canvas(img);
  const normalized = normalizePixels(imageData.data, 224, 224);

  const inputTensor = new ort.Tensor('float32', normalized, [1, 3, 224, 224]);
  const feeds = { input_image: inputTensor };
  const results = await session.run(feeds);
  const output = results.logits;

  const logits = output.data as Float32Array;
  const probabilities = softmax(logits);

  const idxToClass =
    mode === 'packaging' ? packagingMeta.idx_to_class : loosePillMeta.idx_to_class;

  const { prediction, confidence, top3 } = extractTopK(
    probabilities,
    idxToClass as Record<string, string>,
    3,
    0.50
  );

  const inferenceMs = Math.round(performance.now() - t0);

  return {
    mode,
    device: 'Browser WebAssembly (Client-Side ONNX)',
    prediction,
    confidence,
    top3,
    inferenceMs,
  };
}
