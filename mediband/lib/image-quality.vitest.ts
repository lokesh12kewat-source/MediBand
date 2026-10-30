import { describe, it, expect } from 'vitest';
import { analyzePixelData } from './image-quality';

describe('Image Quality Analyzer', () => {
  it('detects low resolution correctly', () => {
    // 320x240 image (smaller than 640x480 minimum)
    const width = 320;
    const height = 240;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(128); // medium gray

    const result = analyzePixelData(pixels, width, height);
    expect(result.resolution.width).toBe(320);
    expect(result.resolution.height).toBe(240);
    expect(result.warnings.some(w => w.includes('Low resolution'))).toBe(true);
    expect(result.isAcceptable).toBe(false);
  });

  it('detects excessive darkness', () => {
    const width = 640;
    const height = 480;
    // Pitch black image (0 luminance)
    const pixels = new Uint8ClampedArray(width * height * 4).fill(10); // R=10, G=10, B=10, A=10

    const result = analyzePixelData(pixels, width, height);
    expect(result.warnings.some(w => w.includes('Image is too dark'))).toBe(true);
    expect(result.brightness).toBeLessThan(10);
    expect(result.isAcceptable).toBe(false);
  });

  it('detects excessive glare / blown-out pixels', () => {
    const width = 640;
    const height = 480;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(100);

    // Make 25% of the pixels pure white (255)
    for (let i = 0; i < (width * height) * 0.25; i++) {
      pixels[i * 4] = 255;
      pixels[i * 4 + 1] = 255;
      pixels[i * 4 + 2] = 255;
      pixels[i * 4 + 3] = 255;
    }

    const result = analyzePixelData(pixels, width, height);
    expect(result.warnings.some(w => w.includes('Excessive glare'))).toBe(true);
    expect(result.glareScore).toBeGreaterThanOrEqual(20);
    expect(result.isAcceptable).toBe(false);
  });

  it('detects blurry/flat images with low edge variance', () => {
    const width = 640;
    const height = 480;
    // Perfectly uniform gray image (variance = 0)
    const pixels = new Uint8ClampedArray(width * height * 4).fill(150);

    const result = analyzePixelData(pixels, width, height);
    expect(result.blurScore).toBe(0);
    expect(result.warnings.some(w => w.includes('blurry or out of focus'))).toBe(true);
  });

  it('passes quality checks for sharp, well-lit, high-resolution image', () => {
    const width = 800;
    const height = 600;
    const pixels = new Uint8ClampedArray(width * height * 4);

    // Create a high-contrast checkerboard pattern simulating high-frequency text / edges
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const isWhite = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0);
        const val = isWhite ? 220 : 60; // good dynamic range, not clipped
        pixels[idx] = val;
        pixels[idx + 1] = val;
        pixels[idx + 2] = val;
        pixels[idx + 3] = 255;
      }
    }

    const result = analyzePixelData(pixels, width, height);
    expect(result.resolution.width).toBe(800);
    expect(result.resolution.height).toBe(600);
    expect(result.blurScore).toBeGreaterThan(100); // very sharp
    expect(result.glareScore).toBeLessThan(1);
    expect(result.brightness).toBeGreaterThan(30);
    expect(result.warnings.length).toBe(0);
    expect(result.isAcceptable).toBe(true);
  });
});
