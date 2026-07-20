/**
 * Code-owned fictional marketing demos.
 *
 * These configs deliberately use the same deterministic candidate, config, video-attachment,
 * motion-sanitizer, schema, and production renderer contracts as a generated site. The media
 * manifest is immutable marketing-asset truth only: no tenant registry UUID, ownership, or
 * published-tenant provenance is claimed. Public path + measured bytes + SHA-256 identify these
 * code-owned marketing assets; the tenant registry is intentionally not applicable.
 */
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { applyHeroVideoToConfig } from '@/lib/ai/video-pipeline-core';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey, type SectionCopy } from '@/lib/data/site-templates';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { canonicalizeSurveyTemplate } from '@/lib/onboarding/site-classification';
import {
  composeFictionalDemoConfig,
  FICTIONAL_DEMO_CONTENT,
} from '@/lib/marketing/fictional-demo-content';
import type {
  DesignCandidate,
  SurveyInput,
} from '@/lib/types/domain';
import type {
  ProductionMotionSignatureId,
  SiteConfig,
} from '@/lib/types/site';

export const FICTIONAL_DEMO_LABEL = '데모 예시 · 가상 시나리오' as const;

export const FICTIONAL_DEMO_SLUGS = ['woldam', 'yeobaek-workshop'] as const;
export type FictionalDemoSlug = (typeof FICTIONAL_DEMO_SLUGS)[number];

type DemoAsset = {
  publicPath: string;
  mediaType: 'image' | 'video';
  origin: 'ai_generated';
  context: 'fictional_marketing_demo';
  /** Marketing assets are repository-owned; this is not a tenant asset-registry assertion. */
  registryStatus: 'code_owned_marketing_asset';
  tenantRegistry: 'not_applicable';
  bytes: number;
  sha256: string;
};

export interface FictionalDemoAssetManifest {
  poster: DemoAsset;
  /** Cost-free deterministic frames extracted from the already-paid 1080p clip. */
  stills: readonly [DemoAsset, DemoAsset, DemoAsset];
  video: DemoAsset & {
    encoding: '1080p-h264-yuv420p-muted-gop1';
    durationSeconds: 8;
  };
}

const demoAsset = (
  slug: FictionalDemoSlug,
  fileName: 'poster.webp' | 'hero.mp4' | 'still-1.webp' | 'still-2.webp' | 'still-3.webp',
  bytes: number,
  sha256: string,
): DemoAsset => ({
  publicPath: `/cases/demos/${slug}/${fileName}`,
  mediaType: fileName.endsWith('.mp4') ? 'video' : 'image',
  origin: 'ai_generated',
  context: 'fictional_marketing_demo',
  registryStatus: 'code_owned_marketing_asset',
  tenantRegistry: 'not_applicable',
  bytes,
  sha256,
});

