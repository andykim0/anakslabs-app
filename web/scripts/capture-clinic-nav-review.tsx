import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer from 'puppeteer-core';
import { TenantPageContent } from '@/components/site-renderer';
import type { SiteConfig } from '@/lib/types/site';

const BEFORE_INPUT = process.env.CLINIC_NAV_BEFORE
  ?? '/private/tmp/clinic-nav/before/all-configs.json';
const AFTER_INPUT = process.env.CLINIC_NAV_AFTER
  ?? '/private/tmp/clinic-nav/after-v2/all-configs.json';
const OUTPUT = process.env.CLINIC_NAV_CAPTURE_OUTPUT
  ?? '/private/tmp/clinic-nav/nav-top-captures';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TARGETS = ['ppeum1', 'aventuradentalarts'] as const;

interface ConfigEntry {
  siteId: string;
  config?: SiteConfig;
}

function documentFor(config: SiteConfig): string {
  const markup = renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug: '',
    interactive: false,
    animate: false,
    runtimeDelivery: 'inline',
  }));
  return `<!doctype html><html lang="${config.meta.locale === 'en-US' ? 'en' : 'ko'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;overflow-x:hidden}.hidden{display:none!important}@media(min-width:1280px){.xl\\:block{display:block!important}.xl\\:flex{display:flex!important}.xl\\:hidden{display:none!important}}</style></head><body>${markup}</body></html>`;
}

function selected(entries: ConfigEntry[]): ConfigEntry[] {
  return TARGETS.map((target) => {
    const entry = entries.find((candidate) => candidate.siteId.includes(target));
    if (!entry?.config) throw new Error(`CLINIC_NAV_CONFIG_MISSING:${target}`);
    return entry;
  });
}

async function main(): Promise<void> {
  const before = selected(JSON.parse(await readFile(BEFORE_INPUT, 'utf8')) as ConfigEntry[]);
  const after = selected(JSON.parse(await readFile(AFTER_INPUT, 'utf8')) as ConfigEntry[]);
  const beforeBySite = new Map(before.map((entry) => [entry.siteId, entry]));
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
    for (const current of after) {
      const baseline = beforeBySite.get(current.siteId);
      if (!baseline?.config || !current.config) {
        throw new Error(`CLINIC_NAV_PAIR_MISSING:${current.siteId}`);
      }
      for (const [phase, config] of [
        ['before', baseline.config],
        ['after', current.config],
      ] as const) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          if (request.isNavigationRequest() || request.url().startsWith('data:')) request.continue();
          else request.abort();
        });
        await page.setContent(documentFor(config), { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => scrollTo(0, 0));
        const values = await page.evaluate(() => {
          const h1: string[] = [];
          document.querySelectorAll<HTMLElement>('main h1').forEach((node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            const text = node.innerText.replace(/\s+/gu, ' ').trim();
            if (
              text && style.display !== 'none' && style.visibility !== 'hidden'
              && rect.width > 0 && rect.height > 0
            ) h1.push(text);
          });
          const navigation: string[] = [];
          document.querySelectorAll<HTMLElement>('.anaks-tenant-header nav a')
            .forEach((node) => {
              const style = getComputedStyle(node);
              const rect = node.getBoundingClientRect();
              const text = node.innerText.replace(/\s+/gu, ' ').trim();
              if (
                text && style.display !== 'none' && style.visibility !== 'hidden'
                && rect.width > 0 && rect.height > 0
              ) navigation.push(text);
            });
          return {
            h1,
            navigation,
            title: document.title,
          };
        });
        const file = path.join(OUTPUT, `${current.siteId}-${phase}.png`);
        await page.screenshot({ path: file });
        evidence.push({ siteId: current.siteId, phase, file, ...values });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  const report = path.join(OUTPUT, 'evidence.json');
  await writeFile(report, `${JSON.stringify({
    version: 1,
    beforeInput: BEFORE_INPUT,
    afterInput: AFTER_INPUT,
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    evidence,
  }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ report, captures: evidence.length }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
