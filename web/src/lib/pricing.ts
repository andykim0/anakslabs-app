export const PRICING = {
  base: {
    list: 590_000,
    launch: 390_000,
  },
  videoHeroAddon: 200_000,
  subscription: {
    monthly: 29_900,
    creditsPerMonth: 2,
    creditValueKrw: 30_000,
    reportFrequency: 'monthly',
  },
  selfEdit: 'unlimited-free',
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
  `구독비만큼 크레딧으로 돌려받아요(매월 ${PRICING.subscription.creditsPerMonth}개 · ${formatKrw(PRICING.subscription.creditValueKrw)} 상당). 매달 성과 리포트에 호스팅·운영까지 함께합니다.`;

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

export type LaunchOffer = {
  display: 'strikethrough' | 'none';
  kind: 'quantity' | 'deadline' | 'none';
  limitCount: number | null;
  deadline: string | null;
};

export const LAUNCH_OFFER = {
  display: 'strikethrough',
  kind: 'quantity',
  limitCount: 50,
  deadline: null,
} as const satisfies LaunchOffer;

/**
 * There is no authoritative launch-customer counter yet. Operations flips this
 * flag and redeploys when the first 50 paid customers have been accepted.
 */
export const LAUNCH_OFFER_AVAILABILITY = {
  quantitySoldOut: false,
} as const;

export type LaunchOfferEvaluationInput = {
  offer?: LaunchOffer;
  quantitySoldOut?: boolean;
  nowMs?: number;
};

export type BasePricePresentation = {
  active: boolean;
  currentPriceKrw: number;
  compareAtPriceKrw: number | null;
  conditionLabel: string | null;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function deadlineEndExclusiveMs(deadline: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dateStartUtc = Date.UTC(year, month - 1, day);
  const parsed = new Date(dateStartUtc);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  // The offer remains active through the stated calendar day in Korea.
  return Date.UTC(year, month - 1, day + 1) - KST_OFFSET_MS;
}

export function isLaunchOfferActive(input: LaunchOfferEvaluationInput = {}): boolean {
  const offer = input.offer ?? LAUNCH_OFFER;
  if (offer.display !== 'strikethrough') return false;

  if (offer.kind === 'quantity') {
    return (
      Number.isInteger(offer.limitCount) &&
      (offer.limitCount ?? 0) > 0 &&
      offer.deadline === null &&
      (input.quantitySoldOut ?? LAUNCH_OFFER_AVAILABILITY.quantitySoldOut) === false
    );
  }

  if (offer.kind === 'deadline') {
    if (offer.limitCount !== null || typeof offer.deadline !== 'string') return false;
    const endExclusiveMs = deadlineEndExclusiveMs(offer.deadline);
    if (endExclusiveMs === null) return false;
    const nowMs = input.nowMs ?? Date.now();
    return Number.isFinite(nowMs) && nowMs < endExclusiveMs;
  }

  return false;
}

export function getLaunchOfferLabel(offer: LaunchOffer = LAUNCH_OFFER): string | null {
  if (offer.display !== 'strikethrough') return null;
  if (offer.kind === 'quantity' && Number.isInteger(offer.limitCount) && (offer.limitCount ?? 0) > 0) {
    return `런칭 선착순 ${offer.limitCount}곳 한정`;
  }
  if (offer.kind === 'deadline' && offer.deadline && deadlineEndExclusiveMs(offer.deadline) !== null) {
    return `런칭 ${offer.deadline}까지`;
  }
  return null;
}

export function getBasePricePresentation(
  input: LaunchOfferEvaluationInput = {},
): BasePricePresentation {
  const offer = input.offer ?? LAUNCH_OFFER;
  const active = isLaunchOfferActive(input);

  if (active) {
    return {
      active: true,
      currentPriceKrw: PRICING.base.launch,
      compareAtPriceKrw: PRICING.base.list,
      conditionLabel: getLaunchOfferLabel(offer),
    };
  }

  return {
    active: false,
    currentPriceKrw: offer.kind === 'none' ? PRICING.base.launch : PRICING.base.list,
    compareAtPriceKrw: null,
    conditionLabel: null,
  };
}

export function formatKrw(value: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}
