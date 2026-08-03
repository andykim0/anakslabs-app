import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer from 'puppeteer-core';
import { TenantPageContent } from '@/components/site-renderer';
import type { SiteConfig } from '@/lib/types/site';
import type { ClinicExpressionRecipe } from '@/lib/clinic-engine/variants';

const INPUT = process.env.CLINIC_VARIANTS_CAPTURE_INPUT
  ?? '/private/tmp/clinic-variants/capture-configs.json';
const OUTPUT = process.env.CLINIC_VARIANTS_CAPTURE_OUTPUT
  ?? '/private/tmp/clinic-variants/captures';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface CaptureSite {
  label: string;
  siteId: string;
  market: 'KR' | 'US';
  materialAxisCount: number;
  sourceBlockCount: number;
  variants: Array<{
    id: string;
    expression: ClinicExpressionRecipe;
    config: SiteConfig;
  }>;
}

function documentFor(config: SiteConfig): string {
  const body = renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug: '',
    interactive: false,
    animate: true,
    runtimeDelivery: 'inline',
  }));
  return `<!doctype html><html lang="${config.meta.locale === 'en-US' ? 'en' : 'ko'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;overflow-x:hidden}.hidden{display:none!important}@media(min-width:1280px){.xl\\:block{display:block!important}.xl\\:flex{display:flex!important}.xl\\:hidden{display:none!important}}</style></head><body>${body}</body></html>`;
}

async function main(): Promise<void> {
  const sites = JSON.parse(await readFile(INPUT, 'utf8')) as CaptureSite[];
  await mkdir(OUTPUT, { recursive: true });
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
    for (const site of sites) {
      for (const variant of site.variants) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
        await page.emulateMediaFeatures([
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ]);
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          if (
            request.isNavigationRequest()
            || request.url().startsWith('data:')
            || request.resourceType() === 'image'
          ) request.continue();
          else request.abort();
        });
        await page.setContent(documentFor(variant.config), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
          'Array.from(document.images).every((image) => image.complete)',
          { timeout: 8_000 },
        ).catch(() => undefined);
        await page.evaluate(() => scrollTo(0, 0));
        const measured = await page.evaluate(() => {
          const hero = document.querySelector<HTMLElement>('[data-section-type="hero"]');
          const h1 = document.querySelector<HTMLElement>('h1[data-font-role="heading"]');
          const body = document.querySelector<HTMLElement>('[data-clinic-flow-copy], [data-clinic-flow-hero-copy] p');
          const heroImage = hero?.querySelector<HTMLImageElement>('img');
          const root = document.querySelector<HTMLElement>('.anaks-site');
          return {
            heroLayout: hero?.getAttribute('data-clinic-flow-section') ?? null,
            motionSignature: hero?.getAttribute('data-clinic-motion-signature') ?? null,
            headingFont: h1 ? getComputedStyle(h1).fontFamily : null,
            bodyFont: body ? getComputedStyle(body).fontFamily : null,
            rootBackground: root ? getComputedStyle(root).backgroundColor : null,
            heroBackground: hero ? getComputedStyle(hero).backgroundColor : null,
            heroImage: heroImage
              ? {
                  src: heroImage.currentSrc || heroImage.src,
                  loaded: heroImage.complete && heroImage.naturalWidth > 0,
                }
              : null,
            sectionCount: document.querySelectorAll('main section').length,
            visibleTextLength: document.querySelector('main')?.textContent?.trim().length ?? 0,
            visibilityHiddenCount: [...document.querySelectorAll<HTMLElement>('main *')]
              .filter((node) => getComputedStyle(node).visibility === 'hidden').length,
          };
        });
        const file = path.join(OUTPUT, `${site.label}-${site.siteId}-${variant.id}.png`);
        await page.screenshot({ path: file });
        evidence.push({
          site: {
            label: site.label,
            siteId: site.siteId,
            materialAxisCount: site.materialAxisCount,
            sourceBlockCount: site.sourceBlockCount,
          },
          variant: {
            id: variant.id,
            expression: variant.expression,
          },
          screenshot: file,
          ...measured,
        });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  const report = path.join(OUTPUT, 'evidence.json');
  await writeFile(report, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ report, screenshotCount: evidence.length }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
