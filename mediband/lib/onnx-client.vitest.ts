import { describe, it, expect } from 'vitest';
import {
  normalizePixels,
  softmax,
  extractTopK,
  computeLetterboxCoords,
  drawImageWithStepDown,
} from './onnx-client';
import packagingB7Config from '@/public/models/packaging_b7.json';

describe('ONNX Client Mathematics & Preprocessing', () => {
  it('1. Correctly computes softmax probabilities and ensures sum equals 1.0', () => {
    const logits = [2.0, 1.0, 0.1];
    const probs = softmax(logits);

    expect(probs).toHaveLength(3);
    const sum = probs.reduce((acc, p) => acc + p, 0);
    expect(sum).toBeCloseTo(1.0, 5);

    // Monotonicity: largest logit has highest probability
    expect(probs[0]).toBeGreaterThan(probs[1]);
    expect(probs[1]).toBeGreaterThan(probs[2]);
  });

  it('2. Softmax is invariant to uniform shift (numerical stability)', () => {
    const raw = [10.0, 5.0, -2.0];
    const shifted = [1010.0, 1005.0, 998.0];

    const p1 = softmax(raw);
    const p2 = softmax(shifted);

    for (let i = 0; i < raw.length; i++) {
      expect(p1[i]).toBeCloseTo(p2[i], 5);
    }
  });

  it('3. Normalizes image pixels into NCHW planar Float32Array with ImageNet parameters', () => {
    const width = 2;
    const height = 2;
    const rgba = new Uint8ClampedArray(width * height * 4);

    // Pixel 0: pure white (255, 255, 255)
    rgba[0] = 255;
    rgba[1] = 255;
    rgba[2] = 255;
    rgba[3] = 255;

    // Pixel 1: pure black (0, 0, 0)
    rgba[4] = 0;
    rgba[5] = 0;
    rgba[6] = 0;
    rgba[7] = 255;

    const normalized = normalizePixels(rgba, width, height);

    expect(normalized).toHaveLength(3 * width * height);

    // Expected white values:
    // (1.0 - 0.485) / 0.229 = ~2.2489
    // (1.0 - 0.456) / 0.224 = ~2.4285
    // (1.0 - 0.406) / 0.225 = ~2.64
    expect(normalized[0]).toBeCloseTo((1.0 - 0.485) / 0.229, 3);
    expect(normalized[4]).toBeCloseTo((1.0 - 0.456) / 0.224, 3);
    expect(normalized[8]).toBeCloseTo((1.0 - 0.406) / 0.225, 3);

    // Expected black values:
    // (0.0 - 0.485) / 0.229 = ~-2.1179
    expect(normalized[1]).toBeCloseTo((0.0 - 0.485) / 0.229, 3);
  });

  it('4. Correctly extracts top-3 predictions and enforces 50% safety confidence threshold', () => {
    const idxToClass = {
      '0': 'Dolo-650',
      '1': 'Calpol 500',
      '2': 'Shelcal 500',
      '3': 'Augmentin 625 Duo',
    };

    // Case A: High confidence match (85% on Dolo-650)
    const confidentProbs = [0.85, 0.10, 0.03, 0.02];
    const resA = extractTopK(confidentProbs, idxToClass, 3, 0.50);

    expect(resA.prediction).toBe('Dolo-650');
    expect(resA.confidence).toBe(0.85);
    expect(resA.top3).toHaveLength(3);
    expect(resA.top3[0].label).toBe('Dolo-650');
    expect(resA.top3[1].label).toBe('Calpol 500');

    // Case B: Low confidence / ambiguous match (38% on Calpol) -> safety threshold triggers null
    const lowConfProbs = [0.25, 0.38, 0.20, 0.17];
    const resB = extractTopK(lowConfProbs, idxToClass, 3, 0.50);

    expect(resB.prediction).toBeNull(); // Below 50% threshold
    expect(resB.confidence).toBe(0.38);
    expect(resB.top3[0].label).toBe('Calpol 500');
  });

  it('5. Phase 4: Preserves aspect ratio with letterbox padding for tall blister packs without squashing', () => {
    // Square image
    const square = computeLetterboxCoords(500, 500, 224);
    expect(square.dw).toBe(224);
    expect(square.dh).toBe(224);
    expect(square.dx).toBe(0);
    expect(square.dy).toBe(0);

    // Elongated tall blister pack (471 x 1024) - real Metronidazole strip format
    const tallStrip = computeLetterboxCoords(471, 1024, 224);
    expect(tallStrip.dh).toBe(224);
    expect(tallStrip.dw).toBe(103);
    expect(tallStrip.dx).toBe(61);
    expect(tallStrip.dy).toBe(0);

    // Wide horizontal strip (1024 x 471)
    const wideStrip = computeLetterboxCoords(1024, 471, 224);
    expect(wideStrip.dw).toBe(224);
    expect(wideStrip.dh).toBe(103);
    expect(wideStrip.dx).toBe(0);
    expect(wideStrip.dy).toBe(61);
  });

  it('6. Temperature scaling correctly calibrates softmax probability distribution', () => {
    const logits = [3.0, 1.0, 0.0];
    const pStandard = softmax(logits, 1.0);
    const pSharpened = softmax(logits, 0.5); // T < 1.0 sharpens confidence
    const pSmoothed = softmax(logits, 2.0);   // T > 1.0 flattens confidence

    expect(pSharpened[0]).toBeGreaterThan(pStandard[0]);
    expect(pStandard[0]).toBeGreaterThan(pSmoothed[0]);

    // All probability distributions still sum to 1.0
    expect(pSharpened.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 5);
    expect(pSmoothed.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 5);
  });

  it('7. Verifies Packaging B7 configuration JSON structure and class alignment', () => {
    expect(packagingB7Config.model_path).toBe('/models/mediband_packaging_b7.onnx');
    expect(packagingB7Config.input_size).toBe(288);
    expect(packagingB7Config.num_classes).toBe(53);
    expect(packagingB7Config.class_labels).toHaveLength(53);
    expect(packagingB7Config.temperature).toBeGreaterThan(0);
    expect(packagingB7Config.thresholds.precision_98).toBeGreaterThan(0.5);
    expect(packagingB7Config.thresholds.precision_99).toBeGreaterThan(packagingB7Config.thresholds.precision_98);
  });

  it('8. Step-down halving helper returns valid 288x288 ImageData structure', () => {
    // In node/vitest environment, check fallback handling for zero/mock dimension
    const mockImg = {
      naturalWidth: 0,
      naturalHeight: 0,
      width: 0,
      height: 0,
    } as unknown as HTMLImageElement;

    // In non-DOM environment, verify handling or canvas generation
    if (typeof document !== 'undefined') {
      const imgData = drawImageWithStepDown(mockImg, 288);
      expect(imgData.width).toBe(288);
      expect(imgData.height).toBe(288);
    }
  });
});
