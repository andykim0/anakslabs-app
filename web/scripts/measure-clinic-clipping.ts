import { readFile, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer, { type Page } from 'puppeteer-core';
import { TenantPageContent } from '@/components/site-renderer';
import { compileUsMedicalDemo } from '@/lib/us-demo/source-compiler';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTHS = [1280, 1366, 1440, 1512, 1920] as const;

interface ClipViolation {
  selector: string;
  overflowX: string;
  overflowY: string;
  excessWidth: number;
  excessHeight: number;
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`MISSING_ARGUMENT:${name}`);
  return process.argv[index + 1];
}

function render(config: SiteConfig, slug: string): string {
  const body = renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug: slug,
    interactive: false,
    animate: false,
    runtimeDelivery: 'inline',
  }));
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

async function inspect(page: Page): Promise<{
  documentHorizontalOverflowPx: number;
  clippedContainers: ClipViolation[];
}> {
  return page.evaluate(() => {
    const selector = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.body && parts.length < 6) {
        const parent: Element | null = current.parentElement;
        const siblings: Element[] = parent
          ? [...parent.children].filter((child: Element) => child.tagName === current!.tagName)
          : [];
        const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
        const classes = [...current.classList]
          .filter((value) => /^[a-z][a-z0-9_-]{1,40}$/iu.test(value))
          .slice(0, 2)
          .map((value) => `.${CSS.escape(value)}`)
          .join('');
        parts.unshift(`${current.tagName.toLowerCase()}${classes}${nth}`);
        current = parent;
      }
      return `body>${parts.join('>')}`;
    };
    const root = document.documentElement;
    const documentHorizontalOverflowPx = Math.max(0, root.scrollWidth - root.clientWidth);
    const clippedContainers = [...document.body.querySelectorAll<HTMLElement>('*')].flatMap(
      (element) => {
        if (element.matches('img,video,iframe,canvas,svg,picture,source')) return [];
        const style = getComputedStyle(element);
        const clipsX = ['hidden', 'clip'].includes(style.overflowX);
        const clipsY = ['hidden', 'clip'].includes(style.overflowY);
        const excessWidth = Math.max(0, element.scrollWidth - element.clientWidth);
        const excessHeight = Math.max(0, element.scrollHeight - element.clientHeight);
        if (!(clipsX && excessWidth > 1) && !(clipsY && excessHeight > 1)) return [];
        return [{
          selector: selector(element),
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          excessWidth,
          excessHeight,
        }];
      },
    );
    return { documentHorizontalOverflowPx, clippedContainers };
  });
}

async function main(): Promise<void> {
  const koConfig = JSON.parse(await readFile(argument('--ko-config'), 'utf8')) as SiteConfig;
  const usArtifact = JSON.parse(
    await readFile(argument('--us-artifact'), 'utf8'),
  ) as CrawlArtifactPayload;
  const output = argument('--output');
  const usOutreach = compileUsMedicalDemo(usArtifact, { renderMode: 'outreach-safe' }).config;
  const usFull = compileUsMedicalDemo(usArtifact, { renderMode: 'preview-full' }).config;
  const cases = [
    { id: 'edomclinic-import', config: koConfig },
    { id: 'iddental-outreach-safe', config: usOutreach },
    { id: 'iddental-preview-full', config: usFull },
  ];
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });
  const rows: Array<{
    caseId: string;
    slug: string;
    width: number;
    documentHorizontalOverflowPx: number;
    clippedContainers: ClipViolation[];
  }> = [];
  const page = await browser.newPage();
  try {
    for (const item of cases) {
      for (const sitePage of item.config.pages) {
        const html = render(item.config, sitePage.slug);
        for (const width of WIDTHS) {
          await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
          await page.setContent(html, { waitUntil: 'domcontentloaded' });
          await page.evaluate('globalThis.__name = (target) => target');
          // Browser zoom remains 100%; no CSS zoom or DevTools emulation is applied.
          const measured = await inspect(page);
          rows.push({
            caseId: item.id,
            slug: sitePage.slug,
            width,
            ...measured,
          });
        }
        process.stdout.write(`${item.id} ${sitePage.slug || '<home>'}\n`);
      }
    }
  } finally {
    await page.close();
    await browser.close();
  }
  const violations = rows.filter((row) => (
    row.documentHorizontalOverflowPx > 0 || row.clippedContainers.length > 0
  ));
  await writeFile(output, JSON.stringify({
    generatedAt: new Date().toISOString(),
    zoom: '100%',
    widths: WIDTHS,
    routes: rows.length / WIDTHS.length,
    measurements: rows.length,
    violationMeasurements: violations.length,
    rows,
  }, null, 2));
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
