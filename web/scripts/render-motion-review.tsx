/**
 * Deterministic browser-review corpus for the production motion renderer.
 *
 * This does not reproduce signature markup. Every document goes through the same
 * renderStaticDocument -> TenantPageContent -> SiteRenderer ->
 * MotionSignatureRenderer path used by static publishing. Output is intentionally
 * written outside public/ so the review corpus can never become a product route.
 */
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderStaticDocument } from '@/lib/export/render-static';
import { runMotionLintContractMatrix } from '@/lib/motion/motion-lint';
import { isActiveSignatureContractId } from '@/lib/motion/signature-contract';
import type { MotionAssetProvenance } from '@/lib/motion/signatures';
import {
  emptySiteConfig,
  type CanvasElement,
  type CustomerCaseMedia,
  type MotionMedia,
  type MotionScene,
  type MotionIndustryClass,
  type Section,
  type SectionType,
  type SiteConfig,
  type SiteTheme,
} from '@/lib/types/site';

const OUTPUT_DIR = process.env.MOTION_REVIEW_OUTPUT ?? '/private/tmp/daboim-motion-review';
const CONTRACT_REVIEW_ENABLED = process.env.SIGNATURE_CONTRACT_ENABLED === '1';
const OWNER_ID = 'motion-review-owner';
const SITE_ID = 'motion-review-site';
const CASE_ID = '11111111-1111-4111-8111-111111111111';
const BEFORE_ASSET_ID = '22222222-2222-4222-8222-222222222222';
const AFTER_ASSET_ID = '33333333-3333-4333-8333-333333333333';

type PaletteName = 'midnight' | 'ivory' | 'warm' | 'clinical';

const THEMES: Record<PaletteName, SiteTheme> = {
  midnight: {
    fonts: { heading: "'Noto Serif KR', serif", body: "'Pretendard', sans-serif" },
    palette: {
      background: '#07111f', surface: '#10233c', text: '#f7fbff', muted: '#b7cbe0',
      primary: '#60ded7', accent: '#75adff',
    },
    radius: 18,
  },
  ivory: {
    fonts: { heading: "'Noto Serif KR', serif", body: "'Pretendard', sans-serif" },
    palette: {
      background: '#f7f8fb', surface: '#ffffff', text: '#142239', muted: '#536279',
      primary: '#164eca', accent: '#007f79',
    },
    radius: 10,
  },
  warm: {
    fonts: { heading: "'Noto Serif KR', serif", body: "'Pretendard', sans-serif" },
    palette: {
      background: '#faf6ee', surface: '#fffdf8', text: '#271d13', muted: '#695c4d',
      primary: '#874e17', accent: '#9b3426',
    },
    radius: 24,
  },
  clinical: {
    fonts: { heading: "'Pretendard', sans-serif", body: "'Pretendard', sans-serif" },
    palette: {
      background: '#f3f9fc', surface: '#ffffff', text: '#102b3a', muted: '#4c6674',
      primary: '#075d79', accent: '#19756c',
    },
    radius: 6,
  },
};

const ASSET_SOURCES = {
  'daboim-film.mp4': 'public/daboim-visibility-film-scrub.mp4',
  'daboim-film-poster.webp': 'public/daboim-visibility-film-poster.webp',
  'brand-film.mp4': 'public/mock/clip-ember.mp4',
  'brand-film-poster.svg': 'public/mock/video-poster.svg',
  'photo.webp': 'public/onboarding/style-samples/photo.webp',
  '3d.webp': 'public/onboarding/style-samples/3d-render.webp',
  'illustration.webp': 'public/onboarding/style-samples/illustration.webp',
  'fine-dining.svg': 'public/mock/hero-hwarodam.svg',
  'fine-dining-interior.svg': 'public/mock/interior-hwarodam.svg',
  'editorial-light.svg': 'public/mock/candidate-light.svg',
  'editorial-dark.svg': 'public/mock/candidate-dark.svg',
  'mint.svg': 'public/mock/mintwash-hero.svg',
  'brand-mint.webp': 'public/reference/company_brand-centered-fresh-mint.webp',
  'brand-sky.webp': 'public/reference/company_brand-fullbleed-sky-clean.webp',
  'brand-charcoal.webp': 'public/reference/company_brand-split-charcoal-amber.webp',
  'brand-midnight.webp': 'public/reference/company_brand-split-midnight-spotlight.webp',
  'cafe-warm.webp': 'public/reference/local_store-fullbleed-warm-bakery.webp',
  'cafe-espresso.webp': 'public/reference/local_store-centered-espresso-dark.webp',
  'cafe-burgundy.webp': 'public/reference/local_store-split-burgundy-craft.webp',
  'cafe-sky.webp': 'public/reference/local_store-split-sky-clean.webp',
  'portfolio-mono.webp': 'public/reference/portfolio-split-mono-gallery.webp',
  'portfolio-sky.webp': 'public/reference/portfolio-centered-sky-clean.webp',
  'portfolio-warm.webp': 'public/reference/portfolio-centered-warm-bakery.webp',
  'portfolio-burgundy.webp': 'public/reference/portfolio-fullbleed-burgundy-craft.webp',
  'portfolio-mint.webp': 'public/reference/portfolio-fullbleed-fresh-mint.webp',
  'portfolio-charcoal.webp': 'public/reference/portfolio-split-charcoal-amber.webp',
  'retail-pastel.svg': 'public/mock/refs/pastel-soft.svg',
  'retail-organic.svg': 'public/mock/refs/forest-organic.svg',
} as const;

