import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer, { type Page } from 'puppeteer-core';
import { TenantPageContent } from '@/components/site-renderer';
import type { SiteConfig } from '@/lib/types/site';

const INPUT = '/private/tmp/modal-residue/capture-configs.json';
const OUTPUT_ROOT = '/private/tmp/modal-residue/captures';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface SourceBlockRef {
  id: string;
  text: string;
}

interface CaptureCase {
  siteId: string;
  market: 'KR' | 'US';
  before: SiteConfig;
  after: SiteConfig;
  audit: {
    removedOverlayBlocks: SourceBlockRef[];
    preservedHospitalBlocks: SourceBlockRef[];
    unexpectedRemoved: SourceBlockRef[];
    unexpectedAdded: SourceBlockRef[];
  };
}

function documentFor(config: SiteConfig): string {
  const body = renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug: '',
    interactive: false,
    animate: false,
    runtimeDelivery: 'inline',
  }));
  return `<!doctype html><html lang="${config.meta.locale === 'en-US' ? 'en' : 'ko'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;overflow-x:hidden}</style></head><body>${body}</body></html>`;
}

async function sourceTextsInDocument(page: Page, texts: readonly string[]): Promise<string[]> {
  return page.evaluate((values) => {
    const normalized = [...document.querySelectorAll<HTMLElement>(
      'h1,h2,h3,h4,h5,h6,p,li,dt,dd,address,blockquote,button,[data-font-role]',
    )].map((element) => element.innerText.replace(/\s+/gu, ' ').trim());
    return values.filter((text) => normalized.includes(text.replace(/\s+/gu, ' ').trim()));
  }, [...texts]);
}

async function captureCase(
  page: Page,
  input: CaptureCase,
  phase: 'before' | 'after',
  scrollRatio: number | undefined,
): Promise<{
  file: string;
  scrollY: number;
  scrollRatio: number;
  removedTextsPresent: string[];
  preservedTextsPresent: string[];
  visibleText: string;
}> {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setContent(documentFor(input[phase]), { waitUntil: 'domcontentloaded' });
  const removedTexts = [...new Set(input.audit.removedOverlayBlocks.map((block) => block.text))];
  const preservedTexts = [...new Set(input.audit.preservedHospitalBlocks.map((block) => block.text))];
  const removedTextsPresent = await sourceTextsInDocument(page, removedTexts);
  const preservedTextsPresent = await sourceTextsInDocument(page, preservedTexts);
  const position = await page.evaluate((options) => {
    const all = [...document.querySelectorAll<HTMLElement>(
      'h1,h2,h3,h4,h5,h6,p,li,dt,dd,address,blockquote,button,[data-font-role]',
    )];
    const target = options.phase === 'before'
      ? all.find((element) => options.texts.some((text) => (
        element.innerText.replace(/\s+/gu, ' ').trim() === text.replace(/\s+/gu, ' ').trim()
      )))
      : undefined;
    const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const targetY = target
      ? Math.max(0, target.getBoundingClientRect().top + scrollY - innerHeight * 0.25)
      : maximum * (options.scrollRatio ?? 0);
    scrollTo(0, Math.min(maximum, targetY));
    return {
      scrollY,
      ratio: maximum === 0 ? 0 : scrollY / maximum,
      visibleText: document.body.innerText.replace(/\s+/gu, ' ').trim().slice(0, 800),
    };
  }, { phase, texts: removedTexts, scrollRatio });
  const file = path.join(OUTPUT_ROOT, `${input.siteId}-${phase}.png`);
  await page.screenshot({ path: file });
  return {
    file,
    scrollY: position.scrollY,
    scrollRatio: position.ratio,
    removedTextsPresent,
    preservedTextsPresent,
    visibleText: position.visibleText,
  };
}

async function main(): Promise<void> {
  const cases = JSON.parse(await readFile(INPUT, 'utf8')) as CaptureCase[];
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
    for (const entry of cases) {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (request.isNavigationRequest() || request.url().startsWith('data:')) request.continue();
        else request.abort();
      });
      const before = await captureCase(page, entry, 'before', undefined);
      const after = await captureCase(page, entry, 'after', before.scrollRatio);
      evidence.push({
        siteId: entry.siteId,
        removedOverlayBlockCount: entry.audit.removedOverlayBlocks.length,
        unexpectedRemovedCount: entry.audit.unexpectedRemoved.length,
        unexpectedAddedCount: entry.audit.unexpectedAdded.length,
        before,
        after,
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  await writeFile(
    '/private/tmp/modal-residue/capture-evidence.json',
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
