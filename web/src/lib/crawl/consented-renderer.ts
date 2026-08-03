import 'server-only';

import { existsSync } from 'node:fs';
import puppeteer, { type Browser, type HTTPRequest, type Page } from 'puppeteer-core';
import { assertPublicHttpUrl } from '@/lib/scan/ssrf';
import { screenshotSegments } from './render-hardening';
import type { CrawlDependencies } from './crawler-core';
import type { CrawlRenderedImageMeasurement } from './contracts';

const VIEWPORT = { width: 1_440, height: 900, deviceScaleFactor: 1 } as const;
const RENDER_TIMEOUT_MS = 20_000;
const IMAGE_SETTLE_TIMEOUT_MS = 5_000;

const COMMON_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
] as const;

export interface ConsentedRenderedPageSession {
  renderPage: NonNullable<CrawlDependencies['renderPage']>;
  close: () => Promise<void>;
}

function chromeExecutablePath(): string {
  const configured = process.env.ANAKS_CHROME_EXECUTABLE_PATH?.trim()
    || process.env.CHROME_PATH?.trim();
  if (configured) {
    if (!existsSync(configured)) throw new Error('US_CONSENTED_RENDERER_EXECUTABLE_NOT_FOUND');
    return configured;
  }
  const detected = COMMON_CHROME_PATHS.find((candidate) => existsSync(candidate));
  if (!detected) throw new Error('US_CONSENTED_RENDERER_UNAVAILABLE');
  return detected;
}

function htmlWithBase(rawHtml: string, sourceUrl: string): string {
  const escaped = sourceUrl
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const guard = '<meta http-equiv="content-security-policy" content="script-src \'none\'; frame-src \'none\'; object-src \'none\'">';
  const base = /<base\b/iu.test(rawHtml) ? '' : `<base href="${escaped}">`;
  if (/<head(?:\s[^>]*)?>/iu.test(rawHtml)) {
    return rawHtml.replace(/<head(?:\s[^>]*)?>/iu, (head) => `${head}${base}${guard}`);
  }
  return `${base}${guard}${rawHtml}`;
}

async function resolveRequest(request: HTTPRequest): Promise<void> {
  if (request.isInterceptResolutionHandled()) return;
  const resourceType = request.resourceType();
  if (!['image', 'stylesheet', 'font'].includes(resourceType)) {
    await request.abort('blockedbyclient').catch(() => undefined);
    return;
  }
  const rawUrl = request.url();
  if (/^(?:about|data|blob):/iu.test(rawUrl)) {
    await request.continue().catch(() => undefined);
    return;
  }
  try {
    await assertPublicHttpUrl(rawUrl);
    if (!request.isInterceptResolutionHandled()) await request.continue();
  } catch {
    if (!request.isInterceptResolutionHandled()) {
      await request.abort('blockedbyclient').catch(() => undefined);
    }
  }
}

async function forceFullScroll(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 50));
    let stableBottom = 0;
    for (let step = 0; step < 120; step += 1) {
      const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      window.scrollTo({ top: Math.min(height, window.scrollY + window.innerHeight * 0.8) });
      await pause();
      const nextHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      if (window.scrollY + window.innerHeight >= nextHeight - 2) stableBottom += 1;
      else stableBottom = 0;
      if (stableBottom >= 2) {
        window.scrollTo({ top: 0 });
        await pause();
        return true;
      }
    }
    window.scrollTo({ top: 0 });
    await pause();
    return document.documentElement.scrollHeight <= window.innerHeight + 2;
  });
}

async function waitForImages(page: Page): Promise<void> {
  await page.evaluate((timeoutMs) => Promise.all(Array.from(document.images).map((image) => (
    image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, timeoutMs);
          const done = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          image.addEventListener('load', done, { once: true });
          image.addEventListener('error', done, { once: true });
        })
  ))).then(() => undefined), IMAGE_SETTLE_TIMEOUT_MS);
}

async function measurements(page: Page): Promise<CrawlRenderedImageMeasurement[]> {
  return page.evaluate(() => Array.from(document.images).map((image) => {
    const rect = image.getBoundingClientRect();
    return {
      url: image.currentSrc || image.src,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      displayedWidth: rect.width,
      displayedHeight: rect.height,
    };
  }).filter((image) => Boolean(image.url)));
}

export async function createConsentedRenderedPageSession(input: {
  acceptInvalidTlsCertificate: boolean;
}): Promise<ConsentedRenderedPageSession> {
  const browser: Browser = await puppeteer.launch({
    executablePath: chromeExecutablePath(),
    headless: true,
    acceptInsecureCerts: input.acceptInvalidTlsCertificate,
    args: ['--disable-dev-shm-usage'],
  });
  return {
    renderPage: async ({ url, rawHtml }) => {
      const page = await browser.newPage();
      try {
        await page.setViewport(VIEWPORT);
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          void resolveRequest(request);
        });
        await page.setContent(htmlWithBase(rawHtml, url), {
          waitUntil: 'domcontentloaded',
          timeout: RENDER_TIMEOUT_MS,
        });
        await page.evaluate('globalThis.__name = (target) => target');
        const fullScrollCompleted = await forceFullScroll(page);
        await waitForImages(page);
        const totalHeight = await page.evaluate(() => Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ));
        return {
          html: await page.content(),
          finalUrl: url,
          observation: {
            version: 1,
            renderAttempts: 1,
            fullScrollCompleted,
            screenshotSegments: screenshotSegments(totalHeight),
          },
          imageMeasurements: await measurements(page),
        };
      } finally {
        await page.close().catch(() => undefined);
      }
    },
    close: () => browser.close(),
  };
}
