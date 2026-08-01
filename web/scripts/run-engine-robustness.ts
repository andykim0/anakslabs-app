import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { isIP } from 'node:net';
import { Agent, request } from 'node:https';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import puppeteer, {
  type Browser,
  type Page,
} from 'puppeteer-core';
import { crawlDesignatedSite, CrawlError } from '@/lib/crawl/crawler-core';
import {
  screenshotSegments,
} from '@/lib/crawl/render-hardening';
import { compileRobustClinicArtifact } from '@/lib/clinic-engine/robust-compile';
import {
  KO_MEDICAL_IMPORT_PROFILE,
  US_MEDICAL_OUTREACH_PROFILE,
} from '@/lib/clinic-engine/profiles';
import { clinicEngineTraceFor } from '@/lib/clinic-engine/pipeline';
import { TenantPageContent } from '@/components/site-renderer';
import type { SiteConfig } from '@/lib/types/site';
import type {
  CrawlArtifactPayload,
  CrawlPageAccessObservation,
} from '@/lib/crawl/contracts';
import { DESIGNATED_CRAWL_POLICY } from '@/lib/crawl/contracts';

const DEFAULT_OUTPUT = '/private/tmp/engine-robust';
const DEFAULT_CORPUS_ROOT = path.resolve(
  process.cwd(),
  '../docs/research/corpus-2026-08',
);
const RESEARCH_ROOT = path.resolve(
  process.cwd(),
  '../docs/research/survey-2026-07',
);
const DEFAULT_SPEC = path.join(RESEARCH_ROOT, 'robustness-spec.md');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CONCURRENCY = 3;
const INVALID_TLS_AGENT = new Agent({
  keepAlive: false,
  rejectUnauthorized: false,
  ciphers: 'DEFAULT@SECLEVEL=0',
  minVersion: 'TLSv1',
});

interface Target {
  market: 'KR' | 'US';
  url: string;
  canonicalUrl: string;
  predictedGrade: 'L1' | 'L2' | 'L3' | 'L4' | 'unrecorded';
}

interface RenderEvidence {
  sourceUrl: string;
  finalUrl: string;
  html: string;
  beforePath?: string;
  afterPath?: string;
  removedDetails: Array<{
    selector: string;
    reason: 'dim_backdrop' | 'explicit_close';
    cover: number;
    effectiveAlpha: number;
    luminance: number;
  }>;
}

interface GateMeasurement {
  sourceCompleteness: {
    pass: boolean;
    sourceBlockCount: number;
    missingCount: number;
    missing: string[];
  };
  blockIntegrity: {
    pass: boolean;
    violationCount: number;
  };
  density: {
    pass: boolean;
    sectionCount: number;
    emptySectionCount: number;
  };
  lineWidth: {
    pass: boolean;
    p95Em: number;
    maxEm: number;
    clippingCount: number;
  };
}

