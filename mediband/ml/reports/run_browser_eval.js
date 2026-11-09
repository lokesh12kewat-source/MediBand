// Smallest Playwright Node.js script to run browser evaluation
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to local test harness server
  await page.goto('http://localhost:3000/browser_eval_page.html');
  await page.waitForFunction(() => typeof window.runBatch === 'function');

  console.log('Starting Playwright browser evaluation on 351 test images...');
  await page.evaluate(() => window.runBatch('/test_manifest.json'));

  await page.waitForFunction(() => window.__EVAL_RESULTS__ && window.__EVAL_RESULTS__.length === 351, { timeout: 300000 });
  const results = await page.evaluate(() => window.__EVAL_RESULTS__);

  fs.writeFileSync('browser_eval_results.json', JSON.stringify(results, null, 2));
  console.log('Saved browser_eval_results.json successfully.');
  await browser.close();
})();
