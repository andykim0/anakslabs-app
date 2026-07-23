/**
 * Motion signatures v2 — page-level motion policy and its single source of truth.
 *
 * A signature is a production layout/progress contract, not an onboarding thumbnail or
 * a video prompt. New sites may only select registry entries exposed by
 * motionSignaturesForContext(); persisted legacy heroMotionId/preset values keep their
 * existing renderer path and are deliberately not translated here.
 */
import { resolveTemplate } from '@/lib/data/site-blueprints';
import { hasVideoAddon } from '@/lib/services/entitlements';
import {
  ACTIVE_SIGNATURE_CONTRACTS,
  type SignatureContract,
} from '@/lib/motion/signature-contract';
import type { SitePurposeId, SurveyInput } from '@/lib/types/domain';
import type {
  ActiveMotionSignatureId,
  CandidateMotionSignatureId,
  LegacyMotionSignatureId,
  MotionIndustryClass,
  MotionIntensity,
  MotionScene,
  MotionSignatureId,
  MotionTier,
  ProductionMotionSignatureId,
  SectionType,
  SiteConfig,
  SiteTheme,
} from '@/lib/types/site';

export const ACTIVE_MOTION_SIGNATURE_IDS = [
  'cinematic-scrub',
  'scrollytelling-manifesto',
  'true-card-stack',
  'scroll-curtain',
  'path-journey',
] as const satisfies readonly ActiveMotionSignatureId[];

export const CANDIDATE_MOTION_SIGNATURE_IDS = [
  'sticky-chapters',
  'portal-zoom',
  'before-after-scrub',
  'horizontal-story',
  'mosaic-reveal',
] as const satisfies readonly CandidateMotionSignatureId[];

export const PRODUCTION_MOTION_SIGNATURE_IDS = [
  ...ACTIVE_MOTION_SIGNATURE_IDS,
  ...CANDIDATE_MOTION_SIGNATURE_IDS,
] as const satisfies readonly ProductionMotionSignatureId[];

export const LEGACY_MOTION_SIGNATURE_IDS = [
  'boomerang-loop',
  'slow-zoom',
  'parallax-depth',
  'count-up',
  'spotlight',
  'stacking-cards',
  'micro-hover',
] as const satisfies readonly LegacyMotionSignatureId[];

export type MotionSignatureStatus = 'active' | 'candidate' | 'legacy';
export type MotionSignatureTarget = 'hero' | 'section' | 'page';
export type MotionMediaCapability =
  | 'none'
  | 'image'
  | 'image-or-video'
  | 'video-required'
  | 'verified-customer-images-only';

export interface MotionSignaturePurposePolicy {
  purposeIds: readonly SitePurposeId[];
  templateIds: readonly string[];
  industryClasses: readonly MotionIndustryClass[];
  blockedIndustryClasses: readonly MotionIndustryClass[];
}

export interface MotionContentFitRule {
  strategy: 'hero-media' | 'page-sections' | 'section-items' | 'verified-pair';
  min: number;
  max: number;
}

export interface MotionSignatureSpec {
  id: MotionSignatureId;
  status: MotionSignatureStatus;
  label: string;
  description: string;
  tier: MotionTier;
  target: MotionSignatureTarget;
  minItems: number;
  maxItems: number;
  supportedSectionTypes: readonly SectionType[];
  mediaCapability: MotionMediaCapability;
  policy: MotionSignaturePurposePolicy;
  contentFit: MotionContentFitRule;
  desktopPlayback: string;
  mobileFallback: string;
  reducedMotionFallback: string;
  noJsFallback: string;
  basicTierFallback: string;
  signatureUnits: 1;
  sticky: boolean;
  /** Active entries author this contract; candidate/legacy entries only accept the schema for later promotion. */
  contract?: SignatureContract;
}

const ANY_POLICY: MotionSignaturePurposePolicy = {
  purposeIds: [],
  templateIds: [],
  industryClasses: [],
  blockedIndustryClasses: [],
};

const spec = <T extends MotionSignatureSpec>(value: T): T => value;

