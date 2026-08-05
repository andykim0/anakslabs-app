/**
 * REBRAND — captures the application's own screens off a running dev server and
 * records the live tenant document's body/font computed styles so the before/after
 * comparison is made against real routes, not a static harness.
 *
 *   node scripts/capture-rebrand-review.mjs <label>
 *
 * Writes /private/tmp/rebrand/<label>/*.png and <label>/tenant-dom.json.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const label = process.argv[2] ?? 'after';
const base = process.env.REBRAND_BASE_URL ?? 'http://localhost:3200';
const outDir = path.join('/private/tmp/rebrand', label);
const chrome = process.env.ANAKS_CHROME_EXECUTABLE_PATH?.trim()
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SITE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT = '/s/hwarodam.anakslabs.com';

/** name, path, mock session cookie value (null = signed out) */
const SCREENS = [
  ['login', '/login', null],
  ['signup', '/signup', null],
  ['marketing-home', '/', null],
  ['dashboard', '/dashboard', 'demo-premium'],
  ['dashboard-reports', '/dashboard/reports', 'demo-premium'],
  ['admin', '/admin', 'admin'],
  ['editor', `/dashboard/sites/${SITE_ID}/editor`, 'demo-premium'],
  ['tenant-404', '/s/does-not-exist.anakslabs.com', null],
];

const VIEWPORTS = [
  ['1440', { width: 1440, height: 900, deviceScaleFactor: 2 }],
  ['375', { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'shell',
    args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'],
  });

  const report = { label, base, screens: [], tenant: null };

  for (const [name, route, session] of SCREENS) {
    for (const [vpName, viewport] of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      const existing = await browser.cookies();
      if (existing.length > 0) await browser.deleteCookie(...existing);
      if (session) {
        await browser.setCookie({
          name: 'anaks_mock_session',
          value: session,
          domain: 'localhost',
          path: '/',
        });
      }
      const url = `${base}${route}`;
      let status = 0;
      try {
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 90_000 });
        status = response?.status() ?? 0;
        await new Promise((r) => setTimeout(r, 1200));
        await page.screenshot({ path: path.join(outDir, `${name}-${vpName}.png`), fullPage: false });
      } catch (error) {
        report.screens.push({ name, vpName, url, error: String(error) });
        await page.close();
        continue;
      }
      const probe = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const mark = document.querySelector('img[src*="anakslabs-mark"], img[src*="anakslabs-logo"]');
        return {
          bodyFont: body.fontFamily,
          bodyBackground: body.backgroundColor,
          bodyColor: body.color,
          htmlClass: document.documentElement.className,
          bodyClass: document.body.className,
          brandImg: mark ? mark.getAttribute('src') : null,
          brandImgVisible: mark ? mark.getBoundingClientRect().width > 0 : false,
          inlineGradientMarks: document.querySelectorAll('svg linearGradient[id*="anaks"]').length,
        };
      });
      report.screens.push({ name, vpName, url, status, ...probe });
      await page.close();
    }
  }

  // Live tenant render — the surface that must not regress.
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const tenantCookies = await browser.cookies();
    if (tenantCookies.length > 0) await browser.deleteCookie(...tenantCookies);
    const response = await page.goto(`${base}${TENANT}`, { waitUntil: 'networkidle2', timeout: 120_000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outDir, 'tenant-hwarodam-1440.png') });
    report.tenant = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const html = getComputedStyle(document.documentElement);
      // Computed styles of every element that carries visible text, in document order.
      const typography = [];
      for (const el of Array.from(document.querySelectorAll('body *')).slice(0, 400)) {
        const cs = getComputedStyle(el);
        typography.push([
          el.tagName,
          cs.fontFamily,
          cs.fontSize,
          cs.fontWeight,
          cs.color,
          cs.backgroundColor,
        ].join('|'));
      }
      return {
        status: 'ok',
        htmlClass: document.documentElement.className,
        bodyClass: document.body.className,
        htmlFont: html.fontFamily,
        bodyFont: body.fontFamily,
        bodyBackground: body.backgroundColor,
        bodyColor: body.color,
        bodyFontSize: body.fontSize,
        title: document.title,
        faviconHref: document.querySelector('link[rel~="icon"]')?.getAttribute('href') ?? null,
        elementCount: document.querySelectorAll('*').length,
        typography,
        html: document.documentElement.outerHTML,
      };
    });
    report.tenant.status = response?.status() ?? 0;
    await page.close();
  }

  await browser.close();
  await writeFile(path.join(outDir, 'tenant-dom.json'), JSON.stringify(report.tenant, null, 2));
  const tenantSummary = { ...report.tenant };
  delete tenantSummary.html;
  delete tenantSummary.typography;
  await writeFile(
    path.join(outDir, 'report.json'),
    JSON.stringify({ ...report, tenant: tenantSummary }, null, 2),
  );
  console.log(JSON.stringify({ ...report, tenant: tenantSummary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