type AssetName = keyof typeof ASSET_SOURCES;

function asset(name: AssetName): string {
  return `/assets/${name}`;
}

function image(
  id: string,
  name: AssetName,
  alt: string,
  width: number,
  height: number,
  caption?: string,
): MotionMedia {
  return {
    id,
    kind: 'image',
    src: asset(name),
    alt,
    ...(caption ? { caption } : {}),
    width,
    height,
    focalPoint: { x: 0.5, y: 0.5 },
    provenance: 'customer-provided',
    assetId: `review-${id}`,
  };
}

function video(
  id: string,
  src: AssetName,
  poster: AssetName,
  alt: string,
  width: number,
  height: number,
): MotionMedia {
  return {
    id,
    kind: 'video',
    src: asset(src),
    poster: asset(poster),
    alt,
    width,
    height,
    focalPoint: { x: 0.5, y: 0.5 },
    provenance: 'curated',
  };
}

function text(id: string, value: string, y: number, size = 42): CanvasElement {
  return {
    id,
    kind: 'text',
    frame: { x: 96, y, w: 960, h: size * 2.8 },
    z: 2,
    text: value,
    style: { fontSize: size, fontWeight: size >= 40 ? 700 : 400, fontFamily: size >= 40 ? 'heading' : 'body', lineHeight: 1.45 },
  };
}

function canvasImage(id: string, src: string, alt: string, y = 260): CanvasElement {
  return {
    id,
    kind: 'image',
    frame: { x: 760, y, w: 560, h: 360 },
    z: 1,
    src,
    alt,
    style: { objectFit: 'cover', borderRadius: 18 },
  };
}

function section(
  id: string,
  type: SectionType,
  heading: string,
  body: string,
  imageSrc?: string,
  height = 880,
): Section {
  return {
    id,
    type,
    name: heading,
    height,
    background: {},
    elements: [text(`${id}-heading`, heading, 100), text(`${id}-body`, body, 230, 23), ...(imageSrc ? [canvasImage(`${id}-image`, imageSrc, heading)] : [])],
  };
}

function handoffSection(theme: SiteTheme): Section {
  return {
    id: 'review-handoff',
    type: 'cta',
    name: '다음 섹션 연결',
    height: 520,
    background: { color: theme.palette.surface },
    elements: [
      text('handoff-heading', '이야기 다음에도, 정보는 편안하게 이어집니다.', 90, 46),
      text('handoff-body', '시그니처가 끝난 뒤에는 일반 문서 흐름으로 돌아와 문의와 핵심 정보를 안정적으로 읽을 수 있어야 합니다.', 220, 23),
      {
        id: 'handoff-button', kind: 'button', frame: { x: 96, y: 350, w: 260, h: 62 }, z: 2,
        label: '상담 요청하기', href: '#review-handoff', style: { variant: 'solid', fontSize: 18 },
      },
    ],
  };
}

interface ReviewFixture {
  id: string;
  label: string;
  industry: string;
  theme: PaletteName;
  signatureId: MotionScene['signatureId'];
  config: SiteConfig;
  tier: 'basic' | 'premium';
  motionAssets?: readonly MotionAssetProvenance[];
  motionOwnerId?: string;
  motionSiteId?: string;
  notes: readonly string[];
}

interface FixtureInput {
  id: string;
  label: string;
  industry: string;
  theme: PaletteName;
  purposeId: string;
  templateId: string;
  industryClass: MotionIndustryClass;
  targetType: SectionType;
  scene: MotionScene;
  sections: Section[];
  tier?: 'basic' | 'premium';
  motionAssets?: readonly MotionAssetProvenance[];
  motionOwnerId?: string;
  motionSiteId?: string;
  notes: readonly string[];
}

function fixture(input: FixtureInput): ReviewFixture {
  const config = emptySiteConfig(input.label);
  config.theme = THEMES[input.theme];
  config.meta = {
    title: input.label,
    description: `${input.industry} 프로덕션 모션 검수 fixture`,
    purposeId: input.purposeId,
    templateId: input.templateId,
    industryClass: input.industryClass,
  };
  config.pages[0].sections = [...input.sections, handoffSection(config.theme)];
  config.motion = {
    presetId: 'base-calm-v2',
    intensity: 'normal',
    catalogVersion: 2,
    signatures: [input.scene],
  };
  return {
    id: input.id,
    label: input.label,
    industry: input.industry,
    theme: input.theme,
    signatureId: input.scene.signatureId,
    config,
    tier: input.tier ?? 'basic',
    ...(input.motionAssets ? { motionAssets: input.motionAssets } : {}),
    ...(input.motionOwnerId ? { motionOwnerId: input.motionOwnerId } : {}),
    ...(input.motionSiteId ? { motionSiteId: input.motionSiteId } : {}),
    notes: input.notes,
  };
}