/** Active, candidate, and legacy IDs share one auditable catalog. */
export const MOTION_SIGNATURES = {
  'cinematic-scrub': spec({
    id: 'cinematic-scrub', status: 'active', label: '시네마틱 스크럽',
    description: '고정 히어로의 실제 영상 재생헤드를 데스크톱 스크롤 진행도에 연결합니다.',
    tier: 'premium', target: 'hero', minItems: 1, maxItems: 1,
    supportedSectionTypes: ['hero'], mediaCapability: 'video-required', policy: ANY_POLICY,
    contentFit: { strategy: 'hero-media', min: 1, max: 1 },
    desktopPlayback: 'sticky video currentTime scrub with seek-failure loop fallback',
    mobileFallback: 'poster-first muted pinned loop without seeking',
    reducedMotionFallback: 'static poster and immediately visible copy',
    noJsFallback: 'static poster and semantic hero copy', basicTierFallback: 'ken-burns',
    signatureUnits: 1, sticky: true, contract: ACTIVE_SIGNATURE_CONTRACTS['cinematic-scrub'],
  }),
  'scrollytelling-manifesto': spec({
    id: 'scrollytelling-manifesto', status: 'active', label: '매니페스토',
    description: '영상 하나를 고정하고 3~5개의 정적 서사 막을 페이지 진행도에 맞춰 전환합니다.',
    tier: 'premium', target: 'page', minItems: 3, maxItems: 5,
    supportedSectionTypes: ['hero'], mediaCapability: 'video-required',
    policy: {
      purposeIds: [],
      templateIds: [
        'company_brand.default',
        'company_brand.professional_firm',
        'local_store.fine_dining',
        'portfolio.default',
      ],
      industryClasses: [], blockedIndustryClasses: ['medical'],
    },
    contentFit: { strategy: 'page-sections', min: 3, max: 5 },
    desktopPlayback: 'one sticky video stage with progress-banded semantic acts',
    mobileFallback: 'pinned loop with normal vertical act reading',
    reducedMotionFallback: 'poster followed by a normal semantic article stack',
    noJsFallback: 'poster followed by all acts in document order', basicTierFallback: 'ken-burns',
    signatureUnits: 1, sticky: true, contract: ACTIVE_SIGNATURE_CONTRACTS['scrollytelling-manifesto'],
  }),
  'sticky-chapters': spec({
    id: 'sticky-chapters', status: 'candidate', label: '스티키 챕터',
    description: '고정 미디어 옆에서 3~5개의 실제 섹션이 정상 문서 흐름으로 읽히며 장면을 바꿉니다.',
    tier: 'basic', target: 'page', minItems: 3, maxItems: 5,
    supportedSectionTypes: ['hero'], mediaCapability: 'image-or-video',
    policy: {
      purposeIds: [],
      templateIds: [
        'company_brand.default',
        'company_brand.professional_firm',
        'local_store.fine_dining',
      ],
      industryClasses: [], blockedIndustryClasses: ['medical'],
    },
    contentFit: { strategy: 'page-sections', min: 3, max: 5 },
    desktopPlayback: 'sticky media column with IntersectionObserver chapter activation',
    mobileFallback: 'normal vertical chapter stack without pin or scrub',
    reducedMotionFallback: 'normal vertical chapter stack with all content visible',
    noJsFallback: 'semantic section stack in source order', basicTierFallback: 'scroll-reveal',
    signatureUnits: 1, sticky: true,
  }),
  'true-card-stack': spec({
    id: 'true-card-stack', status: 'active', label: '카드 스택',
    description: '3~6개의 실제 문서-flow 카드가 position:sticky로 차례로 앞 카드를 덮습니다.',
    tier: 'basic', target: 'section', minItems: 3, maxItems: 6,
    supportedSectionTypes: ['menu', 'features', 'pricing', 'gallery', 'cases'],
    mediaCapability: 'image', policy: ANY_POLICY,
    contentFit: { strategy: 'section-items', min: 3, max: 6 },
    desktopPlayback: 'native sticky cards with restrained previous-card scale depth',
    mobileFallback: 'normal vertical card list in DOM and focus order',
    reducedMotionFallback: 'normal vertical card list', noJsFallback: 'normal vertical card list',
    basicTierFallback: 'scroll-reveal', signatureUnits: 1, sticky: true,
    contract: ACTIVE_SIGNATURE_CONTRACTS['true-card-stack'],
  }),
  'portal-zoom': spec({
    id: 'portal-zoom', status: 'candidate', label: '포털 줌',
    description: '중앙 미디어 포털이 transform·clip-path로 확장된 뒤 다음 의미 장면을 드러냅니다.',
    tier: 'basic', target: 'page', minItems: 2, maxItems: 3,
    supportedSectionTypes: ['hero'], mediaCapability: 'image-or-video',
    policy: {
      purposeIds: ['company_brand', 'portfolio'], templateIds: [],
      industryClasses: ['brand', 'portfolio', 'photography'], blockedIndustryClasses: ['medical'],
    },
    contentFit: { strategy: 'page-sections', min: 2, max: 3 },
    desktopPlayback: 'central transform and clip-path expansion with stable reading bands',
    mobileFallback: 'vertical editorial media and text scenes',
    reducedMotionFallback: 'vertical editorial scenes without clipping',
    noJsFallback: 'semantic vertical scenes', basicTierFallback: 'mask-reveal',
    signatureUnits: 1, sticky: true,
  }),
  'scroll-curtain': spec({
    id: 'scroll-curtain', status: 'active', label: '스크롤 커튼',
    description: '하나의 공유 진행도로 2~4개 의미 장면의 전경을 걷어 다음 장면을 드러냅니다.',
    tier: 'basic', target: 'page', minItems: 2, maxItems: 4,
    supportedSectionTypes: ['hero'], mediaCapability: 'image-or-video',
    policy: {
      purposeIds: ['company_brand', 'portfolio'], templateIds: [],
      industryClasses: ['brand', 'portfolio', 'photography'], blockedIndustryClasses: ['medical'],
    },
    contentFit: { strategy: 'page-sections', min: 2, max: 4 },
    desktopPlayback: 'shared progress clip/transform curtain; final scene always fully open',
    mobileFallback: 'vertical scenes with optional one-shot mask reveal',
    reducedMotionFallback: 'fully open vertical scenes', noJsFallback: 'fully visible semantic scene stack',
    basicTierFallback: 'mask-reveal', signatureUnits: 1, sticky: true,
    contract: ACTIVE_SIGNATURE_CONTRACTS['scroll-curtain'],
  }),
  'mosaic-reveal': spec({
    id: 'mosaic-reveal', status: 'candidate', label: '모자이크 리빌',
    description: '6~12개의 캡션·대체텍스트가 있는 이미지를 결정적인 CSS Grid 순서로 드러냅니다.',
    tier: 'basic', target: 'section', minItems: 6, maxItems: 12,
    supportedSectionTypes: ['gallery'], mediaCapability: 'image',
    policy: {
      purposeIds: [], templateIds: [],
      industryClasses: ['cafe', 'retail', 'photography', 'portfolio'],
      blockedIndustryClasses: ['medical'],
    },
    contentFit: { strategy: 'section-items', min: 6, max: 12 },
    desktopPlayback: 'deterministic CSS Grid tile sequence without hydration randomness',
    mobileFallback: 'one- or two-column static grid with at most one-shot reveal',
    reducedMotionFallback: 'fully visible static grid', noJsFallback: 'semantic figure grid',
    basicTierFallback: 'scroll-reveal', signatureUnits: 1, sticky: false,
  }),
  'path-journey': spec({
    id: 'path-journey', status: 'active', label: '패스 저니',
    description: '3~7개의 검증된 과정 항목을 ol/li 타임라인과 transform 진행선으로 연결합니다.',
    tier: 'basic', target: 'section', minItems: 3, maxItems: 7,
    supportedSectionTypes: ['about', 'features', 'custom', 'faq'], mediaCapability: 'none',
    policy: {
      purposeIds: [], templateIds: [],
      industryClasses: ['legal', 'consulting', 'workshop', 'brand', 'medical'],
      blockedIndustryClasses: [],
    },
    contentFit: { strategy: 'section-items', min: 3, max: 7 },
    desktopPlayback: 'semantic ordered timeline with transform-only progress line',
    mobileFallback: 'single-column ordered timeline', reducedMotionFallback: 'static ordered timeline',
    noJsFallback: 'semantic ol/li timeline', basicTierFallback: 'scroll-reveal',
    signatureUnits: 1, sticky: false, contract: ACTIVE_SIGNATURE_CONTRACTS['path-journey'],
  }),
  'before-after-scrub': spec({
    id: 'before-after-scrub', status: 'candidate', label: '실제 사례 전후 비교',
    description: '같은 실제 사례의 소유권 확인 이미지 두 장만 비교하며 AI·영상 생성물을 금지합니다.',
    tier: 'basic', target: 'section', minItems: 2, maxItems: 2,
    supportedSectionTypes: ['gallery', 'cases'], mediaCapability: 'verified-customer-images-only',
    policy: {
      purposeIds: [], templateIds: [], industryClasses: ['beauty', 'remodeling'],
      blockedIndustryClasses: ['medical'],
    },
    contentFit: { strategy: 'verified-pair', min: 2, max: 2 },
    desktopPlayback: 'scroll and accessible range control the after-image clip position',
    mobileFallback: 'labelled vertical or side-by-side real-case pair',
    reducedMotionFallback: 'labelled static real-case pair', noJsFallback: 'labelled static real-case pair',
    basicTierFallback: 'labelled static real-case pair', signatureUnits: 1, sticky: false,
  }),
  'horizontal-story': spec({
    id: 'horizontal-story', status: 'candidate', label: '가로 스토리',
    description: '충분한 데스크톱에서만 세로 진행도를 3~6개 패널의 translateX에 매핑합니다.',
    tier: 'basic', target: 'page', minItems: 3, maxItems: 6,
    supportedSectionTypes: ['hero'], mediaCapability: 'image-or-video',
    policy: {
      purposeIds: [], templateIds: [],
      industryClasses: ['brand', 'portfolio', 'photography', 'fine_dining'],
      blockedIndustryClasses: ['medical'],
    },
    contentFit: { strategy: 'page-sections', min: 3, max: 6 },
    desktopPlayback: 'native vertical progress mapped to translateX with no input interception',
    mobileFallback: 'ordinary vertical semantic sections with no signature runtime',
    reducedMotionFallback: 'ordinary vertical semantic sections',
    noJsFallback: 'ordinary vertical semantic sections', basicTierFallback: 'scroll-reveal',
    signatureUnits: 1, sticky: true,
  }),

  // Legacy entries are descriptive only. Their persisted IDs keep existing renderer behavior.
  'boomerang-loop': spec({
    id: 'boomerang-loop', status: 'legacy', label: '부메랑 루프 (레거시)',
    description: '기존 영상 프롬프트 방향. 새 사이트 선택에서 제외합니다.', tier: 'premium',
    target: 'hero', minItems: 1, maxItems: 1, supportedSectionTypes: ['hero'],
    mediaCapability: 'video-required', policy: ANY_POLICY,
    contentFit: { strategy: 'hero-media', min: 1, max: 1 },
    desktopPlayback: 'legacy cinematic hero loop', mobileFallback: 'legacy pinned loop',
    reducedMotionFallback: 'poster', noJsFallback: 'poster', basicTierFallback: 'ken-burns',
    signatureUnits: 1, sticky: false,
  }),
  'slow-zoom': spec({
    id: 'slow-zoom', status: 'legacy', label: '슬로우 줌 (레거시)',
    description: '기존 영상 프롬프트 방향. 새 사이트 선택에서 제외합니다.', tier: 'premium',
    target: 'hero', minItems: 1, maxItems: 1, supportedSectionTypes: ['hero'],
    mediaCapability: 'video-required', policy: ANY_POLICY,
    contentFit: { strategy: 'hero-media', min: 1, max: 1 },
    desktopPlayback: 'legacy cinematic hero', mobileFallback: 'legacy pinned loop',
    reducedMotionFallback: 'poster', noJsFallback: 'poster', basicTierFallback: 'ken-burns',
    signatureUnits: 1, sticky: false,
  }),
  'parallax-depth': spec({
    id: 'parallax-depth', status: 'legacy', label: '패럴럭스 깊이 (레거시)',
    description: '기존 영상 프롬프트 방향. 새 사이트 선택에서 제외합니다.', tier: 'premium',
    target: 'hero', minItems: 1, maxItems: 1, supportedSectionTypes: ['hero'],
    mediaCapability: 'video-required', policy: ANY_POLICY,
    contentFit: { strategy: 'hero-media', min: 1, max: 1 },
    desktopPlayback: 'legacy cinematic hero', mobileFallback: 'legacy pinned loop',
    reducedMotionFallback: 'poster', noJsFallback: 'poster', basicTierFallback: 'ken-burns',
    signatureUnits: 1, sticky: false,
  }),
  'count-up': spec({
    id: 'count-up', status: 'legacy', label: '카운트업 (레거시)', description: '기존 숫자 IO accent.',
    tier: 'basic', target: 'section', minItems: 1, maxItems: 3, supportedSectionTypes: ['about', 'features', 'cases'],
    mediaCapability: 'none', policy: ANY_POLICY, contentFit: { strategy: 'section-items', min: 1, max: 3 },
    desktopPlayback: 'legacy one-shot count', mobileFallback: 'static number', reducedMotionFallback: 'static number',
    noJsFallback: 'static number', basicTierFallback: 'static number', signatureUnits: 1, sticky: false,
  }),
  'spotlight': spec({
    id: 'spotlight', status: 'legacy', label: '스포트라이트 (레거시)', description: '기존 포인터 장식.',
    tier: 'premium', target: 'section', minItems: 1, maxItems: 1, supportedSectionTypes: ['custom'],
    mediaCapability: 'none', policy: ANY_POLICY, contentFit: { strategy: 'section-items', min: 1, max: 1 },
    desktopPlayback: 'legacy pointer decoration', mobileFallback: 'static', reducedMotionFallback: 'static',
    noJsFallback: 'static', basicTierFallback: 'static', signatureUnits: 1, sticky: false,
  }),
  'stacking-cards': spec({
    id: 'stacking-cards', status: 'legacy', label: '카드 등장 (레거시)',
    description: '기존 IO reveal이며 true-card-stack과 다른 의미를 유지합니다.', tier: 'premium',
    target: 'section', minItems: 3, maxItems: 99, supportedSectionTypes: ['menu', 'features', 'pricing', 'gallery', 'cases'],
    mediaCapability: 'image', policy: ANY_POLICY, contentFit: { strategy: 'section-items', min: 3, max: 99 },
    desktopPlayback: 'legacy IO reveal', mobileFallback: 'legacy vertical reveal',
    reducedMotionFallback: 'static cards', noJsFallback: 'static cards', basicTierFallback: 'scroll-reveal',
    signatureUnits: 1, sticky: false,
  }),
  'micro-hover': spec({
    id: 'micro-hover', status: 'legacy', label: '마이크로 호버 (기본 UI)',
    description: '기본 버튼 피드백으로만 유지하며 시그니처로 판매하지 않습니다.', tier: 'basic',
    target: 'section', minItems: 1, maxItems: 99, supportedSectionTypes: ['custom'],
    mediaCapability: 'none', policy: ANY_POLICY, contentFit: { strategy: 'section-items', min: 1, max: 99 },
    desktopPlayback: 'ordinary hover/focus affordance', mobileFallback: 'ordinary focus affordance',
    reducedMotionFallback: 'color-only focus affordance', noJsFallback: 'native focus affordance',
    basicTierFallback: 'native focus affordance', signatureUnits: 1, sticky: false,
  }),
} as const satisfies Record<MotionSignatureId, MotionSignatureSpec>;

