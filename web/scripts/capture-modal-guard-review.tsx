import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer, { type Page } from 'puppeteer-core';
import { TenantPageContent } from '@/components/site-renderer';
import type { SiteConfig } from '@/lib/types/site';

const BEFORE_INPUT = '/private/tmp/modal-guard/capture-configs-before.json';
const AFTER_INPUT = '/private/tmp/modal-guard/capture-configs-after.json';
const SNAPSHOT_INPUT = 'src/lib/clinic-engine/overlay-ui-chrome-exclusions.generated.json';
const OUTPUT_ROOT = '/private/tmp/modal-guard/captures';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface SourceBlockRef {
  id: string;
  text: string;
}

interface SourceCaptureConfig {
  siteId: string;
  market: 'KR' | 'US';
  before: SiteConfig;
  after: SiteConfig;
  audit: {
    removedOverlayBlocks: SourceBlockRef[];
  };
}

interface Snapshot {
  vetoedContent: Array<{
    siteId: string;
    blockId: string;
    text: string;
  }>;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
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

async function prepare(page: Page, config: SiteConfig): Promise<void> {
  await page.setViewport({ width: 1440, height: 2400, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setContent(documentFor(config), { waitUntil: 'domcontentloaded' });
}

async function locate(page: Page, texts: readonly string[]): Promise<number> {
  return page.evaluate((values) => {
    const normalized = values.map((value) => value.replace(/\s+/gu, ' ').trim());
    const elements = [...document.querySelectorAll<HTMLElement>(
      'h1,h2,h3,h4,h5,h6,p,li,dt,dd,address,blockquote,button,[data-font-role]',
    )];
    const target = elements.find((element) => {
      const text = element.innerText.replace(/\s+/gu, ' ').trim();
      return normalized.some((value) => text === value || text.includes(value));
    });
    const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    return target
      ? Math.min(maximum, Math.max(0, target.getBoundingClientRect().top + scrollY - 220))
      : 0;
  }, [...texts]);
}

async function capture(input: {
  page: Page;
  siteId: string;
  phase: 'before' | 'after';
  config: SiteConfig;
  scrollY: number;
  restoredTexts: string[];
  removedUiTexts: string[];
}) {
  await prepare(input.page, input.config);
  await input.page.evaluate((value) => scrollTo(0, value), input.scrollY);
  const audit = await input.page.evaluate((options) => {
    const bodyText = document.body.innerText.replace(/\s+/gu, ' ').trim();
    return {
      restoredContentPresent: options.restored.filter((text) => (
        bodyText.includes(text.replace(/\s+/gu, ' ').trim())
      )),
      removedUiCopyPresent: options.removed.filter((text) => (
        bodyText.includes(text.replace(/\s+/gu, ' ').trim())
      )),
      visibleText: document.body.innerText.replace(/\s+/gu, ' ').trim().slice(0, 1_600),
    };
  }, { restored: input.restoredTexts, removed: input.removedUiTexts });
  const file = path.join(OUTPUT_ROOT, `${input.siteId}-${input.phase}.png`);
  await input.page.screenshot({ path: file });
  return { file, scrollY: input.scrollY, ...audit };
}

async function main(): Promise<void> {
  const beforeInputs = JSON.parse(await readFile(BEFORE_INPUT, 'utf8')) as SourceCaptureConfig[];
  const afterInputs = JSON.parse(await readFile(AFTER_INPUT, 'utf8')) as SourceCaptureConfig[];
  const snapshot = JSON.parse(await readFile(SNAPSHOT_INPUT, 'utf8')) as Snapshot;
  const beforeBySite = new Map(beforeInputs.map((entry) => [entry.siteId, entry]));
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
    for (const afterEntry of afterInputs) {
      const beforeEntry = beforeBySite.get(afterEntry.siteId);
      if (!beforeEntry) throw new Error(`MODAL_GUARD_BEFORE_CONFIG_MISSING:${afterEntry.siteId}`);
      const restored = snapshot.vetoedContent
        .filter((block) => block.siteId === afterEntry.siteId)
        .map((block) => normalizeText(block.text));
      const removedUi = [...new Set(afterEntry.audit.removedOverlayBlocks
        .map((block) => normalizeText(block.text)))]
        .sort((left, right) => right.length - left.length)
        .slice(0, 24);
      const focusPhase = restored.length > 0 ? 'after' : 'before';
      const focusTexts = restored.length > 0 ? restored : removedUi;
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (request.isNavigationRequest() || request.url().startsWith('data:')) request.continue();
        else request.abort();
      });
      const focusConfig = focusPhase === 'after' ? afterEntry.after : beforeEntry.after;
      await prepare(page, focusConfig);
      const scrollY = await locate(page, focusTexts);
      const before = await capture({
        page,
        siteId: afterEntry.siteId,
        phase: 'before',
        config: beforeEntry.after,
        scrollY,
        restoredTexts: restored,
        removedUiTexts: removedUi,
      });
      const after = await capture({
        page,
        siteId: afterEntry.siteId,
        phase: 'after',
        config: afterEntry.after,
        scrollY,
        restoredTexts: restored,
        removedUiTexts: removedUi,
      });
      evidence.push({
        siteId: afterEntry.siteId,
        focusPhase,
        restoredContentCount: restored.length,
        retainedUiChromeExclusionCount: afterEntry.audit.removedOverlayBlocks.length,
        before,
        after,
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const output = '/private/tmp/modal-guard/capture-evidence.json';
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