export const FICTIONAL_DEMO_ASSETS = {
  woldam: {
    poster: demoAsset(
      'woldam',
      'poster.webp',
      38_662,
      'eab86dd4b9b1900cc3bf0a5c1ada1f182768fc64408f749b4b034de965e86b45',
    ),
    stills: [
      demoAsset('woldam', 'still-1.webp', 35_392, '40b0bad279330caffab492ef129924f3dc65ecb44df7573ba6067499b72dc03d'),
      demoAsset('woldam', 'still-2.webp', 47_726, 'e6f42e9748b8801b4c3e7ed9a590762c8283be2f462637650f31bc94ee64beec'),
      demoAsset('woldam', 'still-3.webp', 61_522, '5b6731e8cca2962c70860f745df1089db42e0ec5c63f8f47bc7c0ce80e50b938'),
    ],
    video: {
      ...demoAsset(
        'woldam',
        'hero.mp4',
        6_563_782,
        'ae92cd2784db35f2ed891292832678eee53c43611194810f5a1238f210bf3898',
      ),
      encoding: '1080p-h264-yuv420p-muted-gop1',
      durationSeconds: 8,
    },
  },
  'yeobaek-workshop': {
    poster: demoAsset(
      'yeobaek-workshop',
      'poster.webp',
      297_964,
      '22ef284a8cd62ca53db7d939ae830fbdd0efc215f2c96713dcd421c5434ee44a',
    ),
    stills: [
      demoAsset('yeobaek-workshop', 'still-1.webp', 150_238, '0c838e43d7658e25b0d14854c565397bce861091beca1e7def274437d4c02836'),
      demoAsset('yeobaek-workshop', 'still-2.webp', 124_756, 'a5af983ac97e4d1b4d1988ee92ff58f0c691050d3ff5dc6062abb75a6ec1fd09'),
      demoAsset('yeobaek-workshop', 'still-3.webp', 154_368, '96acf0cc5afaecc3451bada0cf24f0d5219a3c9351ac00cac6b7cbb26509c69d'),
    ],
    video: {
      ...demoAsset(
        'yeobaek-workshop',
        'hero.mp4',
        6_625_470,
        '1eb6cc280793a4352d198e13bc5d1b5468bb6822d644424b97d359193521cc1b',
      ),
      encoding: '1080p-h264-yuv420p-muted-gop1',
      durationSeconds: 8,
    },
  },
} as const satisfies Record<FictionalDemoSlug, FictionalDemoAssetManifest>;

interface FictionalDemoProfile {
  slug: FictionalDemoSlug;
  businessName: string;
  purposeId: SurveyInput['purposeId'];
  purpose: string;
  industry: string;
  tone: string[];
  colorPreference: string;
  secondaryColor: string;
  imageDirectionId: NonNullable<SurveyInput['imageDirectionId']>;
  candidateId: string;
  signatureId: Extract<ProductionMotionSignatureId, 'scrollytelling-manifesto' | 'cinematic-scrub'>;
  motionLabel: string;
  tagline: string;
  siteGoal: NonNullable<SurveyInput['siteGoal']>;
  providedContent: string;
  highlights: [string, string, string];
  copy: SectionCopy;
  metaDescription: string;
}

export const FICTIONAL_DEMO_PROFILES = {
  woldam: {
    slug: 'woldam',
    businessName: '월담',
    purposeId: 'local_store',
    purpose: '가상 데모 · 파인다이닝 브랜드 소개',
    industry: '파인다이닝',
    tone: ['우아한', '차분한'],
    colorPreference: '#6B2737',
    secondaryColor: '#C39A5A',
    imageDirectionId: 'abstract_editorial',
    candidateId: 'cand-dark-luxury',
    signatureId: 'scrollytelling-manifesto',
    motionLabel: '페이지 관통 시네마틱',
    tagline: '계절의 결을 천천히 보여줍니다',
    siteGoal: 'reserve',
    providedContent:
      '[소개]\n월담은 빛과 여백으로 파인다이닝의 긴 호흡을 보여주는 가상 브랜드 시나리오입니다.\n[안내]\n실제 매장, 셰프, 메뉴, 예약 정보를 나타내지 않습니다.',
    highlights: [
      '빛으로 이어지는 4막 서사',
      '제품 날조 없는 무드 중심 연출',
      '다중 페이지 정보 설계',
    ],
    copy: {
      heroKicker: '월담',
      heroTitle: '계절의 결을\n천천히 보여줍니다',
      heroSub: '실제 가게가 아닌, 시네마틱 홈페이지 연출을 위한 가상 시나리오입니다.',
      aboutTitle: '빛과 여백으로 만든 가상 장면',
      aboutBody:
        '실제 매장, 셰프, 메뉴를 재현하지 않습니다.\n한 장의 추상 이미지와 제공된 문장만으로 화면의 분위기를 구성합니다.',
    },
    metaDescription: '다보임의 매니페스토 연출을 보여주는 가상 파인다이닝 데모입니다.',
  },
  'yeobaek-workshop': {
    slug: 'yeobaek-workshop',
    businessName: '여백공작소',
    purposeId: 'company_brand',
    purpose: '가상 데모 · 수공예 브랜드 소개',
    industry: '수공예 조명 브랜드',
    tone: ['따뜻한', '미니멀'],
    colorPreference: '#B8613B',
    secondaryColor: '#2F6F68',
    imageDirectionId: 'illustration_collage',
    candidateId: 'cand-warm-cozy',
    signatureId: 'cinematic-scrub',
    motionLabel: '스크롤 시네마틱',
    tagline: '종이의 결이 빛의 움직임이 됩니다',
    siteGoal: 'trust',
    providedContent:
      '[소개]\n여백공작소는 종이의 결, 빛, 그림자로 따뜻한 브랜드 경험을 보여주는 가상 수공예 시나리오입니다.\n[안내]\n실제 제품, 작업실, 제작 이력, 판매 정보를 나타내지 않습니다.',
    highlights: [
      '종이 질감을 살린 시네마틱 스크럽',
      '한글 가독성을 지키는 안전 폰트',
      '고객 개입형 제작 흐름',
    ],
    copy: {
      heroKicker: '여백공작소',
      heroTitle: '종이의 결이\n빛의 움직임이 됩니다',
      heroSub: '실제 브랜드가 아닌, 시네마틱 홈페이지 연출을 위한 가상 시나리오입니다.',
      aboutTitle: '종이와 빛으로 만든 가상 장면',
      aboutBody:
        '실제 제품이나 작업실을 재현하지 않습니다.\n한 장의 추상 콜라주와 제공된 문장만으로 화면의 리듬을 구성합니다.',
    },
    metaDescription: '다보임의 시네마틱 스크럽을 보여주는 가상 수공예 브랜드 데모입니다.',
  },
} as const satisfies Record<FictionalDemoSlug, FictionalDemoProfile>;

