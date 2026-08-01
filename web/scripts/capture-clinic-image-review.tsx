import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer, { type Page } from 'puppeteer-core';
import { TenantPageContent } from '@/components/site-renderer';
import type { SiteConfig } from '@/lib/types/site';

const BEFORE_ROOT = process.env.CLINIC_IMAGE_BEFORE_ROOT
  ?? '/private/tmp/clinic-image/base-output-v2';
const AFTER_ROOT = process.env.CLINIC_IMAGE_AFTER_ROOT
  ?? '/private/tmp/clinic-image/final-v4';
const OUTPUT_ROOT = process.env.CLINIC_IMAGE_CAPTURE_OUTPUT
  ?? '/private/tmp/clinic-image/captures';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface CaptureConfig {
  siteId: string;
  market: 'KR' | 'US';
  config?: SiteConfig;
  renderedImageCount: number;
  renderedImagesPerSection: number;
  compileStatus: 'success' | 'failure';
}

interface RankedCaptureConfig extends CaptureConfig {
  rank: 'bottom' | 'top' | 'reference';
}

interface CaptureImageMetrics {
  imageElementCount: number;
  loadedImageCount: number;
  visibleLoadedImageCount: number;
  failedImageCount: number;
  headerImages: Array<{ src: string; loaded: boolean }>;
  heroImages: Array<{ src: string; loaded: boolean }>;
}

function documentFor(config: SiteConfig): string {
  const body = renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug: '',
    interactive: false,
    animate: false,
    runtimeDelivery: 'inline',
  }));
  return `<!doctype html><html lang="${config.meta.locale === 'en-US' ? 'en' : 'ko'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;overflow-x:hidden}.hidden{display:none!important}@media(min-width:1280px){.xl\\:block{display:block!important}.xl\\:flex{display:flex!important}.xl\\:hidden{display:none!important}}</style></head><body>${body}</body></html>`;
}

async function waitForImages(page: Page): Promise<void> {
  await page.waitForFunction(
    'Array.from(document.images).every((image) => image.complete)',
    { timeout: 8_000 },
  ).catch(() => undefined);
}

async function capture(page: Page, entry: CaptureConfig, phase: 'before' | 'after') {
  if (!entry.config) throw new Error(`CLINIC_IMAGE_CONFIG_MISSING:${entry.siteId}`);
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setContent(documentFor(entry.config), { waitUntil: 'domcontentloaded' });
  await waitForImages(page);
  await page.evaluate('scrollTo(0, 0)');
  const measured = await page.evaluate(`(() => {
    const images = Array.from(document.images).map((image) => {
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return {
        src: image.currentSrc || image.src,
        loaded: image.complete && image.naturalWidth > 0,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
        inHeader: Boolean(image.closest('.anaks-tenant-header')),
        inHero: Boolean(image.closest('[data-section-type="hero"]')),
      };
    });
    return {
      imageElementCount: images.length,
      loadedImageCount: images.filter((image) => image.loaded).length,
      visibleLoadedImageCount: images.filter((image) => image.loaded && image.visible).length,
      failedImageCount: images.filter((image) => !image.loaded).length,
      headerImages: images.filter((image) => image.inHeader),
      heroImages: images.filter((image) => image.inHero),
    };
  })()`) as CaptureImageMetrics;
  const file = path.join(OUTPUT_ROOT, `${entry.siteId}-${phase}.png`);
  await page.screenshot({ path: file });
  return { file, ...measured };
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function main(): Promise<void> {
  const [beforeAll, afterAll, beforeRanked, afterRanked] = await Promise.all([
    readJson<CaptureConfig[]>(path.join(BEFORE_ROOT, 'all-configs.json')),
    readJson<CaptureConfig[]>(path.join(AFTER_ROOT, 'all-configs.json')),
    readJson<RankedCaptureConfig[]>(path.join(BEFORE_ROOT, 'image-capture-configs.json')),
    readJson<RankedCaptureConfig[]>(path.join(AFTER_ROOT, 'image-capture-configs.json')),
  ]);
  const beforeBySite = new Map(beforeAll.map((entry) => [entry.siteId, entry]));
  const afterBySite = new Map(afterAll.map((entry) => [entry.siteId, entry]));
  const ranks = new Map<string, Set<string>>();
  for (const entry of [...beforeRanked, ...afterRanked]) {
    const values = ranks.get(entry.siteId) ?? new Set<string>();
    values.add(entry.rank);
    ranks.set(entry.siteId, values);
  }
  const siteIds = [...ranks.keys()].sort();
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-extensions',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });
  const evidence = [];
  try {
    for (const siteId of siteIds) {
      const before = beforeBySite.get(siteId);
      const after = afterBySite.get(siteId);
      if (!before || !after) throw new Error(`CLINIC_IMAGE_PAIR_MISSING:${siteId}`);
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (
          request.isNavigationRequest()
          || request.url().startsWith('data:')
          || request.resourceType() === 'image'
        ) request.continue();
        else request.abort();
      });
      evidence.push({
        siteId,
        ranks: [...(ranks.get(siteId) ?? [])].sort(),
        beforeConfig: {
          renderedImageCount: before.renderedImageCount,
          renderedImagesPerSection: before.renderedImagesPerSection,
        },
        afterConfig: {
          renderedImageCount: after.renderedImageCount,
          renderedImagesPerSection: after.renderedImagesPerSection,
        },
        before: await capture(page, before, 'before'),
        after: await capture(page, after, 'after'),
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const output = path.join(OUTPUT_ROOT, 'evidence.json');
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, cases: evidence.length }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
