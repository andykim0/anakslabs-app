import type { IndustryProfileId } from '@/lib/industry/profiles';

export const PRICING_MODEL_VERSION = 'industry-single-2026-07' as const;
export const LEGACY_PRICING_MODEL_VERSION = 'retainer-two-tier-v4-2026-07' as const;

export interface SubscriptionPriceContract {
  modelVersion: string;
  industryProfileId: IndustryProfileId;
  amountKrw: number;
  periodMonths: number;
  billingInterval: 'month';
  automaticRenewal: true;
  vatIncluded: true;
}

/**
 * 머지된 과거 v4 결제·이벤트를 해석하기 위한 동결 스냅샷. 신규 견적이나
 * 고객 UI에서 소비하면 안 된다. 머지되지 않은 v5 항목은 만들지 않는다.
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
          inquiryRangeKrw: {
            min: 390_000,
            max: 490_000,
          },
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
      premium: {
        status: 'hidden',
      },
    },
  },
} as const;

export type IndustryProfileAvailability = 'public' | 'gated';
export type IndustrySchemaType =
  | 'HomeAndConstructionBusiness'
  | 'MedicalClinic';

export interface IndustryKeywordSet {
  id: string;
  label: string;
  source: 'region' | 'business_fact';
}

export interface IndustryProfile {
  id: IndustryProfileId;
  label: string;
  availability: IndustryProfileAvailability;
  monthlyKrw: number;
  annualKrw: number;
  postsPerMonth: number;
  schemaType: IndustrySchemaType;
  contentRules: readonly string[];
  keywordSets: readonly IndustryKeywordSet[];
  included: readonly {
    id: string;
    label: string;
  }[];
}

/**
 * 신규 계약의 버전별 업종 단일가 카탈로그. 프로파일은 가격뿐 아니라
 * 계약 범위·스키마·키워드 입력 축을 함께 고정하며 렌더러에는 전달하지 않는다.
 */
export const PRICING_TABLE_CATALOG = {
  [PRICING_MODEL_VERSION]: {
    modelVersion: PRICING_MODEL_VERSION,
    vatIncluded: true,
    profiles: {
      interior: {
        id: 'interior',
        label: '인테리어·공간',
        availability: 'public',
        monthlyKrw: 490_000,
        annualKrw: 4_900_000,
        postsPerMonth: 0,
        schemaType: 'HomeAndConstructionBusiness',
        contentRules: [],
        keywordSets: [
          { id: 'region', label: '지역', source: 'region' },
          { id: 'area-size', label: '평형', source: 'business_fact' },
        ],
        included: [
          { id: 'done-for-you-site', label: '다보임이 만드는 홈페이지' },
          { id: 'connectors', label: '상담·전화·길찾기 연결' },
          { id: 'conversion-tracking', label: '문의 행동 추적' },
          { id: 'monthly-report', label: '월간 성과 리포트' },
          { id: 'search-foundation', label: '검색·AI가 읽기 쉬운 기본 구조' },
          { id: 'hosting-operations', label: '호스팅·SSL·백업·운영' },
          { id: 'zero-cost-assets', label: '레이아웃·절차적 배경 등 기본 자산' },
          { id: 'monthly-credits', label: '매월 2크레딧' },
        ],
      },
    },
  },
} as const satisfies Record<string, {
  modelVersion: string;
  vatIncluded: true;
  profiles: Partial<Record<IndustryProfileId, IndustryProfile>>;
}>;

export const CURRENT_PRICING_TABLE =
  PRICING_TABLE_CATALOG[PRICING_MODEL_VERSION];

export const INDUSTRY_PROFILES = CURRENT_PRICING_TABLE.profiles;

