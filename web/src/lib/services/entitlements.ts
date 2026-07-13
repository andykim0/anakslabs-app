/**
 * [U1] 제품 정의 확정: "홈페이지 전문 최적화 AI" 단일 제품 + 영상 애드온.
 *
 * Basic/Premium '플랜' 분리는 폐기됐다. 모두가 base 제품을 받고, AI 영상 히어로·시네마틱
 * 모션은 누구나 살 수 있는 유료 애드온이다. 현행 요금제 구조에선 `client.tier === 'premium'`이
 * 곧 "영상 애드온 보유"를 의미한다(관리자 승인=updateTier('premium'), 크몽 수동 수금 후 부여).
 *
 * tier 필드는 제거하지 않는다 — 가격대(PRICE_RANGES)·초기 크레딧(INITIAL_GRANT)·모션 프리셋
 * 등급의 진짜 소스로 유지된다. '영상 애드온 보유'만 이 파생 헬퍼로 명확히 표현한다(레거시 무손상).
 */
import type { Tier } from '@/lib/types/domain';

/** 영상 애드온 보유로 간주되는 tier. 현행 요금제에선 premium이 곧 애드온 보유. */
export const VIDEO_ADDON_TIER: Tier = 'premium';

/** 영상 애드온 안내 가격(원). 마케팅·온보딩 라벨 단일 소스. 실제 수금은 크몽(수동). */
export const VIDEO_ADDON_PRICE_KRW = 200_000;

/** client.tier로부터 영상 애드온(AI 영상 히어로·영상 편집) 보유 여부 파생. */
export function hasVideoAddon(tier: Tier): boolean {
  return tier === VIDEO_ADDON_TIER;
}
