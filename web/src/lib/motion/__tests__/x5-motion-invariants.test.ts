/**
 * X5 — registry-derived production motion invariants.
 *
 * This suite intentionally renders the real SiteRenderer through render-static.ts
 * (bundled only to neutralise the `server-only` test guard), then sends that exact
 * document through the publishing audit. It does not maintain a parallel HTML demo.
 *
 * CLS note: node:test has no browser Layout Instability API. X5-7 therefore proves
 * zero-shift construction (reserved geometry, stable SSR flow, transform-only frame
 * writes), not a browser-measured CLS score. Browser measurement belongs to the
 * premium visual/performance lab.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { pageLcpImageSrc } from '@/lib/export/motion-scene-assets';
import {
  ACTIVE_BASE_TECHNIQUE_IDS,
  FORBIDDEN_TECHNIQUES,
  MOTION_LIMITS,
  MOTION_TECHNIQUES,
  type ActiveBaseTechniqueId,
} from '@/lib/motion/registry';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';
import {
  MOTION_SIGNATURES,
  PRODUCTION_MOTION_SIGNATURE_IDS,
  motionContextFromConfig,
  resolveMotionSignaturePlayback,
  sanitizeMotionSignatures,
  type MotionAssetProvenance,
} from '@/lib/motion/signatures';
import { auditPublishArtifacts } from '@/lib/publish/artifact-audit';
import type {
  CustomerCaseMedia,
  MotionMedia,
  MotionScene,
  MotionTier,
  ProductionMotionSignatureId,
  Section,
  SectionType,
  SiteConfig,
} from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import {
  verifyBeforeAfterAssetIds,
  verifyResolvedBeforeAfterAssets,
  type CustomerAssetProvenance,
  type CustomerAssetRegistry,
} from '@/lib/uploads/asset-provenance';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const BEFORE_ID = '22222222-2222-4222-8222-222222222222';
const AFTER_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = 'owner-x5';
const SITE_ID = 'site-x5';
const LONG_KO = '고객이 직접 제공한 사실을 바탕으로 긴 한국어 문장도 읽기 좋은 간격과 위계로 차분하게 전달합니다.';
const CTA_LABEL = '상담 요청하기';

function image(id: string, caption?: string): MotionMedia {
  return {
    id,
    kind: 'image',
    src: `/x5/${id}.webp`,
    alt: `${id} 실제 의미 이미지`,
    ...(caption ? { caption } : {}),
    width: 1600,
    height: 1000,
    focalPoint: { x: 0.5, y: 0.5 },
    provenance: 'customer-provided',
  };
}

function video(id: string): MotionMedia {
  return {
    id,
    kind: 'video',
    src: `/x5/${id}.mp4`,
    poster: `/x5/${id}-poster.webp`,
    alt: `${id} 영상 포스터`,
    width: 1920,
    height: 1080,
    focalPoint: { x: 0.5, y: 0.5 },
    provenance: 'curated',
  };
}

const beforeMedia: CustomerCaseMedia = {
  ...image('before-real'),
  kind: 'image',
  provenance: 'customer-provided',
  assetId: BEFORE_ID,
  caseId: CASE_ID,
};

const afterMedia: CustomerCaseMedia = {
  ...image('after-real'),
  kind: 'image',
  provenance: 'customer-provided',
  assetId: AFTER_ID,
  caseId: CASE_ID,
};

function textElement(id: string, text: string, y = 80) {
  return {
    id,
    kind: 'text' as const,
    frame: { x: 96, y, w: 900, h: 92 },
    z: 1,
    text,
    style: { fontSize: y === 80 ? 48 : 22, fontFamily: y === 80 ? 'heading' as const : 'body' as const },
  };
}

function ordinarySection(id: string, type: SectionType, name: string): Section {
  return {
    id,
    type,
    name,
    height: 760,
    background: {},
    elements: [
      textElement(`${id}-heading`, name, 80),
      textElement(`${id}-body`, `${name} — ${LONG_KO}`, 190),
    ],
  };
}

function sourceSectionIds(scene: MotionScene): string[] {
  switch (scene.signatureId) {
    case 'sticky-chapters': return scene.chapters.map((item) => item.sourceSectionId);
    case 'portal-zoom':
    case 'scroll-curtain': return scene.scenes.map((item) => item.sourceSectionId);
    case 'horizontal-story': return scene.panels.map((item) => item.sourceSectionId);
    default: return [];
  }
}

interface FixturePolicy {
  targetType: SectionType;
  purposeId: string;
  templateId: string;
  industryClass: SiteConfig['meta']['industryClass'];
  tier: MotionTier;
  motionAssets?: readonly MotionAssetProvenance[];
  motionOwnerId?: string;
  motionSiteId?: string;
  dark?: boolean;
}

export interface MotionInvariantFixture {
  scene: MotionScene;
  config: SiteConfig;
  tier: MotionTier;
  motionAssets: readonly MotionAssetProvenance[];
  motionOwnerId?: string;
  motionSiteId?: string;
  distinctSelector: string;
}

function configForScene(scene: MotionScene, policy: FixturePolicy): SiteConfig {
  const config = emptySiteConfig(`X5 ${scene.signatureId}`);
  config.theme = policy.dark ? config.theme : {
    fonts: { heading: "'Noto Serif KR', serif", body: "'Pretendard', sans-serif" },
    palette: {
      background: '#f7f9fc', surface: '#ffffff', text: '#111827', muted: '#526075',
      primary: '#1457d9', accent: '#0f9f98',
    },
    radius: 18,
  };
  config.meta = {
    title: `X5 ${scene.signatureId}`,
    description: LONG_KO,
    purposeId: policy.purposeId,
    templateId: policy.templateId,
    industryClass: policy.industryClass,
  };
  const target = ordinarySection(scene.sectionId, policy.targetType, '시그니처 원본 섹션');
  const sections: Section[] = [target];
  for (const id of sourceSectionIds(scene)) {
    if (!sections.some((section) => section.id === id)) {
      sections.push(ordinarySection(id, 'about', `원본 이야기 ${sections.length}`));
    }
  }
  const contact = ordinarySection('contact-x5', 'contact', '문의');
  contact.elements.push({
    id: 'contact-cta',
    kind: 'button',
    frame: { x: 96, y: 320, w: 280, h: 64 },
    z: 2,
    label: CTA_LABEL,
    href: 'tel:+821012345678',
    style: { variant: 'solid' },
  });
  sections.push(contact);
  config.pages = [{ id: 'home', title: '홈', slug: '', sections }];
  config.motion = {
    presetId: policy.tier === 'premium' ? 'base-premium-v2' : 'base-calm-v2',
    intensity: 'normal',
    catalogVersion: 2,
    signatures: [scene],
  };
  return config;
}

function fixture(scene: MotionScene, policy: FixturePolicy, distinctSelector: string): MotionInvariantFixture {
  return {
    scene,
    config: configForScene(scene, policy),
    tier: policy.tier,
    motionAssets: policy.motionAssets ?? [],
    ...(policy.motionOwnerId ? { motionOwnerId: policy.motionOwnerId } : {}),
    ...(policy.motionSiteId ? { motionSiteId: policy.motionSiteId } : {}),
    distinctSelector,
  };
}

/** Compile-time exhaustiveness: a new production ID cannot land without an X5 fixture. */
export const X5_SIGNATURE_FIXTURES = {
  'cinematic-scrub': fixture({
    signatureId: 'cinematic-scrub', pageId: 'home', sectionId: 'hero-x5',
    heading: '시네마틱 브랜드의 첫 장면', body: LONG_KO, media: video('cinematic'),
  }, {
    targetType: 'hero', purposeId: 'company_brand', templateId: 'company_brand.default',
    industryClass: 'brand', tier: 'premium', dark: true,
  }, '[data-cinematic-copy]'),
  'scrollytelling-manifesto': fixture({
    signatureId: 'scrollytelling-manifesto', pageId: 'home', sectionId: 'hero-x5',
    media: video('manifesto'),
    acts: Array.from({ length: 4 }, (_, index) => ({
      id: `manifesto-act-${index + 1}`,
      heading: `매니페스토 ${index + 1}막`,
      body: `${index + 1}막 ${LONG_KO}`,
    })),
  }, {
    targetType: 'hero', purposeId: 'company_brand', templateId: 'company_brand.default',
    industryClass: 'brand', tier: 'premium', dark: true,
  }, '[data-ss-act]'),
  'sticky-chapters': fixture({
    signatureId: 'sticky-chapters', pageId: 'home', sectionId: 'hero-x5',
    chapters: Array.from({ length: 4 }, (_, index) => ({
      id: `chapter-${index + 1}`,
      sourceSectionId: `chapter-source-${index + 1}`,
      heading: `에디토리얼 챕터 ${index + 1}`,
      body: `${index + 1}장 ${LONG_KO}`,
      media: image(`chapter-media-${index + 1}`, `챕터 ${index + 1} 실제 캡션`),
    })),
  }, {
    targetType: 'hero', purposeId: 'company_brand', templateId: 'company_brand.default',
    industryClass: 'brand', tier: 'basic',
  }, '[data-signature-chapter]'),
  'true-card-stack': fixture({
    signatureId: 'true-card-stack', pageId: 'home', sectionId: 'features-x5', heading: '선택 가능한 서비스',
    cards: Array.from({ length: 4 }, (_, index) => ({
      id: `service-card-${index + 1}`,
      heading: `서비스 카드 ${index + 1}`,
      body: `${index + 1}번 서비스 ${LONG_KO}`,
      caption: `서비스 안내 ${index + 1}`,
      media: image(`card-media-${index + 1}`),
    })),
  }, {
    targetType: 'features', purposeId: 'company_brand', templateId: 'company_brand.default',
    industryClass: 'brand', tier: 'basic',
  }, '[data-stack-card]'),
  'portal-zoom': fixture({
    signatureId: 'portal-zoom', pageId: 'home', sectionId: 'hero-x5',
    scenes: Array.from({ length: 3 }, (_, index) => ({
      id: `portal-${index + 1}`,
      sourceSectionId: `portal-source-${index + 1}`,
      heading: `포털 장면 ${index + 1}`,
      body: `${index + 1}번째 포털 ${LONG_KO}`,
      media: image(`portal-media-${index + 1}`),
    })),
  }, {
    targetType: 'hero', purposeId: 'company_brand', templateId: 'company_brand.default',
    industryClass: 'brand', tier: 'basic',
  }, '[data-portal-media]'),
  'scroll-curtain': fixture({
    signatureId: 'scroll-curtain', pageId: 'home', sectionId: 'hero-x5',
    scenes: Array.from({ length: 3 }, (_, index) => ({
      id: `curtain-${index + 1}`,
      sourceSectionId: `curtain-source-${index + 1}`,
      heading: `커튼 장면 ${index + 1}`,
      body: `${index + 1}번째 커튼 ${LONG_KO}`,
      media: image(`curtain-media-${index + 1}`),
    })),
  }, {
    targetType: 'hero', purposeId: 'portfolio', templateId: 'portfolio.default',
    industryClass: 'portfolio', tier: 'basic', dark: true,
  }, '[data-curtain-panel]'),
  'mosaic-reveal': fixture({
    signatureId: 'mosaic-reveal', pageId: 'home', sectionId: 'gallery-x5', heading: '실제 촬영 모음',
    images: Array.from({ length: 9 }, (_, index) => image(
      `mosaic-${index + 1}`,
      `실제 촬영 캡션 ${index + 1}`,
    )),
  }, {
    targetType: 'gallery', purposeId: 'portfolio', templateId: 'portfolio.default',
    industryClass: 'photography', tier: 'basic',
  }, '[data-mosaic-tile]'),
  'path-journey': fixture({
    signatureId: 'path-journey', pageId: 'home', sectionId: 'about-x5', heading: '상담 진행 과정',
    milestones: Array.from({ length: 5 }, (_, index) => ({
      id: `milestone-${index + 1}`,
      heading: `확인된 단계 ${index + 1}`,
      body: `${index + 1}단계 ${LONG_KO}`,
      caption: `절차 ${index + 1}`,
    })),
  }, {
    targetType: 'about', purposeId: 'company_brand', templateId: 'company_brand.professional_firm',
    industryClass: 'legal', tier: 'basic',
  }, '[data-path-milestone]'),
  'before-after-scrub': fixture({
    signatureId: 'before-after-scrub', pageId: 'home', sectionId: 'cases-x5', heading: '같은 실제 공간 비교',
    caseId: CASE_ID, before: beforeMedia, after: afterMedia,
    sameCaseAttested: true, publicationRightsAttested: true,
  }, {
    targetType: 'cases', purposeId: 'booking_service', templateId: 'booking_service.beauty',
    industryClass: 'beauty', tier: 'basic', motionOwnerId: OWNER_ID, motionSiteId: SITE_ID,
    motionAssets: [
      {
        assetId: BEFORE_ID, kind: 'image', source: 'customer-upload', ownerId: OWNER_ID,
        siteId: SITE_ID, caseId: CASE_ID, canonicalSrc: beforeMedia.src,
        width: beforeMedia.width, height: beforeMedia.height,
      },
      {
        assetId: AFTER_ID, kind: 'image', source: 'customer-upload', ownerId: OWNER_ID,
        siteId: SITE_ID, caseId: CASE_ID, canonicalSrc: afterMedia.src,
        width: afterMedia.width, height: afterMedia.height,
      },
    ],
  }, '[data-before-after-range]'),
  'horizontal-story': fixture({
    signatureId: 'horizontal-story', pageId: 'home', sectionId: 'hero-x5', heading: '브랜드 가로 이야기',
    panels: Array.from({ length: 5 }, (_, index) => ({
      id: `horizontal-${index + 1}`,
      sourceSectionId: `horizontal-source-${index + 1}`,
      heading: `가로 패널 ${index + 1}`,
      body: `${index + 1}번째 패널 ${LONG_KO}`,
      media: image(`horizontal-media-${index + 1}`),
    })),
  }, {
    targetType: 'hero', purposeId: 'company_brand', templateId: 'company_brand.default',
    industryClass: 'brand', tier: 'basic', dark: true,
  }, '[data-horizontal-rail]'),
} satisfies Record<ProductionMotionSignatureId, MotionInvariantFixture>;

