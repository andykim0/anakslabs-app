import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer from 'puppeteer-core';
import { TenantPageContent } from '@/components/site-renderer';
import type { SiteConfig } from '@/lib/types/site';

const INPUT = process.env.US_CONSENTED_CONFIG
  ?? '/private/tmp/us-consented/consented-config.json';
const OUTPUT_DIR = process.env.US_CONSENTED_CAPTURE_DIR
  ?? '/private/tmp/us-consented/capture';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function builtCss(): Promise<string> {
  const root = path.resolve(process.cwd(), '.next/static');
  const files = await readdir(root, { recursive: true });
  const cssFiles = files.filter((file) => file.endsWith('.css')).sort();
  return (await Promise.all(cssFiles.map((file) => readFile(path.join(root, file), 'utf8'))))
    .join('\n');
}

async function main(): Promise<void> {
  const config = JSON.parse(await readFile(INPUT, 'utf8')) as SiteConfig;
  const body = renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug: '',
    interactive: false,
    animate: false,
    runtimeDelivery: 'inline',
  }));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${await builtCss()}</style></head><body>${body}</body></html>`;
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-background-networking'],
  });
  let blockedExternalRequests = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().startsWith('data:') || request.url().startsWith('file:')) {
        void request.continue();
      } else {
        blockedExternalRequests += 1;
        void request.abort();
      }
    });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const metrics = await page.evaluate(() => {
      const h1s = Array.from(document.querySelectorAll('h1')).map((heading) => {
        const rect = heading.getBoundingClientRect();
        const style = getComputedStyle(heading);
        return {
          text: heading.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
          className: heading.className,
          display: style.display,
          visibility: style.visibility,
          width: rect.width,
          height: rect.height,
        };
      });
      return {
        h1Count: h1s.length,
        visibleH1Count: h1s.filter((heading) => heading.width > 0 && heading.height > 0).length,
        h1s,
        sectionCount: document.querySelectorAll('main section').length,
        visibleTextCharacters: document.body.innerText.replace(/\s+/gu, ' ').trim().length,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    const screenshot = path.join(OUTPUT_DIR, 'aventura-consented-home.png');
    await page.screenshot({ path: screenshot });
    const evidence = {
      issuance: false,
      source: 'frozen-corpus-local-compile',
      externalRequestsBlocked: blockedExternalRequests,
      screenshot,
      ...metrics,
    };
    await writeFile(
      path.join(OUTPUT_DIR, 'evidence.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
