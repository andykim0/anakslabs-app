/**
 * BLOG-SCREEN — captures the customer blog screen and the admin content queue off a running
 * dev server, so the fulfillment counter is read from real routes rather than a static harness.
 *
 *   node scripts/capture-blog-screen-review.mjs
 *
 * Writes /private/tmp/blog-screen/*.png.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.BLOG_SCREEN_BASE_URL ?? 'http://localhost:3000';
const outDir = '/private/tmp/blog-screen';
const chrome = process.env.ANAKS_CHROME_EXECUTABLE_PATH?.trim()
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const CLINIC_CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** name, path, mock session cookie value */
const SCREENS = [
  ['customer-blog', '/dashboard/blog', CLINIC_CLIENT],
  ['admin-content-queue', '/admin/content-queue', 'admin'],
];

const VIEWPORTS = [
  ['1440', { width: 1440, height: 1000, deviceScaleFactor: 2 }],
  ['375', { width: 375, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'shell',
    args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'],
  });
  const findings = [];
  try {
    for (const [name, pathname, session] of SCREENS) {
      for (const [label, viewport] of VIEWPORTS) {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        await page.setCookie({
          name: 'anaks_mock_session',
          value: session,
          domain: 'localhost',
          path: '/',
        });
        await page.goto(`${base}${pathname}`, { waitUntil: 'networkidle0', timeout: 60_000 });
        // The admin queue paints its counter from a client fetch; wait for the text itself.
        await page.waitForFunction(
          () => /\d+ of \d+ published/u.test(document.body.innerText),
          { timeout: 30_000 },
        ).catch(() => undefined);
        const counter = await page.evaluate(() =>
          /[^\n]*\d+ of \d+ published[^\n]*/u.exec(document.body.innerText)?.[0] ?? null);
        const file = path.join(outDir, `${name}-${label}.png`);
        await page.screenshot({ path: file, fullPage: true });
        findings.push({ screen: name, viewport: label, counter, file });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  await writeFile(
    path.join(outDir, 'counters.json'),
    `${JSON.stringify(findings, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify(findings, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
