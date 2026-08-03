/**
 * FNT owner-review evidence. Uses checked-in font subsets and the production SiteRenderer.
 * No provider, generated image, or external font request is used.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-font-pairing-review.tsx
 * Out: /private/tmp/anakslabs-fonts-review
 */
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import puppeteer from 'puppeteer-core';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import type { DesignDnaId } from '@/lib/design/dna/types';
import {
  applyKoreanFontPairing,
  fontPairingResources,
  fontPairingResourcesForText,
  KOREAN_FONT_PERFORMANCE_BUDGETS,
} from '@/lib/fonts';
import type {
  ProductionKoreanFontPairId,
} from '@/lib/fonts/types';
import type { Section, SiteConfig } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';

const OUTPUT_DIR = '/private/tmp/anakslabs-fonts-review';
const PUBLIC_DIR = path.resolve('public');
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.FNT_REVIEW_PORT ?? 4194);
const VIEWPORTS = [
  { band: 'wide', width: 1440, height: 900 },
  { band: 'compact', width: 768, height: 900 },
  { band: 'mobile', width: 390, height: 844 },
] as const;
const CASES = [
  {
    id: 'kr-pretendard-neutral',
    dnaId: 'medical-clinical-clarity',
    hueSeed: 202,
    business: '바른결 의원',
  },
  {
    id: 'kr-nanum-myeongjo-readable',
    dnaId: 'cafe-warm-editorial',
    hueSeed: 30,
    business: '고요한 잔',
  },
  {
    id: 'kr-gmarket-noto-structured',
    dnaId: 'retail-bold-geometric',
    hueSeed: 312,
    business: '오브제 마켓',
  },
  {
    id: 'kr-nanum-square-round-friendly',
    dnaId: 'beauty-soft-wellness',
    hueSeed: 348,
    business: '온결 살롱',
  },
] as const satisfies readonly {
  id: ProductionKoreanFontPairId;
  dnaId: DesignDnaId;
  hueSeed: number;
  business: string;
}[];

const BEFORE_R1_FIRST_SCREEN_BYTES = {
  'kr-pretendard-neutral': 444_468,
  'kr-nanum-myeongjo-readable': 810_012,
  'kr-gmarket-noto-structured': 617_176,
  'kr-nanum-square-round-friendly': 604_960,
} as const satisfies Record<ProductionKoreanFontPairId, number>;

const BEFORE_R1_EXPORT_PAIR_BYTES = {
  'kr-pretendard-neutral': 444_468,
  'kr-nanum-myeongjo-readable': 1_284_252,
  'kr-gmarket-noto-structured': 863_496,
  'kr-nanum-square-round-friendly': 760_376,
} as const satisfies Record<ProductionKoreanFontPairId, number>;

function hero(theme: SiteConfig['theme'], business: string): Section {
  return {
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 820,
    background: { color: theme.palette.background },
    elements: [
      {
        id: 'hero-kicker',
        kind: 'text',
        text: business,
        frame: { x: 132, y: 126, w: 620, h: 42 },
        z: 1,
        style: {
          fontSize: 17,
          fontFamily: 'body',
          fontWeight: 600,
          color: theme.palette.primary,
          lineHeight: 1.5,
        },
      },
      {
        id: 'hero-title',
        kind: 'text',
        text: '머무는 순간이\n차분한 기억으로\n이어지도록',
        frame: { x: 126, y: 194, w: 810, h: 260 },
        z: 1,
        style: {
          fontSize: 72,
          fontFamily: 'heading',
          fontWeight: 700,
          color: theme.palette.text,
          lineHeight: 1.18,
          readabilityGuard: 'long-hero',
        },
      },
      {
        id: 'hero-lead',
        kind: 'text',
        text: '처음 찾는 분도 필요한 내용을 한눈에 읽고, 편안하게 다음 행동을 고를 수 있도록 안내합니다.',
        frame: { x: 132, y: 500, w: 650, h: 92 },
        z: 1,
        style: {
          fontSize: 21,
          fontFamily: 'body',
          color: theme.palette.muted,
          lineHeight: 1.65,
        },
      },
      {
        id: 'hero-cta',
        kind: 'button',
        label: '방문 전에 확인하기',
        href: '#details',
        frame: { x: 132, y: 626, w: 226, h: 58 },
        z: 1,
        style: {
          variant: 'solid',
          fontSize: 17,
          color: theme.palette.primary,
        },
      },
    ],
  };
}

function details(theme: SiteConfig['theme']): Section {
  return {
    id: 'details',
    type: 'features',
    name: '안내',
    height: 660,
    background: { color: theme.palette.surface },
    elements: [
      {
        id: 'details-title',
        kind: 'text',
        text: '읽기 편한 순서로\n필요한 안내를 전합니다',
        frame: { x: 126, y: 112, w: 760, h: 148 },
        z: 1,
        style: {
          fontSize: 48,
          fontFamily: 'heading',
          fontWeight: 700,
          color: theme.palette.text,
          lineHeight: 1.28,
        },
      },
      {
        id: 'details-body',
        kind: 'text',
        text: '제목은 짧고 분명하게, 긴 설명은 여유 있는 행간으로 정리합니다. 한글 낱말이 중간에서 어색하게 끊기지 않고 작은 화면에서도 가장자리에 닿지 않습니다.',
        frame: { x: 126, y: 306, w: 760, h: 150 },
        z: 1,
        style: {
          fontSize: 20,
          fontFamily: 'body',
          color: theme.palette.muted,
          lineHeight: 1.7,
        },
      },
    ],
  };
}

