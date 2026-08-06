/**
 * PUBLISHED-REWORK — captures the two screens a rework touches, off a running dev server, at a
 * moment the caller names. The point of the pair is the comparison: with a rework staged, the
 * operator's queue shows both versions while the customer's screen shows no sign of it.
 *
 *   node scripts/capture-published-rework-review.mjs staged
 *   node scripts/capture-published-rework-review.mjs swapped
 *
 * Writes /private/tmp/published-rework/<label>-*.png and prints what each screen reads.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.PUBLISHED_REWORK_BASE_URL ?? 'http://localhost:3000';
const label = process.argv[2] ?? 'now';
const outDir = '/private/tmp/published-rework';
const chrome = process.env.ANAKS_CHROME_EXECUTABLE_PATH?.trim()
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const CLINIC_CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** name, path, mock session cookie value, text to wait for */
const SCREENS = [
  ['customer-blog', '/dashboard/blog', CLINIC_CLIENT, /delivered/u],
  ['admin-content-queue', '/admin/content-queue', 'admin', /Content Approval Queue/u],
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
    for (const [name, pathname, session, ready] of SCREENS) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });
      await page.setCookie({
        name: 'anaks_mock_session',
        value: session,
        domain: 'localhost',
        path: '/',
      });
      await page.goto(`${base}${pathname}`, { waitUntil: 'networkidle0', timeout: 60_000 });
      await page.waitForFunction(
        (source) => new RegExp(source, 'u').test(document.body.innerText),
        { timeout: 30_000 },
        ready.source,
      ).catch(() => undefined);
      const file = path.join(outDir, `${label}-${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      findings.push({
        screen: name,
        file,
        reads: await page.evaluate(() => ({
          counter: /[^\n]*\d+ of \d+ delivered[^\n]*/u.exec(document.body.innerText)?.[0] ?? null,
          stagedPanel: document.body.innerText.includes('Staged replacement'),
          liveBadge: document.body.innerText.includes('Live on the site'),
        })),
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ label, findings }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