const LONG_KOREAN = '고객의 중요한 결정을 돕는 문장은 빠르게 지나가지 않아야 합니다. 핵심 정보와 실제 근거를 충분히 읽을 수 있는 안정된 구간을 두고, 시선의 이동은 한 번에 하나의 초점만 따라가도록 절제합니다.';

const cinematicMedia = video('brand-cinematic', 'daboim-film.mp4', 'daboim-film-poster.webp', '푸른 빛의 브랜드 시네마틱 포스터', 1920, 1080);
const manifestoMedia = video('dining-manifesto', 'brand-film.mp4', 'brand-film-poster.svg', '빛이 천천히 흐르는 다이닝 공간', 1280, 720);

const legalChapterMedia = [
  image('legal-1', 'editorial-light.svg', '정돈된 법률 자문 공간', 1600, 1000),
  image('legal-2', 'brand-sky.webp', '문서 검토와 상담의 차분한 분위기', 600, 375),
  image('legal-3', 'brand-mint.webp', '기업 의사결정을 위한 정밀한 검토', 600, 375),
  image('legal-4', 'brand-charcoal.webp', '분쟁 대응 절차를 설명하는 상담 공간', 600, 375),
  image('legal-5', 'editorial-dark.svg', '장기 파트너십을 상징하는 회의 공간', 1600, 1000),
];

const cafeCards = [
  image('cafe-1', 'cafe-warm.webp', '따뜻한 창가와 원목 테이블', 600, 375),
  image('cafe-2', 'cafe-espresso.webp', '차분한 카페 실내', 600, 375),
  image('cafe-3', 'cafe-burgundy.webp', '공간의 깊이를 보여주는 좌석', 600, 375),
  image('cafe-4', 'cafe-sky.webp', '밝은 자연광이 드는 카운터', 600, 375),
  image('cafe-5', 'retail-pastel.svg', '부드러운 색감의 휴식 공간', 1600, 1000),
  image('cafe-6', 'retail-organic.svg', '자연 소재가 느껴지는 공간', 1600, 1000),
];

const portfolioMedia = [
  image('portfolio-1', 'portfolio-mono.webp', '흑백 중심의 편집 포트폴리오 표지', 600, 375, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-2', 'portfolio-sky.webp', '밝은 그리드의 포트폴리오 구성', 600, 375, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-3', 'portfolio-warm.webp', '따뜻한 톤의 포트폴리오 구성', 600, 375, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-4', 'portfolio-burgundy.webp', '버건디 톤의 포트폴리오 구성', 600, 375, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-5', 'portfolio-mint.webp', '민트 톤의 포트폴리오 구성', 600, 375, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-6', 'portfolio-charcoal.webp', '차콜 톤의 포트폴리오 구성', 600, 375, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-7', 'photo.webp', '사진 중심의 레이아웃 예시', 800, 600, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-8', '3d.webp', '입체 그래픽 중심의 레이아웃 예시', 800, 600, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-9', 'illustration.webp', '일러스트 중심의 레이아웃 예시', 800, 600, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-10', 'brand-midnight.webp', '야간 색감의 브랜드 구성', 600, 375, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-11', 'brand-mint.webp', '여백 중심의 브랜드 구성', 600, 375, '프로덕션 검수용 기존 샘플 자산'),
  image('portfolio-12', 'brand-sky.webp', '하늘색 중심의 브랜드 구성', 600, 375, '프로덕션 검수용 기존 샘플 자산'),
];

function editorialSections(prefix: string, headings: readonly string[], media: readonly MotionMedia[], target = 'hero'): Section[] {
  return headings.map((heading, index) => section(
    index === 0 ? target : `${prefix}-source-${index + 1}`,
    index === 0 ? 'hero' : index % 2 ? 'about' : 'features',
    heading,
    `${heading}에 관한 고객 제공 핵심 문장을 충분한 여백과 함께 전달합니다. ${LONG_KOREAN}`,
    media[index]?.src,
  ));
}

const beautyBefore: CustomerCaseMedia = {
  ...image('beauty-before', 'editorial-light.svg', '실제 사례 시술 전 고객 제공 사진', 1600, 1000),
  kind: 'image', provenance: 'customer-provided', assetId: BEFORE_ASSET_ID, caseId: CASE_ID,
};
const beautyAfter: CustomerCaseMedia = {
  ...image('beauty-after', 'editorial-dark.svg', '실제 사례 시술 후 고객 제공 사진', 1600, 1000),
  kind: 'image', provenance: 'customer-provided', assetId: AFTER_ASSET_ID, caseId: CASE_ID,
};
const verifiedAssets: readonly MotionAssetProvenance[] = [
  {
    assetId: BEFORE_ASSET_ID, kind: 'image', source: 'customer-upload', ownerId: OWNER_ID, siteId: SITE_ID,
    caseId: CASE_ID, canonicalSrc: beautyBefore.src, width: beautyBefore.width, height: beautyBefore.height,
  },
  {
    assetId: AFTER_ASSET_ID, kind: 'image', source: 'customer-upload', ownerId: OWNER_ID, siteId: SITE_ID,
    caseId: CASE_ID, canonicalSrc: beautyAfter.src, width: beautyAfter.width, height: beautyAfter.height,
  },
];