interface SiteResult {
  target: Target;
  tlsOptIn: boolean;
  crawl: {
    status: 'success' | 'failure';
    pageCount: number;
    failureReason?: string;
    pageFailures?: CrawlArtifactPayload['pageFailures'];
    modalRemovedNodeCount: number;
    modalRemovedSelectors: string[];
    modalEvidence?: Array<Omit<RenderEvidence, 'html'>>;
    fullScrollCompleted: boolean;
    screenshotSegmentCount: number;
  };
  compile: {
    status: 'success' | 'failure' | 'not_run';
    failureReason?: string;
    pageCount: number;
    engineProfile?: string;
  };
  gates: {
    status: 'pass' | 'fail' | 'not_run';
    measurements?: GateMeasurement;
  };
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

interface FrozenCorpusSiteRecord {
  version: 1;
  target: Target;
  crawlStartedAt: string;
  crawlCompletedAt: string;
  tlsOptIn: boolean;
  status: 'success' | 'failure';
  failureReason?: string;
  artifact?: CrawlArtifactPayload;
  documents: Array<{
    sourceUrl: string;
    finalUrl: string;
    postModalDomFile: string;
    postModalDomSha256: string;
    removedDetails: RenderEvidence['removedDetails'];
  }>;
}

async function persistFrozenCorpusSite(input: {
  corpusRoot: string;
  corpusId: string;
  target: Target;
  crawlStartedAt: string;
  crawlCompletedAt: string;
  tlsOptIn: boolean;
  artifact?: CrawlArtifactPayload;
  failureReason?: string;
  rendered: ReadonlyMap<string, RenderEvidence>;
}): Promise<{ siteFile: string; documentFiles: string[] }> {
  const siteDir = path.join(input.corpusRoot, 'sites', input.corpusId);
  const documentDir = path.join(siteDir, 'documents');
  await mkdir(documentDir, { recursive: true });
  const documents: FrozenCorpusSiteRecord['documents'] = [];
  for (const [index, evidence] of [...input.rendered.values()].entries()) {
    const fileName = `${String(index + 1).padStart(3, '0')}-${safeId(evidence.finalUrl)}.html.gz`;
    const absoluteFile = path.join(documentDir, fileName);
    await writeFile(absoluteFile, gzipSync(Buffer.from(evidence.html, 'utf8')));
    documents.push({
      sourceUrl: evidence.sourceUrl,
      finalUrl: evidence.finalUrl,
      postModalDomFile: path.relative(input.corpusRoot, absoluteFile),
      postModalDomSha256: hash(evidence.html),
      removedDetails: evidence.removedDetails,
    });
  }
  const record: FrozenCorpusSiteRecord = {
    version: 1,
    target: input.target,
    crawlStartedAt: input.crawlStartedAt,
    crawlCompletedAt: input.crawlCompletedAt,
    tlsOptIn: input.tlsOptIn,
    status: input.artifact ? 'success' : 'failure',
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
    ...(input.artifact ? { artifact: input.artifact } : {}),
    documents,
  };
  const siteFile = path.join(siteDir, 'crawl-artifact.json.gz');
  await writeFile(
    siteFile,
    gzipSync(Buffer.from(JSON.stringify(record), 'utf8')),
  );
  return {
    siteFile: path.relative(input.corpusRoot, siteFile),
    documentFiles: documents.map((document) => document.postModalDomFile),
  };
}

function normalizeHost(raw: string): string {
  const withScheme = /^[a-z]+:\/\//iu.test(raw) ? raw : `https://${raw}`;
  return new URL(withScheme).hostname.toLowerCase().replace(/^www\./u, '');
}

function predictedGrades(markdown: string): Map<string, Target['predictedGrade']> {
  const grades = new Map<string, Target['predictedGrade']>();
  const row = /^\|\s*[^|]+\|\s*`([^`]+)`\s*\|.*\|\s*\*\*(L[1-4])\*\*\s*\|$/u;
  for (const line of markdown.split(/\r?\n/u)) {
    const match = row.exec(line);
    if (!match) continue;
    try {
      grades.set(normalizeHost(match[1]), match[2] as Target['predictedGrade']);
    } catch {
      // Non-URL table rows are ignored.
    }
  }
  return grades;
}

function privateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 10
      || a === 127
      || a === 0
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }
  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:');
}

async function validatePublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('PUBLIC_HTTP_URL_REQUIRED');
  }
  const resolved = await lookup(url.hostname, { all: true });
  if (resolved.length === 0 || resolved.some((entry) => privateAddress(entry.address))) {
    throw new TypeError('PUBLIC_ADDRESS_REQUIRED');
  }
  return url;
}

const explicitlyUnverifiedTlsFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.protocol !== 'https:') return fetch(input, init);
  return new Promise<Response>((resolve, reject) => {
    const req = request(url, {
      agent: INVALID_TLS_AGENT,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    }, (res) => {
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) responseHeaders.append(key, item);
        } else if (value !== undefined) responseHeaders.set(key, String(value));
      }
      resolve(new Response(
        (init?.method ?? 'GET') === 'HEAD'
          ? null
          : Readable.toWeb(res) as ReadableStream<Uint8Array>,
        {
          status: res.statusCode ?? 500,
          statusText: res.statusMessage,
          headers: responseHeaders,
        },
      ));
    });
    const abort = () => req.destroy(new DOMException('The operation was aborted', 'AbortError'));
    if (init?.signal?.aborted) {
      abort();
      return;
    }
    init?.signal?.addEventListener('abort', abort, { once: true });
    req.once('close', () => init?.signal?.removeEventListener('abort', abort));
    req.once('error', reject);
    req.end();
  });
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeId(url: string): string {
  const parsed = new URL(url);
  return `${parsed.hostname.replace(/[^a-z0-9.-]/giu, '-')}-${hash(url).slice(0, 10)}`;
}

async function settle(page: Page, milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
}

async function closeBrowser(browser: Browser | undefined): Promise<void> {
  if (!browser) return;
  let timedOut = false;
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(() => {
      timedOut = true;
      resolve();
    }, 5_000)),
  ]);
  if (timedOut && browser.connected) browser.process()?.kill('SIGTERM');
}

async function releaseDarkModalScrims(page: Page): Promise<RenderEvidence['removedDetails']> {
  const candidates = await page.evaluate(() => {
    const parseColor = (value: string) => {
      const match = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/iu
        .exec(value.trim());
      if (!match) return null;
      return {
        red: Number(match[1]),
        green: Number(match[2]),
        blue: Number(match[3]),
        alpha: match[4] === undefined ? 1 : Number(match[4]),
      };
    };
    const luminance = (color: { red: number; green: number; blue: number }) => (
      (
        0.2126 * color.red
        + 0.7152 * color.green
        + 0.0722 * color.blue
      ) / 255
    );
    const cssPath = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.body && parts.length < 5) {
        const parent: Element | null = current.parentElement;
        const siblings: Element[] = parent
          ? [...parent.children].filter((child: Element) => child.tagName === current!.tagName)
          : [];
        const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
        const className = [...current.classList]
          .filter((value) => /^[a-z][a-z0-9_-]{1,40}$/iu.test(value))
          .slice(0, 2)
          .map((value) => `.${CSS.escape(value)}`)
          .join('');
        parts.unshift(`${current.tagName.toLowerCase()}${className}${nth}`);
        current = parent;
      }
      return `body>${parts.join('>')}`;
    };
    const closeControls = [...document.querySelectorAll<HTMLElement>('button,a')].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        rect.width <= 0
        || rect.height <= 0
        || style.display === 'none'
        || style.visibility === 'hidden'
      ) return false;
      const accessibleLabel = [
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
      ].filter(Boolean).join(' ').trim();
      const visibleLabel = element.innerText.trim();
      return /(?:^|\s)(?:close|닫기|닫음)(?:\s|$)/iu.test(accessibleLabel)
        || /^(?:close|닫기|닫음|×)$/iu.test(visibleLabel);
    });
    const explicitCloseRoots = new Set<Element>();
    for (const control of closeControls) {
      explicitCloseRoots.add(
        control.closest('[role="dialog"],[aria-modal="true"]')
          ?? control.parentElement
          ?? control,
      );
    }
    const allElements = [...document.body.querySelectorAll<Element>('*')];
    const approved = new Map<Element, 'dim_backdrop' | 'explicit_close'>();
    for (const element of allElements) {
      const style = getComputedStyle(element);
      const color = parseColor(style.backgroundColor);
      if (!color) continue;
      const rect = element.getBoundingClientRect();
      const cover = (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
      const effectiveAlpha = color.alpha;
      const value = luminance(color);
      const interactiveDescendantCount = element.querySelectorAll(
        'a,button,img,video,iframe',
      ).length;
      if (
        cover >= 0.55
        && effectiveAlpha > 0.15
        && value < 0.35
        && interactiveDescendantCount === 0
        && (element as HTMLElement).innerText.trim().length <= 4
      ) {
        approved.set(element, 'dim_backdrop');
      }
    }
    for (const root of explicitCloseRoots) approved.set(root, 'explicit_close');
    return [...approved].map(([element, reason], index) => {
      const style = getComputedStyle(element);
      const color = parseColor(style.backgroundColor) ?? {
        red: 0,
        green: 0,
        blue: 0,
        alpha: 0,
      };
      const rect = element.getBoundingClientRect();
      const cover = (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
      const effectiveAlpha = color.alpha;
      const value = luminance(color);
      const auditId = `overlay-${index + 1}`;
      element.setAttribute('data-daboim-overlay-audit', auditId);
      let clicked = false;
      for (const control of closeControls) {
        if (element.contains(control) || element.parentElement?.contains(control)) {
          control.click();
          clicked = true;
          break;
        }
      }
      return {
        auditId,
        selector: cssPath(element),
        reason,
        cover,
        effectiveAlpha,
        luminance: value,
        clicked,
      };
    });
  });
  if (candidates.length === 0) return [];
  await settle(page, 500);
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('[data-daboim-overlay-audit]')) {
      element.remove();
    }
  });
  await settle(page, 100);
  return candidates.map(({ selector, reason, cover, effectiveAlpha, luminance }) => ({
    selector,
    reason,
    cover,
    effectiveAlpha,
    luminance,
  }));
}

async function forceFullScroll(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 75));
    const landmarks = [...document.querySelectorAll<HTMLElement>(
      'main>*,section,article,[data-aos],[class*="wow" i]',
    )].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.height > 1 && rect.width > 1;
    });
    for (const element of landmarks.slice(0, 120)) {
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      await pause();
    }
    let stableBottom = 0;
    for (let step = 0; step < 120; step += 1) {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      window.scrollTo({ top: Math.min(height, window.scrollY + window.innerHeight * 0.8) });
      await pause();
      const nextHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
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

async function renderSourcePage(input: {
  browser: Browser;
  sourceUrl: string;
  rawHtml: string;
  outputDir: string;
}): Promise<{
  html: string;
  finalUrl: string;
  observation: CrawlPageAccessObservation;
  evidence: RenderEvidence;
}> {
  let finalError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const page = await input.browser.newPage();
    try {
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      // tsx/esbuild names nested page-evaluate helpers through __name. Install
      // the no-op helper in every new document so a delayed client redirect
      // cannot erase it between navigation and the full-scroll pass.
      await page.evaluateOnNewDocument('globalThis.__name = (target) => target');
      await page.goto(input.sourceUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      await page.evaluate('globalThis.__name = (target) => target');
      await settle(page, 1_000 + (attempt - 1) * 1_000);
      const before = await page.content();
      const removedDetails = await releaseDarkModalScrims(page);
      const fullScrollCompleted = await forceFullScroll(page);
      await settle(page, 500);
      const after = await page.content();
      const finalUrl = page.url();
      const visibleTextLength = await page.evaluate(() => document.body.innerText.trim().length);
      const rawTextLength = parse(input.rawHtml).text.trim().length;
      if (attempt === 1 && visibleTextLength < 40 && rawTextLength >= 40) {
        await page.close();
        continue;
      }
      const totalHeight = await page.evaluate(() => Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      ));
      const segments = screenshotSegments(totalHeight);
      const id = safeId(input.sourceUrl);
      let beforePath: string | undefined;
      let afterPath: string | undefined;
      if (removedDetails.length > 0) {
        const domDir = path.join(input.outputDir, 'dom');
        await mkdir(domDir, { recursive: true });
        beforePath = path.join(domDir, `${id}-before.html`);
        afterPath = path.join(domDir, `${id}-after.html`);
        await writeFile(beforePath, before);
        await writeFile(afterPath, after);
      }
      await page.close();
      return {
        html: after,
        finalUrl,
        observation: {
          version: 1,
          renderAttempts: attempt,
          fullScrollCompleted,
          screenshotSegments: segments,
          ...(removedDetails.length > 0
            ? {
                modalRelease: {
                  version: 1,
                  beforeDomSha256: hash(before),
                  afterDomSha256: hash(after),
                  removedNodeCount: removedDetails.length,
                  removedSelectors: removedDetails.map((entry) => entry.selector),
                },
              }
            : {}),
        },
        evidence: {
          sourceUrl: input.sourceUrl,
          finalUrl,
          html: after,
          ...(beforePath ? { beforePath } : {}),
          ...(afterPath ? { afterPath } : {}),
          removedDetails,
        },
      };
    } catch (error) {
      finalError = error;
      await page.close().catch(() => undefined);
    }
  }
  throw finalError instanceof Error ? finalError : new Error('HEADLESS_RENDER_FAILED');
}

function normalized(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function sourceBlocks(html: string): string[] {
  const root = parse(html);
  for (const removable of root.querySelectorAll(
    'script,style,noscript,template,nav,form,.pagination,.paging',
  )) removable.remove();
  const candidates = root.querySelectorAll(
    'main h1,main h2,main h3,main p,main li,article h1,article h2,article h3,article p,article li',
  );
  return [...new Set(candidates
    .map((element) => normalized(element.text))
    .filter((value) => value.length >= 4))];
}

function renderLocalDocument(config: SiteConfig, lang: string): string {
  const body = renderToStaticMarkup(createElement(TenantPageContent, {
    config,
    pageSlug: '',
    interactive: false,
    animate: false,
    runtimeDelivery: 'inline',
  }));
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

async function measureCompiledPage(
  browser: Browser,
  html: string,
  originalHtml: string,
  fallbackOriginalBlocks: readonly string[],
): Promise<GateMeasurement> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await settle(page, 300);
  const measured = await page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLElement>(
      'h1,h2,h3,h4,p,li,dd,dt,address,[data-font-role]',
    )].filter((element) => element.innerText.trim().length > 0);
    const textBlocks = elements.map((element) => element.innerText.replace(/\s+/gu, ' ').trim());
    const widths: number[] = [];
    for (const element of elements) {
      const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (!textNode?.textContent) {
        const size = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
        widths.push(element.getBoundingClientRect().width / size);
        continue;
      }
      const lines = new Map<number, { left: number; right: number }>();
      for (let index = 0; index < textNode.textContent.length; index += 1) {
        const range = document.createRange();
        range.setStart(textNode, index);
        range.setEnd(textNode, index + 1);
        for (const rect of range.getClientRects()) {
          const key = Math.round(rect.top);
          const line = lines.get(key) ?? { left: rect.left, right: rect.right };
          line.left = Math.min(line.left, rect.left);
          line.right = Math.max(line.right, rect.right);
          lines.set(key, line);
        }
      }
      const size = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
      for (const line of lines.values()) widths.push((line.right - line.left) / size);
    }
    const sections = [...document.querySelectorAll<HTMLElement>('main section')];
    const emptySectionCount = sections.filter((section) => (
      section.innerText.trim().length === 0 && !section.querySelector('img,video,svg')
    )).length;
    const clippingCount = elements.filter((element) => {
      const style = getComputedStyle(element);
      if (style.overflow === 'visible' && style.overflowX === 'visible') return false;
      return element.scrollWidth > element.clientWidth + 1
        || element.scrollHeight > element.clientHeight + 1;
    }).length;
    return { textBlocks, widths, sectionCount: sections.length, emptySectionCount, clippingCount };
  });
  await page.close();
  const sortedWidths = [...measured.widths].sort((a, b) => a - b);
  const p95Em = sortedWidths.length > 0
    ? sortedWidths[Math.min(sortedWidths.length - 1, Math.floor(sortedWidths.length * 0.95))]
    : 0;
  const maxEm = sortedWidths.at(-1) ?? 0;
  const originals = sourceBlocks(originalHtml).length > 0
    ? sourceBlocks(originalHtml)
    : [...new Set(fallbackOriginalBlocks.map(normalized).filter((value) => value.length >= 4))];
  const rendered = measured.textBlocks.map(normalized);
  const missing = originals.filter((block) => !rendered.some((value) => value.includes(block)));
  const integrityViolations = originals.filter((block) => (
    rendered.filter((value) => value.includes(block)).length > 1
  ));
  return {
    sourceCompleteness: {
      // Empty input is not proof of completeness. Treat the vacuous set as
      // insufficient source material so the local preview remains fail-closed.
      pass: originals.length > 0 && missing.length === 0,
      sourceBlockCount: originals.length,
      missingCount: missing.length,
      missing,
    },
    blockIntegrity: {
      pass: integrityViolations.length === 0,
      violationCount: integrityViolations.length,
    },
    density: {
      pass: measured.sectionCount >= 1
        && measured.sectionCount <= 20
        && measured.emptySectionCount === 0,
      sectionCount: measured.sectionCount,
      emptySectionCount: measured.emptySectionCount,
    },
    lineWidth: {
      pass: maxEm <= 30 && measured.clippingCount === 0,
      p95Em,
      maxEm,
      clippingCount: measured.clippingCount,
    },
  };
}

async function captureCompiled(input: {
  browser: Browser;
  html: string;
  outputDir: string;
  id: string;
}): Promise<string[]> {
  const page = await input.browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setContent(input.html, { waitUntil: 'domcontentloaded' });
  await settle(page, 500);
  const totalHeight = await page.evaluate(() => Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  ));
  const captureDir = path.join(input.outputDir, 'captures');
  await mkdir(captureDir, { recursive: true });
  const files: string[] = [];
  for (const [index, segment] of screenshotSegments(totalHeight).entries()) {
    const file = path.join(captureDir, `${input.id}-${index + 1}.png`);
    await page.screenshot({
      path: file,
      clip: { x: 0, y: segment.y, width: 1440, height: segment.height },
    });
    files.push(file);
  }
  await page.close();
  return files;
}

async function runTarget(input: {
  target: Target;
  browser: () => Promise<Browser>;
  insecureBrowser: () => Promise<Browser>;
  outputDir: string;
  corpusRoot: string;
  corpusId: string;
  pageLimit: number;
  corpusOnly: boolean;
  compiledHtml: Map<string, string>;
}): Promise<SiteResult> {
  const crawlStartedAt = new Date().toISOString();
  let tlsOptIn = false;
  let artifact: CrawlArtifactPayload | undefined;
  const rendered = new Map<string, RenderEvidence>();
  const crawl = async (browser: Browser, allowInvalidTlsCertificate: boolean) => (
    crawlDesignatedSite(
      {
        url: input.target.url,
        allowInvalidTlsCertificate,
      },
      {
        validateUrl: validatePublicUrl,
        wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
        pageLimit: input.pageLimit,
        ...(allowInvalidTlsCertificate
          ? { invalidTlsFetchFn: explicitlyUnverifiedTlsFetch }
          : {}),
        renderPage: async ({ url, rawHtml }) => {
          const result = await renderSourcePage({
            browser,
            sourceUrl: url,
            rawHtml,
            outputDir: input.outputDir,
          });
          rendered.set(result.finalUrl, result.evidence);
          return {
            html: result.html,
            finalUrl: result.finalUrl,
            observation: result.observation,
          };
        },
      },
    )
  );
  let crawlFailure: unknown;
  try {
    artifact = await crawl(await input.browser(), false);
  } catch (error) {
    crawlFailure = error;
    if (
      error instanceof CrawlError
      && ['TLS_FALLBACK_NOT_APPROVED', 'TLS_INSECURE_FETCH_UNAVAILABLE'].includes(error.code)
    ) {
      tlsOptIn = true;
      try {
        artifact = await crawl(await input.insecureBrowser(), true);
        crawlFailure = undefined;
      } catch (retryError) {
        crawlFailure = retryError;
      }
    }
  }
  if (!artifact) {
    const failureReason = crawlFailure instanceof Error
      ? `${crawlFailure.name}:${crawlFailure.message}`
      : String(crawlFailure);
    await persistFrozenCorpusSite({
      corpusRoot: input.corpusRoot,
      corpusId: input.corpusId,
      target: input.target,
      crawlStartedAt,
      crawlCompletedAt: new Date().toISOString(),
      tlsOptIn,
      failureReason,
      rendered,
    });
    return {
      target: input.target,
      tlsOptIn,
      crawl: {
        status: 'failure',
        pageCount: 0,
        failureReason,
        modalRemovedNodeCount: 0,
        modalRemovedSelectors: [],
        fullScrollCompleted: false,
        screenshotSegmentCount: 0,
      },
      compile: { status: 'not_run', pageCount: 0 },
      gates: { status: 'not_run' },
    };
  }
  const observations = artifact.pages.flatMap((page) => (
    page.accessObservation ? [page.accessObservation] : []
  ));
  const crawlResult: SiteResult['crawl'] = {
    status: 'success',
    pageCount: artifact.pages.length,
    ...(artifact.pageFailures ? { pageFailures: artifact.pageFailures } : {}),
    modalRemovedNodeCount: observations.reduce(
      (sum, observation) => sum + (observation.modalRelease?.removedNodeCount ?? 0),
      0,
    ),
    modalRemovedSelectors: observations.flatMap(
      (observation) => observation.modalRelease?.removedSelectors ?? [],
    ),
    ...(observations.some((observation) => observation.modalRelease)
      ? {
          modalEvidence: [...rendered.values()].map((evidence) => ({
            sourceUrl: evidence.sourceUrl,
            finalUrl: evidence.finalUrl,
            ...(evidence.beforePath ? { beforePath: evidence.beforePath } : {}),
            ...(evidence.afterPath ? { afterPath: evidence.afterPath } : {}),
            removedDetails: evidence.removedDetails,
          })),
        }
      : {}),
    fullScrollCompleted: observations.length === artifact.pages.length
      && observations.every((observation) => observation.fullScrollCompleted),
    screenshotSegmentCount: observations.reduce(
      (sum, observation) => sum + observation.screenshotSegments.length,
      0,
    ),
  };
  await persistFrozenCorpusSite({
    corpusRoot: input.corpusRoot,
    corpusId: input.corpusId,
    target: input.target,
    crawlStartedAt,
    crawlCompletedAt: new Date().toISOString(),
    tlsOptIn,
    artifact,
    rendered,
  });
  if (input.corpusOnly) {
    return {
      target: input.target,
      tlsOptIn,
      crawl: crawlResult,
      compile: { status: 'not_run', pageCount: 0 },
      gates: { status: 'not_run' },
    };
  }
  try {
    const profile = input.target.market === 'KR'
      ? KO_MEDICAL_IMPORT_PROFILE
      : US_MEDICAL_OUTREACH_PROFILE;
    const initial = compileRobustClinicArtifact({ artifact, profile });
    const html = renderLocalDocument(initial.config, profile.locale);
    const sourceEvidence = rendered.values().next().value as RenderEvidence | undefined;
    const gates = await measureCompiledPage(
      await input.browser(),
      html,
      sourceEvidence?.html ?? '',
      artifact.pages.flatMap((page) => [
        ...page.headings,
        ...page.text.split(/\n+/u),
      ]),
    );
    const gateEvidence = {
      'source-completeness': gates.sourceCompleteness.pass,
      'render-block-integrity': gates.blockIntegrity.pass,
      density: gates.density.pass,
      'line-width': gates.lineWidth.pass,
    } as const;
    const compiled = compileRobustClinicArtifact({ artifact, profile, gateEvidence });
    const trace = clinicEngineTraceFor(compiled);
    input.compiledHtml.set(input.target.url, html);
    const pass = Object.values(gateEvidence).every(Boolean);
    return {
      target: input.target,
      tlsOptIn,
      crawl: crawlResult,
      compile: {
        status: 'success',
        pageCount: compiled.config.pages.length,
        engineProfile: trace?.profileId,
      },
      gates: {
        status: pass ? 'pass' : 'fail',
        measurements: gates,
      },
    };
  } catch (error) {
    return {
      target: input.target,
      tlsOptIn,
      crawl: crawlResult,
      compile: {
        status: 'failure',
        failureReason: error instanceof Error ? `${error.name}:${error.message}` : String(error),
        pageCount: 0,
      },
      gates: { status: 'not_run' },
    };
  }
}

async function main(): Promise<void> {
  const outputDir = argument('--output') ?? DEFAULT_OUTPUT;
  const corpusRoot = path.resolve(argument('--corpus') ?? DEFAULT_CORPUS_ROOT);
  const specFile = argument('--spec') ?? DEFAULT_SPEC;
  const limit = Number(argument('--limit') ?? '79');
  const pageLimit = Number(argument('--page-limit') ?? DESIGNATED_CRAWL_POLICY.maxPages);
  const corpusOnly = flag('--corpus-only');
  if (!Number.isSafeInteger(pageLimit) || pageLimit < 1 || pageLimit > DESIGNATED_CRAWL_POLICY.maxPages) {
    throw new Error(`ENGINE_ROBUST_PAGE_LIMIT_INVALID:${pageLimit}`);
  }
  await mkdir(outputDir, { recursive: true });
  await mkdir(corpusRoot, { recursive: true });
  const [krSites, dental, aesthetic, ortho, specification] = await Promise.all([
    readFile(path.join(RESEARCH_ROOT, 'kr-survey/site-list.txt'), 'utf8'),
    readFile(path.join(RESEARCH_ROOT, 'us-survey/segment-dental.md'), 'utf8'),
    readFile(path.join(RESEARCH_ROOT, 'us-survey/segment-aesthetic.md'), 'utf8'),
    readFile(path.join(RESEARCH_ROOT, 'us-survey/segment-ortho.md'), 'utf8'),
    readFile(specFile, 'utf8'),
  ]);
  const grades = predictedGrades(specification);
  const markdownSites = (value: string) => [...value.matchAll(
    /^#{2,3}\s+\d+\.\s+([a-z0-9.-]+\.[a-z]{2,})(?:\s|$)/gimu,
  )].map((match) => match[1].toLowerCase());
  const targetRows: Array<{ market: 'KR' | 'US'; url: string }> = [
    ...krSites.split(/\r?\n/u)
      .map((url) => url.trim())
      .filter((url) => /^https?:\/\//iu.test(url))
      .map((url) => ({ market: 'KR' as const, url })),
    ...[
      ...markdownSites(dental).filter((host) => host !== 'thetoothco.com').slice(0, 10),
      ...markdownSites(aesthetic).slice(0, 7),
      ...markdownSites(ortho).slice(0, 8),
    ].map((host) => ({ market: 'US' as const, url: `https://${host}/` })),
  ];
  const onlyHosts = new Set((argument('--hosts') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
  const selectedRows = onlyHosts.size > 0
    ? targetRows.filter((site) => onlyHosts.has(normalizeHost(site.url)))
    : targetRows.slice(0, limit);
  const targets = selectedRows.map((site): Target => ({
    ...site,
    canonicalUrl: site.url,
    predictedGrade: grades.get(normalizeHost(site.url)) ?? 'unrecorded',
  }));
  if (onlyHosts.size === 0 && limit >= 79 && targets.length !== 79) {
    throw new Error(`ENGINE_ROBUST_TARGET_COUNT_MISMATCH:${targets.length}`);
  }
  let normalBrowserInstance: Browser | undefined;
  const normalBrowser = async () => {
    if (!normalBrowserInstance?.connected) {
      normalBrowserInstance = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        acceptInsecureCerts: false,
        args: ['--disable-dev-shm-usage', '--no-sandbox'],
      });
    }
    return normalBrowserInstance;
  };
  let insecureBrowserInstance: Browser | undefined;
  const insecureBrowser = async () => {
    if (!insecureBrowserInstance?.connected) {
      insecureBrowserInstance = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        acceptInsecureCerts: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox'],
      });
    }
    return insecureBrowserInstance;
  };
  const results: SiteResult[] = [];
  const compiledHtml = new Map<string, string>();
  try {
    for (let index = 0; index < targets.length; index += CONCURRENCY) {
      const batch = targets.slice(index, index + CONCURRENCY);
      const completed = await Promise.all(batch.map((target) => runTarget({
        target,
        browser: normalBrowser,
        insecureBrowser,
        outputDir,
        corpusRoot,
        corpusId: [
          String(targets.indexOf(target) + 1).padStart(3, '0'),
          target.market.toLowerCase(),
          safeId(target.url),
        ].join('-'),
        pageLimit,
        corpusOnly,
        compiledHtml,
      })));
      results.push(...completed);
      for (const [offset, result] of completed.entries()) {
        process.stdout.write([
          `${index + offset + 1}/${targets.length}`,
          normalizeHost(result.target.url),
          result.target.predictedGrade,
          `crawl=${result.crawl.status}`,
          `compile=${result.compile.status}`,
          `gate=${result.gates.status}`,
          `modal=${result.crawl.modalRemovedNodeCount}`,
          `tlsOptIn=${result.tlsOptIn}`,
        ].join(' ') + '\n');
      }
      await writeFile(
        path.join(outputDir, 'progress.json'),
        JSON.stringify({ targets: targets.length, results }, null, 2),
      );
    }
    const visualCandidates = results.filter((result) => (
      result.crawl.status === 'success'
      && result.compile.status === 'success'
      && result.gates.status === 'pass'
      && result.target.predictedGrade !== 'L1'
      && compiledHtml.has(result.target.url)
    )).slice(0, 3);
    const captures: Record<string, string[]> = {};
    for (const result of visualCandidates) {
      captures[result.target.url] = await captureCompiled({
        browser: await normalBrowser(),
        html: compiledHtml.get(result.target.url)!,
        outputDir,
        id: safeId(result.target.url),
      });
    }
    const summary = {
      generatedAt: new Date().toISOString(),
      source: {
        targets: [
          path.join(RESEARCH_ROOT, 'kr-survey/site-list.txt'),
          path.join(RESEARCH_ROOT, 'us-survey/segment-dental.md'),
          path.join(RESEARCH_ROOT, 'us-survey/segment-aesthetic.md'),
          path.join(RESEARCH_ROOT, 'us-survey/segment-ortho.md'),
        ],
        spec: specFile,
        targetCount: targets.length,
        issuance: false,
        compileMode: 'local-static-document',
        frozenCorpusRoot: corpusRoot,
        pageLimit,
        corpusOnly,
      },
      results,
      captures,
    };
    await writeFile(
      path.join(outputDir, 'driver-report.json'),
      JSON.stringify(summary, null, 2),
    );
    await writeFile(
      path.join(corpusRoot, 'manifest.json'),
      JSON.stringify({
        version: 1,
        generatedAt: summary.generatedAt,
        sourceRunner: 'web/scripts/run-engine-robustness.ts',
        targetCount: targets.length,
        pageLimit,
        issuance: false,
        siteFiles: targets.map((target, index) => path.join(
          'sites',
          [
            String(index + 1).padStart(3, '0'),
            target.market.toLowerCase(),
            safeId(target.url),
          ].join('-'),
          'crawl-artifact.json.gz',
        )),
      }, null, 2),
    );
  } finally {
    await closeBrowser(normalBrowserInstance);
    await closeBrowser(insecureBrowserInstance);
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