interface BaseMotionInvariantFixture {
  presetId: string;
  tier: MotionTier;
  marker: RegExp;
  staticFallback: string;
}

/** Compile-time base-catalog coverage. */
export const X5_BASE_FIXTURES = {
  'scroll-reveal': { presetId: 'base-calm-v2', tier: 'basic', marker: /data-m="reveal"/, staticFallback: 'visible section copy' },
  'ken-burns': { presetId: 'base-calm-v2', tier: 'basic', marker: /data-m="kenburns"/, staticFallback: 'static background image' },
  'mask-reveal': { presetId: 'base-calm-v2', tier: 'basic', marker: /data-m="mask"/, staticFallback: 'fully open image' },
  marquee: { presetId: 'base-flow-v2', tier: 'basic', marker: /data-m="marquee"/, staticFallback: 'single ordered item row' },
  'video-hero': { presetId: 'beauty-premium', tier: 'premium', marker: /data-m="videohero"/, staticFallback: 'poster image' },
  'scroll-scrub': { presetId: 'cinematic-hero', tier: 'premium', marker: /data-m="cinematic"/, staticFallback: 'poster and hero copy' },
  'split-text': { presetId: 'cinematic-hero', tier: 'premium', marker: /data-m="storyword"/, staticFallback: 'intact accessible phrase' },
  parallax: { presetId: 'base-premium-v2', tier: 'premium', marker: /data-m="parallax"/, staticFallback: 'untranslated layers' },
  'hover-video': { presetId: 'beauty-premium', tier: 'premium', marker: /data-m="hovervideo"/, staticFallback: 'video poster' },
} satisfies Record<ActiveBaseTechniqueId, BaseMotionInvariantFixture>;