const FIXTURES: ReviewFixture[] = [
  fixture({
    id: 'saas-cinematic-dark', label: '다보임 AI 검색 가시성', industry: 'SaaS / 브랜드', theme: 'midnight',
    purposeId: 'company_brand', templateId: 'company_brand.default', industryClass: 'brand', targetType: 'hero', tier: 'premium',
    scene: {
      signatureId: 'cinematic-scrub', pageId: 'home', sectionId: 'hero',
      heading: '검색되는 순간부터, 선택되는 경험까지',
      body: 'SEO·AEO·GEO에 맞춘 정적 콘텐츠 위에 한 번의 집중된 시네마틱 경험을 더합니다.',
      media: cinematicMedia,
    },
    sections: [section('hero', 'hero', '검색되는 순간부터, 선택되는 경험까지', LONG_KOREAN, cinematicMedia.poster)],
    notes: ['dark theme', 'single video/poster', '1-item invariant'],
  }),
  fixture({
    id: 'fine-dining-manifesto-dark', label: '저녁의 결을 설계하는 다이닝', industry: '파인다이닝', theme: 'midnight',
    purposeId: 'local_store', templateId: 'local_store.fine_dining', industryClass: 'fine_dining', targetType: 'hero', tier: 'premium',
    scene: {
      signatureId: 'scrollytelling-manifesto', pageId: 'home', sectionId: 'hero', media: manifestoMedia,
      acts: [
        { id: 'act-1', heading: '불빛이 낮아지는 시간', body: '공간의 첫인상과 저녁의 온도를 천천히 소개합니다.' },
        { id: 'act-2', heading: '재료를 존중하는 태도', body: '메뉴를 날조하지 않고 고객이 제공한 철학과 공간의 결을 이야기합니다.' },
        { id: 'act-3', heading: '한 팀의 정교한 호흡', body: '서비스 과정과 환대의 기준을 사실에 근거해 전달합니다.' },
        { id: 'act-4', heading: '머무는 동안의 리듬', body: LONG_KOREAN },
        { id: 'act-5', heading: '당신의 저녁을 위한 초대', body: '예약이라는 다음 행동으로 차분하게 연결합니다.' },
      ],
    },
    sections: [section('hero', 'hero', '불빛이 낮아지는 시간', LONG_KOREAN, manifestoMedia.poster)],
    notes: ['editorial luxury', '5 acts (maximum)', 'dark theme'],
  }),
  fixture({
    id: 'legal-sticky-chapters-light', label: '기업의 중요한 판단을 함께하는 법률 파트너', industry: '전문 법률 사무소', theme: 'ivory',
    purposeId: 'company_brand', templateId: 'company_brand.professional_firm', industryClass: 'legal', targetType: 'hero',
    scene: {
      signatureId: 'sticky-chapters', pageId: 'home', sectionId: 'hero',
      chapters: legalChapterMedia.map((media, index) => ({
        id: `legal-chapter-${index + 1}`,
        sourceSectionId: index === 0 ? 'hero' : `legal-source-${index + 1}`,
        heading: ['상황을 정확히 듣습니다', '쟁점을 구조화합니다', '선택지를 투명하게 설명합니다', '실행 과정에 함께합니다', '긴 관계를 책임집니다'][index],
        body: `${index + 1}단계는 과장된 승소 가능성이나 결과를 약속하지 않습니다. ${LONG_KOREAN}`,
        media,
      })),
    },
    sections: editorialSections('legal', ['상황을 정확히 듣습니다', '쟁점을 구조화합니다', '선택지를 투명하게 설명합니다', '실행 과정에 함께합니다', '긴 관계를 책임집니다'], legalChapterMedia),
    notes: ['professional precision', 'long Korean copy', '5 chapters (maximum)', 'light theme'],
  }),
  fixture({
    id: 'cafe-card-stack-warm', label: '동네의 속도로 머무는 카페', industry: '카페 / 리테일', theme: 'warm',
    purposeId: 'local_store', templateId: 'local_store.default', industryClass: 'cafe', targetType: 'menu',
    scene: {
      signatureId: 'true-card-stack', pageId: 'home', sectionId: 'menu', heading: '공간을 즐기는 여섯 가지 장면',
      cards: cafeCards.map((media, index) => ({
        id: `cafe-card-${index + 1}`,
        heading: ['창가의 오전', '조용한 오후', '함께 앉는 테이블', '집중할 수 있는 자리', '천천히 쉬는 시간', '다시 찾는 저녁'][index],
        body: index === 2 ? LONG_KOREAN : '실제 공간 사진과 고객이 제공한 설명을 바탕으로 각 장면을 소개합니다.',
        caption: `${String(index + 1).padStart(2, '0')} / 06`,
        media,
      })),
    },
    sections: [section('menu', 'menu', '공간을 즐기는 여섯 가지 장면', LONG_KOREAN, cafeCards[0].src, 1100)],
    notes: ['warm tactile', 'mixed Korean copy lengths', '6 cards (maximum)'],
  }),
  fixture({
    id: 'photography-portal-dark', label: '빛과 구조 사이의 포트폴리오', industry: '사진 포트폴리오', theme: 'midnight',
    purposeId: 'portfolio', templateId: 'portfolio.default', industryClass: 'photography', targetType: 'hero',
    scene: {
      signatureId: 'portal-zoom', pageId: 'home', sectionId: 'hero',
      scenes: portfolioMedia.slice(0, 2).map((media, index) => ({
        id: `portal-scene-${index + 1}`, sourceSectionId: index === 0 ? 'hero' : 'portal-source-2',
        heading: index === 0 ? '프레임 안의 첫 장면' : '다음 시선이 열리는 순간',
        body: index === 0 ? '중앙의 미디어 경계를 분명히 세우고 다음 장면으로 공간적 연속성을 만듭니다.' : LONG_KOREAN,
        media: { ...media, focalPoint: index === 0 ? { x: 0.42, y: 0.48 } : { x: 0.62, y: 0.45 } },
      })),
    },
    sections: editorialSections('portal', ['프레임 안의 첫 장면', '다음 시선이 열리는 순간'], portfolioMedia.slice(0, 2), 'hero'),
    notes: ['creative spatial', '2 scenes (minimum)', 'focal-point variation'],
  }),
  fixture({
    id: 'saas-curtain-light', label: '복잡한 운영을 명료한 흐름으로', industry: 'SaaS / 브랜드', theme: 'ivory',
    purposeId: 'company_brand', templateId: 'company_brand.default', industryClass: 'brand', targetType: 'hero',
    scene: {
      signatureId: 'scroll-curtain', pageId: 'home', sectionId: 'hero',
      scenes: [
        ['문제를 한눈에', '흩어진 운영 현황을 한 화면에서 이해합니다.', image('curtain-1', 'brand-sky.webp', '밝은 SaaS 브랜드 장면', 600, 375)],
        ['우선순위를 선명하게', LONG_KOREAN, image('curtain-2', 'brand-mint.webp', '민트 색감의 SaaS 브랜드 장면', 600, 375)],
        ['팀의 실행을 빠르게', '필요한 다음 행동과 담당자를 명확히 연결합니다.', image('curtain-3', '3d.webp', '입체적인 SaaS 제품 분위기', 800, 600)],
        ['결과를 차분하게 확인', '과장 없이 실제 데이터를 기준으로 다음 개선을 결정합니다.', image('curtain-4', 'brand-charcoal.webp', '차콜 색감의 SaaS 브랜드 장면', 600, 375)],
      ].map(([heading, body, media], index) => ({
        id: `curtain-${index + 1}`, sourceSectionId: index === 0 ? 'hero' : `curtain-source-${index + 1}`,
        heading: heading as string, body: body as string, media: media as MotionMedia,
      })),
    },
    sections: editorialSections('curtain', ['문제를 한눈에', '우선순위를 선명하게', '팀의 실행을 빠르게', '결과를 차분하게 확인'], [
      image('curtain-s1', 'brand-sky.webp', '밝은 SaaS 브랜드 장면', 600, 375),
      image('curtain-s2', 'brand-mint.webp', '민트 색감의 SaaS 브랜드 장면', 600, 375),
      image('curtain-s3', '3d.webp', '입체적인 SaaS 제품 분위기', 800, 600),
      image('curtain-s4', 'brand-charcoal.webp', '차콜 색감의 SaaS 브랜드 장면', 600, 375),
    ], 'hero'),
    notes: ['creative spatial', '4 scenes (maximum)', 'light theme'],
  }),
  fixture({
    id: 'portfolio-mosaic-light', label: '선택한 작업을 한눈에 보는 아카이브', industry: '사진 포트폴리오', theme: 'ivory',
    purposeId: 'portfolio', templateId: 'portfolio.default', industryClass: 'photography', targetType: 'gallery',
    scene: {
      signatureId: 'mosaic-reveal', pageId: 'home', sectionId: 'gallery', heading: '작업 아카이브', images: portfolioMedia,
    },
    sections: [section('gallery', 'gallery', '작업 아카이브', '검수 자산은 실제 고객 작업으로 발행하지 않으며, 프로덕션 로딩·캡션·구도만 확인합니다.', portfolioMedia[0].src, 1400)],
    notes: ['12 images (maximum)', 'all lazy/async', 'existing repository review assets only'],
  }),
  fixture({
    id: 'medical-path-light', label: '처음 방문하는 분을 위한 진료 안내', industry: '의료 정보 안내', theme: 'clinical',
    purposeId: 'booking_service', templateId: 'booking_service.clinic', industryClass: 'medical', targetType: 'about',
    scene: {
      signatureId: 'path-journey', pageId: 'home', sectionId: 'about', heading: '방문 과정 안내',
      milestones: [
        ['01', '예약 확인', '예약 시간과 방문 전 준비 사항을 확인합니다.'],
        ['02', '접수', '본인 확인과 필요한 기본 정보를 안내에 따라 작성합니다.'],
        ['03', '대기', '순서와 예상 대기 안내를 확인합니다.'],
        ['04', '문진', '현재 불편한 점과 관련 정보를 사실대로 전달합니다.'],
        ['05', '진료·검사 안내', '의료진 설명에 따라 필요한 진료 또는 검사 절차를 안내받습니다.'],
        ['06', '설명 확인', '주의 사항과 추가 안내를 충분히 확인합니다.'],
        ['07', '다음 일정', '필요한 경우 다음 방문 일정을 안내받습니다.'],
      ].map(([caption, heading, body], index) => ({ id: `medical-step-${index + 1}`, caption, heading, body })),
    },
    sections: [section('about', 'about', '방문 과정 안내', '치료 결과나 성공률을 암시하지 않고 예약·방문·검사·정보 절차만 설명합니다.', undefined, 1400)],
    notes: ['clinical informational', '7 factual milestones (maximum)', 'no outcome claims'],
  }),
  fixture({
    id: 'beauty-before-after-light', label: '실제 고객 사례 비교 검수', industry: '뷰티', theme: 'ivory',
    purposeId: 'booking_service', templateId: 'booking_service.beauty', industryClass: 'beauty', targetType: 'cases',
    scene: {
      signatureId: 'before-after-scrub', pageId: 'home', sectionId: 'cases', heading: '같은 실제 사례의 변화',
      caseId: CASE_ID, before: beautyBefore, after: beautyAfter,
      sameCaseAttested: true, publicationRightsAttested: true,
    },
    sections: [section('cases', 'cases', '같은 실제 사례의 변화', '이 개발 검수 fixture는 정책과 렌더 경로만 확인하며 실제 고객 사례로 발행되지 않습니다.', beautyBefore.src)],
    motionAssets: verifiedAssets, motionOwnerId: OWNER_ID, motionSiteId: SITE_ID,
    notes: ['verified projection required', 'exactly 2 images', 'development fixture—not customer evidence'],
  }),
  fixture({
    id: 'remodeling-before-after-dark', label: '공간 시공 전후 비교 검수', industry: '리모델링', theme: 'midnight',
    purposeId: 'company_brand', templateId: 'company_brand.remodeling', industryClass: 'remodeling', targetType: 'cases',
    scene: {
      signatureId: 'before-after-scrub', pageId: 'home', sectionId: 'cases', heading: '같은 공간의 시공 전후',
      caseId: CASE_ID, before: beautyBefore, after: beautyAfter,
      sameCaseAttested: true, publicationRightsAttested: true,
    },
    sections: [section('cases', 'cases', '같은 공간의 시공 전후', '동일 사례·소유권·게시 권한이 서버에서 확인된 자산만 이 경로에 진입합니다.', beautyBefore.src)],
    motionAssets: verifiedAssets, motionOwnerId: OWNER_ID, motionSiteId: SITE_ID,
    notes: ['professional precision', 'dark theme', 'verified projection required'],
  }),
  fixture({
    id: 'fine-dining-horizontal-dark', label: '한 저녁을 이루는 여섯 개의 장면', industry: '파인다이닝', theme: 'midnight',
    purposeId: 'local_store', templateId: 'local_store.fine_dining', industryClass: 'fine_dining', targetType: 'hero',
    scene: {
      signatureId: 'horizontal-story', pageId: 'home', sectionId: 'hero', heading: '오늘의 저녁이 흐르는 방식',
      panels: [
        image('horizontal-1', 'fine-dining.svg', '불빛이 낮은 다이닝 공간', 1920, 1280),
        image('horizontal-2', 'fine-dining-interior.svg', '원목과 조명이 어우러진 실내', 1280, 1024),
        image('horizontal-3', 'editorial-dark.svg', '차분한 저녁의 질감', 1600, 1000),
        image('horizontal-4', 'cafe-espresso.webp', '깊은 색감의 좌석 공간', 600, 375),
        image('horizontal-5', 'brand-midnight.webp', '밤의 색감으로 정리한 장면', 600, 375),
        image('horizontal-6', 'cafe-warm.webp', '따뜻한 마지막 환대의 장면', 600, 375),
      ].map((media, index) => ({
        id: `horizontal-panel-${index + 1}`,
        sourceSectionId: index === 0 ? 'hero' : `horizontal-source-${index + 1}`,
        heading: ['도착', '공간', '대화', '집중', '여운', '다음 예약'][index],
        body: index === 3 ? LONG_KOREAN : '세로 스크롤의 흐름을 가로 장면 전환에 연결하되 읽는 순서와 문서 순서는 그대로 유지합니다.',
        media,
      })),
    },
    sections: editorialSections('horizontal', ['도착', '공간', '대화', '집중', '여운', '다음 예약'], [
      image('horizontal-s1', 'fine-dining.svg', '불빛이 낮은 다이닝 공간', 1920, 1280),
      image('horizontal-s2', 'fine-dining-interior.svg', '원목과 조명이 어우러진 실내', 1280, 1024),
      image('horizontal-s3', 'editorial-dark.svg', '차분한 저녁의 질감', 1600, 1000),
      image('horizontal-s4', 'cafe-espresso.webp', '깊은 색감의 좌석 공간', 600, 375),
      image('horizontal-s5', 'brand-midnight.webp', '밤의 색감으로 정리한 장면', 600, 375),
      image('horizontal-s6', 'cafe-warm.webp', '따뜻한 마지막 환대의 장면', 600, 375),
    ], 'hero'),
    notes: ['editorial luxury', '6 panels (maximum)', 'long Korean copy', 'desktop capability gate'],
  }),
];

