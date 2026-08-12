import type { IndustryProfileId } from '@/lib/industry/profiles';

export const PRICING_MODEL_VERSION = 'enterprise-us-v6-2026-08' as const;
export const US_ENTERPRISE_PRICING_MODEL_VERSION = PRICING_MODEL_VERSION;
export const PREVIOUS_PRICING_MODEL_VERSION = 'price-v6-2026-08' as const;
export const LEGACY_PRICING_MODEL_VERSION = 'retainer-two-tier-v4-2026-07' as const;
/** clinic 계약이 요구하는 배포 의료광고 정책. 기존 계약 읽기 경계에서만 사용한다. */
export const CLINIC_REQUIRED_MEDICAL_AD_POLICY_VERSION = 'us-medical-ad-2026-08-v1' as const;

/** 과거 영상 애드온 영수증 분해용. 신규 견적·표시·주문에는 사용하지 않는다. */
const LEGACY_VIDEO_HERO_ADDON_KRW = 200_000;

export const US_ENTERPRISE_PRICING = {
  modelVersion: US_ENTERPRISE_PRICING_MODEL_VERSION,
  setupUsd: 990,
  monthlyUsd: 1_490,
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
  amountUsd: number;
  currency: 'USD';
  /** Legacy numeric payment-column bridge. New quotes must use amountUsd + currency. */
  amountKrw: number;
  periodMonths: number;
  billingInterval: 'month';
  automaticRenewal: true;
  taxMode: 'calculated-at-checkout';
  /** Legacy quote bridge; USD checkout does not represent tax as included. */
  vatIncluded: false;
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
          { id: 'done-for-you-site', label: 'Anaks Labs이 만드는 사이트·커넥터' },
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
export type IndustrySchemaType = 'MedicalClinic';

export interface IndustryKeywordSet {
  id: string;
  label: string;
  source: 'region' | 'business_fact';
}

export interface IndustryProfile {
  id: IndustryProfileId;
  label: string;
  availability: IndustryProfileAvailability;
  setupUsd: number;
  monthlyUsd: number;
  annualUsd: number | null;
  postsPerMonth: number;
  schemaType: IndustrySchemaType;
  requiredMedicalAdPolicyVersion?: string;
  contentRules: readonly string[];
  keywordSets: readonly IndustryKeywordSet[];
  included: readonly { id: string; label: string }[];
}

const CURRENT_CLINIC_PROFILE: IndustryProfile = {
  id: 'clinic',
  label: 'Clinic',
  availability: 'gated',
  setupUsd: US_ENTERPRISE_PRICING.setupUsd,
  monthlyUsd: US_ENTERPRISE_PRICING.monthlyUsd,
  annualUsd: null,
  postsPerMonth: 8,
  schemaType: 'MedicalClinic',
  requiredMedicalAdPolicyVersion: CLINIC_REQUIRED_MEDICAL_AD_POLICY_VERSION,
  contentRules: [
    'Publication requires the current medical-ad policy and public-release gates.',
  ],
  keywordSets: [
    { id: 'region', label: 'Region', source: 'region' },
    { id: 'medical-specialty', label: 'Medical specialty', source: 'business_fact' },
  ],
  included: [],
};

/**
 * 기존 industry-single 행을 재발행·환불할 때만 쓰는 읽기 전용 스냅샷.
 * 현재 PRICING_TABLE_CATALOG이나 고객 화면에는 노출하지 않는다.
 */
const PREVIOUS_INDUSTRY_PROFILES: Partial<Record<IndustryProfileId, IndustryProfile>> = {
  clinic: {
    ...CURRENT_CLINIC_PROFILE,
  },
};

export const PRICING_TABLE_CATALOG = {
  [PRICING_MODEL_VERSION]: {
    modelVersion: PRICING_MODEL_VERSION,
    currency: 'USD',
    profiles: { clinic: CURRENT_CLINIC_PROFILE },
  },
} as const satisfies Record<string, {
  modelVersion: string;
  currency: 'USD';
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
    amountUsd: profile.monthlyUsd,
    currency: 'USD',
    amountKrw: profile.monthlyUsd,
    periodMonths: 1,
    billingInterval: 'month',
    automaticRenewal: true,
    taxMode: 'calculated-at-checkout',
    vatIncluded: false,
  };
}

/** @deprecated 신규 계약은 프로파일 ID 없이 버전만으로 가격을 해석하지 않는다. */
export function subscriptionPriceForVersion(
  modelVersion: string,
  profileId: IndustryProfileId = 'clinic',
): SubscriptionPriceContract | null {
  return subscriptionPriceForProfile(profileId, modelVersion);
}

function requireSubscriptionPrice(profileId: IndustryProfileId): SubscriptionPriceContract {
  const pricing = subscriptionPriceForProfile(profileId);
  if (!pricing) throw new Error(`현재 ${profileId} 가격 프로파일이 없습니다.`);
  return pricing;
}

export const CURRENT_SUBSCRIPTION_PRICE = requireSubscriptionPrice('clinic');

/** 현재 신규 계약의 단일 가격 소스. */
export const PRICING = {
  modelVersion: PRICING_MODEL_VERSION,
  siteCount: 1,
  build: {
    setupUsd: US_ENTERPRISE_PRICING.setupUsd,
    currency: 'USD',
    paymentTiming: 'publish',
    taxMode: 'calculated-at-checkout',
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
  lead: 'Review the completed site before starting the paid service.',
  decision: 'Publishing begins the Enterprise service agreement.',
  setup: `${formatUsd(PRICING.build.setupUsd)} setup`,
  setupPromotion: `${formatUsd(PRICING.build.setupUsd)} setup`,
  monthlyMaintenance: `${formatUsd(PRICING.subscription.amountUsd)}/month`,
  term: `${PRICING.siteCount} clinic website`,
  renewal: 'The monthly service renews automatically until canceled.',
  videoIncluded: 'One approved hero-video generation is included.',
  tax: 'Applicable taxes are calculated at checkout.',
} as const;

export const SUBSCRIPTION_BENEFIT_COPY = {
  operations: 'Hosting, SSL, backups, and maintenance',
  selfEdit: 'Self-service editing',
  videoHero: PUBLISH_PAYMENT_COPY.videoIncluded,
} as const;

export const SUBSCRIPTION_VALUE_COPY =
  `${SUBSCRIPTION_BENEFIT_COPY.operations} and ${SUBSCRIPTION_BENEFIT_COPY.selfEdit} are included in the monthly service.`;

export const INCLUDED_ZERO_COST_ASSET_COPY =
  'Licensed stock, approved layout assets, and procedural backgrounds are included when applicable.';

export const SITE_PRICE_UNIT_COPY = 'Pricing applies to one clinic website.';

export const MULTI_SITE_FAQ_ANSWER =
  'Additional clinic websites require a separate setup and monthly service agreement.';

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function formatKrw(value: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}