type StaticRenderer = (options: {
  config: SiteConfig;
  pageSlug?: string;
  siteUrl?: string;
  tier?: MotionTier;
  motionOwnerId?: string;
  motionSiteId?: string;
  motionAssets?: readonly MotionAssetProvenance[];
}) => string;

let staticRendererPromise: Promise<StaticRenderer> | undefined;

/**
 * `render-static.ts` is intentionally server-only. Bundle the real module with the
 * repository's existing empty server-only script shim, rather than reimplementing it.
 */
async function loadStaticRenderer(): Promise<StaticRenderer> {
  staticRendererPromise ??= (async () => {
    const directory = mkdtempSync(join(tmpdir(), 'daboim-x5-render-static-'));
    const outfile = join(directory, 'render-static.mjs');
    try {
      execFileSync(join(process.cwd(), 'node_modules/.bin/esbuild'), [
        'src/lib/export/render-static.ts',
        '--bundle',
        '--platform=node',
        '--format=esm',
        '--conditions=default',
        '--alias:server-only=./scripts/_empty-server-only.ts',
        `--outfile=${outfile}`,
      ], { cwd: process.cwd(), stdio: 'pipe' });
      const loadedModule = await import(`${pathToFileURL(outfile).href}?x5=${Date.now()}`) as {
        renderStaticDocument: StaticRenderer;
      };
      return loadedModule.renderStaticDocument;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  })();
  return staticRendererPromise;
}

const renderedDocuments = new Map<ProductionMotionSignatureId, Promise<string>>();
const renderedBaseDocuments = new Map<ActiveBaseTechniqueId, Promise<string>>();

function renderFixture(id: ProductionMotionSignatureId): Promise<string> {
  const existing = renderedDocuments.get(id);
  if (existing) return existing;
  const fixtureValue = X5_SIGNATURE_FIXTURES[id];
  const pending = loadStaticRenderer().then((renderStaticDocument) => renderStaticDocument({
    config: fixtureValue.config,
    pageSlug: '',
    siteUrl: 'https://x5.daboim.example',
    tier: fixtureValue.tier,
    motionOwnerId: fixtureValue.motionOwnerId,
    motionSiteId: fixtureValue.motionSiteId,
    motionAssets: fixtureValue.motionAssets,
  }));
  renderedDocuments.set(id, pending);
  return pending;
}

function imageElement(id: string, y: number) {
  return {
    id,
    kind: 'image' as const,
    frame: { x: 96, y, w: 560, h: 360 },
    z: 1,
    src: `/x5/base-${id}.webp`,
    alt: `${id} 의미 이미지`,
    style: { objectFit: 'cover' as const },
  };
}

function videoElement(id: string, y: number) {
  return {
    id,
    kind: 'video' as const,
    frame: { x: 96, y, w: 560, h: 360 },
    z: 1,
    src: `/x5/base-${id}.mp4`,
    poster: `/x5/base-${id}-poster.webp`,
    style: { objectFit: 'cover' as const, muted: true, autoplay: false, loop: true },
  };
}

function baseConfig(id: ActiveBaseTechniqueId): SiteConfig {
  const config = emptySiteConfig(`X5 base ${id}`);
  config.meta = {
    title: `X5 base ${id}`,
    description: LONG_KO,
    purposeId: 'company_brand',
    templateId: 'company_brand.default',
    industryClass: 'brand',
  };
  const hero = ordinarySection('base-hero', 'hero', '기본 모션 히어로');
  const detail = ordinarySection('base-detail', 'features', '기본 모션 본문');
  if (id === 'ken-burns') hero.background.image = { src: '/x5/base-hero.webp' };
  if (id === 'video-hero' || id === 'scroll-scrub' || id === 'split-text') {
    hero.background.image = { src: '/x5/base-video-poster.webp' };
    hero.background.video = { src: '/x5/base-video.mp4', poster: '/x5/base-video-poster.webp', bytes: 2_000_000 };
  }
  if (id === 'mask-reveal') detail.elements.push(imageElement('mask', 320));
  if (id === 'parallax') {
    detail.elements = [imageElement('parallax-back', 60), textElement('parallax-copy', LONG_KO, 220)];
  }
  if (id === 'hover-video') detail.elements.push(videoElement('hover', 320));
  if (id === 'marquee') {
    detail.layout = 'marquee';
    detail.elements = [
      textElement('mq-one', '첫 번째 실제 항목', 80),
      textElement('mq-two', '두 번째 실제 항목', 80),
      textElement('mq-three', '세 번째 실제 항목', 80),
    ];
    detail.elements[0]!.frame.x = 40;
    detail.elements[1]!.frame.x = 520;
    detail.elements[2]!.frame.x = 1000;
  }
  config.pages = [{ id: 'home', title: '홈', slug: '', sections: [hero, detail] }];
  config.motion = {
    presetId: X5_BASE_FIXTURES[id].presetId,
    intensity: 'normal',
  };
  return config;
}

function renderBaseFixture(id: ActiveBaseTechniqueId): Promise<string> {
  const existing = renderedBaseDocuments.get(id);
  if (existing) return existing;
  const fixtureValue = X5_BASE_FIXTURES[id];
  const pending = loadStaticRenderer().then((renderStaticDocument) => renderStaticDocument({
    config: baseConfig(id),
    pageSlug: '',
    siteUrl: 'https://x5-base.daboim.example',
    tier: fixtureValue.tier,
  }));
  renderedBaseDocuments.set(id, pending);
  return pending;
}

function contentMarkup(html: string): string {
  const root = parse(html);
  for (const node of root.querySelectorAll('style, script')) node.remove();
  return root.toString();
}

function sceneCopy(scene: MotionScene): { required: string[]; readingOrder: string[] } {
  const required: string[] = [];
  const readingOrder: string[] = [];
  const add = (...values: Array<string | undefined>) => {
    for (const value of values) if (value?.trim()) required.push(value);
  };
  const ordered = (...values: Array<string | undefined>) => {
    for (const value of values) if (value?.trim()) readingOrder.push(value);
  };
  switch (scene.signatureId) {
    case 'cinematic-scrub':
      add(scene.heading, scene.body, scene.media.caption);
      ordered(scene.heading, scene.body);
      break;
    case 'scrollytelling-manifesto':
      for (const act of scene.acts) { add(act.heading, act.body); ordered(act.heading, act.body); }
      break;
    case 'sticky-chapters':
      for (const item of scene.chapters) {
        add(item.heading, item.body, item.media?.caption);
        ordered(item.heading, item.body);
      }
      break;
    case 'true-card-stack':
      add(scene.heading);
      ordered(scene.heading);
      for (const item of scene.cards) { add(item.heading, item.body, item.caption, item.media?.caption); ordered(item.heading, item.body, item.caption); }
      break;
    case 'portal-zoom':
    case 'scroll-curtain':
      for (const item of scene.scenes) { add(item.heading, item.body, item.media?.caption); ordered(item.heading, item.body); }
      break;
    case 'mosaic-reveal':
      add(scene.heading);
      ordered(scene.heading);
      for (const item of scene.images) { add(item.caption); ordered(item.caption); }
      break;
    case 'path-journey':
      add(scene.heading);
      ordered(scene.heading);
      for (const item of scene.milestones) { add(item.heading, item.body, item.caption); ordered(item.heading, item.body, item.caption); }
      break;
    case 'before-after-scrub':
      add(scene.heading, scene.before.caption, scene.after.caption, '실제 사례', '이전 · 실제 사례', '이후 · 실제 사례');
      ordered(scene.heading, '이전 · 실제 사례', '이후 · 실제 사례');
      break;
    case 'horizontal-story':
      add(scene.heading);
      ordered(scene.heading);
      for (const item of scene.panels) { add(item.heading, item.body, item.media?.caption); ordered(item.heading, item.body); }
      break;
  }
  return { required, readingOrder };
}

function documentAttribute(node: ReturnType<typeof parse>, name: string): string | undefined {
  return node.getAttribute(name) ?? node.getAttribute(name.toLowerCase());
}

function assertOrdered(haystack: string, values: readonly string[], message: string): void {
  let cursor = -1;
  for (const value of values) {
    const index = haystack.indexOf(value, cursor + 1);
    assert.ok(index > cursor, `${message}: ${value}`);
    cursor = index;
  }
}

function mediaFor(scene: MotionScene): MotionMedia[] {
  switch (scene.signatureId) {
    case 'cinematic-scrub':
    case 'scrollytelling-manifesto': return [scene.media];
    case 'sticky-chapters': return scene.chapters.flatMap((item) => item.media ? [item.media] : []);
    case 'true-card-stack': return scene.cards.flatMap((item) => item.media ? [item.media] : []);
    case 'portal-zoom':
    case 'scroll-curtain': return scene.scenes.flatMap((item) => item.media ? [item.media] : []);
    case 'mosaic-reveal': return scene.images;
    case 'path-journey': return [];
    case 'before-after-scrub': return [scene.before, scene.after];
    case 'horizontal-story': return scene.panels.flatMap((item) => item.media ? [item.media] : []);
  }
}

function semanticSelectors(id: ProductionMotionSignatureId): string[] {
  switch (id) {
    case 'cinematic-scrub': return ['figure', 'h2'];
    case 'scrollytelling-manifesto': return ['article[data-ss-act]', 'h2'];
    case 'sticky-chapters': return ['section[data-signature-chapter]', 'figure', 'h2'];
    case 'true-card-stack': return ['ol[data-card-list]', 'li[data-stack-card]', 'article', 'h2', 'h3'];
    case 'portal-zoom':
    case 'scroll-curtain':
    case 'horizontal-story': return ['section[data-signature-panel]', 'figure', 'h2'];
    case 'mosaic-reveal': return ['[role="list"]', '[role="listitem"]', 'figure', 'figcaption'];
    case 'path-journey': return ['ol[data-path-list]', 'li[data-path-milestone]', 'article', 'h2', 'h3'];
    case 'before-after-scrub': return ['figure', 'figcaption', 'input[type="range"]'];
  }
}

describe('X5 registry fixture exhaustiveness', () => {
  test('production signatures and active base techniques cannot escape an X5 fixture', () => {
    assert.deepEqual(Object.keys(X5_SIGNATURE_FIXTURES).sort(), [...PRODUCTION_MOTION_SIGNATURE_IDS].sort());
    assert.deepEqual(Object.keys(X5_BASE_FIXTURES), [...ACTIVE_BASE_TECHNIQUE_IDS]);
    for (const id of PRODUCTION_MOTION_SIGNATURE_IDS) {
      assert.equal(X5_SIGNATURE_FIXTURES[id].scene.signatureId, id);
      assert.equal(MOTION_SIGNATURES[id].signatureUnits, 1);
    }
    for (const id of ACTIVE_BASE_TECHNIQUE_IDS) {
      assert.equal(MOTION_TECHNIQUES[id].status, 'active');
      assert.ok(X5_BASE_FIXTURES[id].staticFallback.length > 0);
    }
  });
});

describe('X5 active base techniques use the production renderer', () => {
  for (const id of ACTIVE_BASE_TECHNIQUE_IDS) {
    test(`${id}: real static output has its production marker and a readable static fallback`, async () => {
      const html = await renderBaseFixture(id);
      const markup = contentMarkup(html);
      const root = parse(html);
      assert.match(markup, X5_BASE_FIXTURES[id].marker);
      assert.ok(markup.includes('기본 모션 히어로'));
      assert.ok(markup.includes('기본 모션 본문'));
      assert.equal(root.querySelectorAll('h1').length, 1);
      assert.doesNotMatch(markup, /class="[^"]*\bm-hide\b/);
      const eagerImages = root.querySelectorAll('.anaks-site img').filter((node) =>
        node.getAttribute('loading') === 'eager' || documentAttribute(node, 'fetchpriority') === 'high',
      );
      assert.ok(eagerImages.length <= 1, 'base motion may designate at most one LCP image');
      for (const node of root.querySelectorAll('.anaks-site video')) {
        assert.ok((node.getAttribute('poster') ?? '').length > 0, `${id} video needs an SSR poster attribute`);
        assert.ok(node.hasAttribute('muted') && node.hasAttribute('playsinline'));
        assert.ok(!node.hasAttribute('autoplay'), 'base motion may not autoplay sound or begin in SSR');
        if (node.hasAttribute('data-m')) assert.equal(node.getAttribute('preload'), 'none');
      }
      for (const section of baseConfig(id).pages[0]!.sections) {
        assert.ok(section.height > 0);
        for (const element of section.elements) {
          assert.ok(element.frame.w > 0 && element.frame.h > 0, `${id} canvas media/content needs reserved frame geometry`);
        }
      }
      if (id === 'marquee') {
        assertOrdered(markup, ['첫 번째 실제 항목', '두 번째 실제 항목', '세 번째 실제 항목'], 'marquee source order');
        assert.ok(parse(markup).querySelector('[aria-hidden="true"]'), 'animated duplicate must be inaccessible');
      }
      if (id === 'split-text') {
        assert.match(markup, /aria-label="기본 모션 히어로"/);
      }
      if (id === 'hover-video') {
        const node = parse(markup).querySelector('video[data-m="hovervideo"]')!;
        assert.equal(node.getAttribute('poster'), '/x5/base-hover-poster.webp');
        assert.equal(node.getAttribute('preload'), 'none');
        assert.ok(node.hasAttribute('muted') && !node.hasAttribute('autoplay'));
      }
    });
  }

  test('every base hide/enhancement selector is opt-in after SSR and reduced motion restores the final state', () => {
    for (const id of ACTIVE_BASE_TECHNIQUE_IDS) {
      assert.equal(MOTION_TECHNIQUES[id].status, 'active');
    }
    assert.match(MOTION_CSS, /\[data-m="reveal"\]\.m-hide/);
    assert.match(MOTION_CSS, /\[data-m="mask"\]\.m-hide/);
    assert.match(MOTION_CSS, /prefers-reduced-motion: reduce[\s\S]*\.m-hide[^}]*opacity: 1 !important[^}]*clip-path: none !important/);
    assert.match(MOTION_RUNTIME, /reveals\.forEach\(function\(el\)\{el\.classList\.add\('m-hide'\);\}\)/);
  });
});

