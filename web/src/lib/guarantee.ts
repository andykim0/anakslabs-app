/**
 * GT$ G1 — 발행 후 90일 성과 보장 판정의 단일 소스.
 *
 * 방문 수는 방문자 식별 없이 저장된 `source=naver,eventType=pageview` 누적 건수다.
 * 네이버 색인 여부는 검색 순위 스크래핑으로 추정하지 않고, 운영자가 네이버
 * 서치어드바이저의 색인 리포트 또는 URL 검색으로 확인한 서버 기록만 받는다.
 */

export const GUARANTEE_WINDOW_DAYS = 90;
export const GUARANTEE_NAVER_REFERRAL_THRESHOLD = 30;

export const GUARANTEE_EXCEPTION_CODES = [
  'site-private',
  'domain-expired',
  'content-removed',
  'force-majeure',
] as const;

export type GuaranteeExceptionCode = (typeof GUARANTEE_EXCEPTION_CODES)[number];
export type GuaranteeDecision =
  | 'not-due'
  | 'needs-index-evidence'
  | 'eligible'
  | 'not-eligible'
  | 'excluded';

export interface GuaranteeEvaluationInput {
  publishedAt: string;
  asOf: string;
  /** null은 운영자가 아직 신뢰 가능한 색인 신호를 기록하지 않은 상태다. */
  naverIndexed: boolean | null;
  naverReferralCount: number;
  exceptionCode?: GuaranteeExceptionCode | null;
}

export interface GuaranteeEvaluation {
  decision: GuaranteeDecision;
  dueAt: string;
  daysRemaining: number;
  naverIndexed: boolean | null;
  naverReferralCount: number;
  referralThreshold: number;
  indexBelowThreshold: boolean | null;
  referralsBelowThreshold: boolean;
  exceptionCode: GuaranteeExceptionCode | null;
}

const DAY_MS = 86_400_000;

function instant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be a valid ISO date`);
  return parsed;
}

export function guaranteeDueAt(publishedAt: string): string {
  return new Date(instant(publishedAt, 'publishedAt') + GUARANTEE_WINDOW_DAYS * DAY_MS).toISOString();
}

/** 같은 입력은 항상 같은 판정을 반환한다. 현재 시각을 내부에서 읽지 않는다. */
export function evaluateGuarantee(input: GuaranteeEvaluationInput): GuaranteeEvaluation {
  const publishedMs = instant(input.publishedAt, 'publishedAt');
  const asOfMs = instant(input.asOf, 'asOf');
  if (!Number.isSafeInteger(input.naverReferralCount) || input.naverReferralCount < 0) {
    throw new TypeError('naverReferralCount must be a non-negative safe integer');
  }
  const dueMs = publishedMs + GUARANTEE_WINDOW_DAYS * DAY_MS;
  const exceptionCode = input.exceptionCode ?? null;
  const referralsBelowThreshold = input.naverReferralCount < GUARANTEE_NAVER_REFERRAL_THRESHOLD;
  const indexBelowThreshold = input.naverIndexed === null ? null : !input.naverIndexed;
  const daysRemaining = Math.max(0, Math.ceil((dueMs - asOfMs) / DAY_MS));

  let decision: GuaranteeDecision;
  if (exceptionCode) decision = 'excluded';
  else if (asOfMs < dueMs) decision = 'not-due';
  else if (input.naverIndexed === null) decision = 'needs-index-evidence';
  else if (!input.naverIndexed && referralsBelowThreshold) decision = 'eligible';
  else decision = 'not-eligible';

  return {
    decision,
    dueAt: new Date(dueMs).toISOString(),
    daysRemaining,
    naverIndexed: input.naverIndexed,
    naverReferralCount: input.naverReferralCount,
    referralThreshold: GUARANTEE_NAVER_REFERRAL_THRESHOLD,
    indexBelowThreshold,
    referralsBelowThreshold,
    exceptionCode,
  };
}

export const GUARANTEE_MARKETING_COPY =
  `발행 후 ${GUARANTEE_WINDOW_DAYS}일, 네이버에서 손님이 들어오지 않으면 제작비를 돌려드립니다.`;

export const GUARANTEE_CRITERIA_COPY =
  `발행 ${GUARANTEE_WINDOW_DAYS}일 시점에 네이버 색인 확인이 되지 않고, 다보임 비콘의 네이버 유입이 누적 ${GUARANTEE_NAVER_REFERRAL_THRESHOLD}회 미만이면 환불 대상입니다.`;