export interface MotionSectionContext {
  pageId: string;
  sectionId: string;
  type: SectionType;
  itemCount: number;
  mediaCount: number;
}

/** Server-authoritative asset record projection. A URL is intentionally insufficient. */
export interface MotionAssetProvenance {
  assetId: string;
  kind: 'image' | 'video';
  source: 'customer-upload' | 'ai-generated' | 'external' | 'curated';
  ownerId: string;
  siteId: string;
  caseId?: string;
  /** Server-registry URL. Persisted scene media must match this value exactly. */
  canonicalSrc: string;
  /**
   * Optional server-generated static-export rewrite of `canonicalSrc`.
   * This projection is never accepted from API/config input; only the trusted exporter may set it.
   */
  renderSrc?: string;
  /** Registry dimensions are part of provenance and prevent geometry spoofing. */
  width: number;
  height: number;
}

export interface MotionPlaybackCapabilities {
  javascript: boolean;
  viewportWidth: number;
  finePointer: boolean;
  hover: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  hardwareConcurrency: number;
  intersectionObserver: boolean;
  renderMode: 'desktop' | 'mobile' | 'auto';
}

export type MotionContentDensity = 'sparse' | 'balanced' | 'dense';

export interface MotionContext {
  purposeId?: SitePurposeId;
  templateId?: string;
  industryClass: MotionIndustryClass;
  /** `server` only when derived from the server template/taxonomy boundary. */
  classificationSource: 'server' | 'legacy-unknown';
  availableSections: readonly MotionSectionContext[];
  assets: readonly MotionAssetProvenance[];
  ownerId?: string;
  siteId?: string;
  tier: MotionTier;
  entitlement: { videoAddon: boolean };
  playback: MotionPlaybackCapabilities;
  theme?: SiteTheme;
  contentDensity: MotionContentDensity;
  motionIntensity?: MotionIntensity;
}