describe('X5-1 static-export completeness and semantics', () => {
  for (const id of PRODUCTION_MOTION_SIGNATURE_IDS) {
    test(`${id}: actual static export contains every structured item in reading order`, async () => {
      const fixtureValue = X5_SIGNATURE_FIXTURES[id];
      const html = await renderFixture(id);
      const root = parse(html);
      assert.equal(root.querySelectorAll('main').length, 1);
      assert.equal(root.querySelectorAll('h1').length, 1, 'document must have exactly one real h1');
      const stages = root.querySelectorAll(`[data-motion-signature="${id}"]`);
      assert.equal(stages.length, 1, 'signature production renderer must occur once');
      const stage = stages[0]!;
      assert.equal(stage.tagName, 'SECTION');
      assert.ok(stage.querySelector(fixtureValue.distinctSelector), 'distinct production DOM contract missing');
      for (const selector of semanticSelectors(id)) {
        assert.ok(stage.querySelectorAll(selector).length > 0, `${id} missing semantic ${selector}`);
      }
      const copy = sceneCopy(fixtureValue.scene);
      for (const value of copy.required) assert.ok(stage.text.includes(value), `${id} omitted: ${value}`);
      assertOrdered(stage.text, copy.readingOrder, `${id} DOM reading order`);
      const firstH3 = stage.toString().indexOf('<h3');
      const firstH2 = stage.toString().indexOf('<h2');
      assert.ok(firstH3 < 0 || (firstH2 >= 0 && firstH2 < firstH3), 'h3 must follow an h2');
      assert.ok(root.text.includes(CTA_LABEL), 'ordinary CTA must survive the signature and no-JS export');
    });
  }
});

