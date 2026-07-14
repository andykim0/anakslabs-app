/**
 * [motion-system] 모션 프리셋 — hero/sections/accents 조합을 registry 키로만 참조.
 * 사이트는 프리셋 1개 + 강도만 고른다(섹션/요소 레벨 오버라이드 없음 — 절제 원칙).
 * 강도는 SiteConfig.motion.intensity 계약 필드로 항상 조절 가능하며, 모든 프리셋에서
 * intensity "off"(전 모션 비활성)를 선택할 수 있다.
 */
import type { MotionTier } from '@/lib/types/site';
import type { SitePurposeId } from '@/lib/types/domain';
import type { CompositeSignatureId, TechniqueId } from './registry';

export interface MotionPreset {
  tier: MotionTier;
  hero: TechniqueId;
  sections: TechniqueId;
  accents: TechniqueId[];
  /** 있으면 techniques 조합 전체를 한 시그니처 예산으로 센다. */
  composite?: CompositeSignatureId;
}

/** 업종 프리셋 6종 + 영상 애드온 합성 1종. 전부 registry 실존 키만 참조. */
export const MOTION_PRESETS = {
  'cafe-basic': { tier: 'basic', hero: 'ken-burns', sections: 'scroll-reveal', accents: ['marquee'] },
  'clinic-premium': { tier: 'premium', hero: 'video-hero', sections: 'scroll-reveal', accents: ['count-up', 'stacking-cards'] },
  'academy-basic': { tier: 'basic', hero: 'ken-burns', sections: 'scroll-reveal', accents: ['count-up'] },
  'dining-premium': { tier: 'premium', hero: 'video-hero', sections: 'scroll-reveal', accents: ['spotlight', 'split-text'] },
  'beauty-premium': { tier: 'premium', hero: 'video-hero', sections: 'scroll-reveal', accents: ['parallax', 'hover-video'] },
  'office-basic': { tier: 'basic', hero: 'mask-reveal', sections: 'scroll-reveal', accents: ['count-up'] },
  'cinematic-hero': {
    tier: 'premium',
    hero: 'video-hero',
    sections: 'scroll-reveal',
    accents: ['scroll-scrub', 'split-text', 'parallax'],
    composite: 'cinematic-hero',
  },
} as const satisfies Record<string, MotionPreset>;

export type PresetId = keyof typeof MOTION_PRESETS;

/** tier별 기본 프리셋 (매핑 없는 업종·검증 실패 폴백) */
export const DEFAULT_PRESET: Record<MotionTier, PresetId> = {
  basic: 'cafe-basic',
  premium: 'clinic-premium',
};

/**
 * 업종(SitePurposeId) → tier별 프리셋. 업종 프리셋 6개를 목적에 결정적으로 배정한다.
 * 매핑에 없거나 미래에 추가된 목적은 DEFAULT_PRESET 로 폴백 → 전 업종 커버(테스트 보장).
 */
// [제품 확정] 소개형 6종만. deprecated 목적(레거시 draft 재생성)은 DEFAULT_PRESET로 폴백(Partial).
const PURPOSE_PRESET: Partial<Record<SitePurposeId, Record<MotionTier, PresetId>>> = {
  local_store: { basic: 'cafe-basic', premium: 'dining-premium' },
  booking_service: { basic: 'office-basic', premium: 'beauty-premium' },
  edu_membership: { basic: 'academy-basic', premium: 'clinic-premium' },
  company_brand: { basic: 'office-basic', premium: 'clinic-premium' },
  portfolio: { basic: 'office-basic', premium: 'dining-premium' },
  one_page: { basic: 'office-basic', premium: 'clinic-premium' },
};

/** 업종+티어 → 프리셋 id (모션 값은 LLM이 아니라 이 코드가 결정한다) */
export function resolvePresetForIndustry(purpose: SitePurposeId, tier: MotionTier): PresetId {
  return (PURPOSE_PRESET[purpose] ?? DEFAULT_PRESET)[tier];
}

export function isPresetId(id: string): id is PresetId {
  return Object.prototype.hasOwnProperty.call(MOTION_PRESETS, id);
}