function reviewConfig(reviewCase: typeof CASES[number]): SiteConfig {
  const dnaTheme = tokenSetToSiteTheme(expandTokens(reviewCase.dnaId, reviewCase.hueSeed));
  const theme = applyKoreanFontPairing(dnaTheme, reviewCase.id);
  const config = emptySiteConfig(reviewCase.business);
  return {
    ...config,
    theme,
    designDna: {
      catalogVersion: 1,
      dnaId: reviewCase.dnaId,
      hueSeed: reviewCase.hueSeed,
      overrides: {},
    },
    pages: [{
      id: 'home',
      title: '홈',
      slug: '',
      sections: [hero(theme, reviewCase.business), details(theme)],
    }],
  };
}

function documentFor(config: SiteConfig, mode: 'desktop' | 'mobile'): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    interactive: false,
    animate: false,
    runtimeDelivery: 'client',
  }));
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.__fntCls=0;window.__fntShifts=[];new PerformanceObserver(function(list){list.getEntries().forEach(function(entry){if(!entry.hadRecentInput){window.__fntCls+=entry.value;window.__fntShifts.push({value:entry.value,sources:(entry.sources||[]).map(function(source){var node=source.node;return node?(node.id||node.getAttribute&&node.getAttribute('data-font-role')||node.tagName):null})})}})}).observe({type:'layout-shift',buffered:true})</script><style>html,body{margin:0;min-height:100%;overflow-x:hidden}</style></head><body>${markup}</body></html>`;
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
      const decoded = decodeURIComponent(url.pathname);
      if (decoded === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }
      const file = decoded.startsWith('/fonts/')
        ? path.resolve(PUBLIC_DIR, decoded.replace(/^\/+/u, ''))
        : path.resolve(OUTPUT_DIR, decoded.replace(/^\/+/u, ''));
      const allowedRoot = decoded.startsWith('/fonts/') ? PUBLIC_DIR : OUTPUT_DIR;
      if (!file.startsWith(`${allowedRoot}${path.sep}`)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      const body = await readFile(file);
      const type = file.endsWith('.woff2')
        ? 'font/woff2'
        : file.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : 'application/octet-stream';
      response.writeHead(200, {
        'content-type': type,
        'cache-control': file.endsWith('.woff2')
          ? 'public, max-age=31536000, immutable'
          : 'no-store',
        'access-control-allow-origin': '*',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise<typeof server>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });
  for (const reviewCase of CASES) {
    for (const viewport of VIEWPORTS) {
      await writeFile(
        path.join(OUTPUT_DIR, `${reviewCase.id}-${viewport.band}.html`),
        documentFor(reviewConfig(reviewCase), viewport.band === 'wide' ? 'desktop' : 'mobile'),
      );
    }
  }
  const server = await startServer();
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
  const records = [];
  try {
    for (const reviewCase of CASES) {
      const config = reviewConfig(reviewCase);
      const resources = fontPairingResources(config.theme);
      const exportResources = fontPairingResourcesForText(
        config.theme,
        JSON.stringify(config),
      );
      if (!resources) throw new Error(`Missing resources: ${reviewCase.id}`);
      if (!exportResources) throw new Error(`Missing export resources: ${reviewCase.id}`);
      if (exportResources.bytes > KOREAN_FONT_PERFORMANCE_BUDGETS.exportPairBytes) {
        throw new Error(`${reviewCase.id}: export ${exportResources.bytes}`);
      }
      for (const viewport of VIEWPORTS) {
        const page = await browser.newPage();
        await page.setCacheEnabled(false);
        await page.setViewport({
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          isMobile: viewport.band === 'mobile',
        });
        const consoleErrors: string[] = [];
        const fontResponseBodies: Promise<{ url: string; bytes: number }>[] = [];
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('pageerror', (error) => consoleErrors.push(
          error instanceof Error ? error.message : String(error),
        ));
        page.on('response', (response) => {
          if (
            response.request().resourceType() === 'font'
            && response.url().includes('/fonts/korean/')
          ) {
            fontResponseBodies.push(
              response.buffer().then((body) => ({
                url: response.url(),
                bytes: body.byteLength,
              })),
            );
          }
        });
        await page.goto(`http://127.0.0.1:${PORT}/${reviewCase.id}-${viewport.band}.html`, {
          waitUntil: 'networkidle0',
        });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        const fontTransfers = await Promise.all(fontResponseBodies);
        const metrics = await page.evaluate(() => {
          const title = document.querySelector<HTMLElement>('[data-font-role="display"]');
          const lead = document.querySelector<HTMLElement>('[data-font-role="lead"]');
          const button = document.querySelector<HTMLElement>('.anaks-btn');
          const titleRect = title?.getBoundingClientRect();
          const leadRect = lead?.getBoundingClientRect();
          const buttonStyle = button ? getComputedStyle(button) : null;
          const faceRules = [...document.styleSheets].flatMap((sheet) => {
            try {
              return [...sheet.cssRules].filter((rule) => rule.constructor.name === 'CSSFontFaceRule');
            } catch {
              return [];
            }
          });
          const logicalFaces = new Set(faceRules.map((rule) => {
            const declaration = (rule as CSSFontFaceRule).style;
            return `${declaration.getPropertyValue('font-family')}|${declaration.getPropertyValue('font-weight')}`;
          }));
          return {
            viewport: { width: innerWidth, height: innerHeight },
            scrollWidth: document.documentElement.scrollWidth,
            cls: Number((window as unknown as { __fntCls?: number }).__fntCls ?? 0),
            shifts: (window as unknown as { __fntShifts?: unknown[] }).__fntShifts ?? [],
            title: titleRect
              ? {
                  left: titleRect.left,
                  right: titleRect.right,
                  top: titleRect.top,
                  bottom: titleRect.bottom,
                  wordBreak: getComputedStyle(title!).wordBreak,
                  overflowWrap: getComputedStyle(title!).overflowWrap,
                }
              : null,
            lead: leadRect
              ? { left: leadRect.left, right: leadRect.right }
              : null,
            button: button
              ? {
                  scrollWidth: button.scrollWidth,
                  clientWidth: button.clientWidth,
                  scrollHeight: button.scrollHeight,
                  clientHeight: button.clientHeight,
                  whiteSpace: buttonStyle?.whiteSpace,
                }
              : null,
            fontFaceRuleCount: faceRules.length,
            faceCount: logicalFaces.size,
            loadedFonts: [...document.fonts].map((face) => ({
              family: face.family,
              weight: face.weight,
              status: face.status,
            })),
          };
        });
        const firstScreenFontBytes = fontTransfers.reduce(
          (sum, transfer) => sum + transfer.bytes,
          0,
        );
        const minimumInlineMargin = viewport.band === 'mobile' ? 16 : 24;
        if (metrics.scrollWidth > viewport.width) throw new Error(`${reviewCase.id}/${viewport.band}: overflow`);
        if (metrics.cls !== 0) throw new Error(`${reviewCase.id}/${viewport.band}: CLS ${metrics.cls}`);
        if (firstScreenFontBytes > KOREAN_FONT_PERFORMANCE_BUDGETS.firstScreenBytes) {
          throw new Error(`${reviewCase.id}/${viewport.band}: first screen ${firstScreenFontBytes}`);
        }
        if (!metrics.title || metrics.title.left < minimumInlineMargin || metrics.title.right > viewport.width - minimumInlineMargin) {
          throw new Error(`${reviewCase.id}/${viewport.band}: title edge ${JSON.stringify(metrics.title)}`);
        }
        if (!metrics.lead || metrics.lead.left < minimumInlineMargin || metrics.lead.right > viewport.width - minimumInlineMargin) {
          throw new Error(`${reviewCase.id}/${viewport.band}: lead edge ${JSON.stringify(metrics.lead)}`);
        }
        if (!metrics.button || metrics.button.scrollWidth > metrics.button.clientWidth || metrics.button.whiteSpace !== 'nowrap') {
          throw new Error(`${reviewCase.id}/${viewport.band}: button wrap ${JSON.stringify(metrics.button)}`);
        }
        if (consoleErrors.length) throw new Error(`${reviewCase.id}/${viewport.band}: ${consoleErrors.join('; ')}`);
        const screenshot = path.join(
          OUTPUT_DIR,
          'screenshots',
          `${reviewCase.id}-${viewport.width}.png`,
        );
        await page.screenshot({ path: screenshot, fullPage: true });
        records.push({
          id: reviewCase.id,
          dnaId: reviewCase.dnaId,
          band: viewport.band,
          resources: {
            familyCount: resources.familyCount,
            faceCount: resources.faceCount,
            chunkCount: resources.chunkCount,
            catalogBytes: resources.bytes,
          },
          metrics,
          performance: {
            beforeR1FirstScreenFontBytes: BEFORE_R1_FIRST_SCREEN_BYTES[reviewCase.id],
            firstScreenFontBytes,
            fontTransfers,
            beforeR1ExportPairBytes: BEFORE_R1_EXPORT_PAIR_BYTES[reviewCase.id],
            exportPairBytes: exportResources.bytes,
            exportChunks: [...new Set(exportResources.assets.map((asset) => asset.chunkId))],
          },
          screenshot,
          consoleErrors,
        });
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await writeFile(
    path.join(OUTPUT_DIR, 'manifest.json'),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      budgets: KOREAN_FONT_PERFORMANCE_BUDGETS,
      records,
    }, null, 2)}\n`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