describe('X5-2 image loading and reserved geometry', () => {
  for (const id of PRODUCTION_MOTION_SIGNATURE_IDS) {
    test(`${id}: only the designated page media can be eager; all other images are lazy/async`, async () => {
      const fixtureValue = X5_SIGNATURE_FIXTURES[id];
      const html = await renderFixture(id);
      const root = parse(html);
      const images = root.querySelectorAll('[data-motion-signature] img');
      for (const node of images) {
        assert.ok(Number(node.getAttribute('width')) > 0 && Number(node.getAttribute('height')) > 0, 'image dimensions required');
        assert.ok((node.getAttribute('alt') ?? '').trim().length > 0, 'meaningful signature image alt required');
      }
      const expectedLcp = pageLcpImageSrc(fixtureValue.config, '');
      const eager = images.filter((node) =>
        (node.getAttribute('loading') ?? '').toLowerCase() === 'eager' ||
        (documentAttribute(node, 'fetchpriority') ?? '').toLowerCase() === 'high',
      );
      assert.equal(eager.length, expectedLcp ? 1 : 0);
      if (expectedLcp) assert.equal(eager[0]?.getAttribute('src'), expectedLcp);
      for (const node of images.filter((candidate) => candidate !== eager[0])) {
        assert.equal((node.getAttribute('loading') ?? '').toLowerCase(), 'lazy');
        assert.equal((node.getAttribute('decoding') ?? '').toLowerCase(), 'async');
      }
      const preloads = root.querySelectorAll('link[rel="preload"][as="image"]');
      assert.equal(preloads.length, expectedLcp ? 1 : 0);
      if (expectedLcp) assert.equal(preloads[0]?.getAttribute('href'), expectedLcp);
      if (id === 'mosaic-reveal') {
        assert.equal(images.length, fixtureValue.scene.signatureId === 'mosaic-reveal' ? fixtureValue.scene.images.length : -1);
        assert.ok(images.every((node) => node.getAttribute('loading') === 'lazy' && node.getAttribute('decoding') === 'async'));
      }
    });
  }
});