export function industryProfile(
  profileId: IndustryProfileId,
  modelVersion: string = PRICING_MODEL_VERSION,
): IndustryProfile | null {
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

/**
 * 신규 계약의 단일 가격 소스.
 *
 * 제작 중에는 결제가 없고, 발행할 때 월 리테이너를 시작한다. 기존 제작비·
 * 월 구독 행은 LEGACY_PRICING으로만 해석하며 새 주문에는 사용하지 않는다.
 */
export const PRICING = {
  modelVersion: PRICING_MODEL_VERSION,
  siteCount: 1,
  build: {
    amountKrw: 0,
    paymentTiming: 'publish',
  },
  videoHeroAddon: 200_000,
  subscription: {
    ...CURRENT_SUBSCRIPTION_PRICE,
    creditsPerMonth: 2,
    creditValueKrw: 30_000,
    reportFrequency: 'monthly',
    annualCommitment: {
      status: 'available',
      amountKrw: INDUSTRY_PROFILES.interior.annualKrw,
      periodMonths: 12,
      freeMonths: 2,
      billingInterval: 'year',
      automaticRenewal: true,
    },
  },
  profiles: INDUSTRY_PROFILES,
  /**
   * M3 마케팅 단일가 전환 전까지만 기존 페이지를 컴파일하는 동결 view.
   * 신규 견적·결제는 이 값을 소비하지 않으며 M3에서 제거한다.
   */
  tiers: LEGACY_PRICING_TABLE_CATALOG[LEGACY_PRICING_MODEL_VERSION].tiers,
  selfEdit: 'unlimited-free',
} as const;

/**
 * 이미 기록된 제작비·월 구독 증거를 읽고 환불·운영 지표를 재현하기 위한
 * 불변 스냅샷. 신규 주문·고객 가격 표시에 사용하면 안 된다.
 */
export const LEGACY_PRICING = {
  build: {
    list: 590_000,
    launch: 390_000,
  },
  subscriptionMonthly: 29_900,
} as const;

export const PUBLISH_PAYMENT_COPY = {
  lead: '먼저 만들어 보여드립니다. 발행할 때만 결제하세요.',
  decision: '완성된 결과를 확인한 뒤 발행을 결정합니다.',
  monthlyRetainer: `월 ${formatKrw(PRICING.subscription.amountKrw)}`,
  term: `홈페이지 ${PRICING.siteCount}개 · ${PRICING.subscription.periodMonths}개월 이용`,
  renewal: '매월 같은 금액으로 자동 갱신',
  annualOption:
    `연납 시 ${PRICING.subscription.annualCommitment.freeMonths}개월 무료 · 연 ${formatKrw(PRICING.subscription.annualCommitment.amountKrw)}`,
  noBuildFee: '별도 제작비 없음',
  vat: '부가세 포함 총액',
} as const;

/**
 * 사이트 운영 구독의 고객 노출 혜택. 화면별 문구가 서로 다른 계약을
 * 설명하지 않도록 가격과 함께 이 모듈을 단일 진실원으로 사용한다.
 */
export const SUBSCRIPTION_BENEFIT_COPY = {
  report: '매월 성과 리포트',
  credits: `매월 ${PRICING.subscription.creditsPerMonth}크레딧`,
  operations: '호스팅·SSL·백업·운영',
  visibility: '검색·AI 노출 최적화',
  conversion: '전환 리포팅',
  selfEdit: '직접 수정 무제한 무료',
} as const;

export const SUBSCRIPTION_VALUE_COPY =
  `검색·AI 노출 최적화와 전환 리포팅, 호스팅·운영, 매월 ${PRICING.subscription.creditsPerMonth}개 크레딧을 함께 제공합니다. 크레딧은 외부 생성비가 드는 프리미엄 작업에만 사용합니다.`;

export const RETAINER_SCOPE_COPY =
  '전환 흐름과 AI 검색 대비, 사이트 품질을 매달 확인하고 관리합니다. 검색 순위나 노출 자체를 약속하지 않습니다.';

export const RETAINER_COMPLEMENT_COPY =
  '블로그·광고 운영을 대신하는 상품이 아니라, 그 활동이 연결될 공식 사이트와 전환 기반을 보완합니다.';

export const INCLUDED_ZERO_COST_ASSET_COPY =
  '레이아웃 선택, 절차적 배경, 제공 스톡처럼 외부 생성비가 들지 않는 기본 자산은 크레딧 없이 포함됩니다.';

/** 월 리테이너·영상 옵션·사이트 운영 구독에 공통으로 붙는 가격 단위 고지. */
export const SITE_PRICE_UNIT_COPY = '모든 가격은 홈페이지 1개 기준입니다.';

export const MULTI_SITE_FAQ_ANSWER =
  '가능합니다. 홈페이지마다 월 구독이 각각 적용됩니다. 두 번째 홈페이지는 문의 주시면 안내해 드립니다.';

/**
 * Customer-facing actions that may consume credits.
 * Manual canvas edits and direct image replacement are intentionally absent.
 */
export const CREDIT_CONSUMING_ACTIONS = [
  'ai-image-generate',
  'ai-video-regenerate',
  'ai-section-redesign',
  'daboim-edit-service',
] as const;

export type CreditConsumingAction = (typeof CREDIT_CONSUMING_ACTIONS)[number];

export const CREDIT_CONSUMING_ACTION_LABELS = {
  'ai-image-generate': 'AI 이미지 새로 생성',
  'ai-video-regenerate': 'AI 영상 재생성',
  'ai-section-redesign': 'AI 전체 섹션 재디자인',
  'daboim-edit-service': '다보임 수정 대행',
} as const satisfies Record<CreditConsumingAction, string>;

export function formatKrw(value: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}
