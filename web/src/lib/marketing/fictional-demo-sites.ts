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
import type {
  DesignCandidate,
  SectionPlanItem,
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
  video: DemoAsset & {
    encoding: '1080p-h264-yuv420p-muted-gop1';
    durationSeconds: 8;
  };
}

const demoAsset = (
  slug: FictionalDemoSlug,
  fileName: 'poster.webp' | 'hero.mp4',
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
    providedContent:
      '[소개]\n월담은 다보임의 시네마틱 연출을 설명하기 위해 만든 가상 파인다이닝 시나리오입니다.\n[안내]\n실제 매장, 셰프, 메뉴, 예약 정보를 나타내지 않습니다.',
    highlights: [
      '가상 파인다이닝 시나리오',
      '추상 이미지 한 장으로 구성',
      '실제 메뉴·매장 정보 없음',
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
    providedContent:
      '[소개]\n여백공작소는 다보임의 시네마틱 연출을 설명하기 위해 만든 가상 수공예 브랜드입니다.\n[안내]\n실제 제품, 작업실, 제작 이력, 판매 정보를 나타내지 않습니다.',
    highlights: [
      '가상 수공예 브랜드 시나리오',
      '추상 콜라주 한 장으로 구성',
      '실제 제품·제작 이력 없음',
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

const DEMO_CONTACT: SectionPlanItem = {
  type: 'contact',
  name: '데모 안내',
  brief: '실제 사업 정보와 문의 기능이 없는 가상 시나리오입니다.',
  variant: 'contact:form',
  priority: 'must',
  source: 'user',
  pageSlug: 'contact',
};

function surveyForProfile(profile: FictionalDemoProfile): SurveyInput {
  const template = resolveTemplate(profile.purposeId, profile.industry);
  const sectionPlan = planFromTemplate(template)
    .filter((section) => section.type === 'hero' || section.type === 'about')
    .map((section) => section.type === 'about'
      ? { ...section, name: '시나리오 소개' }
      : section);
  const pagePlan = pagePlanFromTemplate(template)
    .filter((page) => page.slug === '' || page.slug === 'about' || page.slug === 'contact')
    .map((page) => page.slug === 'contact'
      ? { ...page, title: '데모 안내', navLabel: '데모 안내' }
      : page);

  return canonicalizeSurveyTemplate({
    businessName: profile.businessName,
    purposeId: profile.purposeId,
    purpose: profile.purpose,
    industry: profile.industry,
    tone: [...profile.tone],
    colorPreference: profile.colorPreference,
    secondaryColor: profile.secondaryColor,
    referenceImageUrls: [],
    highlights: [...profile.highlights],
    sectionPlan: [...sectionPlan, { ...DEMO_CONTACT }],
    pagePlan,
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
    theme: blueprint.theme,
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

/** Build through the production deterministic path; never invokes an AI/provider adapter. */
export function buildFictionalDemo(slug: FictionalDemoSlug): BuiltFictionalDemo {
  const profile = FICTIONAL_DEMO_PROFILES[slug];
  const assets = FICTIONAL_DEMO_ASSETS[slug];
  const survey = surveyForProfile(profile);
  const candidate = candidateForProfile(profile, survey, assets.poster.publicPath);
  let config = buildSiteConfigFromSurvey(survey, candidate, {
    heroImageUrl: assets.poster.publicPath,
    imagePool: [],
    copy: profile.copy,
  });
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