function minimumCountVariant(sourceId: string, id: string, count: number): ReviewFixture {
  const source = FIXTURES.find((candidate) => candidate.id === sourceId);
  if (!source) throw new Error(`minimum fixture source missing: ${sourceId}`);
  const result = structuredClone(source);
  result.id = id;
  result.label = `${source.label} · 최소 구성`;
  result.notes = [`minimum-count production fixture (${count})`, ...source.notes];
  result.config.meta.title = result.label;
  result.config.meta.description = `${source.industry} 최소 구성 프로덕션 모션 검수 fixture`;
  const scene = result.config.motion?.signatures?.[0];
  if (!scene) throw new Error(`minimum fixture scene missing: ${sourceId}`);
  switch (scene.signatureId) {
    case 'true-card-stack':
      scene.heading = '공간을 즐기는 세 가지 장면';
      scene.cards = scene.cards.slice(0, count);
      break;
    case 'mosaic-reveal':
      scene.images = scene.images.slice(0, count);
      break;
    case 'path-journey':
      scene.milestones = scene.milestones.slice(0, count);
      break;
    case 'horizontal-story':
      scene.heading = '오늘의 저녁이 흐르는 세 가지 장면';
      scene.panels = scene.panels.slice(0, count);
      result.config.pages[0].sections = result.config.pages[0].sections.filter((candidate) => (
        candidate.id === 'hero'
        || candidate.id === 'review-handoff'
        || /^horizontal-source-[23]$/.test(candidate.id)
      ));
      break;
    default:
      throw new Error(`unsupported minimum fixture signature: ${scene.signatureId}`);
  }
  return result;
}

