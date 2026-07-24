export const PRICING_MODEL_VERSION = 'retainer-two-tier-v4-2026-07' as const;

export interface SubscriptionPriceContract {
  modelVersion: string;
  amountKrw: number;
  periodMonths: number;
  billingInterval: 'month';
  automaticRenewal: true;
}

export interface SubscriptionTierContract {
  id: 'standard' | 'premium';
  label: string;
  availability: 'public' | 'contact';
  monthlyPrice:
    | SubscriptionPriceContract
    | {
      modelVersion: string;
      amountKrw: null;
      inquiryRangeKrw: {
        min: number;
        max: number;
      };
      billingInterval: 'month';
    };
  included: readonly {
    id: string;
    label: string;
  }[];
}

/**
 * 신규 견적과 마케팅 티어 표가 함께 소비하는 버전별 가격표. 파일럿 WTP
 * 반영은 새 버전 항목을 추가하고 PRICING_MODEL_VERSION을 올리는 작업으로만
 * 이루어진다. premium 범위는 서버 판단 자료이며 문의 UI에는 숫자를 노출하지 않는다.
 */
export const PRICING_TABLE_CATALOG = {
  [PRICING_MODEL_VERSION]: {
    modelVersion: PRICING_MODEL_VERSION,
    tiers: {
      standard: {
        id: 'standard',
        label: '스탠다드',
        availability: 'public',
        monthlyPrice: {
          modelVersion: PRICING_MODEL_VERSION,
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
          modelVersion: PRICING_MODEL_VERSION,
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

export const CURRENT_PRICING_TABLE =
  PRICING_TABLE_CATALOG[PRICING_MODEL_VERSION];

/**
 * 기존 발행 결제 경계가 소비하는 스탠다드 월 가격 호환 view.
 * 금액은 PRICING_TABLE_CATALOG에만 존재한다.
 */
export const SUBSCRIPTION_PRICE_CATALOG = {
  [PRICING_MODEL_VERSION]: CURRENT_PRICING_TABLE.tiers.standard.monthlyPrice,
} as const satisfies Record<string, SubscriptionPriceContract>;

export function subscriptionPriceForVersion(
  modelVersion: string,
): SubscriptionPriceContract | null {
  return (SUBSCRIPTION_PRICE_CATALOG as Record<string, SubscriptionPriceContract>)[modelVersion]
    ?? null;
}

export const CURRENT_SUBSCRIPTION_PRICE =
  SUBSCRIPTION_PRICE_CATALOG[PRICING_MODEL_VERSION];

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
    annualCommitment: CURRENT_PRICING_TABLE.annualOptions.standard,
  },
  tiers: CURRENT_PRICING_TABLE.tiers,
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
  vat: '부가세 별도',
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
