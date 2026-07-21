/**
 * 고객 이행 기간과 운영 대기 경고의 단일 소스.
 * 공휴일은 추측하지 않고 주말만 제외하므로, 화면에는 약속 범위만 표시한다.
 */
export const FULFILLMENT_SLA = {
  siteBuild: { maxBusinessDays: 3 },
  videoApplication: { minBusinessDays: 1, maxBusinessDays: 2 },
  assistedEdit: { minBusinessDays: 1, maxBusinessDays: 2 },
} as const;

function businessDayRange(min: number, max: number): string {
  return min === max ? `영업일 ${max}일` : `영업일 ${min}~${max}일`;
}

export const SITE_BUILD_SLA_COPY =
  `홈페이지 제작은 영업일 ${FULFILLMENT_SLA.siteBuild.maxBusinessDays}일 이내 완료됩니다.`;

export const VIDEO_FULFILLMENT_COPY =
  `주문 후 ${businessDayRange(FULFILLMENT_SLA.videoApplication.minBusinessDays, FULFILLMENT_SLA.videoApplication.maxBusinessDays)} 안에 적용됩니다. `
  + '사장님이 고르신 연출 방향대로 다보임 AI가 만들고, 한 편씩 직접 검수해 가게 분위기에 맞는 것만 올립니다.';

export const EDIT_REQUEST_SLA_COPY =
  `수정 대행은 접수 후 ${businessDayRange(FULFILLMENT_SLA.assistedEdit.minBusinessDays, FULFILLMENT_SLA.assistedEdit.maxBusinessDays)} 안에 처리됩니다.`;

export const VIDEO_FULFILLMENT_STATUS_LABELS = {
  received: '접수됨',
  reviewing: '검수 중',
  applied: '적용 완료',
} as const;

export type VideoFulfillmentStatus = keyof typeof VIDEO_FULFILLMENT_STATUS_LABELS;

/** 수정·영상 큐의 공통 운영 경고는 두 약속의 최대 처리일을 사용한다. */
export const FULFILLMENT_SLA_BUSINESS_DAYS = Math.max(
  FULFILLMENT_SLA.videoApplication.maxBusinessDays,
  FULFILLMENT_SLA.assistedEdit.maxBusinessDays,
);

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 86_400_000;

function kstDayStartMs(value: string | Date): number | null {
  const sourceMs = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(sourceMs)) return null;
  const shifted = new Date(sourceMs + KST_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

function isWeekday(dayStartMs: number): boolean {
  const day = new Date(dayStartMs).getUTCDay();
  return day !== 0 && day !== 6;
}

/** 완료된 KST 영업일 경계 수를 계산한다. */
export function waitingBusinessDays(requestedAt: string, now: Date = new Date()): number {
  const requestedDay = kstDayStartMs(requestedAt);
  const currentDay = kstDayStartMs(now);
  if (requestedDay === null || currentDay === null || currentDay <= requestedDay) return 0;

  let count = 0;
  for (let day = requestedDay + DAY_MS; day <= currentDay; day += DAY_MS) {
    if (isWeekday(day)) count += 1;
  }
  return count;
}

export function fulfillmentSlaState(requestedAt: string, now: Date = new Date()): {
  waitingBusinessDays: number;
  overdue: boolean;
} {
  const days = waitingBusinessDays(requestedAt, now);
  return {
    waitingBusinessDays: days,
    overdue: days >= FULFILLMENT_SLA_BUSINESS_DAYS,
  };
}