function surveyForProfile(profile: FictionalDemoProfile): SurveyInput {
  const template = resolveTemplate(profile.purposeId, profile.industry);
  const hero = planFromTemplate(template).find((section) => section.type === 'hero');
  const home = pagePlanFromTemplate(template).find((page) => page.slug === '');
  if (!hero || !home) throw new Error(`FICTIONAL_DEMO_TEMPLATE_HOME_MISSING:${profile.slug}`);

  return canonicalizeSurveyTemplate({
    businessName: profile.businessName,
    purposeId: profile.purposeId,
    purpose: profile.purpose,
    industry: profile.industry,
    tone: [...profile.tone],
    colorPreference: profile.colorPreference,
    secondaryColor: profile.secondaryColor,
    referenceImageUrls: [],
    siteGoal: profile.siteGoal,
    highlights: [...profile.highlights],
    // The production builder supplies the hero shell and theme. Rich demo pages are composed
    // afterwards from explicitly authored, fact-safe content instead of generic fake claims.
    sectionPlan: [{ ...hero }],
    pagePlan: [{ ...home }],
    templateId: template.id,
    tagline: profile.tagline,
    conceptMode: 'fictional',
    imageDirectionId: profile.imageDirectionId,
    contentMode: 'provided',
    providedContent: profile.providedContent,
    heroImageChoice: 'ai-1',
    videoAddon: true,
    signatureId: profile.signatureId,
    mode: 'fresh',
  });
}

function candidateForProfile(
  profile: FictionalDemoProfile,
  survey: SurveyInput,
  posterPath: string,
): DesignCandidate {
  const blueprint = buildCandidateBlueprints(survey)
    .find((candidate) => candidate.id === profile.candidateId);
  if (!blueprint) {
    throw new Error(`FICTIONAL_DEMO_CANDIDATE_MISSING:${profile.slug}:${profile.candidateId}`);
  }
  return {
    id: blueprint.id,
    label: blueprint.label,
    style: blueprint.style,
    ...(blueprint.imageDirectionId ? { imageDirectionId: blueprint.imageDirectionId } : {}),
    heroImageUrl: posterPath,
    theme: {
      ...blueprint.theme,
      // Avoid Latin-only/synthetic Korean fallback in the public demo routes.
      fonts: { ...FICTIONAL_DEMO_CONTENT[profile.slug].fonts },
    },
    description: blueprint.description,
  };
}

