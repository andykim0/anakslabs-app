export const PRICING_MODEL_VERSION = 'annual-v2-2026-07' as const;

/**
 * 신규 계약의 단일 가격 소스.
 *
 * 제작 중에는 결제가 없고, 발행할 때 첫해 이용료를 결제한다. 기존 제작비·
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
    annual: 390_000,
    periodMonths: 12,
    monthlyEquivalent: 32_500,
    automaticRenewal: true,
    creditsPerMonth: 2,
    creditValueKrw: 30_000,
    reportFrequency: 'monthly',
  },
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
  firstYear: `첫해 ${formatKrw(PRICING.subscription.annual)}`,
  term: `홈페이지 ${PRICING.siteCount}개 · ${PRICING.subscription.periodMonths}개월 선결제`,
  renewal: `이후 매년 ${formatKrw(PRICING.subscription.annual)} 자동 갱신`,
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
  selfEdit: '직접 수정 무제한 무료',
} as const;

export const SUBSCRIPTION_VALUE_COPY =
  `매월 ${PRICING.subscription.creditsPerMonth}개 크레딧과 성과 리포트, 호스팅·운영을 함께 제공합니다. 크레딧은 외부 생성비가 드는 프리미엄 작업에만 사용합니다.`;

export const INCLUDED_ZERO_COST_ASSET_COPY =
  '레이아웃 선택, 절차적 배경, 제공 스톡처럼 외부 생성비가 들지 않는 기본 자산은 크레딧 없이 포함됩니다.';

/** 연간 이용료·영상 옵션·사이트 운영 구독에 공통으로 붙는 가격 단위 고지. */
export const SITE_PRICE_UNIT_COPY = '모든 가격은 홈페이지 1개 기준입니다.';

export const MULTI_SITE_FAQ_ANSWER =
  '가능합니다. 홈페이지마다 첫해 이용료와 연간 구독이 각각 적용됩니다. 두 번째 홈페이지는 문의 주시면 안내해 드립니다.';

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