const DEFAULT_PLAYBACK: MotionPlaybackCapabilities = {
  javascript: true,
  viewportWidth: 1440,
  finePointer: true,
  hover: true,
  reducedMotion: false,
  saveData: false,
  hardwareConcurrency: 8,
  intersectionObserver: true,
  renderMode: 'auto',
};

const PURPOSE_IDS: readonly SitePurposeId[] = [
  'local_store', 'booking_service', 'ecommerce', 'edu_membership', 'company_brand',
  'portfolio', 'blog_media', 'community', 'event', 'one_page',
];

function purposeIdOf(value: string | undefined): SitePurposeId | undefined {
  return value && (PURPOSE_IDS as readonly string[]).includes(value) ? value as SitePurposeId : undefined;
}

/**
 * Exact server template rules run first. Sensitive beauty/remodeling classifications are
 * never granted from free-form industry text; they require a future canonical template.
 */
export function canonicalIndustryClass(
  purposeId: SitePurposeId,
  templateId: string,
  industry: string,
): MotionIndustryClass {
  if (templateId === 'booking_service.clinic') return 'medical';
  if (templateId === 'booking_service.beauty') return 'beauty';
  if (templateId === 'company_brand.remodeling') return 'remodeling';
  if (templateId === 'local_store.fine_dining') return 'fine_dining';
  if (templateId === 'company_brand.professional_firm') return 'legal';

  const value = industry.trim().toLowerCase();
  if (purposeId === 'local_store') {
    if (/카페|베이커리|디저트|bakery|cafe/.test(value)) return 'cafe';
    if (/편집숍|소품샵|꽃집|반찬가게|정육|청과|retail|shop/.test(value)) return 'retail';
    return 'other';
  }
  if (purposeId === 'booking_service') {
    // medical precedence remains fail-closed even if a forged non-clinic template reaches this helper.
    if (/병원|의원|치과|한의원|한방|clinic|hospital|dental/.test(value)) return 'medical';
    if (/공방|원데이|workshop/.test(value)) return 'workshop';
    if (/사진|대여 스튜디오|photo|studio/.test(value)) return 'photography';
    if (/상담|법률|세무|consult/.test(value)) return 'consulting';
    return 'other';
  }
  if (purposeId === 'company_brand') return 'brand';
  if (purposeId === 'portfolio') {
    return /사진|영상|photo|video/.test(value) ? 'photography' : 'portfolio';
  }
  return 'other';
}

function surveyItemCount(survey: SurveyInput, type: SectionType): number {
  if (type === 'gallery') return survey.storePhotoUrls?.length ?? 0;
  if (['menu', 'features', 'pricing', 'cases'].includes(type)) return survey.contentItems?.length ?? 0;
  if (['about', 'custom', 'faq'].includes(type)) {
    return Math.max(survey.contentItems?.length ?? 0, survey.highlights?.length ?? 0);
  }
  if (type === 'hero') {
    return [survey.tagline, survey.providedContent, ...(survey.highlights ?? [])].filter(Boolean).length;
  }
  return 1;
}

/** Korean characters carry more semantic density per whitespace token, so count them explicitly. */
export function estimateMotionContentDensity(
  values: readonly string[],
  structuredItemCount = 0,
): MotionContentDensity {
  const joined = values.join(' ').trim();
  const hangul = (joined.match(/[\u3131-\u318e\uac00-\ud7a3]/g) ?? []).length;
  const other = joined.replace(/[\u3131-\u318e\uac00-\ud7a3\s]/g, '').length;
  const score = hangul * 1.35 + other * 0.7 + structuredItemCount * 28;
  if (score < 100) return 'sparse';
  if (score >= 360) return 'dense';
  return 'balanced';
}

export interface MotionContextOptions {
  assets?: readonly MotionAssetProvenance[];
  ownerId?: string;
  siteId?: string;
  playback?: Partial<MotionPlaybackCapabilities>;
  theme?: SiteTheme;
  motionIntensity?: MotionIntensity;
}

/** Stable onboarding/server helper. It ignores a client-supplied template/industryClass. */
export function motionContextFromSurvey(
  survey: SurveyInput,
  tier: MotionTier,
  opts: MotionContextOptions = {},
): MotionContext {
  const templateId = resolveTemplate(survey.purposeId, survey.industry).id;
  const industryClass = canonicalIndustryClass(survey.purposeId, templateId, survey.industry);
  const availableSections = survey.sectionPlan.map((section, index) => ({
    pageId: section.pageSlug || 'home',
    sectionId: `planned-${index + 1}-${section.type}`,
    type: section.type,
    itemCount: surveyItemCount(survey, section.type),
    mediaCount: section.type === 'hero'
      ? (survey.heroPhotoUrl ? 1 : 0)
      : section.type === 'gallery'
        ? (survey.storePhotoUrls?.length ?? 0)
        : (survey.contentItems?.filter((item) => Boolean(item.photoUrl)).length ?? 0),
  }));
  const densityText = [
    survey.tagline, survey.providedContent, ...(survey.highlights ?? []),
    ...(survey.contentItems ?? []).flatMap((item) => [item.name, item.description, item.price]),
  ].filter((value): value is string => Boolean(value));
  return {
    purposeId: survey.purposeId,
    templateId,
    industryClass,
    classificationSource: 'server',
    availableSections,
    assets: opts.assets ?? [],
    ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
    ...(opts.siteId ? { siteId: opts.siteId } : {}),
    tier,
    entitlement: { videoAddon: hasVideoAddon(tier) },
    playback: { ...DEFAULT_PLAYBACK, ...opts.playback },
    ...(opts.theme ? { theme: opts.theme } : {}),
    contentDensity: estimateMotionContentDensity(densityText, availableSections.reduce((sum, section) => sum + section.itemCount, 0)),
    motionIntensity: opts.motionIntensity ?? 'normal',
  };
}

