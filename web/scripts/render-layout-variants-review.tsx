/**
 * LIB owner-review evidence. Renders the production SiteRenderer for every new hero
 * layout at 1440/768/390, then verifies the exact captured glyph pixels stay out of
 * the 8px viewport edge band.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-layout-variants-review.tsx
 * Out: /private/tmp/anakslabs-layout-variants-review
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import puppeteer, { type Page } from 'puppeteer-core';
import sharp from 'sharp';
import { SiteRenderer } from '@/components/site-renderer';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme, type DesignDNA } from '@/lib/design/dna';
import { HERO_LAYOUT_CATALOG } from '@/lib/layout/catalog';
import type { HeroLayoutVariantId } from '@/lib/layout/types';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

const OUTPUT_DIR = '/private/tmp/anakslabs-layout-variants-review';
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GLYPH_EDGE_BAND_PX = 8;
const VIEWPORTS = [
  { band: 'wide', width: 1440, height: 900, mode: 'desktop' },
  { band: 'compact', width: 768, height: 900, mode: 'mobile' },
  { band: 'mobile', width: 390, height: 844, mode: 'mobile' },
] as const;

interface CaptureRecord {
  variantId: HeroLayoutVariantId;
  resolvedId: HeroLayoutVariantId;
  band: 'wide' | 'compact' | 'mobile';
  requestedViewport: { width: number; height: number };
  measuredViewport: { width: number; height: number; devicePixelRatio: number };
  heroSize: { width: number; height: number };
  rendererPath: 'SectionCanvas' | 'SectionStack';
  screenshot: string;
  textMask: string;
  glyphEdge: Awaited<ReturnType<typeof glyphEdgeMetrics>>;
  horizontalOverflow: number;
  overlaps: string[];
  consoleErrors: string[];
}

function survey(): SurveyInput {
  const template = resolveTemplate('local_store', '카페');
  return {
    businessName: '온결 살롱',
    purposeId: 'local_store',
    purpose: '가게 소개',
    industry: '카페',
    tone: ['차분한', '따뜻한'],
    tagline: '찾는 내용을 차분하게 안내합니다.',
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    highlights: ['예약 상담', '차분한 안내', '매일의 기준'],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageStyle: 'photo',
  } as SurveyInput;
}

function candidate(
  id: HeroLayoutVariantId,
  heroImageUrl: string,
): DesignCandidate {
  const dark = id === 'hero.asymmetric-offset';
  const dnaId: DesignDNA['id'] = dark
    ? 'dining-refined-contrast'
    : 'cafe-warm-editorial';
  const theme = tokenSetToSiteTheme(expandTokens(dnaId, dark ? 28 : 34));
  theme.fonts = {
    heading: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    body: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    googleFonts: [],
  };
  return {
    id: `review-${id}`,
    label: HERO_LAYOUT_CATALOG.find((layout) => layout.id === id)!.label,
    style: 'photo',
    heroImageUrl,
    theme,
    designDna: { catalogVersion: 1, dnaId, hueSeed: dark ? 28 : 34, overrides: {} },
    description: '',
  };
}

function buildConfig(
  id: HeroLayoutVariantId,
  heroImageUrl: string,
  videoSrc: string,
  videoPoster: string,
): SiteConfig {
  return buildSiteConfigFromSurvey(survey(), candidate(id, heroImageUrl), {
    heroImageUrl,
    imagePool: [heroImageUrl],
    heroLayoutVariantId: id,
    ...(id === 'hero.video-scrim'
      ? { heroVideo: { src: videoSrc, poster: videoPoster } }
      : {}),
    copy: {
      heroKicker: '가게 소개',
      heroTitle: '오늘의 가게\n필요한 정보\n분명한 안내',
      heroSub: '찾는 내용을 차분하게 안내합니다.',
    },
  });
}

function documentFor(
  config: SiteConfig,
  mode: 'desktop' | 'mobile',
  width: number,
): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    interactive: false,
    animate: false,
    runtimeDelivery: 'client',
  }));
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">',
    `<meta name="viewport" content="width=${width},initial-scale=1">`,
    '<style>html,body{margin:0;width:100%;overflow-x:hidden}body{min-height:100dvh}</style>',
    `</head><body>${markup}</body></html>`,
  ].join('');
}

async function glyphEdgeMetrics(file: string, bandPx: number) {
  const sample = await sharp(file)
    .flatten({ background: '#ffffff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = sample.info;
  let glyphPixels = 0;
  let leftBandGlyphPixels = 0;
  let rightBandGlyphPixels = 0;
  let minX = width;
  let maxX = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = sample.data[(y * width + x) * channels];
      if (value >= 200) continue;
      glyphPixels += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      if (x < bandPx) leftBandGlyphPixels += 1;
      if (x >= width - bandPx) rightBandGlyphPixels += 1;
    }
  }
  if (glyphPixels === 0 || maxX < 0) {
    throw new Error(`Hero glyph mask contained no text pixels: ${file}`);
  }
  return {
    bandPx,
    glyphPixels,
    leftBandGlyphPixels,
    rightBandGlyphPixels,
    minGlyphX: minX,
    maxGlyphX: maxX,
    leftMarginPx: minX,
    rightMarginPx: width - 1 - maxX,
  };
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function capture(
  page: Page,
  input: {
    id: HeroLayoutVariantId;
    resolvedId: HeroLayoutVariantId;
    htmlFile: string;
    band: 'wide' | 'compact' | 'mobile';
    width: number;
    height: number;
  },
): Promise<CaptureRecord> {
  await page.setViewport({
    width: input.width,
    height: input.height,
    deviceScaleFactor: 1,
  });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  const consoleErrors: string[] = [];
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  page.on('console', onConsole);
  await page.goto(pathToFileURL(input.htmlFile).href, { waitUntil: 'load' });
  await settle(page);

  const metrics = await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>('section[data-section-type="hero"]');
    if (!hero) throw new Error('Rendered hero section missing');
    const heroRect = hero.getBoundingClientRect();
    const nodes = [...hero.querySelectorAll<HTMLElement>('p,.anaks-btn')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.opacity !== '0';
      })
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        return {
          label: node.textContent?.trim() || `node-${index}`,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
    const overlaps: string[] = [];
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const a = nodes[left];
        const b = nodes[right];
        const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (width * height > 0.5) overlaps.push(`${a.label} ↔ ${b.label}`);
      }
    }
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      heroSize: { width: heroRect.width, height: heroRect.height },
      rendererPath: hero.hasAttribute('data-hero-layout-stack')
        ? 'SectionStack' as const
        : 'SectionCanvas' as const,
      horizontalOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      overlaps,
    };
  });

  if (
    metrics.viewport.width !== input.width
    || metrics.viewport.height !== input.height
    || metrics.viewport.devicePixelRatio !== 1
  ) {
    throw new Error(`Viewport mismatch: ${JSON.stringify(metrics.viewport)}`);
  }
  if (metrics.horizontalOverflow > 0) {
    throw new Error(`${input.id}/${input.band}: horizontal overflow ${metrics.horizontalOverflow}`);
  }
  if (metrics.overlaps.length > 0) {
    throw new Error(`${input.id}/${input.band}: ${metrics.overlaps.join(', ')}`);
  }
  if (
    (input.band === 'wide' && metrics.rendererPath !== 'SectionCanvas')
    || (input.band !== 'wide' && metrics.rendererPath !== 'SectionStack')
  ) {
    throw new Error(`${input.id}/${input.band}: wrong renderer ${metrics.rendererPath}`);
  }

  const slug = input.id.replace('hero.', '');
  const screenshot = path.join(OUTPUT_DIR, 'screenshots', `${slug}-${input.width}.png`);
  const textMask = path.join(OUTPUT_DIR, 'masks', `${slug}-${input.width}-text-mask.png`);
  const hero = await page.$('section[data-section-type="hero"]');
  if (!hero) throw new Error('Hero handle missing');
  await hero.screenshot({ path: screenshot });
  await page.addStyleTag({
    content: `
      html,body,.anaks-site,.anaks-site main,.anaks-site section {
        background:#fff!important;background-image:none!important
      }
      .anaks-site *,.anaks-site *::before,.anaks-site *::after {
        color:transparent!important;background:transparent!important;border-color:transparent!important;
        box-shadow:none!important;text-shadow:none!important;outline:0!important
      }
      .anaks-site img,.anaks-site video,.anaks-site svg {visibility:hidden!important}
      .anaks-site section[data-section-type="hero"] p,
      .anaks-site section[data-section-type="hero"] p *,
      .anaks-site section[data-section-type="hero"] .anaks-btn,
      .anaks-site section[data-section-type="hero"] .anaks-btn * {
        color:#000!important;opacity:1!important;visibility:visible!important;filter:none!important
      }
    `,
  });
  await hero.screenshot({ path: textMask });
  const glyphEdge = await glyphEdgeMetrics(textMask, GLYPH_EDGE_BAND_PX);
  if (glyphEdge.leftBandGlyphPixels > 0 || glyphEdge.rightBandGlyphPixels > 0) {
    throw new Error(
      `${input.id}/${input.band}: glyph entered ${GLYPH_EDGE_BAND_PX}px edge band ${JSON.stringify(glyphEdge)}`,
    );
  }
  if (consoleErrors.length > 0) {
    throw new Error(`${input.id}/${input.band}: console errors ${consoleErrors.join(' | ')}`);
  }
  page.off('console', onConsole);
  return {
    variantId: input.id,
    resolvedId: input.resolvedId,
    band: input.band,
    requestedViewport: { width: input.width, height: input.height },
    measuredViewport: metrics.viewport,
    heroSize: metrics.heroSize,
    rendererPath: metrics.rendererPath,
    screenshot,
    textMask,
    glyphEdge,
    horizontalOverflow: metrics.horizontalOverflow,
    overlaps: metrics.overlaps,
    consoleErrors,
  };
}

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'masks'), { recursive: true });

  const lightSvg = await readFile(path.resolve('public/mock/candidate-light.svg'));
  const darkSvg = await readFile(path.resolve('public/mock/candidate-dark.svg'));
  const video = await readFile(path.resolve('public/mock/clip-ember.mp4'));
  const lightUrl = `data:image/svg+xml;base64,${lightSvg.toString('base64')}`;
  const darkUrl = `data:image/svg+xml;base64,${darkSvg.toString('base64')}`;
  const videoUrl = `data:video/mp4;base64,${video.toString('base64')}`;

  const fixtures: Array<{
    id: HeroLayoutVariantId;
    resolvedId: HeroLayoutVariantId;
    band: 'wide' | 'compact' | 'mobile';
    width: number;
    height: number;
    htmlFile: string;
  }> = [];
  for (const layout of HERO_LAYOUT_CATALOG) {
    const heroImageUrl = layout.id === 'hero.asymmetric-offset' ? darkUrl : lightUrl;
    const config = buildConfig(layout.id, heroImageUrl, videoUrl, darkUrl);
    const hero = config.pages[0].sections.find((section) => section.type === 'hero');
    if (!hero?.heroLayout) throw new Error(`${layout.id}: projection missing`);
    for (const viewport of VIEWPORTS) {
      const htmlFile = path.join(
        OUTPUT_DIR,
        'fixtures',
        `${layout.id.replace('hero.', '')}-${viewport.width}.html`,
      );
      await writeFile(
        htmlFile,
        documentFor(config, viewport.mode, viewport.width),
        'utf8',
      );
      fixtures.push({
        id: layout.id,
        resolvedId: hero.heroLayout.resolvedId,
        band: viewport.band,
        width: viewport.width,
        height: viewport.height,
        htmlFile,
      });
    }
  }

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
      '--allow-file-access-from-files',
    ],
  });
  const records: CaptureRecord[] = [];
  try {
    const page = await browser.newPage();
    for (const fixture of fixtures) {
      records.push(await capture(page, fixture));
    }
  } finally {
    await browser.close();
  }

  const compactRecords = records.filter((record) => record.band === 'compact');
  if (
    records.length !== HERO_LAYOUT_CATALOG.length * VIEWPORTS.length
    || compactRecords.length !== HERO_LAYOUT_CATALOG.length
    || compactRecords.some((record) => record.rendererPath !== 'SectionStack')
  ) {
    throw new Error('Review matrix or compact SectionStack proof is incomplete');
  }
  await writeFile(path.join(OUTPUT_DIR, 'report.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    matrix: {
      variants: HERO_LAYOUT_CATALOG.length,
      bands: VIEWPORTS.length,
      captures: records.length,
      glyphEdgeBandPx: GLYPH_EDGE_BAND_PX,
      darkDnaVariant: 'hero.asymmetric-offset',
    },
    records,
  }, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `LIB review complete: ${records.length} captures, compact SectionStack ${compactRecords.length}/${compactRecords.length}, output ${OUTPUT_DIR}\n`,
  );
}

void main();