FIXTURES.push(
  minimumCountVariant('cafe-card-stack-warm', 'cafe-card-stack-min', 3),
  minimumCountVariant('portfolio-mosaic-light', 'portfolio-mosaic-min', 6),
  minimumCountVariant('medical-path-light', 'medical-path-min', 3),
  minimumCountVariant('fine-dining-horizontal-dark', 'fine-dining-horizontal-min', 3),
);

function reviewHeadScript(): string {
  return `<script>
(function(){
  var state={cls:0,layoutShifts:[],longTaskCount:0,maxLongTask:0,errors:[]};
  window.__motionReviewMetrics=state;
  function shiftNodeLabel(node){
    if(!node)return 'unknown';
    if(!node.getAttribute)return node.tagName||'node';
    if(node.hasAttribute('data-before-after-shell'))return 'before-after-shell';
    if(node.hasAttribute('data-before-after-viewport'))return 'before-after-viewport';
    if(node.hasAttribute('data-before-after-control'))return 'before-after-control';
    return node.getAttribute('data-before-after-frame')||node.tagName||'node';
  }
  try{new PerformanceObserver(function(list){list.getEntries().forEach(function(entry){if(entry.hadRecentInput)return;state.cls+=entry.value||0;state.layoutShifts.push({value:entry.value||0,sources:(entry.sources||[]).map(function(source){return{node:shiftNodeLabel(source.node),previousRect:source.previousRect,currentRect:source.currentRect};})});});}).observe({type:'layout-shift',buffered:true});}catch(_){}
  try{new PerformanceObserver(function(list){list.getEntries().forEach(function(entry){state.longTaskCount++;state.maxLongTask=Math.max(state.maxLongTask,entry.duration||0);});}).observe({type:'longtask',buffered:true});}catch(_){}
  window.addEventListener('error',function(event){state.errors.push(String(event.message||'window-error'));});
  window.addEventListener('unhandledrejection',function(event){state.errors.push(String(event.reason||'unhandled-rejection'));});
  window.addEventListener('load',function(){
    var value=parseFloat(new URLSearchParams(location.search).get('progress')||'0');
    if(Number.isFinite(value)&&value>0){
      requestAnimationFrame(function(){requestAnimationFrame(function(){window.scrollTo(0,Math.max(0,(document.documentElement.scrollHeight-innerHeight)*Math.min(1,value)));});});
    }
  });
})();
</script>`;
}