/** Hosted/export/server helper. Missing persisted classification deliberately fails closed. */
export function motionContextFromConfig(
  config: SiteConfig,
  tier: MotionTier,
  opts: MotionContextOptions = {},
): MotionContext {
  const availableSections = config.pages.flatMap((page) => page.sections
    .filter((section) => !section.hidden)
    .map((section) => ({
      pageId: page.id,
      sectionId: section.id,
      type: section.type,
      itemCount: section.elements.length,
      mediaCount:
        (section.background.image?.src || section.background.video?.src ? 1 : 0) +
        section.elements.filter((element) => element.kind === 'image' || element.kind === 'video').length,
    })));
  const densityText = config.pages.flatMap((page) => page.sections.flatMap((section) =>
    section.elements.flatMap((element) => element.kind === 'text' ? [element.text] : []),
  ));
  return {
    purposeId: purposeIdOf(config.meta.purposeId),
    templateId: config.meta.templateId,
    industryClass: config.meta.industryClass ?? 'other',
    classificationSource: config.meta.industryClass ? 'server' : 'legacy-unknown',
    availableSections,
    assets: opts.assets ?? [],
    ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
    ...(opts.siteId ? { siteId: opts.siteId } : {}),
    tier,
    entitlement: { videoAddon: hasVideoAddon(tier) },
    playback: { ...DEFAULT_PLAYBACK, ...opts.playback },
    theme: opts.theme ?? config.theme,
    contentDensity: estimateMotionContentDensity(densityText, availableSections.reduce((sum, section) => sum + section.itemCount, 0)),
    motionIntensity: opts.motionIntensity ?? config.motion?.intensity ?? 'normal',
  };
}

function sceneItemCount(scene: MotionScene): number {
  switch (scene.signatureId) {
    case 'cinematic-scrub': return 1;
    case 'scrollytelling-manifesto': return scene.acts.length;
    case 'sticky-chapters': return scene.chapters.length;
    case 'true-card-stack': return scene.cards.length;
    case 'portal-zoom':
    case 'scroll-curtain': return scene.scenes.length;
    case 'mosaic-reveal': return scene.images.length;
    case 'path-journey': return scene.milestones.length;
    case 'before-after-scrub': return 2;
    case 'horizontal-story': return scene.panels.length;
  }
}

function contentFits(id: ProductionMotionSignatureId, context: MotionContext, scene?: MotionScene): boolean {
  const specValue: MotionSignatureSpec = MOTION_SIGNATURES[id];
  if (scene) {
    const count = sceneItemCount(scene);
    return count >= specValue.minItems && count <= specValue.maxItems;
  }
  if (specValue.contentFit.strategy === 'hero-media') {
    return context.availableSections.some((section) => section.type === 'hero');
  }
  if (specValue.contentFit.strategy === 'page-sections') {
    const editorial = context.availableSections.filter((section) =>
      section.type !== 'contact' && section.type !== 'cta' && section.itemCount > 0,
    );
    const needsFocalMedia = ['sticky-chapters', 'portal-zoom', 'scroll-curtain', 'horizontal-story'].includes(id);
    const count = needsFocalMedia ? editorial.filter((section) => section.mediaCount > 0).length : editorial.length;
    return count >= specValue.minItems;
  }
  if (specValue.contentFit.strategy === 'verified-pair') return hasVerifiedCustomerPair(context);
  return context.availableSections.some((section) =>
    specValue.supportedSectionTypes.includes(section.type) && section.itemCount >= specValue.minItems,
  );
}

function policyAllows(specValue: MotionSignatureSpec, context: MotionContext): boolean {
  const { policy } = specValue;
  if (policy.blockedIndustryClasses.includes(context.industryClass)) return false;
  if (policy.templateIds.length > 0 && (!context.templateId || !policy.templateIds.includes(context.templateId))) return false;
  if (policy.purposeIds.length > 0 && (!context.purposeId || !policy.purposeIds.includes(context.purposeId))) return false;
  if (policy.industryClasses.length > 0 && !policy.industryClasses.includes(context.industryClass)) return false;
  return true;
}

function hasVerifiedCustomerPair(context: MotionContext): boolean {
  if (
    context.classificationSource !== 'server' ||
    !context.ownerId || !context.siteId ||
    !['beauty', 'remodeling'].includes(context.industryClass)
  ) return false;
  const customerImages = context.assets.filter((asset) =>
    asset.kind === 'image' && asset.source === 'customer-upload' &&
    asset.ownerId === context.ownerId && asset.siteId === context.siteId && Boolean(asset.caseId),
  );
  const byCase = new Map<string, number>();
  for (const asset of customerImages) byCase.set(asset.caseId!, (byCase.get(asset.caseId!) ?? 0) + 1);
  return [...byCase.values()].some((count) => count >= 2);
}

export interface MotionEligibility {
  allowed: boolean;
  reason?: string;
}

export function canUseMotionSignature(
  id: ProductionMotionSignatureId,
  context: MotionContext,
  scene?: MotionScene,
): MotionEligibility {
  const specValue: MotionSignatureSpec = MOTION_SIGNATURES[id];
  if (specValue.tier === 'premium' && !context.entitlement.videoAddon) {
    return { allowed: false, reason: 'AI 영상 홈페이지 승인 필요' };
  }
  if (!policyAllows(specValue, context)) return { allowed: false, reason: 'purpose/template/industry policy' };
  if (!contentFits(id, context, scene)) return { allowed: false, reason: 'insufficient structured content' };
  if (id === 'before-after-scrub') {
    if (context.industryClass === 'medical') return { allowed: false, reason: 'medical before-after blocked' };
    if (context.classificationSource !== 'server') return { allowed: false, reason: 'unverified industry classification' };
    if (!hasVerifiedCustomerPair(context)) return { allowed: false, reason: 'verified customer pair required' };
    if (scene && !verifiedBeforeAfter(scene, context)) {
      return { allowed: false, reason: 'before-after asset projection mismatch' };
    }
  }
  return { allowed: true };
}

const RECOMMENDED: Record<MotionIndustryClass, readonly ProductionMotionSignatureId[]> = {
  cafe: ['mosaic-reveal', 'true-card-stack'],
  retail: ['mosaic-reveal', 'true-card-stack'],
  fine_dining: ['sticky-chapters', 'horizontal-story', 'true-card-stack', 'cinematic-scrub'],
  beauty: ['before-after-scrub', 'true-card-stack', 'path-journey'],
  medical: ['path-journey', 'true-card-stack'],
  remodeling: ['before-after-scrub', 'path-journey', 'true-card-stack'],
  legal: ['sticky-chapters', 'path-journey', 'scrollytelling-manifesto'],
  consulting: ['path-journey', 'true-card-stack'],
  workshop: ['path-journey', 'true-card-stack'],
  photography: ['mosaic-reveal', 'horizontal-story', 'portal-zoom', 'scroll-curtain'],
  brand: ['sticky-chapters', 'portal-zoom', 'scroll-curtain', 'horizontal-story'],
  portfolio: ['portal-zoom', 'scroll-curtain', 'horizontal-story', 'true-card-stack'],
  other: ['true-card-stack'],
};

