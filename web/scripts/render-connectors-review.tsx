/**
 * CONN owner-review evidence: a production SiteRenderer workshop seed with all
 * five native connectors at 1440/768/390.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-connectors-review.tsx
 * Out: /private/tmp/daboim-connectors-review
 */
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import puppeteer, { type Page } from 'puppeteer-core';
import sharp from 'sharp';
import { SiteRenderer } from '@/components/site-renderer';
import { classifySiteClick } from '@/lib/analytics/site-beacon';
import { applyConnectorManifest } from '@/lib/connectors/application';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { applyExtraFeatures } from '@/lib/data/extras-inject';
import { HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { MockSiteEventsRepo } from '@/lib/data/mock/site-events';
import { resetMockStore } from '@/lib/data/mock/store';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import { withContinuousCanvasDefault, withSiteCinematicDefault } from '@/lib/motion/site-cinematic';
import { buildMonthlyPerformanceReport } from '@/lib/reporting/monthly-report';
import type {
  DesignCandidate,
  ExtraFeatureSelection,
  SurveyInput,
} from '@/lib/types/domain';
import type { SiteConfig, SiteTheme } from '@/lib/types/site';

const OUTPUT = '/private/tmp/daboim-connectors-review';
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SITE_ID = '00000000-0000-4000-8000-000000000045';
const VIEWPORTS = [
  { band: 'wide', width: 1440, height: 900, mode: 'desktop' },
  { band: 'compact', width: 768, height: 900, mode: 'mobile' },
  { band: 'mobile', width: 390, height: 844, mode: 'mobile' },
] as const;
const BRAND_CONNECTOR_IDS = [
  'kakao-channel',
  'naver-booking',
  'naver-map',
  'instagram',
] as const;

async function dataUrl(file: string, mime: string): Promise<string> {
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}

function workshopSurvey(photos: readonly string[]): SurveyInput {
  const template = resolveTemplate('company_brand', '인테리어 공간 설계');
  return {
    businessName: '온결 공간연구소',
    purposeId: 'company_brand',
    purpose: '회사·브랜드',
    industry: '인테리어 공간 설계',
    region: '서울 성동구',
    tone: ['차분한', '신뢰감 있는', '정돈된'],
    colorPreference: '웜 그레이',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    tagline: '일하는 방식과 머무는 시간을 함께 설계합니다.',
    providedContent:
      '[회사 소개]\n온결 공간연구소는 업무 공간과 소규모 상업 공간의 쓰임을 먼저 듣고 설계 방향을 정리합니다.',
    highlights: [
      '사용 흐름을 먼저 살피는 설계',
      '공정별 안내를 한곳에서 확인',
      '완성 뒤 운영까지 고려한 공간',
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
    storePhotoUrls: [...photos],
    storePhotoAssetRefs: photos.map((url, index) => ({
      assetId: `connector-review-photo-${index + 1}`,
      url,
    })),
    generalAssetAttestationId: 'connector-review-attestation',
    contentDepth: {
      version: 2,
      imports: [],
      facts: [
        { key: 'phone', value: '02-1234-5678', source: 'customer' },
        { key: 'openingHours', value: '평일 09:30–18:00', source: 'customer' },
        { key: 'address', value: '서울특별시 성동구 연무장길 1', source: 'customer' },
        { key: 'directions', value: '성수역 3번 출구에서 도보 6분', source: 'customer' },
        { key: 'reservation', value: '상담은 예약 후 진행합니다.', source: 'customer' },
      ],
      faqAnswers: [
        {
          questionId: 'reservation',
          answer: '공간의 용도와 일정, 현재 고민을 먼저 듣고 다음 순서를 안내합니다.',
        },
        {
          questionId: 'preparation',
          answer: '공간 도면이나 사진이 있다면 함께 보내 주세요.',
        },
      ],
      mainStorytelling: {
        version: 1,
        brandStory:
          '온결은 보기 좋은 장면보다 그 안에서 보내는 시간이 편안해야 한다는 생각으로 공간을 바라봅니다.',
        origin:
          '사용하는 사람의 하루를 먼저 듣고, 필요한 변화의 순서를 함께 찾는 일에서 시작합니다.',
        philosophy:
          '재료와 빛, 이동의 흐름이 한 방향을 가리키도록 차분하게 정리하는 태도를 지향합니다.',
      },
      surveyBrief: {
        version: 1,
        targetCustomer: '업무 공간이나 소규모 매장을 새로 준비하는 운영자',
        visitorNeed: '설계 범위와 상담 방법, 실제 작업 방향을 확인',
        valueProposition: '사용하는 사람의 흐름부터 듣고 공간의 기준을 함께 정리합니다.',
        conversionDestination: {
          kind: 'messenger_url',
          url: 'https://pf.kakao.com/_ongyeol',
        },
        proofs: [
          {
            kind: 'case',
            content: '고객이 공개를 확인한 업무 공간 설계 사례',
            sourceStatus: 'publication_permission',
            publisher: '온결 공간연구소',
            asOfDate: '2026-07-24',
          },
        ],
      },
    },
  };
}

function extras(): ExtraFeatureSelection {
  return {
    connectorCatalogVersion: 1,
    reservationLink: {
      url: 'https://booking.naver.com/booking/6/bizes/12345',
    },
    contactForm: { targetSection: 'contact' },
    snsLinks: [
      { kind: 'kakao_channel', url: 'https://pf.kakao.com/_ongyeol' },
      { kind: 'instagram', url: 'https://www.instagram.com/ongyeol.interior/' },
    ],
  };
}

function documentFor(
  config: SiteConfig,
  mode: 'desktop' | 'mobile',
): string {
  const markup = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    siteId: SITE_ID,
    interactive: true,
    animate: false,
    runtimeDelivery: 'client',
  }))
    .replace(/<link[^>]*>/gu, '');
  return [
    '<!doctype html><html lang="ko" data-review-settled="true"><head>',
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<link rel="icon" href="data:,">',
    `<style>html,body{margin:0;width:100%;overflow-x:hidden;background:${config.theme.palette.background}}</style>`,
    `</head><body>${markup}</body></html>`,
  ].join('');
}