function reviewBadge(fixture: ReviewFixture): string {
  const notes = fixture.notes.join(' · ');
  return `<aside data-motion-review-badge style="position:fixed;right:12px;top:12px;z-index:2147483647;max-width:min(420px,calc(100vw - 24px));padding:9px 12px;border:1px solid rgba(255,255,255,.5);border-radius:8px;background:rgba(9,15,25,.9);color:#fff;font:600 11px/1.45 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.25);pointer-events:none">DEV VISUAL FIXTURE · NOT CUSTOMER EVIDENCE<br>${fixture.signatureId} · ${fixture.industry}<br><span style="font-weight:400;opacity:.8">${notes}</span></aside>`;
}

function assertRendered(fixture: ReviewFixture, html: string): void {
  const marker = `data-motion-signature="${fixture.signatureId}"`;
  if (!html.includes(marker)) {
    throw new Error(`${fixture.id}: production sanitizer/renderer did not emit ${marker}`);
  }
  if (!html.includes('window.__anaksMotionDispose')) {
    throw new Error(`${fixture.id}: production motion runtime is missing`);
  }
  if (!html.includes('<main')) {
    throw new Error(`${fixture.id}: static document is missing its semantic main`);
  }
  if (CONTRACT_REVIEW_ENABLED && isActiveSignatureContractId(fixture.signatureId) && !html.includes('data-signature-contract="1"')) {
    throw new Error(`${fixture.id}: enabled SignatureContract projection is missing`);
  }
}

