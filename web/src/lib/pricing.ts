import type { IndustryProfileId } from '@/lib/industry/profiles';

export const PRICING_MODEL_VERSION = 'price-v6-2026-08' as const;
export const US_ENTERPRISE_PRICING_MODEL_VERSION = 'enterprise-us-v6-2026-08' as const;
export const PREVIOUS_PRICING_MODEL_VERSION = 'industry-single-2026-07' as const;
export const LEGACY_PRICING_MODEL_VERSION = 'retainer-two-tier-v4-2026-07' as const;
/** clinic 계약이 요구하는 배포 의료광고 정책. 기존 계약 읽기 경계에서만 사용한다. */
export const CLINIC_REQUIRED_MEDICAL_AD_POLICY_VERSION = 'medical-ad-2026-07-v1' as const;

export const KO_BASIC_SETUP_LIST_KRW = 990_000;
export const KO_BASIC_SETUP_PROMOTION_KRW = 490_000;
export const KO_BASIC_PROMOTION_END_DATE = '2026-10-31' as const;
export const KO_BASIC_MAINTENANCE_MONTHLY_KRW = 29_000;
/** 과거 영상 애드온 영수증 분해용. 신규 견적·표시·주문에는 사용하지 않는다. */
export const LEGACY_VIDEO_HERO_ADDON_KRW = 200_000;
const KO_BASIC_PROMOTION_END_AT_MS = Date.parse(`${KO_BASIC_PROMOTION_END_DATE}T23:59:59.999+09:00`);

export const US_ENTERPRISE_PRICING = {
  modelVersion: US_ENTERPRISE_PRICING_MODEL_VERSION,
  setupUsd: 990,
  monthlyUsd: 990,
  availability: 'enterprise-only',
  deliverables: [
    'monthly-report',
    'blog-posts-8',
    'inquiry-booking-tracking',
    'hosting-selfedit',
  ],
} as const;

export type UsEnterpriseDeliverable = (typeof US_ENTERPRISE_PRICING.deliverables)[number];

export interface SubscriptionPriceContract {
  modelVersion: string;
  industryProfileId: IndustryProfileId;
  amountKrw: number;
  periodMonths: number;
  billingInterval: 'month';
  automaticRenewal: true;
  vatIncluded: true;
}

export interface LegacySubscriptionPriceContract {
  modelVersion: typeof LEGACY_PRICING_MODEL_VERSION;
  amountKrw: number;
  periodMonths: number;
  billingInterval: 'month';
  automaticRenewal: true;
  vatIncluded: false;
}

export type PublishSubscriptionPriceContract =
  | SubscriptionPriceContract
  | LegacySubscriptionPriceContract;

/**
 * 과거 결제·이벤트를 해석하기 위한 동결 스냅샷. 신규 견적이나 고객 UI에서
 * 소비하면 안 된다. 크레딧 문구도 역사적 행을 읽기 위해서만 보존한다.
 */