/**
 * Returns only 2–4 relevant entries when that many fit. Candidate exposure is explicit;
 * default product onboarding contains promoted active signatures only.
 */
export function motionSignaturesForContext(
  context: MotionContext,
  opts: { includeCandidates?: boolean } = {},
): MotionSignatureSpec[] {
  const allowedStatuses: readonly MotionSignatureStatus[] = opts.includeCandidates
    ? ['active', 'candidate']
    : ['active'];
  const preferred = RECOMMENDED[context.industryClass];
  const order = [...preferred, ...PRODUCTION_MOTION_SIGNATURE_IDS.filter((id) => !preferred.includes(id))];
  return order
    .map((id) => MOTION_SIGNATURES[id])
    .filter((entry) => allowedStatuses.includes(entry.status) && canUseMotionSignature(entry.id as ProductionMotionSignatureId, context).allowed)
    .slice(0, 4);
}

export interface MotionArtDirectionProfile {
  signatureId: ProductionMotionSignatureId;
  artDirection:
    | 'editorial-luxury'
    | 'professional-precision'
    | 'creative-spatial'
    | 'warm-tactile'
    | 'clinical-informational';
  tempo: 'slow' | 'measured' | 'brisk';
  durationMs: number;
  easing: 'linear-progress' | 'editorial-ease' | 'soft-spring-like';
  cssEasing: string;
  depth: 'flat' | 'restrained' | 'layered';
  mediaTreatment: 'full-bleed' | 'framed' | 'masked' | 'grid' | 'comparison';
  themeTone: 'dark' | 'light';
  cornerTreatment: 'precise' | 'soft' | 'rounded';
  typographyVoice: 'serif-editorial' | 'sans-precise' | 'display-contrast';
  mediaShape: 'none' | 'wide' | 'square' | 'portrait' | 'mixed';
  itemCount: number;
  motionIntensity: MotionIntensity;
  progressWindows: {
    establish: readonly [number, number];
    progress: readonly [number, number];
    focal: readonly [number, number];
    settle: readonly [number, number];
  };
  maxScale: number;
  maxTranslationPx: number;
}

const SIGNATURE_PROGRESS_WINDOWS = {
  'cinematic-scrub': { establish: [0, 0.14], progress: [0.1, 0.62], focal: [0.5, 0.86], settle: [0.82, 1] },
  'scrollytelling-manifesto': { establish: [0, 0.12], progress: [0.08, 0.7], focal: [0.58, 0.9], settle: [0.86, 1] },
  'sticky-chapters': { establish: [0, 0.18], progress: [0.14, 0.68], focal: [0.55, 0.88], settle: [0.84, 1] },
  'true-card-stack': { establish: [0, 0.16], progress: [0.12, 0.72], focal: [0.62, 0.91], settle: [0.88, 1] },
  'portal-zoom': { establish: [0, 0.2], progress: [0.16, 0.6], focal: [0.48, 0.84], settle: [0.78, 1] },
  'scroll-curtain': { establish: [0, 0.15], progress: [0.11, 0.66], focal: [0.54, 0.89], settle: [0.85, 1] },
  'mosaic-reveal': { establish: [0, 0.22], progress: [0.18, 0.74], focal: [0.64, 0.93], settle: [0.9, 1] },
  'path-journey': { establish: [0, 0.13], progress: [0.09, 0.76], focal: [0.67, 0.92], settle: [0.89, 1] },
  'before-after-scrub': { establish: [0, 0.1], progress: [0.06, 0.8], focal: [0.7, 0.94], settle: [0.91, 1] },
  'horizontal-story': { establish: [0, 0.17], progress: [0.13, 0.69], focal: [0.57, 0.87], settle: [0.83, 1] },
} as const satisfies Record<ProductionMotionSignatureId, {
  establish: readonly [number, number];
  progress: readonly [number, number];
  focal: readonly [number, number];
  settle: readonly [number, number];
}>;

const SIGNATURE_CSS_EASING = {
  'cinematic-scrub': 'linear',
  'scrollytelling-manifesto': 'cubic-bezier(.22,.61,.36,1)',
  'sticky-chapters': 'cubic-bezier(.25,.46,.45,.94)',
  'true-card-stack': 'cubic-bezier(.2,.8,.2,1)',
  'portal-zoom': 'cubic-bezier(.65,0,.35,1)',
  'scroll-curtain': 'cubic-bezier(.77,0,.18,1)',
  'mosaic-reveal': 'cubic-bezier(.16,1,.3,1)',
  'path-journey': 'cubic-bezier(.33,1,.68,1)',
  'before-after-scrub': 'linear',
  'horizontal-story': 'cubic-bezier(.37,0,.63,1)',
} as const satisfies Record<ProductionMotionSignatureId, string>;

export type MotionSignaturePlayback = 'enhanced' | 'mobile-fallback' | 'static';

/** Capability-only playback resolution; content and eligibility are handled separately. */
export function resolveMotionSignaturePlayback(
  signatureId: ProductionMotionSignatureId,
  context: MotionContext,
): MotionSignaturePlayback {
  const capability = context.playback;
  if (!capability.javascript || capability.reducedMotion || capability.saveData || !capability.intersectionObserver) {
    return 'static';
  }
  if (signatureId === 'horizontal-story') {
    return (
      capability.viewportWidth >= 1024 && capability.finePointer && capability.hover &&
      capability.hardwareConcurrency >= 4 && capability.renderMode !== 'mobile'
    ) ? 'enhanced' : 'mobile-fallback';
  }
  if (
    capability.renderMode === 'mobile' ||
    capability.viewportWidth < (['sticky-chapters', 'portal-zoom', 'scroll-curtain'].includes(signatureId) ? 1024 : 768)
  ) return 'mobile-fallback';
  return 'enhanced';
}

function darkTheme(theme: SiteTheme | undefined): boolean {
  const value = theme?.palette.background.trim();
  const match = value && /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return false;
  const red = Number.parseInt(match[1].slice(0, 2), 16);
  const green = Number.parseInt(match[1].slice(2, 4), 16);
  const blue = Number.parseInt(match[1].slice(4, 6), 16);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 < 128;
}

function artDirectionFor(context: MotionContext): MotionArtDirectionProfile['artDirection'] {
  if (context.industryClass === 'medical') return 'clinical-informational';
  if (['legal', 'consulting', 'remodeling'].includes(context.industryClass)) return 'professional-precision';
  if (context.industryClass === 'fine_dining') return 'editorial-luxury';
  if (['brand', 'portfolio', 'photography'].includes(context.industryClass)) return 'creative-spatial';
  if (['cafe', 'retail', 'workshop', 'beauty'].includes(context.industryClass)) return 'warm-tactile';
  return 'professional-precision';
}