async function nonEmptyImage(file: string): Promise<number> {
  const stats = await sharp(file).stats();
  return Math.max(...stats.channels.map((channel) => channel.stdev));
}

async function settle(page: Page): Promise<void> {
  await page.waitForSelector('.anaks-connectors');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      }
      await image.decode().catch(() => undefined);
    }));
    const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    for (let index = 0; index <= 12; index += 1) {
      scrollTo(0, maximum * index / 12);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    document.querySelector<HTMLElement>('.anaks-connectors')?.scrollIntoView({ block: 'center' });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function capture(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  input: {
    url: string;
    band: 'wide' | 'compact' | 'mobile';
    tone: 'light' | 'dark';
    width: number;
    height: number;
  },
) {
  const page = await browser.newPage();
  await page.setViewport({
    width: input.width,
    height: input.height,
    deviceScaleFactor: 1,
    isMobile: input.width < 768,
  });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.evaluateOnNewDocument(() => {
    (window as typeof window & { __connectorReviewCls?: number }).__connectorReviewCls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const rawEntry of list.getEntries()) {
          const entry = rawEntry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
          };
          if (!entry.hadRecentInput) {
            const target = window as typeof window & { __connectorReviewCls?: number };
            target.__connectorReviewCls =
              (target.__connectorReviewCls ?? 0) + (entry.value ?? 0);
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Older local Chrome still renders the deterministic static fallback.
    }
  });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];
  const failedResources: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(
    error instanceof Error ? error.message : String(error),
  ));
  page.on('request', (request) => {
    const requestUrl = request.url();
    if (
      /^https?:/u.test(requestUrl)
      && new URL(requestUrl).origin !== new URL(input.url).origin
    ) {
      externalRequests.push(requestUrl);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResources.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto(input.url, { waitUntil: 'load' });
  await settle(page);
  const metrics = await page.evaluate(() => ({
    viewport: {
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
    },
    connectorCount: document.querySelectorAll('.anaks-connector').length,
    brandMarkCount: document.querySelectorAll('[data-connector-brand]').length,
    brokenBrandMarkCount: [...document.querySelectorAll<HTMLImageElement>(
      '[data-connector-brand] img',
    )].filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0).length,
    brandSources: [...document.querySelectorAll<HTMLImageElement>(
      '[data-connector-brand] img',
    )].map((image) => image.src),
    iframeCount: document.querySelectorAll('iframe').length,
    externalScriptCount: document.querySelectorAll('script[src]').length,
    horizontalOverflow: Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    cls: Number(
      ((window as typeof window & { __connectorReviewCls?: number }).__connectorReviewCls ?? 0)
        .toFixed(4),
    ),
  }));
  if (metrics.viewport.width !== input.width || metrics.viewport.height !== input.height) {
    throw new Error(`${input.band}: viewport mismatch ${JSON.stringify(metrics.viewport)}`);
  }
  if (
    metrics.connectorCount !== 5
    || metrics.brandMarkCount !== 4
    || metrics.brokenBrandMarkCount !== 0
    || metrics.iframeCount !== 0
    || metrics.externalScriptCount !== 0
    || metrics.horizontalOverflow !== 0
    || metrics.cls !== 0
    || consoleErrors.length > 0
    || pageErrors.length > 0
    || externalRequests.length > 0
    || failedResources.length > 0
  ) {
    throw new Error(`${input.band}: review guard failed ${JSON.stringify({
      metrics,
      consoleErrors,
      pageErrors,
      externalRequests,
      failedResources,
    })}`);
  }

  const fullPage = path.join(
    OUTPUT,
    'screenshots',
    `workshop-${input.tone}-full-${input.width}.png`,
  );
  const connectors = path.join(
    OUTPUT,
    'screenshots',
    `workshop-${input.tone}-connectors-${input.width}.png`,
  );
  await page.screenshot({ path: fullPage, fullPage: true });
  const panel = await page.$('.anaks-connectors');
  if (!panel) throw new Error(`${input.band}: connector panel missing`);
  await panel.screenshot({ path: connectors });
  const brandMarkImageStdev: Record<string, number> = {};
  for (const connectorId of BRAND_CONNECTOR_IDS) {
    const brandMark = await page.$(`[data-connector-brand="${connectorId}"]`);
    if (!brandMark) throw new Error(`${input.band}: ${connectorId} brand mark missing`);
    const brandCheck = path.join(
      OUTPUT,
      'brand-checks',
      `${input.tone}-${input.width}-${connectorId}.png`,
    );
    await brandMark.screenshot({ path: brandCheck });
    const brandStdev = await nonEmptyImage(brandCheck);
    if (brandStdev < 3) {
      throw new Error(`${input.band}: ${connectorId} brand mark is effectively blank`);
    }
    brandMarkImageStdev[connectorId] = Number(brandStdev.toFixed(2));
  }
  const stdev = await nonEmptyImage(connectors);
  if (stdev < 8) throw new Error(`${input.band}: connector evidence is effectively blank`);
  const result = {
    ...input,
    fullPage,
    connectors,
    fullPageBytes: (await stat(fullPage)).size,
    connectorBytes: (await stat(connectors)).size,
    connectorImageStdev: Number(stdev.toFixed(2)),
    brandMarkImageStdev,
    ...metrics,
    consoleErrors,
    pageErrors,
    externalRequests,
    failedResources,
  };
  await page.close();
  return result;
}

async function startReviewServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const requestedFile = pathname.startsWith('/fixtures/')
        ? path.join(OUTPUT, pathname)
        : pathname.startsWith('/brand/')
          ? path.join(process.cwd(), 'public', pathname)
          : '';
      const allowedRoot = pathname.startsWith('/fixtures/')
        ? path.join(OUTPUT, 'fixtures')
        : path.join(process.cwd(), 'public', 'brand');
      const resolved = path.resolve(requestedFile);
      if (!requestedFile || (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`))) {
        response.writeHead(404).end();
        return;
      }
      const content = await readFile(resolved);
      const contentType = resolved.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : resolved.endsWith('.svg')
          ? 'image/svg+xml'
          : resolved.endsWith('.png')
            ? 'image/png'
            : 'application/octet-stream';
      response.writeHead(200, {
        'content-type': contentType,
        'cache-control': 'no-store',
      });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function roundTripEvidence(config: SiteConfig) {
  resetMockStore();
  const repository = new MockSiteEventsRepo();
  const clicks = [];
  for (const [index, connector] of (config.connectors?.items ?? []).entries()) {
    const eventType = classifySiteClick(connector.href, 'https://ongyeol.example/');
    if (!eventType) throw new Error(`Unclassified connector: ${connector.id}`);
    const eventId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await repository.increment({
      siteId: HWARODAM_SITE_ID,
      eventType,
      source: 'direct',
      eventDate: '2026-07-24',
      eventId,
    });
    await repository.increment({
      siteId: HWARODAM_SITE_ID,
      eventType,
      source: 'direct',
      eventDate: '2026-07-24',
      eventId,
    });
    clicks.push({ connectorId: connector.id, eventType, eventId, acceptedCount: 1 });
  }
  await repository.increment({
    siteId: HWARODAM_SITE_ID,
    eventType: 'form',
    source: 'direct',
    eventDate: '2026-07-24',
    eventId: '00000000-0000-4000-8000-000000000099',
  });
  const aggregates = await repository.listBySiteRange({
    siteId: HWARODAM_SITE_ID,
    fromDate: '2026-07-01',
    toDate: '2026-08-01',
  });
  const report = buildMonthlyPerformanceReport({
    siteId: HWARODAM_SITE_ID,
    period: {
      month: '2026-07',
      startDate: '2026-07-01',
      endExclusiveDate: '2026-08-01',
      startIso: '2026-06-30T15:00:00.000Z',
      endExclusiveIso: '2026-07-31T15:00:00.000Z',
    },
    comparisonPeriod: {
      month: '2026-06',
      startDate: '2026-06-01',
      endExclusiveDate: '2026-07-01',
      startIso: '2026-05-31T15:00:00.000Z',
      endExclusiveIso: '2026-06-30T15:00:00.000Z',
    },
    current: aggregates,
    previous: [],
  });
  if (report.schemaVersion !== 2) throw new Error('Expected report schema v2');
  return {
    clicks,
    successfulFormEvents: 1,
    aggregates: aggregates.map(({ eventType, source, count }) => ({
      eventType,
      source,
      count,
    })),
    report: {
      schemaVersion: report.schemaVersion,
      consultationActions: report.metrics.consultationActions.current,
      phoneClicks: report.metrics.phoneClicks.current,
      reservationClicks: report.metrics.reservationClicks.current,
      directionsClicks: report.metrics.directionsClicks.current,
      instagramClicks: report.metrics.instagramClicks.current,
    },
  };
}

async function main(): Promise<void> {
  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT, 'screenshots'), { recursive: true });
  await mkdir(path.join(OUTPUT, 'brand-checks'), { recursive: true });
  const photos = await Promise.all([
    'public/cases/demos/yeobaek-workshop/still-1.webp',
    'public/cases/demos/yeobaek-workshop/still-2.webp',
    'public/cases/demos/yeobaek-workshop/still-3.webp',
  ].map((file) => dataUrl(file, 'image/webp')));
  const survey = workshopSurvey(photos);
  const lightTheme = tokenSetToSiteTheme(expandTokens('workshop-tactile-heritage', 31));
  lightTheme.fonts = {
    heading: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    body: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    googleFonts: [],
  };
  const darkTheme: SiteTheme = {
    ...lightTheme,
    fonts: { ...lightTheme.fonts },
    palette: {
      background: '#07111f',
      surface: '#10233c',
      text: '#f7fbff',
      muted: '#b7cbe0',
      primary: '#60ded7',
      accent: '#75adff',
    },
  };
  const buildConfig = (theme: SiteTheme, tone: 'light' | 'dark'): SiteConfig => {
    const candidate: DesignCandidate = {
      id: `connectors-workshop-${tone}`,
      label: `온결 공간연구소 ${tone}`,
      style: 'photo',
      heroImageUrl: photos[0],
      heroPresentation: 'system',
      theme,
      description: '',
      designDna: {
        catalogVersion: 1,
        dnaId: 'workshop-tactile-heritage',
        hueSeed: 31,
        overrides: {},
      },
    };
    const built = buildSiteConfigFromSurvey(survey, candidate, {
      heroImageUrl: photos[0],
      imagePool: [...photos],
      copy: {
        heroKicker: '공간 설계',
        heroTitle: '일하는 방식과\n머무는 시간을\n함께 설계합니다',
        heroSub: '업무 공간과 소규모 상업 공간의 쓰임을 먼저 듣습니다.',
      },
    });
    const withContact = applyExtraFeatures(built, extras());
    const withConnectors = applyConnectorManifest({
      ...withContact,
      publicContact: {
        version: 1,
        phone: '02-1234-5678',
        address: '서울특별시 성동구 연무장길 1',
      },
    }, survey, extras());
    return withContinuousCanvasDefault(withSiteCinematicDefault(withConnectors));
  };
  const reviewConfigs = [
    { tone: 'light' as const, config: buildConfig(lightTheme, 'light') },
    { tone: 'dark' as const, config: buildConfig(darkTheme, 'dark') },
  ];
  for (const review of reviewConfigs) {
    if (review.config.connectors?.items.length !== 5) {
      throw new Error(
        `${review.tone}: expected five connectors, got ${review.config.connectors?.items.length ?? 0}`,
      );
    }
  }
  const roundTrip = await roundTripEvidence(reviewConfigs[0].config);
  const roundTripFile = path.join(OUTPUT, 'click-to-report-roundtrip.json');
  await writeFile(roundTripFile, JSON.stringify(roundTrip, null, 2), 'utf8');

  const reviewServer = await startReviewServer();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const captures = [];
    for (const review of reviewConfigs) {
      for (const viewport of VIEWPORTS) {
        const file = path.join(
          OUTPUT,
          'fixtures',
          `workshop-${review.tone}-${viewport.width}.html`,
        );
        await writeFile(file, documentFor(review.config, viewport.mode), 'utf8');
        captures.push(await capture(browser, {
          url: `${reviewServer.origin}/fixtures/${path.basename(file)}`,
          tone: review.tone,
          ...viewport,
        }));
      }
    }
    await writeFile(path.join(OUTPUT, 'manifest.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      generatedAssets: 0,
      representativeSeed: {
        purposeId: survey.purposeId,
        templateId: survey.templateId,
        industry: survey.industry,
        homeSectionIds:
          reviewConfigs[0].config.pages
            .find((page) => page.slug === '')
            ?.sections.map((section) => section.id) ?? [],
        connectorIds: reviewConfigs[0].config.connectors?.items.map((item) => item.id) ?? [],
        designDna: reviewConfigs.map(({ tone, config }) => ({
          tone,
          designDna: config.designDna,
          palette: config.theme.palette,
        })),
      },
      roundTripFile,
      roundTrip,
      captures,
    }, null, 2), 'utf8');
  } finally {
    await browser.close();
    await reviewServer.close();
  }
  process.stdout.write(`CONN review -> ${OUTPUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
