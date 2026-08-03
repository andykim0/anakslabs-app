/**
 * [G3] 목적별 필수 콘텐츠 게이트 (rules as code) — 콘텐츠 없는 "껍데기"를 차단한다.
 * 이 제품은 "홈페이지 전문 최적화 AI" — 콘텐츠 없는 홈페이지는 검색에 노출될 수 없으므로,
 * 콘텐츠(메뉴·시술·수업·서비스·작업)를 받아내는 것 자체가 핵심 기능이다.
 * minItems = 하드 게이트(미달 시 다음 스텝 진행 불가). recommendedItems = 권장(미달 시 경고만).
 */
import type { LivePurposeId } from '@/lib/types/domain';

export interface ContentRequirement {
  /** 목적별 항목 명칭 — '메뉴' | '시술·서비스' | '수업·과정' | '서비스·제품' | '작업' | '링크' */
  itemLabel: string;
  /** 하드 게이트 최소 개수 */
  minItems: number;
  /** 권장 개수(미달 시 "N개 이상이면 검색 노출에 유리" 경고) */
  recommendedItems: number;
  /** 항목 필드 노출·필수 규칙 */
  fields: {
    name: true;
    price: 'optional' | 'hidden';
    description: 'optional';
    photo: 'optional';
  };
}

export const CONTENT_REQUIREMENTS = {
  local_store: {
    itemLabel: 'Menu item',
    minItems: 1,
    recommendedItems: 5,
    fields: { name: true, price: 'optional', description: 'optional', photo: 'optional' },
  },
  booking_service: {
    itemLabel: 'Treatment or service',
    minItems: 1,
    recommendedItems: 5,
    fields: { name: true, price: 'optional', description: 'optional', photo: 'optional' },
  },
  edu_membership: {
    itemLabel: 'Class or program',
    minItems: 1,
    recommendedItems: 4,
    fields: { name: true, price: 'optional', description: 'optional', photo: 'optional' },
  },
  company_brand: {
    itemLabel: 'Service or product',
    minItems: 1,
    recommendedItems: 3,
    fields: { name: true, price: 'optional', description: 'optional', photo: 'optional' },
  },
  portfolio: {
    itemLabel: 'Work item',
    minItems: 1,
    recommendedItems: 3,
    fields: { name: true, price: 'hidden', description: 'optional', photo: 'optional' },
  },
  one_page: {
    itemLabel: 'Link',
    minItems: 1,
    recommendedItems: 3,
    fields: { name: true, price: 'hidden', description: 'optional', photo: 'optional' },
  },
} as const satisfies Record<LivePurposeId, ContentRequirement>;

export function requirementOf(purposeId: LivePurposeId): ContentRequirement {
  return CONTENT_REQUIREMENTS[purposeId];
}

export interface ContentGateStatus {
  /** 하드 게이트 통과 (minItems 이상) */
  ok: boolean;
  /** 하드 게이트까지 더 필요한 개수 */
  needMore: number;
  /** 권장까지 부족한 개수 (0이면 충분) — 경고용 */
  recommendedShort: number;
  label: string;
  minItems: number;
  recommendedItems: number;
}

/** 목적 + 입력 항목 수 → 게이트 상태 (하드 통과 여부 + 권장 부족분) */
export function contentGateStatus(purposeId: LivePurposeId, itemCount: number): ContentGateStatus {
  const req = requirementOf(purposeId);
  return {
    ok: itemCount >= req.minItems,
    needMore: Math.max(0, req.minItems - itemCount),
    recommendedShort: Math.max(0, req.recommendedItems - itemCount),
    label: req.itemLabel,
    minItems: req.minItems,
    recommendedItems: req.recommendedItems,
  };
}