/** Trusted context + content density determine a restrained, deterministic production profile. */
export function resolveMotionArtDirectionProfile(
  signatureId: ProductionMotionSignatureId,
  context: MotionContext,
  scene?: MotionScene,
): MotionArtDirectionProfile {
  const dense = context.contentDensity === 'dense';
  const sparse = context.contentDensity === 'sparse';
  const slow = ['cinematic-scrub', 'scrollytelling-manifesto', 'sticky-chapters', 'portal-zoom'].includes(signatureId);
  const brisk = signatureId === 'mosaic-reveal' && dense;
  const flat = ['path-journey', 'before-after-scrub'].includes(signatureId);
  const grid = signatureId === 'mosaic-reveal';
  const comparison = signatureId === 'before-after-scrub';
  const masked = ['portal-zoom', 'scroll-curtain'].includes(signatureId);
  const fullBleed = ['cinematic-scrub', 'scrollytelling-manifesto', 'horizontal-story'].includes(signatureId);
  const dark = darkTheme(context.theme);
  const radius = context.theme?.radius ?? 0;
  const headingFont = context.theme?.fonts.heading.toLowerCase() ?? '';
  const bodyFont = context.theme?.fonts.body.toLowerCase() ?? '';
  const serifHeading = /serif|myeongjo|명조|song/.test(headingFont);
  const typographyVoice = serifHeading
    ? 'serif-editorial'
    : headingFont && bodyFont && headingFont !== bodyFont
      ? 'display-contrast'
      : 'sans-precise';
  const ratios = (scene ? sceneMedia(scene) : [])
    .filter((media): media is { width: number; height: number } => Boolean(
      media && typeof media === 'object' &&
      typeof (media as { width?: unknown }).width === 'number' &&
      typeof (media as { height?: unknown }).height === 'number',
    ))
    .map((media) => media.width / media.height);
  const shapes = new Set(ratios.map((ratio) => ratio >= 1.35 ? 'wide' : ratio <= 0.8 ? 'portrait' : 'square'));
  const mediaShape = shapes.size === 0 ? 'none' : shapes.size > 1 ? 'mixed' : [...shapes][0];
  const motionIntensity = context.motionIntensity ?? 'normal';
  const intensityFactor = motionIntensity === 'off' ? 0 : motionIntensity === 'subtle' ? 0.62 : 1;
  return {
    signatureId,
    artDirection: artDirectionFor(context),
    tempo: brisk ? 'brisk' : slow ? 'slow' : 'measured',
    durationMs: brisk ? 420 : slow ? (sparse ? 900 : 760) : (dense ? 520 : 620),
    easing: ['cinematic-scrub', 'scrollytelling-manifesto', 'horizontal-story'].includes(signatureId)
      ? 'linear-progress'
      : signatureId === 'true-card-stack'
        ? 'soft-spring-like'
        : 'editorial-ease',
    cssEasing: SIGNATURE_CSS_EASING[signatureId],
    depth: flat ? 'flat' : slow || signatureId === 'horizontal-story' ? 'layered' : 'restrained',
    mediaTreatment: comparison ? 'comparison' : grid ? 'grid' : masked ? 'masked' : fullBleed ? 'full-bleed' : 'framed',
    themeTone: dark ? 'dark' : 'light',
    cornerTreatment: radius >= 20 ? 'rounded' : radius >= 8 ? 'soft' : 'precise',
    typographyVoice,
    mediaShape,
    itemCount: scene ? sceneItemCount(scene) : 0,
    motionIntensity,
    progressWindows: SIGNATURE_PROGRESS_WINDOWS[signatureId],
    maxScale: comparison || flat ? 1 : 1 + ((slow ? (dark ? 0.09 : 0.08) : 0.04) * intensityFactor),
    maxTranslationPx: comparison ? 0 : Math.round((dense ? 24 : dark ? 36 : 40) * intensityFactor),
  };
}

function validMedia(media: unknown): boolean {
  if (!media || typeof media !== 'object') return false;
  const value = media as {
    kind?: unknown;
    src?: unknown;
    poster?: unknown;
    alt?: unknown;
    width?: unknown;
    height?: unknown;
    focalPoint?: { x?: unknown; y?: unknown };
  };
  const focalPointValid = value.focalPoint === undefined || (
    typeof value.focalPoint.x === 'number' && Number.isFinite(value.focalPoint.x) &&
    value.focalPoint.x >= 0 && value.focalPoint.x <= 1 &&
    typeof value.focalPoint.y === 'number' && Number.isFinite(value.focalPoint.y) &&
    value.focalPoint.y >= 0 && value.focalPoint.y <= 1
  );
  return (
    (value.kind === 'image' || value.kind === 'video') &&
    typeof value.src === 'string' && value.src.length > 0 &&
    typeof value.alt === 'string' && value.alt.trim().length > 0 &&
    typeof value.width === 'number' && Number.isFinite(value.width) && value.width > 0 &&
    typeof value.height === 'number' && Number.isFinite(value.height) && value.height > 0 &&
    (value.kind !== 'video' || (typeof value.poster === 'string' && value.poster.length > 0)) &&
    focalPointValid
  );
}

function sceneMedia(scene: MotionScene): readonly unknown[] {
  switch (scene.signatureId) {
    case 'cinematic-scrub': return [scene.media];
    case 'scrollytelling-manifesto': return [scene.media];
    case 'sticky-chapters': return scene.chapters.flatMap((chapter) => chapter.media ? [chapter.media] : []);
    case 'true-card-stack': return scene.cards.flatMap((card) => card.media ? [card.media] : []);
    case 'portal-zoom':
    case 'scroll-curtain': return scene.scenes.flatMap((item) => item.media ? [item.media] : []);
    case 'mosaic-reveal': return scene.images;
    case 'path-journey': return [];
    case 'before-after-scrub': return [scene.before, scene.after];
    case 'horizontal-story': return scene.panels.flatMap((panel) => panel.media ? [panel.media] : []);
  }
}

function validBandSequence(scene: MotionScene): boolean {
  if (scene.signatureId !== 'scrollytelling-manifesto') return true;
  const explicit = scene.acts.filter((act) => act.band).length;
  if (explicit === 0) return true;
  if (explicit !== scene.acts.length) return false;
  let end = 0;
  for (const [index, act] of scene.acts.entries()) {
    const band = act.band!;
    if (band[0] !== end || band[0] < 0 || band[1] > 1 || band[0] >= band[1]) return false;
    end = band[1];
    if (index === scene.acts.length - 1 && end !== 1) return false;
  }
  return true;
}

