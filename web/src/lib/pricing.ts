export const PRICING = {
  base: {
    list: 590_000,
    launch: 390_000,
  },
  videoHeroAddon: 200_000,
  subscription: {
    monthly: 19_900,
  },
  selfEdit: 'unlimited-free',
} as const;

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

export const CREDIT_CONTRACT_COPY =
  '직접 수정은 횟수 제한 없이 무료입니다. 크레딧은 AI 재생성(이미지·영상·섹션)과 다보임 수정 대행에만 사용됩니다.';

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