export const LEGACY_PRICING_TABLE_CATALOG = {
  [LEGACY_PRICING_MODEL_VERSION]: {
    modelVersion: LEGACY_PRICING_MODEL_VERSION,
    tiers: {
      standard: {
        id: 'standard',
        label: '스탠다드',
        availability: 'public',
        monthlyPrice: {
          modelVersion: LEGACY_PRICING_MODEL_VERSION,
          amountKrw: 150_000,
          periodMonths: 1,
          billingInterval: 'month',
          automaticRenewal: true,
        },
        included: [
          { id: 'done-for-you-site', label: '다보임이 만드는 사이트·커넥터' },
          { id: 'conversion-tracking', label: '문의·예약 전환 추적' },
          { id: 'monthly-report', label: '월간 성과 리포트' },
          { id: 'basic-search-schema', label: '기초 검색·AI 대비와 구조화 정보' },
          { id: 'hosting-operations', label: '호스팅·SSL·백업·운영' },
          { id: 'zero-cost-assets', label: '레이아웃·절차적 배경·제공 스톡 기본 포함' },
          { id: 'monthly-credits', label: '매월 2크레딧' },
        ],
      },
      premium: {
        id: 'premium',
        label: '프리미엄',
        availability: 'contact',
        monthlyPrice: {
          modelVersion: LEGACY_PRICING_MODEL_VERSION,
          amountKrw: null,
          inquiryRangeKrw: { min: 390_000, max: 490_000 },
          billingInterval: 'month',
        },
        included: [
          { id: 'standard-scope', label: '스탠다드의 모든 관리 범위' },
          { id: 'advanced-aeo', label: '고급 AEO 설계' },
          { id: 'ongoing-aeo-content', label: '지속 AEO 콘텐츠 · Phase 2' },
          { id: 'premium-credits', label: '프리미엄 생성 크레딧 포함' },
          { id: 'expanded-edit-service', label: '더 넉넉한 편집 의뢰 범위' },
        ],
      },
    },
    annualOptions: {
      standard: {
        status: 'available',
        amountKrw: 1_500_000,
        periodMonths: 12,
        freeMonths: 2,
        billingInterval: 'year',
        automaticRenewal: true,
      },
      premium: { status: 'hidden' },
    },
  },
} as const;

export const LEGACY_V4_SUBSCRIPTION_PRICE: LegacySubscriptionPriceContract = {
  modelVersion: LEGACY_PRICING_MODEL_VERSION,
  amountKrw:
    LEGACY_PRICING_TABLE_CATALOG[LEGACY_PRICING_MODEL_VERSION].tiers.standard.monthlyPrice.amountKrw,
  periodMonths:
    LEGACY_PRICING_TABLE_CATALOG[LEGACY_PRICING_MODEL_VERSION].tiers.standard.monthlyPrice.periodMonths,
  billingInterval: 'month',
  automaticRenewal: true,
  vatIncluded: false,
};

export type IndustryProfileAvailability = 'public' | 'gated';
export type IndustrySchemaType = 'HomeAndConstructionBusiness' | 'MedicalClinic';

export interface IndustryKeywordSet {
  id: string;
  label: string;
  source: 'region' | 'business_fact';
}

export interface IndustryProfile {
  id: IndustryProfileId;
  label: string;
  availability: IndustryProfileAvailability;
  setupListKrw: number;
  setupPromotionalKrw: number;
  promotionEndsOn: string;
  monthlyKrw: number;
  annualKrw: number | null;
  postsPerMonth: number;
  schemaType: IndustrySchemaType;
  requiredMedicalAdPolicyVersion?: string;
  contentRules: readonly string[];
  keywordSets: readonly IndustryKeywordSet[];
  included: readonly { id: string; label: string }[];
}

const CURRENT_INTERIOR_PROFILE: IndustryProfile = {
  id: 'interior',
  label: '베이직',
  availability: 'public',
  setupListKrw: KO_BASIC_SETUP_LIST_KRW,
  setupPromotionalKrw: KO_BASIC_SETUP_PROMOTION_KRW,
  promotionEndsOn: KO_BASIC_PROMOTION_END_DATE,
  monthlyKrw: KO_BASIC_MAINTENANCE_MONTHLY_KRW,
  annualKrw: null,
  postsPerMonth: 0,
  schemaType: 'HomeAndConstructionBusiness',
  contentRules: [],
  keywordSets: [
    { id: 'region', label: '지역', source: 'region' },
    { id: 'area-size', label: '평형', source: 'business_fact' },
  ],
  included: [
    { id: 'done-for-you-site', label: '다보임이 제작하는 홈페이지' },
    { id: 'hosting-maintenance', label: '호스팅·SSL·백업·유지' },
    { id: 'self-edit', label: '직접 편집' },
    { id: 'video-hero-included', label: '승인한 디자인의 영상 히어로 1회 생성' },
  ],
};