function verifiedBeforeAfter(scene: MotionScene, context: MotionContext): boolean {
  if (scene.signatureId !== 'before-after-scrub') return true;
  if (!scene.sameCaseAttested || !scene.publicationRightsAttested) return false;
  if (scene.before.assetId === scene.after.assetId || scene.before.caseId !== scene.caseId || scene.after.caseId !== scene.caseId) return false;
  return [scene.before, scene.after].every((media) => {
    const asset = context.assets.find((candidate) => candidate.assetId === media.assetId);
    return Boolean(
      asset && asset.kind === 'image' && asset.source === 'customer-upload' &&
      asset.ownerId === context.ownerId && asset.siteId === context.siteId && asset.caseId === scene.caseId &&
      (asset.canonicalSrc === media.src || asset.renderSrc === media.src) &&
      asset.width === media.width && asset.height === media.height,
    );
  });
}

function meaningful(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function distinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function signatureContentIsProductionReady(scene: MotionScene, context: MotionContext): boolean {
  switch (scene.signatureId) {
    case 'cinematic-scrub':
      return meaningful(scene.heading) && scene.media.kind === 'video';
    case 'scrollytelling-manifesto':
      return scene.acts.every((act) => meaningful(act.heading) && meaningful(act.body) && meaningful(act.id));
    case 'sticky-chapters':
      return (
        distinct(scene.chapters.map((chapter) => chapter.sourceSectionId)) &&
        scene.chapters.every((chapter) =>
          meaningful(chapter.heading) && meaningful(chapter.body) && Boolean(chapter.media),
        )
      );
    case 'true-card-stack':
      return scene.cards.every((card) => meaningful(card.id) && meaningful(card.heading) && meaningful(card.body));
    case 'portal-zoom':
      return (
        distinct(scene.scenes.map((item) => item.sourceSectionId)) &&
        scene.scenes.every((item) =>
          meaningful(item.heading) && meaningful(item.body) &&
          Boolean(item.media?.focalPoint),
        )
      );
    case 'scroll-curtain':
      return (
        distinct(scene.scenes.map((item) => item.sourceSectionId)) &&
        scene.scenes.every((item) => meaningful(item.heading) && meaningful(item.body) && Boolean(item.media))
      );
    case 'mosaic-reveal':
      return scene.images.every((image) =>
        image.kind === 'image' && image.provenance === 'customer-provided' && meaningful(image.alt),
      ) && (
        !['portfolio', 'photography'].includes(context.industryClass) ||
        scene.images.every((image) => image.provenance !== 'ai-generated')
      );
    case 'path-journey':
      return scene.milestones.every((item) => meaningful(item.id) && meaningful(item.heading) && meaningful(item.body));
    case 'before-after-scrub':
      return meaningful(scene.heading);
    case 'horizontal-story':
      return (
        distinct(scene.panels.map((panel) => panel.sourceSectionId)) &&
        scene.panels.every((panel) => meaningful(panel.heading) && meaningful(panel.body) && Boolean(panel.media))
      );
  }
}

function validateScene(scene: MotionScene, config: SiteConfig, context: MotionContext): string | null {
  const specValue: MotionSignatureSpec = MOTION_SIGNATURES[scene.signatureId];
  const page = config.pages.find((candidate) => candidate.id === scene.pageId);
  if (!page) return 'target page missing';
  const section = page.sections.find((candidate) => candidate.id === scene.sectionId && !candidate.hidden);
  if (!section) return 'target section missing';
  if (!specValue.supportedSectionTypes.includes(section.type)) return 'unsupported target section type';
  if (!contentFits(scene.signatureId, context, scene)) return 'signature item count out of range';
  if (!canUseMotionSignature(scene.signatureId, context, scene).allowed) return 'signature eligibility failed';
  if (!signatureContentIsProductionReady(scene, context)) return 'content/media fit failed';
  if (!validBandSequence(scene)) return 'invalid progress bands';
  const media = sceneMedia(scene);
  if (!media.every(validMedia)) return 'invalid or unreserved media';
  if (specValue.mediaCapability === 'video-required' && !media.some((item) =>
    Boolean(item && typeof item === 'object' && (item as { kind?: unknown }).kind === 'video'),
  )) return 'required video missing';
  if (scene.signatureId === 'mosaic-reveal' && scene.images.some((image) => image.kind !== 'image')) return 'mosaic accepts images only';
  if (!verifiedBeforeAfter(scene, context)) return 'before-after provenance rejected';
  return null;
}

/** Server sanitizer: invalid scenes disappear; first valid scene deterministically wins per page. */
export function sanitizeMotionSignatures(
  config: SiteConfig,
  context: MotionContext,
): { config: SiteConfig; changes: string[] } {
  const input = config.motion?.signatures;
  if (!input?.length) return { config, changes: [] };
  if (config.motion?.catalogVersion !== 2) {
    return {
      config: {
        ...config,
        motion: config.motion ? { ...config.motion, signatures: [] } : config.motion,
      },
      changes: ['모션 시그니처 카탈로그 버전이 없어 안전하게 모든 시그니처를 제거했습니다.'],
    };
  }
  const changes: string[] = [];
  const scenes: MotionScene[] = [];
  const pages = new Set<string>();
  for (const candidate of input) {
    const id = candidate?.signatureId;
    if (!(PRODUCTION_MOTION_SIGNATURE_IDS as readonly string[]).includes(id)) {
      changes.push(`알 수 없는 모션 시그니처 '${String(id)}'을 제거했습니다.`);
      continue;
    }
    const scene = candidate as MotionScene;
    const invalid = validateScene(scene, config, context);
    if (invalid) {
      changes.push(`모션 시그니처 '${id}'을 제거했습니다: ${invalid}.`);
      continue;
    }
    if (pages.has(scene.pageId)) {
      changes.push(`페이지 '${scene.pageId}'의 두 번째 모션 시그니처 '${id}'을 제거했습니다.`);
      continue;
    }
    pages.add(scene.pageId);
    scenes.push(scene);
  }
  if (scenes.length === input.length && changes.length === 0) return { config, changes };
  return {
    config: {
      ...config,
      motion: config.motion ? { ...config.motion, signatures: scenes } : config.motion,
    },
    changes,
  };
}

export interface MotionSignaturePlan {
  scenes: readonly MotionScene[];
  sceneByPage: ReadonlyMap<string, MotionScene>;
  changes: readonly string[];
}

/** Renderer/static-export shared accessor. It always plans from sanitized scenes. */
export function resolveMotionSignaturePlan(config: SiteConfig, context: MotionContext): MotionSignaturePlan {
  const sanitized = sanitizeMotionSignatures(config, context);
  const scenes = sanitized.config.motion?.signatures ?? [];
  return {
    scenes,
    sceneByPage: new Map(scenes.map((scene) => [scene.pageId, scene])),
    changes: sanitized.changes,
  };
}

export function isProductionMotionSignatureId(value: string): value is ProductionMotionSignatureId {
  return (PRODUCTION_MOTION_SIGNATURE_IDS as readonly string[]).includes(value);
}

export function isLegacyMotionSignatureId(value: string): value is LegacyMotionSignatureId {
  return (LEGACY_MOTION_SIGNATURE_IDS as readonly string[]).includes(value);
}