describe('X5-3 poster-first video', () => {
  for (const id of ['cinematic-scrub', 'scrollytelling-manifesto'] as const) {
    test(`${id}: poster is SSR-first, equal geometry, preload=none, and failure-safe`, async () => {
      const fixtureValue = X5_SIGNATURE_FIXTURES[id];
      const media = mediaFor(fixtureValue.scene)[0]!;
      assert.equal(media.kind, 'video');
      const html = await renderFixture(id);
      const root = parse(html);
      const stage = root.querySelector(`[data-motion-signature="${id}"]`)!;
      const poster = stage.querySelector(`img[src="${media.poster}"][data-video-poster]`);
      const videoNode = stage.querySelector(`video[src="${media.src}"]`);
      assert.ok(poster && videoNode);
      assert.ok(stage.toString().indexOf('<img') < stage.toString().indexOf('<video'), 'poster must precede video');
      assert.equal(videoNode!.getAttribute('poster'), media.poster);
      assert.equal(videoNode!.getAttribute('preload'), 'none');
      assert.ok(videoNode!.hasAttribute('muted') && videoNode!.hasAttribute('playsinline'));
      assert.ok(!videoNode!.hasAttribute('autoplay'), 'SSR must not begin playback or download');
      assert.equal(videoNode!.getAttribute('width'), poster!.getAttribute('width'));
      assert.equal(videoNode!.getAttribute('height'), poster!.getAttribute('height'));
      assert.match(MOTION_CSS, /\[data-signature-media\] > video[^}]*opacity:\s*0/);
      assert.match(MOTION_RUNTIME, /listen\(v,'playing',reveal\)/);
      assert.match(MOTION_RUNTIME, /failPoster=function\(\)\{[^}]*opacity='0'/);
      assert.match(MOTION_RUNTIME, /if\(!saveData0\)[\s\S]*cinematicVideos/);
    });
  }
});

describe('X5-4 reduced motion', () => {
  for (const id of PRODUCTION_MOTION_SIGNATURE_IDS) {
    test(`${id}: resolver is static and core SSR content starts visible`, async () => {
      const fixtureValue = X5_SIGNATURE_FIXTURES[id];
      const context = motionContextFromConfig(fixtureValue.config, fixtureValue.tier, {
        assets: fixtureValue.motionAssets,
        ownerId: fixtureValue.motionOwnerId,
        siteId: fixtureValue.motionSiteId,
        playback: { reducedMotion: true },
      });
      assert.equal(resolveMotionSignaturePlayback(id, context), 'static');
      const root = parse(await renderFixture(id));
      const stage = root.querySelector(`[data-motion-signature="${id}"]`)!;
      assert.ok(!/m-signature-ready/.test(stage.getAttribute('class') ?? ''));
      for (const node of stage.querySelectorAll('[data-signature-heading], [data-signature-body], [data-signature-caption], a, button')) {
        const style = node.getAttribute('style') ?? '';
        assert.doesNotMatch(style, /opacity\s*:\s*0(?:\D|$)|visibility\s*:\s*hidden|display\s*:\s*none|clip-path\s*:\s*inset\([^)]*100%/i);
        assert.notEqual(node.getAttribute('aria-hidden'), 'true');
      }
    });
  }

  test('reduced CSS dismantles pin/scrub/horizontal layout and reveals every core node', () => {
    assert.match(MOTION_CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\[data-motion-signature\] \{ height: auto !important; \}/);
    assert.match(MOTION_CSS, /prefers-reduced-motion: reduce[\s\S]*\[data-signature-pin\][^}]*position: relative !important/);
    assert.match(MOTION_CSS, /prefers-reduced-motion: reduce[\s\S]*opacity: 1 !important; transform: none !important; clip-path: none !important/);
    assert.match(MOTION_CSS, /prefers-reduced-motion: reduce[\s\S]*\[data-horizontal-rail\][^}]*transform: none !important/);
    assert.match(MOTION_RUNTIME, /if\(mm && mm\.matches\)\{ roots\.forEach\(markStatic\); return; \}/);
  });
});

describe('X5-5 no JavaScript', () => {
  for (const id of PRODUCTION_MOTION_SIGNATURE_IDS) {
    test(`${id}: removing scripts leaves all copy, CTA, and usable document flow`, async () => {
      const fixtureValue = X5_SIGNATURE_FIXTURES[id];
      const root = parse(await renderFixture(id));
      for (const script of root.querySelectorAll('script')) script.remove();
      const stage = root.querySelector(`[data-motion-signature="${id}"]`)!;
      for (const value of sceneCopy(fixtureValue.scene).required) assert.ok(stage.text.includes(value));
      assert.ok(root.text.includes(CTA_LABEL));
      assert.ok(!stage.getAttribute('class')?.includes('m-signature-ready'));
      if (['portal-zoom', 'scroll-curtain', 'horizontal-story'].includes(id)) {
        assert.equal(stage.querySelectorAll('[data-signature-panel]').length, MOTION_SIGNATURES[id].minItems <= 3 ? (fixtureValue.scene.signatureId === 'horizontal-story' ? fixtureValue.scene.panels.length : fixtureValue.scene.signatureId === 'portal-zoom' || fixtureValue.scene.signatureId === 'scroll-curtain' ? fixtureValue.scene.scenes.length : 0) : 0);
      }
      if (id === 'scrollytelling-manifesto') {
        assert.equal(stage.querySelectorAll('[data-ss-act]').length, fixtureValue.scene.signatureId === id ? fixtureValue.scene.acts.length : 0);
      }
    });
  }

  test('SSR never starts with an enhanced sticky track or an empty panel stage', async () => {
    for (const id of PRODUCTION_MOTION_SIGNATURE_IDS) {
      const root = parse(await renderFixture(id));
      const stage = root.querySelector(`[data-motion-signature="${id}"]`)!;
      assert.ok(!stage.getAttribute('class')?.includes('m-signature-ready'));
      assert.doesNotMatch(stage.getAttribute('style') ?? '', /(?:^|;)\s*height\s*:\s*(?:[2-9]\d{2,}s?vh|var\(--signature-track-height\))/i);
      if (id === 'portal-zoom' || id === 'scroll-curtain' || id === 'horizontal-story') {
        assert.ok(stage.querySelectorAll('[data-signature-panel]').every((panel) => panel.text.trim().length > 0));
      }
      if (id === 'scrollytelling-manifesto') {
        const scene = X5_SIGNATURE_FIXTURES[id].scene;
        assert.equal(scene.signatureId, id);
        assert.equal(stage.querySelectorAll('[data-ss-act]').length, scene.acts.length);
        assert.match(stage.getAttribute('style') ?? '', new RegExp(`--ss-scroll-height:${scene.acts.length * 100}svh`));
      }
    }
    assert.match(MOTION_CSS, /\[data-signature-id="portal-zoom"\],[\s\S]*\[data-signature-id="horizontal-story"\] \{ height: auto; \}/);
  });
});