function attachMeasuredVideoBytes(config: SiteConfig, bytes: number): SiteConfig {
  return {
    ...config,
    pages: config.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => section.type === 'hero' && section.background.video
        ? {
            ...section,
            background: {
              ...section.background,
              video: { ...section.background.video, bytes },
            },
          }
        : section),
    })),
  };
}

export interface BuiltFictionalDemo {
  slug: FictionalDemoSlug;
  label: typeof FICTIONAL_DEMO_LABEL;
  survey: SurveyInput;
  candidate: DesignCandidate;
  config: SiteConfig;
  assets: FictionalDemoAssetManifest;
}

/**
 * Marketing demo routes live below `/cases/demo/:slug`, while a generated tenant stores
 * ordinary root-relative links such as `/about#sec-about`. Keep the persisted production
 * meaning intact and adapt only the temporary preview projection. External URLs and hash-only
 * anchors are never rewritten.
 */
export function configForFictionalDemoPreview(demo: BuiltFictionalDemo): SiteConfig {
  const knownPaths = new Set(demo.config.pages.map((page) => page.slug ? `/${page.slug}` : '/'));
  const prefix = `/cases/demo/${demo.slug}`;
  const previewHref = (href: string): string => {
    if (!href.startsWith('/') || href.startsWith('//')) return href;
    const match = /^(\/[^?#]*)([?#].*)?$/u.exec(href);
    if (!match || !knownPaths.has(match[1] || '/')) return href;
    const pathname = match[1] === '/' ? '' : match[1];
    return `${prefix}${pathname}${match[2] ?? ''}`;
  };

  return {
    ...demo.config,
    pages: demo.config.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        elements: section.elements.map((element) => element.kind === 'button'
          ? { ...element, href: previewHref(element.href) }
          : element),
      })),
    })),
  };
}

export function fictionalDemoHref(slug: FictionalDemoSlug, pageSlug = ''): string {
  return `/cases/demo/${slug}${pageSlug ? `/${pageSlug}` : ''}`;
}

/** Build through the production deterministic path; never invokes an AI/provider adapter. */
export function buildFictionalDemo(slug: FictionalDemoSlug): BuiltFictionalDemo {
  const profile = FICTIONAL_DEMO_PROFILES[slug];
  const assets = FICTIONAL_DEMO_ASSETS[slug];
  const survey = surveyForProfile(profile);
  const candidate = candidateForProfile(profile, survey, assets.poster.publicPath);
  let config = buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl: assets.poster.publicPath,
    imagePool: assets.stills.map((asset) => asset.publicPath),
    copy: profile.copy,
  });
  config = composeFictionalDemoConfig(config, FICTIONAL_DEMO_CONTENT[slug]);
  config = {
    ...config,
    meta: { ...config.meta, description: profile.metaDescription },
  };
  config = applyHeroVideoToConfig(config, assets.video.publicPath, assets.poster.publicPath);
  config = attachMeasuredVideoBytes(config, assets.video.bytes);
  config = applyGeneratedMotion(
    config,
    survey.purposeId,
    'premium',
    {
      signatureId: profile.signatureId,
      heroImageChoice: 'ai-1',
      videoAddon: true,
      heroTechnique: 'video-hero',
      intensity: 'normal',
    },
    survey,
  );

  return {
    slug,
    label: FICTIONAL_DEMO_LABEL,
    survey,
    candidate,
    config: siteConfigSchema.parse(config),
    assets,
  };
}

export function fictionalDemoForSlug(slug: string): BuiltFictionalDemo | null {
  return (FICTIONAL_DEMO_SLUGS as readonly string[]).includes(slug)
    ? buildFictionalDemo(slug as FictionalDemoSlug)
    : null;
}