/**
 * 기존 industry-single 행을 재발행·환불할 때만 쓰는 읽기 전용 스냅샷.
 * 현재 PRICING_TABLE_CATALOG이나 고객 화면에는 노출하지 않는다.
 */
const PREVIOUS_INDUSTRY_PROFILES: Record<IndustryProfileId, IndustryProfile> = {
  interior: {
    ...CURRENT_INTERIOR_PROFILE,
    label: '인테리어·공간',
    setupListKrw: 0,
    setupPromotionalKrw: 0,
    promotionEndsOn: '2026-07-31',
    monthlyKrw: 490_000,
    annualKrw: 4_900_000,
    included: [],
  },
  clinic: {
    id: 'clinic',
    label: '의원·클리닉',
    availability: 'gated',
    setupListKrw: 0,
    setupPromotionalKrw: 0,
    promotionEndsOn: '2026-07-31',
    monthlyKrw: 790_000,
    annualKrw: 7_900_000,
    postsPerMonth: 0,
    schemaType: 'MedicalClinic',
    requiredMedicalAdPolicyVersion: CLINIC_REQUIRED_MEDICAL_AD_POLICY_VERSION,
    contentRules: [
      '현재 의료광고 정책 검사와 공개 활성화 게이트를 모두 통과해야 공개·발행·결제를 허용한다.',
    ],
    keywordSets: [
      { id: 'region', label: '지역', source: 'region' },
      { id: 'medical-specialty', label: '진료과목', source: 'business_fact' },
    ],
    included: [],
  },
};

export const PRICING_TABLE_CATALOG = {
  [PRICING_MODEL_VERSION]: {
    modelVersion: PRICING_MODEL_VERSION,
    vatIncluded: true,
    profiles: { interior: CURRENT_INTERIOR_PROFILE },
  },
} as const satisfies Record<string, {
  modelVersion: string;
  vatIncluded: true;
  profiles: Partial<Record<IndustryProfileId, IndustryProfile>>;
}>;

export const CURRENT_PRICING_TABLE = PRICING_TABLE_CATALOG[PRICING_MODEL_VERSION];
export const INDUSTRY_PROFILES = CURRENT_PRICING_TABLE.profiles;

export function industryProfile(
  profileId: IndustryProfileId,
  modelVersion: string = PRICING_MODEL_VERSION,
): IndustryProfile | null {
  if (modelVersion === PREVIOUS_PRICING_MODEL_VERSION) {
    return PREVIOUS_INDUSTRY_PROFILES[profileId] ?? null;
  }
  if (modelVersion !== PRICING_MODEL_VERSION) return null;
  return (INDUSTRY_PROFILES as Partial<Record<IndustryProfileId, IndustryProfile>>)[profileId]
    ?? null;
}

export function subscriptionPriceForProfile(
  profileId: IndustryProfileId,
  modelVersion: string = PRICING_MODEL_VERSION,
): SubscriptionPriceContract | null {
  const profile = industryProfile(profileId, modelVersion);
  if (!profile) return null;
  return {
    modelVersion,
    industryProfileId: profile.id,
    amountKrw: profile.monthlyKrw,
    periodMonths: 1,
    billingInterval: 'month',
    automaticRenewal: true,
    vatIncluded: true,
  };
}

/** @deprecated 신규 계약은 프로파일 ID 없이 버전만으로 가격을 해석하지 않는다. */
export function subscriptionPriceForVersion(
  modelVersion: string,
  profileId: IndustryProfileId = 'interior',
): SubscriptionPriceContract | null {
  return subscriptionPriceForProfile(profileId, modelVersion);
}

function requireSubscriptionPrice(profileId: IndustryProfileId): SubscriptionPriceContract {
  const pricing = subscriptionPriceForProfile(profileId);
  if (!pricing) throw new Error(`현재 ${profileId} 가격 프로파일이 없습니다.`);
  return pricing;
}

export const CURRENT_SUBSCRIPTION_PRICE = requireSubscriptionPrice('interior');