describe('X5-6 forbidden behavior and bounded budgets', () => {
  test('active registry contains no forbidden technique and keeps page budgets', () => {
    const activeNames = [...ACTIVE_BASE_TECHNIQUE_IDS, ...PRODUCTION_MOTION_SIGNATURE_IDS];
    for (const forbidden of FORBIDDEN_TECHNIQUES) assert.ok(!activeNames.includes(forbidden as never));
    assert.equal(MOTION_LIMITS.maxSignaturePerPage, 1);
    assert.equal(MOTION_LIMITS.maxInfinitePerPage, 2);
  });

  test('production motion runtime has no scroll hijacking, input interception, WebGL, or autoplay sound', () => {
    const sources = [
      readFileSync(join(process.cwd(), 'src/lib/motion/runtime.ts'), 'utf8'),
      readFileSync(join(process.cwd(), 'src/components/site-renderer/MotionSignatureRenderer.tsx'), 'utf8'),
      readFileSync(join(process.cwd(), 'src/lib/motion/signatures.ts'), 'utf8'),
    ].join('\n');
    assert.doesNotMatch(MOTION_RUNTIME, /addEventListener\(['"](?:wheel|touchmove)['"]/);
    assert.doesNotMatch(MOTION_RUNTIME, /preventDefault\(|scrollTo\(|scrollBy\(/);
    assert.doesNotMatch(sources, /\b(?:WebGL|THREE|gsap|Lenis|LocomotiveScroll)\b|from ['"]framer-motion['"]/i);
    assert.doesNotMatch(sources, /<audio\b|autoplaySound|autoplay-sound/i);
    assert.match(MOTION_RUNTIME, /addEventListener\('scroll',scheduleProgress,\{passive:true\}\)/);
  });
});

describe('X5-7 CLS zero by construction (not browser-measured)', () => {
  for (const id of PRODUCTION_MOTION_SIGNATURE_IDS) {
    test(`${id}: SSR reserves media and stage geometry without injected core copy`, async () => {
      const fixtureValue = X5_SIGNATURE_FIXTURES[id];
      const root = parse(await renderFixture(id));
      const stage = root.querySelector(`[data-motion-signature="${id}"]`)!;
      for (const media of mediaFor(fixtureValue.scene)) {
        const src = media.kind === 'video' ? media.poster : media.src;
        const imageNode = stage.querySelector(`img[src="${src}"]`);
        assert.ok(imageNode, `${media.id} SSR surface missing`);
        assert.equal(Number(imageNode!.getAttribute('width')), media.width);
        assert.equal(Number(imageNode!.getAttribute('height')), media.height);
        assert.ok(imageNode!.closest('[data-signature-media]') || id === 'before-after-scrub');
        if (media.kind === 'video') {
          const videoNode = stage.querySelector(`video[src="${media.src}"]`)!;
          assert.equal(Number(videoNode.getAttribute('width')), media.width);
          assert.equal(Number(videoNode.getAttribute('height')), media.height);
        }
      }
      if (MOTION_SIGNATURES[id].sticky) {
        const style = stage.getAttribute('style') ?? '';
        const realFlowItems = stage.querySelectorAll('[data-signature-chapter], [data-stack-card], [data-signature-panel], [data-ss-act]').length;
        assert.ok(style.includes('--signature-track-height') || style.includes('--ss-scroll-height') || realFlowItems >= MOTION_SIGNATURES[id].minItems);
      }
    });
  }

  test('shared frame writer mutates only transform/opacity/clip/custom properties, not layout properties', () => {
    assert.doesNotMatch(MOTION_RUNTIME, /\.style\.(?:height|width|margin|padding|top|left)\s*=/);
    assert.doesNotMatch(MOTION_RUNTIME, /(?:innerHTML|insertAdjacentHTML|createElement|appendChild)\s*[=(]/);
    assert.match(MOTION_RUNTIME, /var reads=targets\.map\(readProgress\);reads\.forEach\(writeProgress\)/);
    assert.match(MOTION_RUNTIME, /function scheduleProgress\(\)\{if\(progressTick\|\|disposed\)return;progressTick=true;requestAnimationFrame\(progressFrame\);\}/);
  });

  test('before-after comparison handle advances with transform rather than a layout position', () => {
    const handleRule = MOTION_CSS.match(/\.m-signature-ready \[data-before-after-handle\] \{([^}]*)\}/)?.[1] ?? '';
    assert.match(handleRule, /transform:\s*translate3d\(calc\(100% - var\(--before-after-clip/);
    assert.doesNotMatch(handleRule, /(?:left|right):\s*calc\(/);
  });
});

describe('X5-8 mobile enforcement', () => {
  test('horizontal-story resolves vertical/static whenever any required capability fails', () => {
    const fixtureValue = X5_SIGNATURE_FIXTURES['horizontal-story'];
    const baseline = motionContextFromConfig(fixtureValue.config, 'basic', {
      playback: {
        viewportWidth: 1440, finePointer: true, hover: true, reducedMotion: false,
        saveData: false, hardwareConcurrency: 8, intersectionObserver: true,
        javascript: true, renderMode: 'desktop',
      },
    });
    assert.equal(resolveMotionSignaturePlayback('horizontal-story', baseline), 'enhanced');
    const failed = [
      { viewportWidth: 1023 }, { finePointer: false }, { hover: false }, { reducedMotion: true },
      { saveData: true }, { hardwareConcurrency: 3 }, { intersectionObserver: false },
      { javascript: false }, { renderMode: 'mobile' as const },
    ];
    for (const patch of failed) {
      const context = { ...baseline, playback: { ...baseline.playback, ...patch } };
      assert.notEqual(resolveMotionSignaturePlayback('horizontal-story', context), 'enhanced', JSON.stringify(patch));
    }
  });

  test('mobile production markup stays vertical and runtime cleans desktop enhancement on resize', () => {
    const fixtureValue = X5_SIGNATURE_FIXTURES['horizontal-story'];
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: fixtureValue.config,
      mode: 'mobile',
      tier: 'basic',
      interactive: true,
      animate: true,
    }));
    const root = parse(html);
    const stage = root.querySelector('[data-signature-id="horizontal-story"]')!;
    assert.match(html, /data-signature-id="horizontal-story"/);
    assert.match(html, /data-render-mode="mobile"/);
    assert.ok(!stage.getAttribute('class')?.includes('m-signature-ready'));
    assert.match(MOTION_RUNTIME, /if\(id==='horizontal-story'\) return !modeMobile&&w>=1024&&finePointer\(\)&&hoverCapable\(\)&&!saveData0&&cores0>=4/);
    assert.match(MOTION_RUNTIME, /if\(!ok\) clearStage\(stage\)/);
    assert.match(MOTION_RUNTIME, /listen\(window,'resize',[\s\S]*rebuildProgressNodes\(\)/);
    assert.match(MOTION_RUNTIME, /progressCandidates\(\)[\s\S]*hasAttribute\('data-motion-signature'\)&&!el\.classList\.contains\('m-signature-ready'\)/);
    assert.match(MOTION_CSS, /@media \(max-width: 1023\.98px\)[\s\S]*\[data-signature-id="horizontal-story"\][^}]*height: auto/);
    assert.match(MOTION_CSS, /max-width: 1023\.98px[\s\S]*\[data-horizontal-rail\][^}]*display: block[^}]*transform: none/);
  });
});

function provenanceRecord(overrides: Partial<CustomerAssetProvenance> = {}): CustomerAssetProvenance {
  return {
    id: BEFORE_ID,
    clientId: OWNER_ID,
    siteId: SITE_ID,
    objectPath: `${OWNER_ID}/${BEFORE_ID}.webp`,
    publicUrl: `/uploads/${BEFORE_ID}.webp`,
    mimeType: 'image/webp',
    width: 1600,
    height: 1000,
    source: 'customer-upload',
    aiGenerated: false,
    generativeEdited: false,
    caseId: CASE_ID,
    usageContext: 'beauty',
    rightsAttested: true,
    sameCaseAttested: true,
    attestedAt: '2026-07-15T00:00:00.000Z',
    createdAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('X5-9 legal and provenance defense layers', () => {
  test('asset verifier rejects URL-only, missing, AI, other owner/site, missing provenance, and medical', async () => {
    const before = provenanceRecord();
    const after = provenanceRecord({ id: AFTER_ID, objectPath: `${OWNER_ID}/${AFTER_ID}.webp`, publicUrl: `/uploads/${AFTER_ID}.webp` });
    const records = new Map([[BEFORE_ID, before], [AFTER_ID, after]]);
    const registry: CustomerAssetRegistry = {
      async create() { throw new Error('not used'); },
      async bindToSite() { throw new Error('not used'); },
      async getById(assetId) { return records.get(assetId) ?? null; },
    };
    const base = { beforeAssetId: BEFORE_ID, afterAssetId: AFTER_ID, clientId: OWNER_ID, siteId: SITE_ID, usageContext: 'beauty' as const };
    assert.deepEqual(await verifyBeforeAfterAssetIds(registry, { ...base, beforeAssetId: 'https://copied.example/before.webp' }), {
      ok: false, code: 'ASSET_ID_REQUIRED', message: '공개 URL이 아니라 업로드 응답의 assetId 두 개가 필요합니다.',
    });
    assert.equal((await verifyBeforeAfterAssetIds(registry, { ...base, afterAssetId: '44444444-4444-4444-8444-444444444444' })).ok, false);
    assert.equal(verifyResolvedBeforeAfterAssets({ ...before, aiGenerated: true, source: 'ai-generated' }, after, base).ok, false);
    assert.equal(verifyResolvedBeforeAfterAssets(before, after, { ...base, clientId: 'other-user' }).ok, false);
    assert.equal(verifyResolvedBeforeAfterAssets(before, after, { ...base, siteId: 'other-site' }).ok, false);
    assert.equal(verifyResolvedBeforeAfterAssets({ ...before, objectPath: '' }, after, base).ok, false);
    assert.equal(verifyResolvedBeforeAfterAssets({ ...before, rightsAttested: false }, after, base).ok, false);
    assert.equal(verifyResolvedBeforeAfterAssets(before, after, { ...base, usageContext: 'medical' }).ok, false);
    assert.equal(verifyResolvedBeforeAfterAssets(before, after, base).ok, true);
  });

  test('API schema, sanitizer, renderer, and publish audit all fail closed for invalid persisted pairs', async () => {
    const validFixture = X5_SIGNATURE_FIXTURES['before-after-scrub'];
    assert.equal(siteConfigSchema.safeParse(validFixture.config).success, true);

    const urlOnly = structuredClone(validFixture.config);
    const urlScene = urlOnly.motion!.signatures![0];
    assert.equal(urlScene.signatureId, 'before-after-scrub');
    if (urlScene.signatureId === 'before-after-scrub') urlScene.before.assetId = 'https://copied.example/before.webp';
    assert.equal(siteConfigSchema.safeParse(urlOnly).success, false, 'URL is never an asset record ID');

    const aiPair = structuredClone(validFixture.config);
    const aiScene = aiPair.motion!.signatures![0];
    if (aiScene.signatureId === 'before-after-scrub') aiScene.before.provenance = 'ai-generated' as 'customer-provided';
    assert.equal(siteConfigSchema.safeParse(aiPair).success, false, 'API must reject AI before/after media');

    const medical = structuredClone(validFixture.config);
    medical.meta.industryClass = 'medical';
    assert.equal(siteConfigSchema.safeParse(medical).success, false, 'API must block canonical medical before/after');
    const medicalContext = motionContextFromConfig(medical, 'basic', {
      assets: validFixture.motionAssets, ownerId: OWNER_ID, siteId: SITE_ID,
    });
    assert.equal(sanitizeMotionSignatures(medical, medicalContext).config.motion?.signatures?.length, 0);

    const unverifiedRenderer = renderToStaticMarkup(createElement(SiteRenderer, {
      config: validFixture.config,
      mode: 'desktop',
      tier: 'basic',
      interactive: true,
      animate: true,
    }));
    assert.doesNotMatch(contentMarkup(unverifiedRenderer), /data-motion-signature="before-after-scrub"/);

    const validHtml = await renderFixture('before-after-scrub');
    const stage = parse(validHtml).querySelector('[data-motion-signature="before-after-scrub"]')!;
    assert.equal(stage.querySelectorAll('[data-before-after-label="actual-case"][data-non-removable="true"]').length, 1);
    assert.ok(stage.text.includes('실제 사례'));
    assert.equal(stage.querySelectorAll('video').length, 0);
    const audit = auditPublishArtifacts(validFixture.config, 'basic', [{ pageSlug: '', html: validHtml }]);
    assert.deepEqual(
      audit.blockers.filter((blocker) => blocker.code.startsWith('before_after') || blocker.code.startsWith('motion_')),
      [],
      audit.blockers.map((blocker) => blocker.message).join('\n'),
    );
  });

  test('before-after activation path has no AI image or Veo generation dependency', () => {
    const sources = [
      readFileSync(join(process.cwd(), 'src/lib/uploads/asset-provenance.ts'), 'utf8'),
      readFileSync(join(process.cwd(), 'src/lib/motion/before-after-activation.ts'), 'utf8'),
      readFileSync(join(process.cwd(), 'src/components/site-renderer/MotionSignatureRenderer.tsx'), 'utf8'),
    ].join('\n');
    assert.doesNotMatch(sources, /from ['"]@\/lib\/(?:ai\/|design\/image-generation)|generateHeroVideo|generateImage|VeoClient/);
  });
});

describe('X5 publishing audit integration', () => {
  for (const id of PRODUCTION_MOTION_SIGNATURE_IDS) {
    test(`${id}: real render-static document passes motion/CWV construction audit`, async () => {
      const fixtureValue = X5_SIGNATURE_FIXTURES[id];
      const html = await renderFixture(id);
      const result = auditPublishArtifacts(fixtureValue.config, fixtureValue.tier, [{ pageSlug: '', html }]);
      const relevant = result.blockers.filter((blocker) =>
        blocker.code.startsWith('motion_') ||
        blocker.code.startsWith('before_after') ||
        blocker.code.startsWith('lcp_') ||
        blocker.code === 'hero_video_lazy' ||
        blocker.code === 'reserved_layout' ||
        blocker.code === 'blocking_external_script' ||
        blocker.code === 'static_main' ||
        blocker.code === 'static_h1' ||
        blocker.code === 'static_text',
      );
      assert.deepEqual(relevant, [], relevant.map((blocker) => `${blocker.code}: ${blocker.message}`).join('\n'));
    });
  }
});
