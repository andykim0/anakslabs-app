/**
 * LIB2 owner-review evidence. Captures the production renderer for 14 section
 * layouts and rehearses all 8 hero layouts with existing verified real photos.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-layout-variants2-review.tsx
 * Out: /private/tmp/daboim-layout-variants2-review
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
import {
  ABOUT_LAYOUT_CATALOG,
  FEATURE_LAYOUT_CATALOG,
  GALLERY_LAYOUT_CATALOG,
  HERO_LAYOUT_CATALOG,
} from '@/lib/layout';
import type {
  HeroLayoutVariantId,
  SectionLayoutSelection,
  SectionLayoutVariantId,
} from '@/lib/layout';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

const OUTPUT_DIR = '/private/tmp/daboim-layout-variants2-review';
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GLYPH_EDGE_BAND_PX = 8;
const VIEWPORTS = [
  { band: 'wide', width: 1440, height: 900, mode: 'desktop' },
  { band: 'compact', width: 768, height: 900, mode: 'mobile' },
  { band: 'mobile', width: 390, height: 844, mode: 'mobile' },
] as const;

interface CaptureRecord {
  collection: 'sections' | 'rehearsal';
  id: string;
  band: 'wide' | 'compact' | 'mobile';
  viewport: { width: number; height: number; devicePixelRatio: number };
  targetSize: { width: number; height: number };
  rendererPath: 'SectionCanvas' | 'SectionStack';
  screenshot: string;
  textMask: string;
  glyphEdge: Awaited<ReturnType<typeof glyphEdgeMetrics>>;
  horizontalOverflow: number;
  textOverlaps: string[];
  visibleCarouselItems?: number;
  consoleErrors: string[];
}

function dataUrl(buffer: Buffer, mediaType: 'image/webp' | 'video/mp4'): string {
  return `data:${mediaType};base64,${buffer.toString('base64')}`;
}

function reviewSurvey(photoUrls: readonly string[]): SurveyInput {
  const template = resolveTemplate('local_store', '카페');
  return {
    businessName: '온담 공방',
    purposeId: 'local_store',
    purpose: '가게 소개',
    industry: '카페',
    tone: ['차분한', '따뜻한'],
    tagline: '천천히 고르고 오래 기억하는 시간을 생각합니다.',
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    highlights: [
      '천천히 고르는 안내',
      '고객이 전한 실제 이야기',
      '정돈된 방문 경험',
    ],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageStyle: 'photo',
    contentItems: [
      { name: '첫 번째 작업', description: '고객이 직접 입력한 설명입니다.' },
      { name: '두 번째 작업', description: '차분하게 살펴볼 수 있도록 정리합니다.' },
      { name: '세 번째 작업', description: '실제 제공하는 내용만 안내합니다.' },
      { name: '네 번째 작업', description: '필요한 정보를 빠짐없이 보여드립니다.' },
      { name: '다섯 번째 작업', description: '문의 전 알아볼 내용을 먼저 전합니다.' },
    ],
    storePhotoUrls: [...photoUrls],
    storePhotoAssetRefs: photoUrls.map((url, index) => ({
      assetId: `review-photo-${index + 1}`,
      url,
    })),
    generalAssetAttestationId: 'attestation-lib2-review',
    contentDepth: {
      version: 2,
      facts: [],
      faqAnswers: [],
      imports: [],
      mainStorytelling: {
        version: 1,
        brandStory: '온담 공방은 천천히 고르는 시간을 소중하게 생각합니다.',
        origin: '고객이 직접 적은 시작의 이야기를 바탕으로 구성했습니다.',
        philosophy: '필요한 내용을 차분하고 분명하게 안내하는 태도를 지향합니다.',
      },
    },
  } as SurveyInput;
}

function reviewCandidate({
  id,
  heroImageUrl,
  dark,
  promoted,
}: {
  id: string;
  heroImageUrl: string;
  dark: boolean;
  promoted?: boolean;
}): DesignCandidate {
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
    id,
    label: '실렌더 검수',
    style: 'photo',
    heroImageUrl,
    ...(promoted ? { heroPresentation: 'promoted_customer_photo' as const } : {}),
    theme,
    designDna: { catalogVersion: 1, dnaId, hueSeed: dark ? 28 : 34, overrides: {} },
    description: '',
  };
}

function selectionFor(id: SectionLayoutVariantId): SectionLayoutSelection {
  if (id.startsWith('features.')) return { features: id as SectionLayoutSelection['features'] };
  if (id.startsWith('about.')) return { about: id as SectionLayoutSelection['about'] };
  return { gallery: id as SectionLayoutSelection['gallery'] };
}

function sectionConfig(
  id: SectionLayoutVariantId,
  heroImageUrl: string,
  photoUrls: readonly string[],
): SiteConfig {
  const dark = id === 'about.fullbleed-overlay';
  return buildSiteConfigFromSurvey(
    reviewSurvey(photoUrls),
    reviewCandidate({ id: `section-${id}`, heroImageUrl, dark }),
    {
      heroImageUrl,
      imagePool: [...photoUrls],
      sectionLayoutVariantIds: selectionFor(id),
    },
  );
}

function heroConfig({
  id,
  photoUrl,
  photoUrls,
  videoUrl,
}: {
  id: HeroLayoutVariantId;
  photoUrl: string;
  photoUrls: readonly string[];
  videoUrl: string;
}): SiteConfig {
  const dark = id === 'hero.asymmetric-offset';
  return buildSiteConfigFromSurvey(
    reviewSurvey(photoUrls),
    reviewCandidate({
      id: `rehearsal-${id}`,
      heroImageUrl: photoUrl,
      dark,
      promoted: true,
    }),
    {
      heroImageUrl: photoUrl,
      imagePool: [...photoUrls],
      heroLayoutVariantId: id,
      ...(id === 'hero.video-scrim'
        ? { heroVideo: { src: videoUrl, poster: photoUrl } }
        : {}),
      copy: {
        heroKicker: '가게 소개',
        heroTitle: '오늘의 가게\n필요한 정보\n분명한 안내',
        heroSub: '찾는 내용을 차분하게 안내합니다.',
      },
    },
  );
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
    '<!doctype html><html lang="ko" data-review-settled="true"><head><meta charset="utf-8">',
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
    throw new Error(`Text glyph mask contained no pixels: ${file}`);
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

async function settle(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector);
  await page.evaluate(async (targetSelector) => {
    await document.fonts.ready;
    const target = document.querySelector<HTMLElement>(targetSelector);
    target?.scrollIntoView({ block: 'center' });
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
    });
  }, selector);
}

async function capture(
  page: Page,
  input: {
    collection: 'sections' | 'rehearsal';
    id: string;
    htmlFile: string;
    selector: string;
    band: 'wide' | 'compact' | 'mobile';
    width: number;
    height: number;
  },
): Promise<CaptureRecord> {
  await page.setViewport({ width: input.width, height: input.height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  const consoleErrors: string[] = [];
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  page.on('console', onConsole);
  await page.goto(pathToFileURL(input.htmlFile).href, { waitUntil: 'load' });
  await settle(page, input.selector);
  const metrics = await page.evaluate((targetSelector) => {
    const target = document.querySelector<HTMLElement>(targetSelector);
    if (!target) throw new Error(`Review target missing: ${targetSelector}`);
    const rect = target.getBoundingClientRect();
    const textFrames = [
      ...target.querySelectorAll<HTMLElement>(
        '[data-section-layout-frame],[data-hero-layout-frame]',
      ),
    ].filter((frame) => {
      const style = getComputedStyle(frame);
      const frameRect = frame.getBoundingClientRect();
      return Boolean(frame.querySelector('p,.anaks-btn'))
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && frameRect.width > 0
        && frameRect.height > 0;
    }).map((frame, index) => {
      const frameRect = frame.getBoundingClientRect();
      return {
        label: frame.textContent?.trim() || `text-${index}`,
        left: frameRect.left,
        right: frameRect.right,
        top: frameRect.top,
        bottom: frameRect.bottom,
      };
    });
    const textOverlaps: string[] = [];
    for (let left = 0; left < textFrames.length; left += 1) {
      for (let right = left + 1; right < textFrames.length; right += 1) {
        const a = textFrames[left];
        const b = textFrames[right];
        const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (width * height > 0.5) textOverlaps.push(`${a.label} ↔ ${b.label}`);
      }
    }
    const carouselItems = [
      ...target.querySelectorAll<HTMLElement>('[data-section-layout-item]'),
    ].filter((item) => {
      const style = getComputedStyle(item);
      const itemRect = item.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && itemRect.width > 0
        && itemRect.height > 0;
    }).length;
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      targetSize: { width: rect.width, height: rect.height },
      rendererPath: (
        target.hasAttribute('data-anchor')
        || target.hasAttribute('data-hero-layout-stack')
      )
        ? 'SectionStack' as const
        : 'SectionCanvas' as const,
      horizontalOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      textOverlaps,
      ...(target.hasAttribute('data-section-layout-carousel')
        ? { visibleCarouselItems: carouselItems }
        : {}),
    };
  }, input.selector);
  if (
    metrics.viewport.width !== input.width
    || metrics.viewport.height !== input.height
    || metrics.viewport.devicePixelRatio !== 1
  ) {
    throw new Error(`${input.id}/${input.band}: viewport mismatch ${JSON.stringify(metrics.viewport)}`);
  }
  if (Math.abs(metrics.targetSize.width - input.width) > 0.5) {
    throw new Error(`${input.id}/${input.band}: target width ${metrics.targetSize.width}`);
  }
  if (metrics.horizontalOverflow > 0) {
    throw new Error(`${input.id}/${input.band}: horizontal overflow ${metrics.horizontalOverflow}`);
  }
  if (metrics.textOverlaps.length > 0) {
    throw new Error(`${input.id}/${input.band}: ${metrics.textOverlaps.join(' | ')}`);
  }
  if (input.collection === 'sections') {
    const expectedPath = input.band === 'wide' ? 'SectionCanvas' : 'SectionStack';
    if (metrics.rendererPath !== expectedPath) {
      throw new Error(`${input.id}/${input.band}: expected ${expectedPath}, got ${metrics.rendererPath}`);
    }
  }
  if (
    input.id === 'gallery.carousel'
    && (metrics.visibleCarouselItems ?? 0) < 2
  ) {
    throw new Error(`${input.id}/${input.band}: static carousel did not expose all items`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(`${input.id}/${input.band}: console errors ${consoleErrors.join(' | ')}`);
  }

  const slug = input.id.replace(/^(?:features|about|gallery|hero)\./u, '');
  const baseDir = input.collection === 'rehearsal'
    ? path.join(OUTPUT_DIR, 'rehearsal')
    : path.join(OUTPUT_DIR, 'sections');
  const screenshot = path.join(baseDir, `${slug}-${input.width}.png`);
  const textMask = path.join(baseDir, 'masks', `${slug}-${input.width}-text-mask.png`);
  const target = await page.$(input.selector);
  if (!target) throw new Error(`${input.id}: target handle missing`);
  await target.screenshot({ path: screenshot });
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
      ${input.selector} p,${input.selector} p *,
      ${input.selector} .anaks-btn,${input.selector} .anaks-btn * {
        color:#000!important;opacity:1!important;visibility:visible!important;filter:none!important
      }
    `,
  });
  await target.screenshot({ path: textMask });
  const glyphEdge = await glyphEdgeMetrics(textMask, GLYPH_EDGE_BAND_PX);
  if (glyphEdge.leftBandGlyphPixels > 0 || glyphEdge.rightBandGlyphPixels > 0) {
    throw new Error(
      `${input.id}/${input.band}: glyph entered ${GLYPH_EDGE_BAND_PX}px edge band ${JSON.stringify(glyphEdge)}`,
    );
  }
  page.off('console', onConsole);
  return {
    collection: input.collection,
    id: input.id,
    band: input.band,
    viewport: metrics.viewport,
    targetSize: metrics.targetSize,
    rendererPath: metrics.rendererPath,
    screenshot,
    textMask,
    glyphEdge,
    horizontalOverflow: metrics.horizontalOverflow,
    textOverlaps: metrics.textOverlaps,
    ...('visibleCarouselItems' in metrics
      ? { visibleCarouselItems: metrics.visibleCarouselItems }
      : {}),
    consoleErrors,
  };
}

async function createContactSheet(
  records: readonly CaptureRecord[],
  output: string,
): Promise<void> {
  const ids = [...new Set(records.map((record) => record.id))];
  const cellWidth = 320;
  const cellHeight = 250;
  const labelHeight = 32;
  const composites: sharp.OverlayOptions[] = [];
  for (const [row, id] of ids.entries()) {
    for (const [column, viewport] of VIEWPORTS.entries()) {
      const record = records.find((candidate) => (
        candidate.id === id && candidate.band === viewport.band
      ));
      if (!record) throw new Error(`Contact sheet record missing: ${id}/${viewport.band}`);
      const thumb = await sharp(record.screenshot)
        .resize({
          width: cellWidth - 16,
          height: cellHeight - labelHeight - 12,
          fit: 'contain',
          background: '#ffffff',
        })
        .png()
        .toBuffer();
      const label = Buffer.from(
        `<svg width="${cellWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">`
        + '<rect width="100%" height="100%" fill="#f3f4f6"/>'
        + `<text x="10" y="21" font-family="Arial,sans-serif" font-size="12" fill="#111827">${id} · ${viewport.width}</text>`
        + '</svg>',
      );
      const left = column * cellWidth;
      const top = row * cellHeight;
      composites.push({ input: label, left, top });
      composites.push({
        input: thumb,
        left: left + 8,
        top: top + labelHeight + 6,
      });
    }
  }
  await sharp({
    create: {
      width: cellWidth * VIEWPORTS.length,
      height: cellHeight * ids.length,
      channels: 3,
      background: '#ffffff',
    },
  }).composite(composites).png().toFile(output);
}

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'sections', 'masks'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'rehearsal', 'masks'), { recursive: true });

  const photoFiles = [
    'public/cases/demos/yeobaek-workshop/still-1.webp',
    'public/cases/demos/yeobaek-workshop/still-2.webp',
    'public/cases/demos/yeobaek-workshop/still-3.webp',
    'public/cases/demos/woldam/still-1.webp',
    'public/cases/demos/woldam/still-2.webp',
  ];
  const photos = await Promise.all(
    photoFiles.map(async (file) => dataUrl(await readFile(path.resolve(file)), 'image/webp')),
  );
  const beauty = dataUrl(
    await readFile(path.resolve('scripts/out/demo-cinematic/gyeol-beauty/poster.webp')),
    'image/webp',
  );
  const workshop = dataUrl(
    await readFile(path.resolve('public/cases/demos/yeobaek-workshop/poster.webp')),
    'image/webp',
  );
  const video = dataUrl(
    await readFile(path.resolve('public/mock/clip-ember.mp4')),
    'video/mp4',
  );

  const fixtures: Array<{
    collection: 'sections' | 'rehearsal';
    id: string;
    htmlFile: string;
    selector: string;
    band: 'wide' | 'compact' | 'mobile';
    width: number;
    height: number;
  }> = [];
  const sectionCatalog = [
    ...FEATURE_LAYOUT_CATALOG,
    ...ABOUT_LAYOUT_CATALOG,
    ...GALLERY_LAYOUT_CATALOG,
  ];
  let oddGalleryItems = 0;
  for (const layout of sectionCatalog) {
    const config = sectionConfig(layout.id, workshop, photos);
    const section = config.pages
      .flatMap((page) => page.sections)
      .find((candidate) => candidate.sectionLayout?.requestedId === layout.id);
    if (!section?.sectionLayout) throw new Error(`${layout.id}: production projection missing`);
    if (layout.id === 'gallery.asymmetric-two-one') {
      oddGalleryItems = section.sectionLayout.items.length;
      if (oddGalleryItems < 3 || oddGalleryItems % 2 === 0) {
        throw new Error(`Odd gallery proof did not retain an odd item count: ${oddGalleryItems}`);
      }
    }
    for (const viewport of VIEWPORTS) {
      const htmlFile = path.join(
        OUTPUT_DIR,
        'fixtures',
        `${layout.id.replace('.', '-')}-${viewport.width}.html`,
      );
      await writeFile(htmlFile, documentFor(config, viewport.mode, viewport.width), 'utf8');
      fixtures.push({
        collection: 'sections',
        id: layout.id,
        htmlFile,
        selector: `[data-section-layout-stage="${section.sectionLayout.resolvedId}"]`,
        band: viewport.band,
        width: viewport.width,
        height: viewport.height,
      });
    }
  }

  for (const [index, layout] of HERO_LAYOUT_CATALOG.entries()) {
    const photo = index % 2 === 0 ? beauty : workshop;
    const config = heroConfig({
      id: layout.id,
      photoUrl: photo,
      photoUrls: photos,
      videoUrl: video,
    });
    const hero = config.pages[0].sections.find((section) => section.type === 'hero');
    if (!hero?.heroLayout) throw new Error(`${layout.id}: rehearsal projection missing`);
    for (const viewport of VIEWPORTS) {
      const htmlFile = path.join(
        OUTPUT_DIR,
        'fixtures',
        `rehearsal-${layout.id.replace('.', '-')}-${viewport.width}.html`,
      );
      await writeFile(htmlFile, documentFor(config, viewport.mode, viewport.width), 'utf8');
      fixtures.push({
        collection: 'rehearsal',
        id: layout.id,
        htmlFile,
        selector: 'section[data-section-type="hero"]',
        band: viewport.band,
        width: viewport.width,
        height: viewport.height,
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

  const sectionRecords = records.filter((record) => record.collection === 'sections');
  const rehearsalRecords = records.filter((record) => record.collection === 'rehearsal');
  if (
    sectionRecords.length !== 14 * 3
    || rehearsalRecords.length !== 8 * 3
    || !sectionRecords.some((record) => (
      record.id === 'gallery.asymmetric-two-one' && record.band === 'mobile'
    ))
  ) {
    throw new Error('LIB2 review matrix is incomplete');
  }
  const sectionContactSheet = path.join(OUTPUT_DIR, 'sections-contact-sheet.png');
  const rehearsalContactSheet = path.join(OUTPUT_DIR, 'rehearsal-contact-sheet.png');
  await createContactSheet(sectionRecords, sectionContactSheet);
  await createContactSheet(rehearsalRecords, rehearsalContactSheet);
  await writeFile(path.join(OUTPUT_DIR, 'report.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    sectionMatrix: {
      variants: 14,
      bands: 3,
      captures: sectionRecords.length,
      darkDnaVariant: 'about.fullbleed-overlay',
      oddGalleryItems,
      compactSectionStack: sectionRecords.filter((record) => (
        record.band === 'compact' && record.rendererPath === 'SectionStack'
      )).length,
      contactSheet: sectionContactSheet,
    },
    rehearsalMatrix: {
      heroVariants: 8,
      bands: 3,
      captures: rehearsalRecords.length,
      existingSources: [
        'scripts/out/demo-cinematic/gyeol-beauty/poster.webp',
        'public/cases/demos/yeobaek-workshop/poster.webp',
      ],
      generatedAssets: 0,
      contactSheet: rehearsalContactSheet,
    },
    glyphEdgeBandPx: GLYPH_EDGE_BAND_PX,
    records,
  }, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `LIB2 review complete: sections ${sectionRecords.length}, real-photo rehearsal ${rehearsalRecords.length}, output ${OUTPUT_DIR}\n`,
  );
}

void main();