async function main(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, 'assets'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });
  await mkdir(path.join(OUTPUT_DIR, 'recordings'), { recursive: true });

  for (const [name, source] of Object.entries(ASSET_SOURCES)) {
    await copyFile(path.resolve(source), path.join(OUTPUT_DIR, 'assets', name));
  }

  const manifest = [];
  let motionLintChecked = 0;
  let motionLintViolations = 0;
  for (const value of FIXTURES) {
    const poster = value.signatureId === 'cinematic-scrub'
      ? cinematicMedia.poster
      : value.signatureId === 'scrollytelling-manifesto'
        ? manifestoMedia.poster
        : undefined;
    const html = renderStaticDocument({
      config: value.config,
      tier: value.tier,
      motionOwnerId: value.motionOwnerId,
      motionSiteId: value.motionSiteId,
      motionAssets: value.motionAssets,
      siteUrl: `https://review.invalid/${value.id}`,
      fontFaceCss: 'html{font-family:system-ui,sans-serif}',
      headExtraHtml: `${poster ? `<link rel="preload" as="image" href="${poster}" fetchpriority="high">` : ''}${reviewHeadScript()}`,
      bodyAppendHtml: reviewBadge(value),
    });
    assertRendered(value, html);
    const motionLint = CONTRACT_REVIEW_ENABLED && isActiveSignatureContractId(value.signatureId)
      ? runMotionLintContractMatrix({
          signatureId: value.signatureId,
          palette: value.config.theme.palette,
          representativeContent: `${value.label} ${value.config.meta.description}`,
        })
      : undefined;
    motionLintChecked += motionLint?.checked ?? 0;
    motionLintViolations += motionLint?.violations.length ?? 0;
    if (motionLint?.violations.length) {
      throw new Error(`${value.id}: MotionLint failed: ${JSON.stringify(motionLint.violations)}`);
    }
    await writeFile(path.join(OUTPUT_DIR, `${value.id}.html`), html, 'utf8');
    manifest.push({
      id: value.id,
      label: value.label,
      industry: value.industry,
      theme: value.theme,
      signatureId: value.signatureId,
      tier: value.tier,
      notes: value.notes,
      html: `${value.id}.html`,
      ...(motionLint ? { motionLint } : {}),
    });
  }

  // Dedicated below-fold network probe: same production mosaic renderer, with a real
  // 5200px ordinary document-flow section before it. This isolates native lazy loading.
  const mosaic = FIXTURES.find((value) => value.signatureId === 'mosaic-reveal');
  if (!mosaic) throw new Error('mosaic fixture missing');
  const belowFoldConfig: SiteConfig = structuredClone(mosaic.config);
  belowFoldConfig.pages[0].sections.unshift(section(
    'network-prelude', 'about', '지연 로딩 네트워크 검수 구간',
    '모자이크를 초기 뷰포트에서 충분히 멀리 두어 offscreen 요청 여부를 관찰합니다.', undefined, 5200,
  ));
  const belowFoldHtml = renderStaticDocument({
    config: belowFoldConfig,
    tier: mosaic.tier,
    siteUrl: 'https://review.invalid/mosaic-network-probe',
    fontFaceCss: 'html{font-family:system-ui,sans-serif}',
    headExtraHtml: reviewHeadScript(),
    bodyAppendHtml: reviewBadge({ ...mosaic, id: 'mosaic-network-probe' }),
  });
  assertRendered(mosaic, belowFoldHtml);
  await writeFile(path.join(OUTPUT_DIR, 'mosaic-network-probe.html'), belowFoldHtml, 'utf8');

  await writeFile(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    rendererPath: 'renderStaticDocument -> TenantPageContent -> SiteRenderer -> MotionSignatureRenderer',
    motionLint: {
      enabled: CONTRACT_REVIEW_ENABLED,
      integration: 'src/lib/motion/motion-lint.ts via existing render-motion-review.tsx corpus',
      checked: motionLintChecked,
      violations: motionLintViolations,
    },
    outputDir: OUTPUT_DIR,
    fixtures: manifest,
    networkProbe: 'mosaic-network-probe.html',
  }, null, 2), 'utf8');

  process.stdout.write(`Rendered ${manifest.length} production motion fixtures to ${OUTPUT_DIR}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