export function koBasicPromotionActiveAt(now: Date = new Date()): boolean {
  return Number.isFinite(now.getTime()) && now.getTime() <= KO_BASIC_PROMOTION_END_AT_MS;
}

export function koBasicSetupPriceAt(now: Date = new Date()): number {
  return koBasicPromotionActiveAt(now)
    ? KO_BASIC_SETUP_PROMOTION_KRW
    : KO_BASIC_SETUP_LIST_KRW;
}

/** 현재 신규 계약의 단일 가격 소스. */
export const PRICING = {
  modelVersion: PRICING_MODEL_VERSION,
  siteCount: 1,
  build: {
    listAmountKrw: KO_BASIC_SETUP_LIST_KRW,
    promotionalAmountKrw: KO_BASIC_SETUP_PROMOTION_KRW,
    promotionEndsOn: KO_BASIC_PROMOTION_END_DATE,
    paymentTiming: 'publish',
    vatIncluded: true,
  },
  videoHero: {
    included: true,
    includedGenerations: 1,
    generationTiming: 'admin-approval',
  },
  subscription: {
    ...CURRENT_SUBSCRIPTION_PRICE,
    /** 동면 중인 레거시 서비스가 읽어도 신규 지급을 만들지 않게 0으로 고정한다. */
    creditsPerMonth: 0,
    reportFrequency: 'none',
    annualCommitment: { status: 'unavailable' },
  },
  profiles: INDUSTRY_PROFILES,
  usEnterprise: US_ENTERPRISE_PRICING,
  selfEdit: 'unlimited-free',
} as const;

/** 과거 제작비·구독 증거를 읽기 위한 불변 스냅샷. 신규 주문에 사용하지 않는다. */
export const LEGACY_PRICING = {
  build: { list: 590_000, launch: 390_000 },
  subscriptionMonthly: 29_900,
  videoHeroAddon: LEGACY_VIDEO_HERO_ADDON_KRW,
} as const;

export const PUBLISH_PAYMENT_COPY = {
  lead: '완성된 결과를 확인한 뒤 발행할 때 제작비를 결제합니다.',
  decision: '완성된 결과를 확인한 뒤 발행을 결정합니다.',
  setupList: `정가 ${formatKrw(PRICING.build.listAmountKrw)}`,
  setupPromotion: formatKrw(PRICING.build.promotionalAmountKrw),
  promotionEndsOn: `${PRICING.build.promotionEndsOn}까지 기간한정`,
  monthlyMaintenance: `유지 ${formatKrw(PRICING.subscription.amountKrw)}/월`,
  term: `홈페이지 ${PRICING.siteCount}개`,
  renewal: '유지비는 매월 같은 금액으로 자동 갱신',
  videoIncluded: '승인한 디자인의 영상 히어로 1회 생성 포함',
  vat: '부가세 포함 총액',
} as const;

export const SUBSCRIPTION_BENEFIT_COPY = {
  operations: '호스팅·SSL·백업·유지',
  selfEdit: '직접 수정 무제한 무료',
  videoHero: PUBLISH_PAYMENT_COPY.videoIncluded,
} as const;

export const SUBSCRIPTION_VALUE_COPY =
  `${SUBSCRIPTION_BENEFIT_COPY.operations}와 ${SUBSCRIPTION_BENEFIT_COPY.selfEdit}가 월 유지비에 포함됩니다.`;

export const INCLUDED_ZERO_COST_ASSET_COPY =
  '레이아웃 선택, 절차적 배경, 제공 스톡처럼 외부 생성비가 들지 않는 기본 자산은 제작 범위에 포함됩니다.';

export const SITE_PRICE_UNIT_COPY = '모든 가격은 홈페이지 1개 기준입니다.';

export const MULTI_SITE_FAQ_ANSWER =
  '가능합니다. 홈페이지마다 제작비와 월 유지비가 각각 적용됩니다. 두 번째 홈페이지는 문의 주시면 안내해 드립니다.';

export function formatKrw(value: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}
