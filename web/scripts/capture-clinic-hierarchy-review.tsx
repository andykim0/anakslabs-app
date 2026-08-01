import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer, { type Page } from 'puppeteer-core';
import { TenantPageContent } from '@/components/site-renderer';
import type { SiteConfig } from '@/lib/types/site';

const BEFORE_INPUT = process.env.CLINIC_HIERARCHY_BEFORE
  ?? '/private/tmp/clinic-hierarchy/before/capture-configs.json';
const AFTER_INPUT = process.env.CLINIC_HIERARCHY_AFTER
  ?? '/private/tmp/clinic-hierarchy/after/capture-configs.json';
const OUTPUT_ROOT = process.env.CLINIC_HIERARCHY_CAPTURE_OUTPUT
  ?? '/private/tmp/clinic-hierarchy/captures';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface CaptureConfig {
  siteId: string;
  market: 'KR' | 'US';
  config?: SiteConfig;
  bodyPlacementRate: number;
  totalPlacementRate: number;
  sourceBlockCount: number;
  compileStatus: 'success' | 'failure';
  rank: 'bottom' | 'top' | 'reference';
}

function pageMarkup(config: SiteConfig, pageSlug: string): string {
  return renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug,
    interactive: false,
    animate: false,
    runtimeDelivery: 'inline',
  }));
}

function documentFor(config: SiteConfig): string {
  const body = pageMarkup(config, '');
  return `<!doctype html><html lang="${config.meta.locale === 'en-US' ? 'en' : 'ko'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;overflow-x:hidden}.hidden{display:none!important}@media(min-width:1280px){.xl\\:block{display:block!important}.xl\\:hidden{display:none!important}}</style></head><body>${body}</body></html>`;
}

function configMetrics(entry: CaptureConfig) {
  if (!entry.config) throw new Error(`CLINIC_HIERARCHY_CONFIG_MISSING:${entry.siteId}`);
  const sectionCount = entry.config.pages.reduce((sum, page) => sum + page.sections.length, 0);
  let largeHeadingCount = 0;
  for (const page of entry.config.pages) {
    const markup = pageMarkup(entry.config, page.slug);
    largeHeadingCount += (markup.match(/<h[12](?:\s|>)/gu) ?? []).length;
  }
  return {
    pageCount: entry.config.pages.length,
    sectionCount,
    sourceBlockCount: entry.sourceBlockCount,
    sectionToBlockRatio: entry.sourceBlockCount === 0 ? 0 : sectionCount / entry.sourceBlockCount,
    largeHeadingCount,
  };
}

async function capture(
  page: Page,
  entry: CaptureConfig,
  phase: 'before' | 'after',
): Promise<{
  file: string;
  footerFile?: string;
  visibleSectionCount: number;
  visibleLargeHeadingCount: number;
  homeScrollScreens: number;
  hierarchyItemCount: number;
  focusText: string;
}> {
  if (!entry.config) throw new Error(`CLINIC_HIERARCHY_CONFIG_MISSING:${entry.siteId}`);
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setContent(documentFor(entry.config), { waitUntil: 'domcontentloaded' });
  const measured = await page.evaluate((referenceSite) => {
    const sections: HTMLElement[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('main section')) {
      const style = getComputedStyle(node);
      if (style.display !== 'none' && style.visibility !== 'hidden' && node.getBoundingClientRect().height > 0) {
        sections.push(node);
      }
    }
    const headings: HTMLElement[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('main h1,main h2')) {
      const style = getComputedStyle(node);
      if (style.display !== 'none' && style.visibility !== 'hidden' && node.getBoundingClientRect().height > 0) {
        headings.push(node);
      }
    }
    const items: HTMLElement[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('main section li,main section article')) {
      const style = getComputedStyle(node);
      if (style.display !== 'none' && style.visibility !== 'hidden' && node.getBoundingClientRect().height > 0) {
        items.push(node);
      }
    }
    let focus: HTMLElement | undefined = referenceSite ? undefined : sections[1];
    if (referenceSite) {
      for (const node of document.querySelectorAll<HTMLElement>('main h1,main h2,main h3,main p,main li')) {
        if (node.innerText.includes('손예진 리프팅') && node.innerText.includes('249,000원')) {
          focus = node;
          break;
        }
      }
    }
    focus?.scrollIntoView({ block: 'center' });
    return {
      visibleSectionCount: sections.length,
      visibleLargeHeadingCount: headings.length,
      homeScrollScreens: document.documentElement.scrollHeight / innerHeight,
      hierarchyItemCount: items.length,
      focusText: focus?.innerText.replace(/\s+/gu, ' ').trim().slice(0, 400) ?? '',
    };
  }, entry.siteId.includes('ppeum1'));
  const file = path.join(OUTPUT_ROOT, `${entry.siteId}-${phase}.png`);
  await page.screenshot({ path: file });
  let footerFile: string | undefined;
  if (entry.siteId.includes('ppeum1')) {
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    footerFile = path.join(OUTPUT_ROOT, `${entry.siteId}-${phase}-footer.png`);
    await page.screenshot({ path: footerFile });
  }
  return { file, ...(footerFile ? { footerFile } : {}), ...measured };
}

async function main(): Promise<void> {
  const before = JSON.parse(await readFile(BEFORE_INPUT, 'utf8')) as CaptureConfig[];
  const after = JSON.parse(await readFile(AFTER_INPUT, 'utf8')) as CaptureConfig[];
  const beforeBySite = new Map(before.map((entry) => [entry.siteId, entry]));
  const pairs = after.map((entry) => {
    const baseline = beforeBySite.get(entry.siteId);
    if (!baseline) throw new Error(`CLINIC_HIERARCHY_BASELINE_MISSING:${entry.siteId}`);
    return { before: baseline, after: entry };
  });
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
    for (const pair of pairs) {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (request.isNavigationRequest() || request.url().startsWith('data:')) request.continue();
        else request.abort();
      });
      evidence.push({
        siteId: pair.after.siteId,
        rank: pair.after.rank,
        beforeConfig: configMetrics(pair.before),
        afterConfig: configMetrics(pair.after),
        before: await capture(page, pair.before, 'before'),
        after: await capture(page, pair.after, 'after'),
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
