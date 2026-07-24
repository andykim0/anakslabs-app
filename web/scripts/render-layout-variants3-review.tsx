/**
 * LIB3 owner-review evidence. Captures the production SiteRenderer for all
 * CTA, testimonial, and directions layouts at the three renderer bands.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/render-layout-variants3-review.tsx
 * Out: /private/tmp/daboim-layout-variants3-review
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
import { applyExtraFeatures } from '@/lib/data/extras-inject';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import {
  CTA_LAYOUT_VARIANT_IDS,
  DIRECTIONS_LAYOUT_VARIANT_IDS,
  TESTIMONIAL_LAYOUT_VARIANT_IDS,
  resolveCtaLayoutVariant,
  resolveDirectionsLayoutVariant,
  resolveTestimonialLayoutVariant,
} from '@/lib/layout';
import type {
  CtaLayoutContent,
  CtaLayoutVariantId,
  DirectionsLayoutContent,
  DirectionsLayoutVariantId,
  SectionLayoutVariantId,
  TestimonialLayoutContent,
  TestimonialLayoutVariantId,
} from '@/lib/layout';
import {
  withContinuousCanvasDefault,
  withSiteCinematicDefault,
} from '@/lib/motion/site-cinematic';
import type {
  DesignCandidate,
  SurveyInput,
} from '@/lib/types/domain';
import {
  emptySiteConfig,
  type ButtonElement,
  type CanvasElement,
  type ImageElement,
  type MapElement,
  type Section,
  type SiteConfig,
  type TextElement,
} from '@/lib/types/site';

const OUTPUT_DIR = '/private/tmp/daboim-layout-variants3-review';
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GLYPH_EDGE_BAND_PX = 8;
const VIEWPORTS = [
  { band: 'wide', width: 1440, height: 900, mode: 'desktop' },
  { band: 'compact', width: 768, height: 900, mode: 'mobile' },
  { band: 'mobile', width: 390, height: 844, mode: 'mobile' },
] as const;

interface Fixture {
  id: SectionLayoutVariantId;
  config: SiteConfig;
  selector: string;
  dark: boolean;
}

interface CaptureRecord {
  id: SectionLayoutVariantId;
  band: 'wide' | 'compact' | 'mobile';
  viewport: { width: number; height: number; devicePixelRatio: number };
  targetSize: { width: number; height: number };
  rendererPath: 'SectionCanvas' | 'SectionStack';
  screenshot: string;
  textMask: string;
  glyphEdge: Awaited<ReturnType<typeof glyphEdgeMetrics>>;
  horizontalOverflow: number;
  textOverlaps: string[];
  clippedText: string[];
  consoleErrors: string[];
  dark: boolean;
}

interface GuardCaptureRecord {
  industryClass: 'medical' | 'legal';
  templateId: 'booking_service.clinic' | 'company_brand.professional_firm';
  width: 1440 | 390;
  screenshot: string;
  textMask: string;
  glyphEdge: Awaited<ReturnType<typeof glyphEdgeMetrics>>;
  horizontalOverflow: number;
  sentinelOccurrences: 0;
  pageSlugs: string[];
  homeSectionIds: string[];
}

function text(id: string, value: string, heading = false): TextElement {
  return {
    id,
    kind: 'text',
    text: value,
    frame: { x: 0, y: 0, w: 100, h: 30 },
    z: 2,
    style: {
      fontSize: heading ? 42 : 17,
      fontFamily: heading ? 'heading' : 'body',
      lineHeight: heading ? 1.3 : 1.65,
    },
  };
}

function button(id: string, label: string, href = '#contact'): ButtonElement {
  return {
    id,
    kind: 'button',
    label,
    href,
    frame: { x: 0, y: 0, w: 180, h: 48 },
    z: 3,
    style: { variant: 'solid' },
  };
}

function map(id: string): MapElement {
  return {
    id,
    kind: 'map',
    embedUrl: 'https://www.google.com/maps/embed?pb=customer-confirmed',
    frame: { x: 0, y: 0, w: 640, h: 400 },
    z: 1,
    style: {},
  };
}

function photo(id: string, src: string): ImageElement {
  return {
    id,
    kind: 'image',
    src,
    alt: '고객이 게시를 허락한 인물 사진',
    frame: { x: 0, y: 0, w: 480, h: 600 },
    z: 1,
    style: { objectFit: 'cover' },
  };
}

function themeFor(dark: boolean) {
  const theme = tokenSetToSiteTheme(expandTokens(
    dark ? 'dining-refined-contrast' : 'cafe-warm-editorial',
    dark ? 28 : 34,
  ));
  theme.fonts = {
    heading: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    body: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    googleFonts: [],
  };
  return theme;
}

function configFor(
  id: SectionLayoutVariantId,
  section: Section,
  dark: boolean,
): SiteConfig {
  const config = emptySiteConfig(`LIB3 ${id}`);
  config.theme = themeFor(dark);
  config.meta.industryClass = dark ? 'fine_dining' : 'cafe';
  config.pages[0].sections = [section];
  return config;
}

function ctaFixture(id: CtaLayoutVariantId): Fixture {
  const dark = id === 'cta.fullwidth-band';
  const theme = themeFor(dark);
  const elements: CanvasElement[] = [
    text('cta-kicker', '다음 행동'),
    text('cta-title', '원하시는 일정을 확인하고 편하게 문의해 주세요', true),
    text('cta-lead', '사장님이 확인한 실제 목적지로 바로 연결합니다.'),
    button('cta-primary', '상담 가능한 시간을 확인하고 문의하기'),
    button('cta-secondary', '대표 전화로 문의하기'),
  ];
  const content: CtaLayoutContent = {
    intro: {
      eyebrowId: 'cta-kicker',
      titleId: 'cta-title',
      leadId: 'cta-lead',
    },
    primaryActionId: 'cta-primary',
    secondaryActionId: 'cta-secondary',
  };
  const projection = resolveCtaLayoutVariant({
    requestedId: id,
    elements,
    theme,
    content,
  });
  if (!projection) throw new Error(`${id}: projection missing`);
  const section: Section = {
    id: `sec-${id.replace('.', '-')}`,
    type: 'cta',
    name: '문의',
    height: projection.bands.wide.sectionHeight,
    background: { color: theme.palette.background },
    elements,
    sectionLayout: projection,
  };
  return {
    id,
    config: configFor(id, section, dark),
    selector: `[data-section-layout-stage="${projection.resolvedId}"]`,
    dark,
  };
}

function testimonialFixture(
  id: TestimonialLayoutVariantId,
  photoSrc: string,
): Fixture {
  const dark = id === 'testimonial.quote-photo';
  const theme = themeFor(dark);
  const quotes = [
    '상담 과정에서 필요한 내용을 차분하게 설명해 주셔서 선택 기준을 분명히 세울 수 있었습니다.',
    '예약 전에 궁금했던 내용을 홈페이지에서 확인하고 편하게 방문할 수 있었습니다.',
    '제 상황을 먼저 듣고 가능한 선택지를 알려 주셔서 준비 과정이 한결 수월했습니다.',
    '서비스를 받은 뒤에도 필요한 안내를 다시 확인할 수 있어 좋았습니다.',
    '처음 문의할 때부터 마무리까지 같은 기준으로 안내받았습니다.',
  ];
  const elements: CanvasElement[] = [
    text('testimonial-kicker', '고객의 이야기'),
    text('testimonial-title', '게시를 허락받은 실제 고객의 문장', true),
    text('testimonial-lead', '고객이 확인한 원문과 출처를 함께 보여드립니다.'),
    photo('testimonial-photo-1', photoSrc),
  ];
  quotes.forEach((quote, index) => {
    const number = index + 1;
    elements.push(
      text(`testimonial-quote-${number}`, quote),
      text(`testimonial-source-${number}`, `고객 확인 출처 · 2026-07-${number + 10}`),
      button(
        `testimonial-source-link-${number}`,
        '확인된 출처 보기',
        `https://example.com/review/${number}`,
      ),
    );
  });
  const content: TestimonialLayoutContent = {
    intro: {
      eyebrowId: 'testimonial-kicker',
      titleId: 'testimonial-title',
      leadId: 'testimonial-lead',
    },
    items: quotes.map((_, index) => {
      const number = index + 1;
      return {
        id: `testimonial-${number}`,
        quoteId: `testimonial-quote-${number}`,
        sourceId: `testimonial-source-${number}`,
        sourceLinkId: `testimonial-source-link-${number}`,
        ...(index === 0
          ? { photoId: 'testimonial-photo-1', photoConsentBound: true }
          : {}),
      };
    }),
  };
  const projection = resolveTestimonialLayoutVariant({
    requestedId: id,
    elements,
    theme,
    content,
  });
  if (!projection) throw new Error(`${id}: projection missing`);
  const section: Section = {
    id: `sec-${id.replace('.', '-')}`,
    type: 'testimonials',
    name: '고객 후기',
    height: projection.bands.wide.sectionHeight,
    background: { color: theme.palette.background },
    elements,
    sectionLayout: projection,
  };
  return {
    id,
    config: configFor(id, section, dark),
    selector: `[data-section-layout-stage="${projection.resolvedId}"]`,
    dark,
  };
}

function directionsFixture(id: DirectionsLayoutVariantId): Fixture {
  const dark = id === 'directions.full-map-overlay';
  const theme = themeFor(dark);
  const count = id === 'directions.map-info-split'
    ? 4
    : id === 'directions.info-card-stack'
      ? 1
      : 3;
  const rows = [
    ['주소', '서울시 고객 확인 주소 12'],
    ['전화', '02-1234-5678'],
    ['영업시간', '월요일부터 금요일 오전 10시부터 오후 7시까지'],
    ['찾아오는 길', '고객이 직접 입력한 지하철역 출구와 건물 안내'],
  ].slice(0, count);
  const elements: CanvasElement[] = [
    text('directions-kicker', '방문 안내'),
    text('directions-title', '오시는 길과 이용 정보를 확인해 주세요', true),
    text('directions-lead', '고객이 직접 확인한 정보만 안내합니다.'),
    button('directions-place-link', '고객이 확인한 지도에서 보기', 'https://example.com/place'),
    button('directions-detail-link', '방문 안내 자세히 보기', '/directions'),
  ];
  rows.forEach(([label, value], index) => {
    const number = index + 1;
    elements.push(
      text(`directions-label-${number}`, label),
      text(`directions-value-${number}`, value),
    );
  });
  if (id !== 'directions.info-card-stack') elements.push(map('directions-map'));
  const content: DirectionsLayoutContent = {
    intro: {
      eyebrowId: 'directions-kicker',
      titleId: 'directions-title',
      leadId: 'directions-lead',
    },
    mode: 'full',
    rows: rows.map((_, index) => ({
      id: `direction-${index + 1}`,
      labelId: `directions-label-${index + 1}`,
      valueId: `directions-value-${index + 1}`,
    })),
    mapId: 'directions-map',
    placeLinkId: 'directions-place-link',
    detailLinkId: 'directions-detail-link',
  };
  const projection = resolveDirectionsLayoutVariant({
    requestedId: id,
    elements,
    theme,
    content,
  });
  if (!projection) throw new Error(`${id}: projection missing`);
  const section: Section = {
    id: `sec-${id.replace('.', '-')}`,
    type: 'contact',
    name: '오시는 길',
    height: projection.bands.wide.sectionHeight,
    background: { color: theme.palette.background },
    elements,
    sectionLayout: projection,
  };
  return {
    id,
    config: configFor(id, section, dark),
    selector: `[data-section-layout-stage="${projection.resolvedId}"]`,
    dark,
  };
}

function guardSurvey(kind: 'medical' | 'legal'): SurveyInput {
  const medical = kind === 'medical';
  const purposeId = medical ? 'booking_service' : 'company_brand';
  const industry = medical ? '의원' : '법률 법인';
  const template = resolveTemplate(purposeId, industry);
  const sentinel = medical
    ? 'MEDICAL_TESTIMONIAL_MUST_NOT_RENDER'
    : 'LEGAL_TESTIMONIAL_MUST_NOT_RENDER';
  return {
    businessName: medical ? '온결의원' : '바른길 전문법인',
    purposeId,
    purpose: template.label,
    industry,
    region: '서울 중구',
    tone: ['차분한', '신뢰감 있는'],
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    highlights: medical
      ? ['차분한 진료 안내', '확인하기 쉬운 방문 정보', '필요한 내용을 먼저 설명하는 태도']
      : ['복잡한 내용을 분명하게', '기업의 상황을 먼저 듣는 태도', '과정을 확인할 수 있는 안내'],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    siteGoal: medical ? 'call' : 'kakao_inquiry',
    contentItems: medical
      ? [
          { name: '일반 진료', description: '고객이 직접 입력한 진료 안내입니다.' },
          { name: '건강 상담', description: '방문 전 확인할 내용을 안내합니다.' },
          { name: '검진 안내', description: '예약과 준비 사항을 확인할 수 있습니다.' },
        ]
      : [
          { name: '기업 자문', description: '고객이 직접 입력한 업무 분야입니다.' },
          { name: '계약 검토', description: '검토 범위와 진행 절차를 안내합니다.' },
          { name: '분쟁 대응', description: '상담 전에 필요한 정보를 확인할 수 있습니다.' },
        ],
    contentDepth: {
      version: 2,
      imports: [],
      facts: [
        { key: 'phone', value: medical ? '02-1200-3400' : '02-2100-7800', source: 'customer' },
        {
          key: 'openingHours',
          value: medical ? '평일 09:00–18:00 · 토요일 09:00–13:00' : '평일 09:30–18:00',
          source: 'customer',
        },
        {
          key: 'address',
          value: medical ? '서울 중구 세종대로 100, 4층' : '서울 중구 을지로 120, 8층',
          source: 'customer',
        },
        {
          key: 'directions',
          value: medical
            ? '시청역 4번 출구에서 도보 4분'
            : '을지로입구역 2번 출구에서 도보 5분',
          source: 'customer',
        },
        {
          key: 'services',
          value: medical
            ? '일반 진료 · 건강 상담 · 검진 안내'
            : '기업 자문 · 계약 검토 · 분쟁 대응',
          source: 'customer',
        },
        {
          key: 'specialties',
          value: medical
            ? '방문 전 준비 사항과 진료 절차 안내'
            : '기업 운영 과정에서 필요한 법률 검토',
          source: 'customer',
        },
        {
          key: 'credentials',
          value: medical
            ? '고객이 확인한 의료진 전공·자격 정보'
            : '고객이 확인한 구성원 자격·업무 분야',
          source: 'customer',
        },
        ...(medical
          ? []
          : [{
              key: 'caseStudies' as const,
              value: '고객이 게시를 확인한 기업 자문 수행 분야',
              source: 'customer' as const,
            }]),
      ],
      faqAnswers: [],
      mainStorytelling: {
        version: 1,
        brandStory: medical
          ? '방문 전 궁금한 내용을 먼저 이해할 수 있는 진료 안내를 지향합니다.'
          : '기업이 중요한 결정을 앞두고 필요한 내용을 차분히 이해할 수 있는 안내를 지향합니다.',
        philosophy: medical
          ? '필요한 설명을 분명하게 전하고 편안하게 질문할 수 있는 태도를 생각합니다.'
          : '복잡한 내용을 쉬운 순서로 설명하고 의사결정 과정을 함께 확인하는 태도를 생각합니다.',
      },
      surveyBrief: {
        version: 1,
        targetCustomer: medical ? '방문 전 진료 정보를 확인하려는 환자' : '전문 자문이 필요한 중소기업',
        visitorNeed: medical ? '진료 분야와 방문 정보를 먼저 확인' : '업무 분야와 상담 절차를 확인',
        valueProposition: medical
          ? '필요한 안내를 차분하고 분명하게 전합니다.'
          : '기업의 상황을 먼저 듣고 필요한 과정을 분명하게 안내합니다.',
        conversionDestination: medical
          ? { kind: 'phone_fact' }
          : { kind: 'contact_form' },
        proofs: [
          {
            kind: 'qualification',
            content: medical
              ? '고객이 확인한 의료진 자격 정보'
              : '고객이 확인한 구성원 전문 자격 정보',
            sourceStatus: 'customer_confirmed',
          },
          {
            kind: 'case',
            content: medical
              ? '고객이 입력한 진료 안내 범위'
              : '고객이 게시를 확인한 기업 자문 수행 분야',
            sourceStatus: 'customer_confirmed',
          },
          {
            kind: 'testimonial',
            content: sentinel,
            sourceStatus: 'publication_permission',
            publisher: '고객 확인 출처',
            asOfDate: '2026-07-24',
          },
        ],
      },
    },
  };
}

function guardConfig(
  kind: 'medical' | 'legal',
  heroImageUrl: string,
): SiteConfig {
  const survey = guardSurvey(kind);
  const dark = kind === 'legal';
  const theme = tokenSetToSiteTheme(expandTokens(
    dark ? 'legal-authoritative-editorial' : 'medical-clinical-clarity',
    dark ? 222 : 205,
  ));
  theme.fonts = {
    heading: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    body: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
    googleFonts: [],
  };
  const candidate: DesignCandidate = {
    id: `guard-${kind}`,
    label: '정책 가드 실제 생성 시드',
    style: 'photo',
    heroImageUrl,
    heroPresentation: 'system',
    theme,
    description: '',
  };
  const built = buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl,
    imagePool: [],
    copy: {
      heroKicker: kind === 'medical' ? '진료 안내' : '기업 자문',
      heroTitle: kind === 'medical'
        ? '방문 전에 필요한 정보를\n차분하게 안내합니다'
        : '중요한 결정을 앞둔 기업에\n분명한 기준을 전합니다',
      heroSub: kind === 'medical'
        ? '진료 분야와 의료진, 오시는 길을 한 곳에서 확인하세요.'
        : '업무 분야와 구성원, 상담 절차를 차례로 확인하세요.',
    },
  });
  const withExtras = applyExtraFeatures(built, {
    mapEmbed: {
      embedUrl: 'https://www.google.com/maps/embed?pb=customer-confirmed',
      targetSection: 'contact',
      targetPageSlug: 'directions',
    },
  });
  return withContinuousCanvasDefault(withSiteCinematicDefault(withExtras));
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
    fixture: Fixture;
    htmlFile: string;
    band: 'wide' | 'compact' | 'mobile';
    width: number;
    height: number;
  },
): Promise<CaptureRecord> {
  const { fixture } = input;
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
  await settle(page, fixture.selector);
  const metrics = await page.evaluate((targetSelector) => {
    const target = document.querySelector<HTMLElement>(targetSelector);
    if (!target) throw new Error(`Review target missing: ${targetSelector}`);
    const rect = target.getBoundingClientRect();
    const textFrames = [
      ...target.querySelectorAll<HTMLElement>('[data-section-layout-frame]'),
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
    const clippedText = textFrames.flatMap((frame) => {
      const matching = [...target.querySelectorAll<HTMLElement>(
        '[data-section-layout-frame]',
      )].find((candidate) => candidate.textContent?.trim() === frame.label);
      const content = matching?.querySelector<HTMLElement>('p,.anaks-btn');
      return content && content.scrollWidth > content.clientWidth + 1
        ? [`${frame.label}: ${content.scrollWidth}>${content.clientWidth}`]
        : [];
    });
    for (let left = 0; left < textFrames.length; left += 1) {
      for (let right = left + 1; right < textFrames.length; right += 1) {
        const first = textFrames[left];
        const second = textFrames[right];
        const width = Math.max(
          0,
          Math.min(first.right, second.right) - Math.max(first.left, second.left),
        );
        const height = Math.max(
          0,
          Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top),
        );
        if (width * height > 0.5) {
          textOverlaps.push(`${first.label} ↔ ${second.label}`);
        }
      }
    }
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      targetSize: { width: rect.width, height: rect.height },
      rendererPath: target.hasAttribute('data-anchor')
        ? 'SectionStack' as const
        : 'SectionCanvas' as const,
      horizontalOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      textOverlaps,
      clippedText,
    };
  }, fixture.selector);
  if (
    metrics.viewport.width !== input.width
    || metrics.viewport.height !== input.height
    || metrics.viewport.devicePixelRatio !== 1
  ) {
    throw new Error(
      `${fixture.id}/${input.band}: viewport mismatch ${JSON.stringify(metrics.viewport)}`,
    );
  }
  if (Math.abs(metrics.targetSize.width - input.width) > 0.5) {
    throw new Error(`${fixture.id}/${input.band}: target width ${metrics.targetSize.width}`);
  }
  if (metrics.horizontalOverflow > 0) {
    throw new Error(`${fixture.id}/${input.band}: overflow ${metrics.horizontalOverflow}`);
  }
  if (metrics.textOverlaps.length > 0) {
    throw new Error(
      `${fixture.id}/${input.band}: overlap ${metrics.textOverlaps.join(' | ')}`,
    );
  }
  if (metrics.clippedText.length > 0) {
    throw new Error(
      `${fixture.id}/${input.band}: clipped text ${metrics.clippedText.join(' | ')}`,
    );
  }
  const expectedPath = input.band === 'wide' ? 'SectionCanvas' : 'SectionStack';
  if (metrics.rendererPath !== expectedPath) {
    throw new Error(
      `${fixture.id}/${input.band}: expected ${expectedPath}, got ${metrics.rendererPath}`,
    );
  }
  if (consoleErrors.length > 0) {
    throw new Error(
      `${fixture.id}/${input.band}: console errors ${consoleErrors.join(' | ')}`,
    );
  }

  const slug = fixture.id.replace('.', '-');
  const screenshot = path.join(OUTPUT_DIR, 'screenshots', `${slug}-${input.width}.png`);
  const textMask = path.join(
    OUTPUT_DIR,
    'masks',
    `${slug}-${input.width}-text-mask.png`,
  );
  const target = await page.$(fixture.selector);
  if (!target) throw new Error(`${fixture.id}: target handle missing`);
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
      .anaks-site img,.anaks-site video,.anaks-site svg,.anaks-site iframe {
        visibility:hidden!important
      }
      ${fixture.selector} p,${fixture.selector} p *,
      ${fixture.selector} .anaks-btn,${fixture.selector} .anaks-btn * {
        color:#000!important;opacity:1!important;visibility:visible!important;filter:none!important
      }
    `,
  });
  await target.screenshot({ path: textMask });
  const glyphEdge = await glyphEdgeMetrics(textMask, GLYPH_EDGE_BAND_PX);
  if (glyphEdge.leftBandGlyphPixels > 0 || glyphEdge.rightBandGlyphPixels > 0) {
    throw new Error(
      `${fixture.id}/${input.band}: glyph edge failure ${JSON.stringify(glyphEdge)}`,
    );
  }
  page.off('console', onConsole);
  return {
    id: fixture.id,
    band: input.band,
    viewport: metrics.viewport,
    targetSize: metrics.targetSize,
    rendererPath: metrics.rendererPath,
    screenshot,
    textMask,
    glyphEdge,
    horizontalOverflow: metrics.horizontalOverflow,
    textOverlaps: metrics.textOverlaps,
    clippedText: metrics.clippedText,
    consoleErrors,
    dark: fixture.dark,
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
      const thumbnail = await sharp(record.screenshot)
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
        input: thumbnail,
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

async function captureGuard(
  page: Page,
  industryClass: 'medical' | 'legal',
  width: 1440 | 390,
  heroImageUrl: string,
): Promise<GuardCaptureRecord> {
  const mode = width === 1440 ? 'desktop' : 'mobile';
  const file = path.join(OUTPUT_DIR, 'fixtures', `${industryClass}-guard-${width}.html`);
  const config = guardConfig(industryClass, heroImageUrl);
  const html = documentFor(config, mode, width);
  const sentinel = industryClass === 'medical'
    ? 'MEDICAL_TESTIMONIAL_MUST_NOT_RENDER'
    : 'LEGAL_TESTIMONIAL_MUST_NOT_RENDER';
  const sentinelOccurrences = html.split(sentinel).length - 1;
  if (sentinelOccurrences !== 0) {
    throw new Error(`${industryClass}: testimonial sentinel escaped renderer guard`);
  }
  await writeFile(file, html, 'utf8');
  await page.setViewport({ width, height: width === 1440 ? 900 : 844, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await settle(page, '.anaks-site');
  const horizontalOverflow = await page.evaluate(() => Math.max(
    0,
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  ));
  if (horizontalOverflow > 0) {
    throw new Error(`${industryClass}/${width}: horizontal overflow ${horizontalOverflow}`);
  }
  const output = path.join(OUTPUT_DIR, 'policy', `${industryClass}-guard-${width}.png`);
  await page.screenshot({ path: output, fullPage: true });
  const textMask = path.join(
    OUTPUT_DIR,
    'policy',
    'masks',
    `${industryClass}-guard-${width}-text-mask.png`,
  );
  await page.addStyleTag({
    content: `
      html,body,.anaks-site,.anaks-site main,.anaks-site section {
        background:#fff!important;background-image:none!important
      }
      .anaks-site *,.anaks-site *::before,.anaks-site *::after {
        color:transparent!important;background:transparent!important;border-color:transparent!important;
        box-shadow:none!important;text-shadow:none!important;outline:0!important
      }
      .anaks-site img,.anaks-site video,.anaks-site svg,.anaks-site iframe {
        visibility:hidden!important
      }
      .anaks-site p,.anaks-site p *,.anaks-site .anaks-btn,.anaks-site .anaks-btn * {
        color:#000!important;opacity:1!important;visibility:visible!important;filter:none!important
      }
    `,
  });
  await page.screenshot({ path: textMask, fullPage: true });
  const glyphEdge = await glyphEdgeMetrics(textMask, GLYPH_EDGE_BAND_PX);
  if (glyphEdge.leftBandGlyphPixels > 0 || glyphEdge.rightBandGlyphPixels > 0) {
    throw new Error(
      `${industryClass}/${width}: glyph edge failure ${JSON.stringify(glyphEdge)}`,
    );
  }
  return {
    industryClass,
    templateId: industryClass === 'medical'
      ? 'booking_service.clinic'
      : 'company_brand.professional_firm',
    width,
    screenshot: output,
    textMask,
    glyphEdge,
    horizontalOverflow,
    sentinelOccurrences: 0,
    pageSlugs: config.pages.map((candidate) => candidate.slug),
    homeSectionIds: config.pages.find((candidate) => candidate.slug === '')?.sections
      .map((section) => section.id) ?? [],
  };
}

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'fixtures'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'masks'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'policy'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'policy', 'masks'), { recursive: true });

  const photoBuffer = await readFile(
    path.resolve('public/cases/demos/yeobaek-workshop/still-2.webp'),
  );
  const photoSrc = `data:image/webp;base64,${photoBuffer.toString('base64')}`;
  const systemHeroBuffer = await readFile(path.resolve('public/mock/candidate-light.svg'));
  const systemHeroSrc = `data:image/svg+xml;base64,${systemHeroBuffer.toString('base64')}`;
  const fixtures: Fixture[] = [
    ...CTA_LAYOUT_VARIANT_IDS.map(ctaFixture),
    ...TESTIMONIAL_LAYOUT_VARIANT_IDS.map((id) => testimonialFixture(id, photoSrc)),
    ...DIRECTIONS_LAYOUT_VARIANT_IDS.map(directionsFixture),
  ];
  const jobs: Array<{
    fixture: Fixture;
    htmlFile: string;
    band: 'wide' | 'compact' | 'mobile';
    width: number;
    height: number;
  }> = [];
  for (const fixture of fixtures) {
    for (const viewport of VIEWPORTS) {
      const htmlFile = path.join(
        OUTPUT_DIR,
        'fixtures',
        `${fixture.id.replace('.', '-')}-${viewport.width}.html`,
      );
      await writeFile(
        htmlFile,
        documentFor(fixture.config, viewport.mode, viewport.width),
        'utf8',
      );
      jobs.push({
        fixture,
        htmlFile,
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
  let policyRecords: GuardCaptureRecord[] = [];
  try {
    const page = await browser.newPage();
    for (const job of jobs) records.push(await capture(page, job));
    policyRecords = [
      await captureGuard(page, 'medical', 1440, systemHeroSrc),
      await captureGuard(page, 'medical', 390, systemHeroSrc),
      await captureGuard(page, 'legal', 1440, systemHeroSrc),
    ];
  } finally {
    await browser.close();
  }

  if (records.length !== 9 * 3) {
    throw new Error(`LIB3 review matrix incomplete: ${records.length}`);
  }
  const contactSheet = path.join(OUTPUT_DIR, 'layout-variants3-contact-sheet.png');
  await createContactSheet(records, contactSheet);
  const report = {
    generatedAt: new Date().toISOString(),
    matrix: {
      variants: 9,
      bands: 3,
      captures: records.length,
      compactSectionStack: records.filter((record) => (
        record.band === 'compact' && record.rendererPath === 'SectionStack'
      )).length,
      mobileSectionStack: records.filter((record) => (
        record.band === 'mobile' && record.rendererPath === 'SectionStack'
      )).length,
      darkCaptures: records.filter((record) => record.dark).length,
      glyphEdgeBandPx: GLYPH_EDGE_BAND_PX,
      contactSheet,
    },
    policy: {
      blockedIndustries: ['medical', 'legal'],
      sentinelOccurrences: 0,
      captures: policyRecords,
    },
    generatedAssets: 0,
    reusedAsset: 'public/cases/demos/yeobaek-workshop/still-2.webp',
    records,
  };
  await writeFile(
    path.join(OUTPUT_DIR, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(
    `LIB3 review complete: ${records.length} layout captures, `
    + `${policyRecords.length} production policy captures, output ${OUTPUT_DIR}\n`,
  );
}

void main();
