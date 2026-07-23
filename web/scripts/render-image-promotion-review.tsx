/**
 * IMG owner-review evidence. Reuses existing repository stills only:
 * no generated assets, provider calls, retouching, or image mutation.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-image-promotion-review.tsx
 * Out: /private/tmp/daboim-image-promotion-review
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { SiteRenderer } from '@/components/site-renderer';
import {
  applyHeroPhotoPromotion,
  resolveHeroPhotoCandidate,
} from '@/lib/assets/hero-photo-promotion';
import {
  HERO_PHOTO_QUALITY_LIMITS,
  HERO_PHOTO_QUALITY_VERSION,
  assessHeroPhotoQuality,
  type HeroPhotoQualityStamp,
} from '@/lib/assets/hero-photo-quality';
import type { AssetRecord } from '@/lib/assets/provenance';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import {
  withContinuousCanvasDefault,
  withSiteCinematicDefault,
} from '@/lib/motion/site-cinematic';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const OUTPUT_DIR =
  process.env.IMAGE_PROMOTION_REVIEW_OUTPUT ?? '/private/tmp/daboim-image-promotion-review';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const PASS_SOURCE = 'scripts/out/demo-cinematic/gyeol-beauty/poster.webp';
const GLYPH_EDGE_BAND_PX = 8;
const HEADLINE_MATRIX = {
  one: '오늘의 결을 만납니다',
  two: '원하는 모습을\n차분하게 고릅니다',
  three: '온결 살롱\n원하는 모습을 고르는 일부터',
} as const;

const QUALITY_SOURCES = [
  // Existing photo-like visual fixtures exercise the four quality dimensions.
  // They are not customer evidence; customer_upload provenance is tested separately.
  { id: 'beauty-photo-like', expected: 'pass', path: 'scripts/out/demo-cinematic/gyeol-beauty/poster.webp' },
  { id: 'law-photo-like-soft', expected: 'fail', path: 'scripts/out/demo-cinematic/darim-law/poster.webp' },
  { id: 'dining-photo-like-dark', expected: 'fail', path: 'scripts/out/demo-cinematic/onhwa-dining/poster.webp' },
  { id: 'cafe-photo-like-small', expected: 'fail', path: 'public/onboarding/style-samples/photo.webp' },
  // Published cinematic rasters add bright/dark controls without creating new assets.
  { id: 'workshop-poster', expected: 'pass', path: 'public/cases/demos/yeobaek-workshop/poster.webp' },
  { id: 'workshop-still-1', expected: 'pass', path: 'public/cases/demos/yeobaek-workshop/still-1.webp' },
  { id: 'woldam-poster', expected: 'fail', path: 'public/cases/demos/woldam/poster.webp' },
  { id: 'woldam-still-3', expected: 'fail', path: 'public/cases/demos/woldam/still-3.webp' },
] as const;

function representativeSurvey(): SurveyInput {
  const template = resolveTemplate('booking_service', '미용실');
  return {
    businessName: '온결 살롱',
    purposeId: 'booking_service',
    purpose: template.label,
    industry: '미용실',
    tagline: '나에게 맞는 결을 차분하게 찾습니다',
    region: '서울',
    tone: ['차분한', '정제된'],
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    imageStyle: 'photo',
    imageDirectionId: 'real_photo',
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    highlights: ['결에 맞춘 상담', '예약 전에 확인하는 상세 안내', '차분한 관리 시간'],
    contentItems: [
      { name: '커트', price: '35,000', description: '고객이 입력한 커트 안내입니다.' },
      { name: '컬러', price: '90,000', description: '고객이 입력한 컬러 안내입니다.' },
      { name: '케어', price: '60,000', description: '고객이 입력한 케어 안내입니다.' },
    ],
    contentDepth: {
      version: 2,
      imports: [],
      facts: [
        { key: 'phone', value: '02-123-4567', source: 'customer' },
        { key: 'openingHours', value: '화–일 10:00–19:00', source: 'customer' },
        { key: 'address', value: '서울시 고객 입력 주소', source: 'customer' },
        { key: 'directions', value: '고객이 입력한 오시는 길 안내', source: 'customer' },
        { key: 'reservation', value: '예약 링크에서 날짜와 시간을 선택해 주세요.', source: 'customer' },
      ],
      faqAnswers: [
        { questionId: 'reservation', answer: '고객이 입력한 예약 안내를 확인해 주세요.' },
        { questionId: 'allergy', answer: '알레르기 정보는 예약할 때 알려 주세요.' },
      ],
      mainStorytelling: {
        version: 1,
        brandStory: '고객이 직접 입력한 브랜드 이야기입니다. 각자의 결에 맞는 스타일을 함께 찾습니다.',
        philosophy: '충분히 듣고 차분한 관리 시간을 준비합니다.',
      },
    },
  };
}

function heroConfig(photoUrl: string): SiteConfig {
  const survey = representativeSurvey();
  const darkTheme = tokenSetToSiteTheme(expandTokens('dining-refined-contrast', 28));
  const candidate: DesignCandidate = {
    id: 'review-dark-real-photo',
    label: '다크 DNA 실사진',
    style: 'photo',
    imageDirectionId: 'real_photo',
    heroImageUrl: photoUrl,
    heroAssetRef: { assetId: ASSET_ID, url: photoUrl },
    theme: darkTheme,
    designDna: {
      catalogVersion: 1,
      dnaId: 'dining-refined-contrast',
      hueSeed: 28,
      overrides: {},
    },
    description: '실제 SitePlan v2 대표 시드',
  };
  const built = buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl: photoUrl,
    imagePool: [],
    heroVariant: 'fullbleed',
  });
  const cinematic = withContinuousCanvasDefault(withSiteCinematicDefault(built));
  return applyGeneratedMotion(
    cinematic,
    survey.purposeId,
    'premium',
    { signatureId: 'scroll-curtain', intensity: 'normal' },
    survey,
    {
      ownerId: 'review-client',
      customerUploadAssetRefs: [{ assetId: ASSET_ID, url: photoUrl }],
    },
  );
}

function headlineMatrixConfig(photoUrl: string, title: string): SiteConfig {
  const survey = representativeSurvey();
  survey.contentDepth = undefined;
  const darkTheme = tokenSetToSiteTheme(expandTokens('dining-refined-contrast', 28));
  const matrixCandidate: DesignCandidate = {
    id: 'review-dark-headline-matrix',
    label: '다크 DNA 헤드라인 매트릭스',
    style: 'photo',
    imageDirectionId: 'real_photo',
    heroImageUrl: photoUrl,
    heroAssetRef: { assetId: ASSET_ID, url: photoUrl },
    theme: darkTheme,
    designDna: {
      catalogVersion: 1,
      dnaId: 'dining-refined-contrast',
      hueSeed: 28,
      overrides: {},
    },
    description: '실제 생성 빌더와 SiteRenderer를 통과하는 헤드라인 매트릭스',
  };
  const built = buildSiteConfigFromSurvey(survey, matrixCandidate, {
    heroImageUrl: photoUrl,
    imagePool: [],
    heroVariant: 'fullbleed',
    copy: {
      heroKicker: '예약·서비스업',
      heroTitle: title,
      heroSub: survey.tagline,
    },
  });
  return withContinuousCanvasDefault(withSiteCinematicDefault(built));
}

function candidate(photoUrl: string, config: SiteConfig): DesignCandidate {
  return {
    id: 'review-real-photo',
    label: '고객 실사진',
    style: 'photo',
    imageDirectionId: 'real_photo',
    heroImageUrl: photoUrl,
    heroAssetRef: { assetId: ASSET_ID, url: photoUrl },
    theme: config.theme,
    designDna: config.designDna,
    description: '품질 게이트를 통과한 고객 사진',
  };
}

function assetRecord(photoUrl: string, quality: HeroPhotoQualityStamp): AssetRecord {
  return {
    id: ASSET_ID,
    origin: 'customer_upload',
    mediaType: 'image',
    storageBucket: 'review',
    storageKey: 'customer/hero.webp',
    canonicalUrl: photoUrl,
    createdAt: '2026-07-23T00:00:00.000Z',
    ownerId: 'review-client',
    siteId: null,
    imageQuality: quality,
  };
}

function fixtureDocument(config: SiteConfig, mode: 'desktop' | 'mobile'): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    interactive: true,
    animate: false,
    runtimeDelivery: 'client',
  })).replace(/<link[^>]*>/gu, '');
  return `<!doctype html><html lang="ko" data-review-settled="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;overflow:hidden;background:${config.theme.palette.background}}body{min-height:100dvh}</style></head><body>${markup}</body></html>`;
}

function legacyPublishedConfig(kind: 'illustration' | 'real-photo'): SiteConfig {
  const illustration = kind === 'illustration';
  const config = emptySiteConfig(illustration ? '기존 일러스트' : '기존 실사진');
  config.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 820,
    background: {
      image: {
        src: illustration ? '/legacy-illustration.webp' : '/legacy-real-photo.webp',
        overlayColor: '#111111',
        overlayOpacity: 0.4,
      },
    },
    elements: [{
      id: 'title',
      kind: 'text',
      frame: { x: 116, y: 260, w: 720, h: 180 },
      z: 3,
      text: illustration ? '기존 일러스트 발행본' : '기존 실사진 발행본',
      style: { fontSize: 68, fontFamily: 'heading', color: '#ffffff' },
    }],
  }];
  return config;
}

function publishedHtmlSha(config: SiteConfig): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'auto',
    interactive: false,
    animate: false,
  }));
  return createHash('sha256').update(markup).digest('hex');
}

async function runChrome(
  htmlFile: string,
  outputFile: string,
  size: { width: number; height: number },
): Promise<{
  viewport: {
    requestedWidth: number;
    requestedHeight: number;
    innerWidth: number;
    innerHeight: number;
    clientWidth: number;
    clientHeight: number;
    devicePixelRatio: number;
  };
  textMask: string;
  glyphEdge: Awaited<ReturnType<typeof glyphEdgeMetrics>>;
}> {
  await rm(outputFile, { force: true });
  const textMask = outputFile.replace(/\.png$/u, '.text-mask.png');
  await rm(textMask, { force: true });
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
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: size.width,
      height: size.height,
      deviceScaleFactor: 1,
    });
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });
    const measured = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
      devicePixelRatio: window.devicePixelRatio,
    }));
    const viewport = {
      requestedWidth: size.width,
      requestedHeight: size.height,
      ...measured,
    };
    if (
      measured.innerWidth !== size.width
      || measured.clientWidth !== size.width
      || measured.innerHeight !== size.height
      || measured.clientHeight !== size.height
      || measured.devicePixelRatio !== 1
    ) {
      throw new Error(`Capture viewport mismatch: ${JSON.stringify(viewport)}`);
    }
    await page.screenshot({
      path: outputFile,
      type: 'png',
      captureBeyondViewport: false,
    });
    await page.addStyleTag({
      content: `
        html, body, .anaks-site, .anaks-site main, .anaks-site section {
          background: #fff !important;
          background-image: none !important;
        }
        .anaks-site *, .anaks-site *::before, .anaks-site *::after {
          color: transparent !important;
          background: transparent !important;
          border-color: transparent !important;
          box-shadow: none !important;
          text-shadow: none !important;
          outline: 0 !important;
        }
        .anaks-site img, .anaks-site video, .anaks-site svg {
          visibility: hidden !important;
        }
        .anaks-site section[data-section-type="hero"] p,
        .anaks-site section[data-section-type="hero"] p *,
        .anaks-site section[data-section-type="hero"] .anaks-btn,
        .anaks-site section[data-section-type="hero"] .anaks-btn * {
          color: #000 !important;
          opacity: 1 !important;
          visibility: visible !important;
          filter: none !important;
        }
      `,
    });
    await page.screenshot({
      path: textMask,
      type: 'png',
      captureBeyondViewport: false,
    });
    const glyphEdge = await glyphEdgeMetrics(textMask, GLYPH_EDGE_BAND_PX);
    if (glyphEdge.leftBandGlyphPixels > 0 || glyphEdge.rightBandGlyphPixels > 0) {
      throw new Error(
        `Hero text entered the ${GLYPH_EDGE_BAND_PX}px edge band: ${JSON.stringify(glyphEdge)}`,
      );
    }
    return { viewport, textMask, glyphEdge };
  } finally {
    await browser.close();
  }
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

async function lowerHalfSettleMetrics(file: string) {
  const image = sharp(file);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 2 || height < 2) {
    throw new Error(`Screenshot geometry is invalid: ${file}`);
  }
  const sample = await image
    .extract({
      left: 0,
      top: Math.floor(height / 2),
      width,
      height: Math.max(1, height - Math.floor(height / 2)),
    })
    .resize({ width: 128, height: 64, fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let total = 0;
  let squared = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  for (let y = 0; y < sample.info.height; y += 1) {
    for (let x = 0; x < sample.info.width; x += 1) {
      const index = y * sample.info.width + x;
      const value = sample.data[index] / 255;
      total += value;
      squared += value * value;
      if (x + 1 < sample.info.width) {
        edgeTotal += Math.abs(sample.data[index + 1] - sample.data[index]) / 255;
        edgeCount += 1;
      }
      if (y + 1 < sample.info.height) {
        edgeTotal += Math.abs(sample.data[index + sample.info.width] - sample.data[index]) / 255;
        edgeCount += 1;
      }
    }
  }
  const count = sample.data.length;
  const mean = total / count;
  const standardDeviation = Math.sqrt(Math.max(0, squared / count - mean * mean));
  const edgeDensity = edgeTotal / Math.max(1, edgeCount);
  return {
    standardDeviation: Math.round(standardDeviation * 1_000_000) / 1_000_000,
    edgeDensity: Math.round(edgeDensity * 1_000_000) / 1_000_000,
    nearSolid: standardDeviation < 0.018 && edgeDensity < 0.006,
  };
}

async function captureSettled(
  htmlFile: string,
  outputFile: string,
  size: { width: number; height: number },
) {
  let lastMetrics: Awaited<ReturnType<typeof lowerHalfSettleMetrics>> | undefined;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const capture = await runChrome(htmlFile, outputFile, size);
    lastMetrics = await lowerHalfSettleMetrics(outputFile);
    if (!lastMetrics.nearSolid) {
      return { attempt, ...lastMetrics, ...capture };
    }
  }
  throw new Error(
    `Settled capture lower half remained near-solid after 3 attempts: ${outputFile} ${JSON.stringify(lastMetrics)}`,
  );
}

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'samples'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });

  const qualityMatrix = [];
  for (const sample of QUALITY_SOURCES) {
    const bytes = await readFile(sample.path);
    const quality = await assessHeroPhotoQuality(bytes);
    const copied = path.join(OUTPUT_DIR, 'samples', `${sample.id}${path.extname(sample.path)}`);
    await copyFile(sample.path, copied);
    if (quality.passed !== (sample.expected === 'pass')) {
      throw new Error(`Unexpected quality result for ${sample.id}: ${JSON.stringify(quality)}`);
    }
    qualityMatrix.push({
      id: sample.id,
      source: sample.path,
      copied,
      expected: sample.expected,
      result: quality,
      bytes: bytes.length,
    });
  }

  const passBytes = await readFile(PASS_SOURCE);
  const passQuality = await assessHeroPhotoQuality(passBytes);
  const photoUrl = `data:image/webp;base64,${passBytes.toString('base64')}`;
  const base = heroConfig(photoUrl);
  const promotedCandidate = resolveHeroPhotoCandidate(
    candidate(photoUrl, base),
    assetRecord(photoUrl, passQuality),
  );
  const promoted = applyHeroPhotoPromotion({
    config: base,
    candidate: promotedCandidate,
    customerPhotoRef: { assetId: ASSET_ID, url: photoUrl },
  });
  if (base.siteCinematic?.heroBackdrop !== 'dna-procedural'
    || promoted.siteCinematic?.heroBackdrop !== 'promoted-photo') {
    throw new Error('Hero promotion evidence did not resolve expected presentations.');
  }
  const homeSectionIds = base.pages
    .find((page) => page.slug === '')
    ?.sections.map((section) => section.id) ?? [];
  if (homeSectionIds.length < 3) {
    throw new Error(`Representative SitePlan v2 seed is too thin: ${homeSectionIds.join(', ')}`);
  }

  const captures = [];
  for (const item of [
    { id: 'system-before-1440', config: base, mode: 'desktop' as const, width: 1440, height: 900 },
    { id: 'promoted-after-1440', config: promoted, mode: 'desktop' as const, width: 1440, height: 900 },
    { id: 'system-before-390', config: base, mode: 'mobile' as const, width: 390, height: 844 },
    { id: 'promoted-after-390', config: promoted, mode: 'mobile' as const, width: 390, height: 844 },
  ]) {
    const fixture = path.join(OUTPUT_DIR, 'fixtures', `${item.id}.html`);
    const screenshot = path.join(OUTPUT_DIR, 'screenshots', `${item.id}.png`);
    await writeFile(fixture, fixtureDocument(item.config, item.mode), 'utf8');
    const settleCheck = await captureSettled(
      fixture,
      screenshot,
      { width: item.width, height: item.height },
    );
    captures.push({
      id: item.id,
      fixture,
      screenshot,
      width: item.width,
      height: item.height,
      mode: item.mode,
      settled: true,
      reducedMotion: true,
      darkDnaSeed: true,
      settleCheck,
      bytes: (await stat(screenshot)).size,
    });
  }

  const headlineMatrix = [];
  for (const [lineCount, title] of Object.entries(HEADLINE_MATRIX)) {
    const config = headlineMatrixConfig(photoUrl, title);
    for (const viewport of [
      { band: 'wide', mode: 'desktop' as const, width: 1440, height: 900 },
      { band: 'compact', mode: 'mobile' as const, width: 768, height: 900 },
      { band: 'mobile', mode: 'mobile' as const, width: 390, height: 844 },
    ]) {
      const id = `headline-${lineCount}-${viewport.width}`;
      const fixture = path.join(OUTPUT_DIR, 'fixtures', `${id}.html`);
      const screenshot = path.join(OUTPUT_DIR, 'screenshots', `${id}.png`);
      await writeFile(fixture, fixtureDocument(config, viewport.mode), 'utf8');
      const settleCheck = await captureSettled(fixture, screenshot, {
        width: viewport.width,
        height: viewport.height,
      });
      headlineMatrix.push({
        lineCount,
        title,
        band: viewport.band,
        width: viewport.width,
        height: viewport.height,
        mode: viewport.mode,
        fixture,
        screenshot,
        settleCheck,
        passed: true,
      });
    }
  }

  const compatibility = [
    {
      kind: 'illustration',
      baselineCommit: '134fc96',
      baselineSha256: '5a9d42c139a341d47759883d4860a99d41162a454a5382bcebc3416e648077e7',
      currentSha256: publishedHtmlSha(legacyPublishedConfig('illustration')),
    },
    {
      kind: 'real_photo',
      baselineCommit: '134fc96',
      baselineSha256: '1902cf6133c2aecf5bae279bc0218cdbaff93674d8b108d5815a3bffe9c844f3',
      currentSha256: publishedHtmlSha(legacyPublishedConfig('real-photo')),
    },
  ];
  if (compatibility.some((item) => item.baselineSha256 !== item.currentSha256)) {
    throw new Error('Existing published renderer SHA changed.');
  }

  const evidence = {
    generatedAssetCalls: 0,
    retouchOrRegeneration: false,
    sourcePolicy: 'existing workspace photo-like/demo fixtures only; no customer claim',
    provenanceNote:
      'Visual quality does not prove customer origin. Promotion still requires the immutable customer_upload registry stamp.',
    algorithmVersion: HERO_PHOTO_QUALITY_VERSION,
    limits: HERO_PHOTO_QUALITY_LIMITS,
    qualityMatrix,
    viewportCropMatrix: qualityMatrix.slice(0, 4).flatMap((sample) =>
      (['wide', 'compact', 'mobile'] as const).map((band) => {
        const crops = sample.result.viewportCrops?.[band] ?? [];
        const cropPassed = crops.some((crop) => crop.passed);
        const passed = sample.result.passed && cropPassed;
        return {
          sampleId: sample.id,
          band,
          passed,
          reasons: passed
            ? []
            : [
                ...sample.result.reasons.map((reason) => `quality:${reason}`),
                ...(!cropPassed
                  ? [...new Set(crops.flatMap((crop) => crop.reasons))]
                    .map((reason) => `crop:${reason}`)
                  : []),
              ],
          cropCandidates: crops,
        };
      })),
    heroPromotion: {
      default: base.siteCinematic?.heroBackdrop,
      promoted: promoted.siteCinematic?.heroBackdrop,
      source: PASS_SOURCE,
      focalPoint: promoted.pages[0]?.sections[0]?.background.image?.focalPoint,
      mobileFocalPoint: promoted.pages[0]?.sections[0]?.background.image?.mobileFocalPoint,
      responsivePromotion:
        promoted.pages[0]?.sections[0]?.background.image?.responsivePromotion,
      sitePlanSeed: {
        contentDepthVersion: 2,
        templateId: representativeSurvey().templateId,
        dnaId: 'dining-refined-contrast',
        imageDirectionId: 'real_photo',
        homeSectionIds,
        allSectionIds: base.pages.flatMap((page) =>
          page.sections.map((section) => `${page.slug || 'home'}:${section.id}`)),
      },
      captures,
      headlineMatrix,
    },
    compatibility,
  };
  await writeFile(
    path.join(OUTPUT_DIR, 'evidence.json'),
    JSON.stringify(evidence, null, 2),
    'utf8',
  );
  process.stdout.write(
    `IMG review: ${qualityMatrix.length} existing samples + ${captures.length} settled captures + ${headlineMatrix.length} headline checks -> ${OUTPUT_DIR}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
