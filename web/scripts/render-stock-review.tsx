/**
 * STK owner-review evidence. Uses the production SiteRenderer for a no-upload
 * interior site before/after categorical supply, then proves customer media
 * precedence and real-dimension masonry.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-stock-review.tsx
 * Out: /private/tmp/daboim-stock-review
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import puppeteer, { type Page } from 'puppeteer-core';
import sharp from 'sharp';
import { SiteRenderer } from '@/components/site-renderer';
import { applyProceduralBackgroundDefaults } from '@/lib/abstract/application';
import { systemHeroPreviewForCandidate } from '@/lib/assets/hero-photo-promotion';
import { buildZeroCostSiteConfig } from '@/lib/billing/prepublish-cost-policy';
import { buildCandidateBlueprintsForPipeline } from '@/lib/data/design-candidates';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import { contrastRatio } from '@/lib/design/quality-standards';
import { compositeScrimColor } from '@/lib/design/scrim';
import {
  applySectionLayoutVariants,
  heroLayoutById,
  recompileGallerySectionLayouts,
} from '@/lib/layout';
import {
  withContinuousCanvasDefault,
  withSiteCinematicDefault,
} from '@/lib/motion/site-cinematic';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import {
  applyCategoricalStockSupply,
} from '@/lib/stock/application';
import { workshopStockManifest } from '@/lib/stock/manifest';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';

const OUTPUT = process.env.STOCK_REVIEW_OUTPUT
  ?? '/private/tmp/daboim-stock-body-review';
const PUBLIC = path.resolve('public');
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORTS = [
  { band: 'wide', width: 1440, height: 900, mode: 'desktop' },
  { band: 'compact', width: 768, height: 1024, mode: 'mobile' },
  { band: 'mobile', width: 390, height: 844, mode: 'mobile' },
] as const;
const CUSTOMER_PHOTOS = [
  '/cases/demos/yeobaek-workshop/still-1.webp',
  '/review/assets/customer-portrait.webp',
  '/review/assets/customer-square.webp',
] as const;
const CUSTOMER_ASSET_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
] as const;

function survey(photos: readonly string[] = []): SurveyInput {
  const template = resolveTemplate('company_brand', '건설·인테리어 시공');
  return {
    businessName: '온결 공간연구소',
    purposeId: 'company_brand',
    purpose: '회사·브랜드',
    industry: '건설·인테리어 시공',
    region: '서울 성동구',
    tone: ['차분한', '신뢰감 있는', '정돈된'],
    colorPreference: '웜 그레이',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageDirectionId: photos.length ? 'real_photo' : 'realistic',
    tagline: '쓰임과 동선을 먼저 듣고 공간의 기준을 함께 정리합니다.',
    highlights: [
      '사용 흐름을 먼저 살피는 설계',
      '재료와 동선을 함께 보는 기준',
      '진행 과정을 분명하게 안내',
    ],
    contentItems: [
      {
        name: '업무 공간 설계',
        description: '팀의 이동과 집중 방식에 맞춰 공간 구성을 정리합니다.',
      },
      {
        name: '상업 공간 설계',
        description: '고객 동선과 운영 방식을 함께 살펴 매장의 흐름을 설계합니다.',
      },
      {
        name: '공간 운영 점검',
        description: '현재 공간에서 불편한 지점을 듣고 바꿀 순서를 안내합니다.',
      },
    ],
    ...(photos.length
      ? {
          heroPhotoUrl: photos[0],
          heroPhotoAssetRef: {
            assetId: CUSTOMER_ASSET_IDS[0],
            url: photos[0],
          },
          storePhotoUrls: [...photos],
          storePhotoAssetRefs: photos.map((url, index) => ({
            assetId: CUSTOMER_ASSET_IDS[index]!,
            url,
          })),
          generalAssetAttestationId: 'stock-review-attestation',
          nonPersonPhotoAssetIds: CUSTOMER_ASSET_IDS.slice(0, photos.length),
          personPhotoAssetIds: [],
        }
      : {}),
    contentDepth: {
      version: 2,
      imports: [],
      facts: [
        { key: 'phone', value: '02-1234-5678', source: 'customer' },
        { key: 'openingHours', value: '평일 09:30–18:00', source: 'customer' },
        { key: 'address', value: '서울특별시 성동구 고객 확인 주소', source: 'customer' },
      ],
      faqAnswers: [
        {
          questionId: 'preparation',
          answer: '공간 도면이나 사진이 있다면 상담 전에 함께 보내 주세요.',
        },
      ],
      mainStorytelling: {
        version: 1,
        brandStory:
          '온결은 보기 좋은 장면보다 그 안에서 보내는 시간이 편안해야 한다는 생각으로 공간을 바라봅니다.',
        origin:
          '사용하는 사람의 하루를 먼저 듣고 필요한 변화의 순서를 함께 찾는 일에서 시작합니다.',
        philosophy:
          '재료와 빛, 이동의 흐름이 한 방향을 가리키도록 차분하게 정리하는 태도를 지향합니다.',
      },
      surveyBrief: {
        version: 1,
        targetCustomer: '업무 공간이나 소규모 매장을 준비하는 운영자',
        visitorNeed: '사업 분야와 상담 방법, 공간을 바라보는 기준을 확인',
        valueProposition: '사용하는 사람의 흐름부터 듣고 공간의 기준을 함께 정리합니다.',
        conversionDestination: { kind: 'phone_fact' },
        proofs: [],
      },
    },
  } as SurveyInput;
}

function candidate(source: SurveyInput): DesignCandidate {
  const theme = tokenSetToSiteTheme(expandTokens(
    'workshop-tactile-heritage',
    34,
    { density: 'airy', radius: 'soft', colorChroma: 'balanced' },
  ));
  const base: DesignCandidate = {
    id: 'stock-review-workshop',
    label: '재료의 결',
    style: source.imageDirectionId === 'real_photo' ? 'photo' : 'illustration',
    imageDirectionId: source.imageDirectionId,
    heroImageUrl: source.heroPhotoUrl ?? '/mock/candidate-light.svg',
    heroPresentation: source.imageDirectionId === 'real_photo'
      ? 'promoted_customer_photo'
      : 'system',
    theme,
    description: '재료와 동선을 차분하게 보여주는 인테리어 구성',
    designDna: {
      catalogVersion: 1,
      dnaId: 'workshop-tactile-heritage',
      hueSeed: 34,
      overrides: { density: 'airy', radius: 'soft', colorChroma: 'balanced' },
    },
    heroLayoutVariantId: 'hero.fullbleed-centered',
    sectionLayoutVariantIds: {
      features: 'features.zigzag-media',
      about: 'about.split-left',
      gallery: 'gallery.masonry',
    },
  };
  if (source.imageDirectionId === 'real_photo' && source.heroPhotoAssetRef) {
    base.heroAssetRef = { ...source.heroPhotoAssetRef };
  } else {
    base.heroImageUrl = systemHeroPreviewForCandidate(base);
  }
  return base;
}

function noUploadConfigs() {
  const source = survey();
  const base = buildZeroCostSiteConfig(source, candidate(source));
  const before = applyProceduralBackgroundDefaults(base);
  const supplied = applyCategoricalStockSupply(before, {
    environment: { REALISTIC_IMAGE_SUPPLY_ENABLED: '1' },
  });
  return { before, after: supplied.config, selections: supplied.selections };
}

async function namedRealisticConfig(templateId: string) {
  const source = survey();
  const blueprints = await buildCandidateBlueprintsForPipeline(source, {
    fontPairingEnabled: true,
    templateGalleryEnabled: true,
  });
  const blueprint = blueprints.find(
    (candidate) => candidate.namedTemplate?.templateId === templateId,
  );
  if (!blueprint || blueprint.imageDirectionId !== 'realistic') {
    throw new Error(`${templateId}: realistic recipe did not resolve`);
  }
  const baseCandidate: DesignCandidate = {
    id: blueprint.id,
    label: blueprint.label,
    style: blueprint.style,
    imageDirectionId: blueprint.imageDirectionId,
    heroImageUrl: blueprint.mockHeroUrl,
    heroPresentation: 'system',
    theme: blueprint.theme,
    description: blueprint.description,
    designDna: blueprint.designDna,
    heroLayoutVariantId: blueprint.heroLayoutVariantId,
    sectionLayoutVariantIds: blueprint.sectionLayoutVariantIds,
    namedTemplate: blueprint.namedTemplate,
    recommendedMotionSignatureId: blueprint.recommendedMotionSignatureId,
  };
  baseCandidate.heroImageUrl = systemHeroPreviewForCandidate(baseCandidate);
  const generated = buildZeroCostSiteConfig(source, baseCandidate);
  const cinematic = withContinuousCanvasDefault(withSiteCinematicDefault(generated));
  const motion = applyGeneratedMotion(
    cinematic,
    source.purposeId,
    'premium',
    {
      intensity: 'subtle',
      heroTechnique: 'ken-burns',
      signatureId: blueprint.recommendedMotionSignatureId,
    },
    source,
  );
  const supplied = applyCategoricalStockSupply(motion, {
    environment: { REALISTIC_IMAGE_SUPPLY_ENABLED: '1' },
  });
  return {
    config: applyProceduralBackgroundDefaults(supplied.config),
    selections: supplied.selections,
  };
}

async function customerConfig(): Promise<SiteConfig> {
  const source = survey(CUSTOMER_PHOTOS);
  const base = buildZeroCostSiteConfig(source, candidate(source));
  const refs = await Promise.all(CUSTOMER_PHOTOS.map(async (url, index) => {
    const file = url.startsWith('/review/')
      ? path.join(OUTPUT, url.replace(/^\/review\/+/u, ''))
      : path.join(PUBLIC, url);
    const metadata = await sharp(file).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`${url}: dimensions missing`);
    return {
      assetId: CUSTOMER_ASSET_IDS[index]!,
      url,
      width: metadata.width,
      height: metadata.height,
    };
  }));
  let withRefs = recompileGallerySectionLayouts({
    ...base,
    assetRefs: refs,
  });
  if (!withRefs.pages.some((page) => page.sections.some((section) => section.type === 'gallery'))) {
    withRefs = structuredClone(withRefs);
    withRefs.pages[0]!.sections.push({
      id: 'main-gallery-full',
      type: 'gallery',
      name: '작업 사진',
      height: 920,
      background: { color: withRefs.theme.palette.background },
      elements: [
        {
          id: 'main-gallery-full-title',
          kind: 'text',
          frame: { x: 120, y: 100, w: 900, h: 84 },
          z: 2,
          text: '고객이 확인한 공간 사진',
          style: {
            fontSize: 44,
            fontWeight: 700,
            fontFamily: 'heading',
            color: withRefs.theme.palette.text,
            align: 'left',
            lineHeight: 1.2,
          },
        },
        ...refs.flatMap((ref, index) => [
          {
            id: `gallery-image-${index + 1}`,
            kind: 'image' as const,
            frame: { x: 120 + index * 390, y: 250, w: 350, h: 420 },
            z: 1,
            src: ref.url,
            alt: `고객이 올린 공간 사진 ${index + 1}`,
            style: { objectFit: 'cover' as const, borderRadius: 12 },
          },
          {
            id: `gallery-caption-${index + 1}`,
            kind: 'text' as const,
            frame: { x: 120 + index * 390, y: 690, w: 350, h: 44 },
            z: 2,
            text: `고객이 확인한 공간 사진 ${index + 1}`,
            style: {
              fontSize: 14,
              fontWeight: 400,
              fontFamily: 'body' as const,
              color: withRefs.theme.palette.muted,
              align: 'left' as const,
              lineHeight: 1.5,
            },
          },
        ]),
      ],
    });
    applySectionLayoutVariants({
      pages: withRefs.pages,
      theme: withRefs.theme,
      selection: { gallery: 'gallery.masonry' },
      assetRefs: refs,
    });
  }
  return applyCategoricalStockSupply(withRefs, {
    environment: { REALISTIC_IMAGE_SUPPLY_ENABLED: '1' },
  }).config;
}

function documentFor(config: SiteConfig, mode: 'desktop' | 'mobile'): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    interactive: false,
    animate: false,
    runtimeDelivery: 'client',
  })).replace(/<link\b[^>]*href="https:\/\/[^"]+"[^>]*\/?>/gu, '');
  return [
    '<!doctype html><html lang="ko"><head>',
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<link rel="icon" href="data:,">',
    '<script>window.__reviewCls=0;new PerformanceObserver(function(list){list.getEntries().forEach(function(entry){if(!entry.hadRecentInput)window.__reviewCls+=entry.value})}).observe({type:"layout-shift",buffered:true})</script>',
    '<style>html,body{margin:0;width:100%;overflow-x:hidden}img{color:transparent}</style>',
    '</head><body>',
    markup,
    '</body></html>',
  ].join('');
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const decoded = decodeURIComponent(url.pathname);
      if (decoded === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }
      const fixture = decoded.startsWith('/review/');
      const root = fixture ? OUTPUT : PUBLIC;
      const relative = fixture
        ? decoded.replace(/^\/review\/+/u, '')
        : decoded.replace(/^\/+/u, '');
      const file = path.resolve(root, relative);
      if (!file.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      const body = await readFile(file);
      const extension = path.extname(file);
      response.writeHead(200, {
        'content-type': extension === '.html'
          ? 'text/html; charset=utf-8'
          : extension === '.webp'
            ? 'image/webp'
            : extension === '.svg'
              ? 'image/svg+xml'
              : 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    for (let index = 0; index <= 10; index += 1) {
      scrollTo(0, maximum * index / 10);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    await Promise.all([...document.images].map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      }
      await image.decode().catch(() => undefined);
    }));
    scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function capture(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  origin: string,
  input: {
    fixture: string;
    variant: string;
    band: 'wide' | 'compact' | 'mobile';
    width: number;
    height: number;
    gallery?: boolean;
    requireBodyStock?: boolean;
  },
) {
  const page = await browser.newPage();
  await page.setViewport({
    width: input.width,
    height: input.height,
    deviceScaleFactor: 1,
    isMobile: input.band === 'mobile',
  });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  const errors: string[] = [];
  const externalRequests: string[] = [];
  const failedResources: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(
    error instanceof Error ? error.message : String(error),
  ));
  page.on('request', (request) => {
    if (/^https?:/u.test(request.url()) && new URL(request.url()).origin !== origin) {
      externalRequests.push(request.url());
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResources.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto(`${origin}/review/fixtures/${input.fixture}`, { waitUntil: 'networkidle0' });
  await settle(page);
  const metrics = await page.evaluate(() => {
    const foregrounds = [...document.querySelectorAll<HTMLElement>(
      '[data-image-contrast-foreground]',
    )].map((frame) => {
      const text = frame.querySelector<HTMLElement>('p') ?? frame;
      const rect = text.getBoundingClientRect();
      const style = getComputedStyle(text);
      return {
        id: frame.dataset.imageContrastForeground ?? 'unknown',
        x: rect.left,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
        color: style.color,
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
      };
    }).filter((item) => item.width > 0 && item.height > 0);
    const hero = document.querySelector<HTMLElement>('section[data-section-type="hero"]');
    const heroTargets = hero
      ? [
          ...[...hero.querySelectorAll<HTMLElement>('[data-site-cine-hero-copy]')]
            .map((wrapper) => wrapper.querySelector<HTMLElement>('p') ?? wrapper),
          ...hero.querySelectorAll<HTMLElement>('.anaks-btn'),
        ]
      : [];
    const heroForeground = heroTargets.map((node, index) => {
      const rect = node.getBoundingClientRect();
      return {
        id: `${index}:${(node.textContent ?? '').trim().replace(/\s+/gu, ' ')}`,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }).filter((item) => item.width > 0 && item.height > 0);
    const heroOverlaps: string[] = [];
    for (let left = 0; left < heroForeground.length; left += 1) {
      for (let right = left + 1; right < heroForeground.length; right += 1) {
        const a = heroForeground[left]!;
        const b = heroForeground[right]!;
        if (
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5
        ) {
          heroOverlaps.push(`${a.id} <> ${b.id}`);
        }
      }
    }
    return {
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      stockImages: document.querySelectorAll('img[src^="/stock/pexels/"]').length,
      bodyStockImages: document.querySelectorAll('[data-section-layout-stock-image]').length,
      credits: document.querySelectorAll('[data-stock-attribution]').length,
      pageHeight: document.documentElement.scrollHeight,
      cls: Number((window as typeof window & { __reviewCls?: number }).__reviewCls ?? 0),
      heroOverlaps,
      buttonNowrapViolations: [...document.querySelectorAll<HTMLElement>('.anaks-btn')]
        .filter((button) => getComputedStyle(button).whiteSpace !== 'nowrap')
        .map((button) => (button.textContent ?? '').trim()),
      bodyStockStyles: [...document.querySelectorAll<HTMLElement>(
        '[data-section-layout-stock-scrim]',
      )].map((scrim) => {
        const style = getComputedStyle(scrim);
        return {
          opacity: style.opacity,
          background: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          zIndex: style.zIndex,
        };
      }),
      bodyStockTintStyles: [...document.querySelectorAll<HTMLElement>(
        '[data-section-layout-stock-tint]',
      )].map((tint) => {
        const style = getComputedStyle(tint);
        return {
          opacity: style.opacity,
          background: style.backgroundColor,
          zIndex: style.zIndex,
        };
      }),
      foregrounds,
    };
  });
  const suffix = input.gallery ? '-masonry' : '';
  const screenshot = path.join(
    OUTPUT,
    'screenshots',
    `${input.variant}-${input.width}${suffix}.png`,
  );
  if (input.gallery) {
    const target = await page.$('[data-section-layout-stage="gallery.masonry"]');
    if (!target) throw new Error('customer gallery masonry stage is missing');
    await target.screenshot({ path: screenshot });
  } else {
    await page.screenshot({ path: screenshot, fullPage: true });
  }
  let contrastMeasurements: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    ratio: number;
    required: number;
    color: string;
  }> = [];
  if (metrics.foregrounds.length > 0) {
    await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>(
        '[data-image-contrast-foreground]',
      )) {
        element.style.visibility = 'hidden';
      }
    });
    const background = await page.screenshot({ fullPage: true, type: 'png' });
    if (process.env.STOCK_REVIEW_DEBUG_CONTRAST === '1') {
      await writeFile(
        path.join(OUTPUT, 'screenshots', `${input.variant}-${input.width}-contrast-background.png`),
        background,
      );
    }
    const raw = await sharp(background)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cssColor = (value: string): string => {
      const channels = value.match(/\d+(?:\.\d+)?/gu)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${value}`);
      return `#${channels.map((channel) =>
        Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
        .join('')}`;
    };
    contrastMeasurements = metrics.foregrounds.map((foreground) => {
      const textColor = cssColor(foreground.color);
      const left = Math.max(0, Math.floor(foreground.x));
      const top = Math.max(0, Math.floor(foreground.y));
      const right = Math.min(raw.info.width, Math.ceil(foreground.x + foreground.width));
      const bottom = Math.min(raw.info.height, Math.ceil(foreground.y + foreground.height));
      let minimum = Number.POSITIVE_INFINITY;
      for (let y = top; y < bottom; y += 2) {
        for (let x = left; x < right; x += 2) {
          const offset = (y * raw.info.width + x) * raw.info.channels;
          const backgroundColor = `#${[
            raw.data[offset],
            raw.data[offset + 1],
            raw.data[offset + 2],
          ].map((channel) => channel!.toString(16).padStart(2, '0')).join('')}`;
          minimum = Math.min(minimum, contrastRatio(textColor, backgroundColor));
        }
      }
      const required = foreground.fontSize >= 24
        || (foreground.fontSize >= 18.66 && foreground.fontWeight >= 700)
        ? 3
        : 4.5;
      return {
        id: foreground.id,
        x: Number(foreground.x.toFixed(2)),
        y: Number(foreground.y.toFixed(2)),
        width: Number(foreground.width.toFixed(2)),
        height: Number(foreground.height.toFixed(2)),
        ratio: Number(minimum.toFixed(2)),
        required,
        color: textColor,
      };
    });
    const failures = contrastMeasurements.filter((item) => item.ratio + 0.01 < item.required);
    if (failures.length) {
      throw new Error(`${input.variant}/${input.width}: image text contrast ${JSON.stringify({
        failures,
        bodyStockStyles: metrics.bodyStockStyles,
      })}`);
    }
  }
  await page.close();
  if (
    errors.length
    || externalRequests.length
    || failedResources.length
    || metrics.overflow > 0
    || metrics.cls > 0
    || metrics.heroOverlaps.length > 0
    || metrics.buttonNowrapViolations.length > 0
    || (input.requireBodyStock && metrics.bodyStockImages < 1)
  ) {
    throw new Error(`${input.variant}/${input.width} failed: ${JSON.stringify({
      errors,
      externalRequests,
      failedResources,
      metrics,
    })}`);
  }
  return {
    ...input,
    screenshot,
    metrics,
    contrastMeasurements,
    errors,
    externalRequests,
    failedResources,
  };
}

function sha(config: SiteConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

function textSha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT, 'screenshots'), { recursive: true });
  await mkdir(path.join(OUTPUT, 'assets'), { recursive: true });
  await mkdir(path.join(OUTPUT, 'configs'), { recursive: true });
  await sharp(path.join(PUBLIC, 'cases/demos/yeobaek-workshop/still-2.webp'))
    .resize({ width: 900, height: 1400, fit: 'cover' })
    .webp({ quality: 88 })
    .toFile(path.join(OUTPUT, 'assets/customer-portrait.webp'));
  await sharp(path.join(PUBLIC, 'cases/demos/yeobaek-workshop/still-3.webp'))
    .resize({ width: 1000, height: 1000, fit: 'cover' })
    .webp({ quality: 88 })
    .toFile(path.join(OUTPUT, 'assets/customer-square.webp'));

  const noUpload = noUploadConfigs();
  const customer = await customerConfig();
  const flagOff = applyCategoricalStockSupply(noUpload.before, {
    environment: { REALISTIC_IMAGE_SUPPLY_ENABLED: '0' },
  });
  const abstractDirection = structuredClone(noUpload.before);
  abstractDirection.meta.imageDirectionId = 'abstract_editorial';
  const abstractResult = applyCategoricalStockSupply(abstractDirection, {
    environment: { REALISTIC_IMAGE_SUPPLY_ENABLED: '1' },
  });
  const nonInterior = structuredClone(noUpload.before);
  nonInterior.meta.industryId = 'clinic';
  const nonInteriorResult = applyCategoricalStockSupply(nonInterior, {
    environment: { REALISTIC_IMAGE_SUPPLY_ENABLED: '1' },
  });
  const namedTemplateIds = [
    'material-grain',
    'tactile-chapters',
    'deep-manifesto',
    'spatial-portfolio',
  ] as const;
  const named = await Promise.all(namedTemplateIds.map(async (templateId) => ({
    id: `named-${templateId}`,
    templateId,
    ...await namedRealisticConfig(templateId),
  })));
  const variants = [
    { id: 'system-before', config: noUpload.before },
    { id: 'stock-after', config: noUpload.after },
    { id: 'customer-priority', config: customer },
    ...named.map(({ id, config }) => ({ id, config })),
  ] as const;
  for (const item of named) {
    await writeFile(
      path.join(OUTPUT, 'configs', `${item.templateId}.json`),
      `${JSON.stringify(item.config, null, 2)}\n`,
      'utf8',
    );
  }
  for (const variant of variants) {
    for (const viewport of VIEWPORTS) {
      await writeFile(
        path.join(OUTPUT, 'fixtures', `${variant.id}-${viewport.width}.html`),
        documentFor(variant.config, viewport.mode),
        'utf8',
      );
    }
  }

  const server = await startServer();
  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
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
  const captures = [];
  try {
    for (const variant of variants) {
      for (const viewport of VIEWPORTS) {
        captures.push(await capture(browser, origin, {
          fixture: `${variant.id}-${viewport.width}.html`,
          variant: variant.id,
          band: viewport.band,
          width: viewport.width,
          height: viewport.height,
          requireBodyStock: variant.id.startsWith('named-'),
        }));
      }
    }
    for (const viewport of VIEWPORTS) {
      captures.push(await capture(browser, origin, {
        fixture: `customer-priority-${viewport.width}.html`,
        variant: 'customer-priority',
        band: viewport.band,
        width: viewport.width,
        height: viewport.height,
        gallery: true,
      }));
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const manifest = workshopStockManifest();
  const eligible = manifest.assets.filter((asset) => asset.review.passed);
  const eligibleLandscape = eligible.filter((asset) =>
    asset.orientation.startsWith('landscape'));
  const hero = noUpload.before.pages[0]?.sections.find((section) => section.type === 'hero');
  if (!hero) throw new Error('review hero missing');
  const reuseProbe = applyCategoricalStockSupply({
    ...noUpload.before,
    pages: [{
      ...noUpload.before.pages[0]!,
      sections: Array.from({ length: 24 }, (_, index) => ({
        ...structuredClone(hero),
        id: `reuse-hero-${index + 1}`,
      })),
    }],
  }, {
    environment: { REALISTIC_IMAGE_SUPPLY_ENABLED: '1' },
  });
  const reusedIds = reuseProbe.selections.map((selection) => selection.asset.providerAssetId);
  const uniqueIds = new Set(reusedIds);
  const gallery = customer.pages
    .flatMap((page) => page.sections)
    .find((section) => section.sectionLayout?.resolvedId === 'gallery.masonry');
  const masonryFrames = gallery?.sectionLayout?.bands.wide.frames ?? {};
  const selectedHero = noUpload.selections[0]?.asset;
  const adaptive = noUpload.after.pages[0]?.sections
    .find((section) => section.type === 'hero')
    ?.background.image?.adaptiveScrim;
  const oldFixedContrast = selectedHero?.contrastProfile
    ? Math.min(
        contrastRatio(
          noUpload.after.theme.palette.text,
          compositeScrimColor(
            selectedHero.contrastProfile.darkestColor,
            noUpload.after.theme.palette.background,
            0.3,
          ),
        ),
        contrastRatio(
          noUpload.after.theme.palette.text,
          compositeScrimColor(
            selectedHero.contrastProfile.brightestColor,
            noUpload.after.theme.palette.background,
            0.3,
          ),
        ),
      )
    : null;

  await writeFile(path.join(OUTPUT, 'report.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    manifest: {
      collectionId: manifest.collectionId,
      sourceCount: manifest.assets.length,
      eligibleCount: eligible.length,
      rejectedCount: manifest.assets.length - eligible.length,
      landscapeCount: eligibleLandscape.length,
      trueWideCount: eligible.filter((asset) => asset.orientation === 'landscape-wide').length,
    },
    noUpload: {
      beforeConfigSha: sha(noUpload.before),
      afterConfigSha: sha(noUpload.after),
      selected: noUpload.selections.map((selection) => ({
        sectionId: selection.sectionId,
        stockKey: selection.asset.stockKey,
        providerAssetId: selection.asset.providerAssetId,
        bucket: selection.asset.bucket,
        width: selection.asset.width,
        height: selection.asset.height,
      })),
      contrast: {
        priorFixedOverlayOpacity: 0.3,
        priorFixedOverlayMinimumContrast: oldFixedContrast == null
          ? null
          : Number(oldFixedContrast.toFixed(2)),
        adaptiveScrim: adaptive ?? null,
        renderedMeasurements: captures
          .filter((capture) => capture.variant === 'stock-after')
          .map((capture) => ({
            width: capture.width,
            items: capture.contrastMeasurements,
            minimum: Math.min(
              ...capture.contrastMeasurements.map((item) => item.ratio),
            ),
          })),
      },
    },
    customerPriority: {
      stockRefs: customer.assetRefs?.filter((ref) => ref.attribution).length ?? 0,
      customerRefs: customer.assetRefs?.filter((ref) => !ref.attribution).length ?? 0,
      galleryLayout: gallery?.sectionLayout?.resolvedId,
      wideMasonryFrames: Object.fromEntries(
        Object.entries(masonryFrames)
          .filter(([id]) => id.includes('gallery') && id.includes('image'))
          .map(([id, frame]) => [id, { width: frame.w, height: frame.h }]),
      ),
    },
    compatibility: {
      sourceConfigSha: sha(noUpload.before),
      flagOffConfigSha: sha(flagOff.config),
      flagOffSameReference: flagOff.config === noUpload.before,
      sourceHtmlSha: textSha(documentFor(noUpload.before, 'desktop')),
      flagOffHtmlSha: textSha(documentFor(flagOff.config, 'desktop')),
      abstractSameReference: abstractResult.config === abstractDirection,
      nonInteriorSameReference: nonInteriorResult.config === nonInterior,
    },
    namedRealistic: named.map(({ templateId, config: namedConfig, selections }) => {
      const sections = namedConfig.pages.flatMap((page) => page.sections);
      return {
        templateId,
        configSha: sha(namedConfig),
        fontPairingId: namedConfig.theme.fontPairing?.id ?? null,
        sectionIds: sections.map((section) => section.id),
        selections: selections.map((selection) => {
          const section = sections.find((candidate) => candidate.id === selection.sectionId);
          const scrim = section?.background.image?.adaptiveScrim?.wide;
          return {
            sectionId: selection.sectionId,
            slotKey: selection.slotKey,
            mediaRole: section?.heroLayout
              ? heroLayoutById(section.heroLayout.requestedId).mediaContract.role
              : section?.sectionLayout?.mediaRole ?? null,
            providerAssetId: selection.asset.providerAssetId,
            stockKey: selection.asset.stockKey,
            mood: selection.asset.mood,
            meanLuminance: selection.asset.contrastProfile?.meanLuminance ?? null,
            overlayColor: scrim?.overlayColor ?? null,
            overlayOpacity: scrim?.overlayOpacity ?? null,
          };
        }),
        adjacentDuplicates: selections.filter((selection, index) => (
          index > 0
          && selection.asset.providerAssetId === selections[index - 1]!.asset.providerAssetId
        )).length,
      };
    }),
    landscapeReuseProbe: {
      assignments: reusedIds.length,
      unique: uniqueIds.size,
      reusedAssignments: reusedIds.length - uniqueIds.size,
      reuseRate: Number(((reusedIds.length - uniqueIds.size) / reusedIds.length).toFixed(4)),
      adjacentDuplicates: reusedIds.filter((id, index) => index > 0 && id === reusedIds[index - 1]).length,
    },
    captures,
  }, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `STK review complete: ${captures.length} captures, ${eligible.length}/${manifest.assets.length} eligible, `
      + `${eligibleLandscape.length} landscape, reuse ${reusedIds.length - uniqueIds.size}/${reusedIds.length}\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
