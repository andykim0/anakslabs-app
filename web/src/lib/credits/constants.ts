/**
 * [계약 — Architect 소유. 에이전트 수정 금지, 변경 필요 시 보고]
 * 크레딧/과금 상수. SQL 함수와 프론트가 동일 값 공유.
 */
import type { EditType, Tier, CreditReason } from '@/lib/types/domain';

/** 편집 유형별 크레딧 소모량 */
export const CREDIT_COSTS: Record<EditType, number> = {
  text: 1,
  image: 1,
  video: 3, // Premium 전용 — Basic은 차감 전 업셀 안내 필수
  structure: 2,
};

/** 최초 빌드비 결제 시 자동 지급 크레딧 */
export const INITIAL_GRANT: Record<Tier, number> = {
  basic: 1,
  premium: 3,
};

/** 지급 사유별 만료일 (일). 목록에 없는 사유(refund 등)는 365일 적용 */
export const CREDIT_EXPIRY_DAYS: Partial<Record<CreditReason, number>> = {
  initial_grant: 180,
  purchase: 365,
  refund: 365,
  admin_adjust: 365,
};

export interface CreditPack {
  credits: number;
  priceKrw: number;
  label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { credits: 1, priceKrw: 15_000, label: '1개' },
  { credits: 5, priceKrw: 65_000, label: '5개 (13% 할인)' },
  { credits: 10, priceKrw: 120_000, label: '10개 (20% 할인)' },
];

/** 유지보수 구독 결제 실패 후 suspended 전 유예기간(일) */
export const SUSPENSION_GRACE_DAYS = 7;

/** Cloudflare for SaaS 무료 커스텀 호스트네임 한도 — 임박 시 관리자 알림 */
export const CF_FREE_HOSTNAME_LIMIT = 100;
export const CF_HOSTNAME_ALERT_THRESHOLD = 90;

/** 참고용 가격 범위 (KRW) */
export const PRICE_RANGES = {
  buildFee: { basic: [390_000, 590_000], premium: [890_000, 1_490_000] },
  maintenanceMonthly: { basic: [19_000, 29_000], premium: [39_000, 59_000] },
} as const;
