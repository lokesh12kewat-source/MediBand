/**
 * run.mjs
 * Browser Test Harness Execution Script:
 * 1. Supports --split val (runs on images_val/ and writes results_val.json)
 *    and --split test (runs on images/ and writes results.json).
 * 2. Starts a tiny local static HTTP server.
 * 3. Launches installed Microsoft Edge via Playwright with channel: 'msedge'.
 * 4. Preprocesses images with canvas step-down halving (Strategy C, exactly matching lib/onnx-client.ts)
 *    as well as strategies 'a' and 'b'.
 * 5. Writes all predictions and logits to results file.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI arguments: --split val | test
const args = process.argv.slice(2);
let split = 'test';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--split' && args[i + 1]) {
    split = args[i + 1].toLowerCase();
  }
}

const PORT = 8089;
const isVal = (split === 'val');
const IMAGES_SUBDIR = isVal ? 'images_val' : 'images';
const IMAGES_DIR = path.join(__dirname, IMAGES_SUBDIR);
const RESULTS_FILE = path.join(__dirname, isVal ? 'results_val.json' : 'results.json');
const MANIFEST_FILE = path.join(__dirname, isVal ? 'val_images_manifest.json' : 'test_images_manifest.json');

console.log(`[Browser Harness] Split mode: ${split.toUpperCase()}`);
console.log(`[Browser Harness] Image directory: ${IMAGES_DIR}`);
console.log(`[Browser Harness] Target results file: ${RESULTS_FILE}`);

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.onnx': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
};

// 1. Start Tiny Static Server
const server = http.createServer((req, res) => {
  let reqUrl = decodeURI(req.url.split('?')[0]);
  if (reqUrl === '/') reqUrl = '/index.html';

  let filePath = path.join(__dirname, reqUrl);

  // Fallback for b7_fp32.onnx if located in experiments/export_b7
  if (reqUrl === '/b7_fp32.onnx' && !fs.existsSync(filePath)) {
    filePath = path.join(__dirname, '..', 'experiments', 'export_b7', 'b7_fp32.onnx');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 Not Found: ${reqUrl}`);
      } else {
        res.writeHead(500);
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content, 'utf-8');
    }
  });
});

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`[Browser Harness] Local static server listening on http://localhost:${PORT}`);

  if (!fs.existsSync(IMAGES_DIR)) {
    throw new Error(`Directory ${IMAGES_DIR} does not exist. Run setup script first.`);
  }

  const imageFiles = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  console.log(`[Browser Harness] Found ${imageFiles.length} images in ${IMAGES_DIR}`);

  console.log('[Browser Harness] Launching Microsoft Edge via Playwright...');
  let browser = null;
  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
  } catch (launchErr) {
    console.warn('[Browser Harness] Could not launch channel msedge, attempting default chromium launch:', launchErr.message);
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.error(`[Browser Console ERROR] ${msg.text()}`);
  });

  console.log('[Browser Harness] Navigating to harness index.html...');
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });

  // Wait for session initialization
  await page.waitForFunction(() => window.__modelReady === true || window.__modelError !== undefined, { timeout: 30000 });
  const modelError = await page.evaluate(() => window.__modelError);
  if (modelError) {
    throw new Error('Model initialization failed in browser: ' + modelError);
  }
  console.log('[Browser Harness] ONNX session successfully initialized in Microsoft Edge.');

  const results = {};
  // When running val calibration, strategy_c is the primary client matching strategy
  const strategies = isVal ? ['c'] : ['a', 'b', 'c'];
  const tStart = Date.now();

  for (let i = 0; i < imageFiles.length; i++) {
    const filename = imageFiles[i];
    const imageUrl = `/${IMAGES_SUBDIR}/${filename}`;
    results[filename] = {};

    for (const strat of strategies) {
      try {
        const evalRes = await page.evaluate(async ({ url, s }) => {
          return await window.runInference(url, s);
        }, { url: imageUrl, s: strat });

        results[filename][`strategy_${strat}`] = {
          top1: evalRes.top1,
          logits: evalRes.logits
        };
      } catch (err) {
        console.error(`Error processing ${filename} with strategy ${strat}:`, err.message);
        results[filename][`strategy_${strat}`] = {
          error: err.message
        };
      }
    }

    if ((i + 1) % 50 === 0 || i === imageFiles.length - 1) {
      const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
      console.log(`[Browser Harness] Processed ${i + 1}/${imageFiles.length} images (${elapsed}s elapsed)...`);
    }
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`[Browser Harness] Successfully saved results for ${imageFiles.length} images to ${RESULTS_FILE}`);

  await browser.close();
  server.close();
  console.log('[Browser Harness] Completed execution.');
}

main().catch(err => {
  console.error('[Browser Harness ERROR]', err);
  if (server) server.close();
  process.exit(1);
});
