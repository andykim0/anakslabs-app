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
  /** v1 presets keep their persisted meaning; v2 is the new-site base catalog. */
  catalogVersion: 1 | 2;
  status: 'active' | 'legacy';
  tier: MotionTier;
  hero: TechniqueId;
  sections: TechniqueId;
  accents: TechniqueId[];
  /** 있으면 techniques 조합 전체를 한 시그니처 예산으로 센다. */
  composite?: CompositeSignatureId;
}

/** 업종 프리셋 6종 + 영상 애드온 합성 1종. 전부 registry 실존 키만 참조. */
export const MOTION_PRESETS = {
  // v1 objects are deliberately unchanged in behavior. They remain readable/renderable only.
  'cafe-basic': { catalogVersion: 1, status: 'legacy', tier: 'basic', hero: 'ken-burns', sections: 'scroll-reveal', accents: ['marquee'] },
  'clinic-premium': { catalogVersion: 1, status: 'legacy', tier: 'premium', hero: 'video-hero', sections: 'scroll-reveal', accents: ['count-up', 'stacking-cards'] },
  'academy-basic': { catalogVersion: 1, status: 'legacy', tier: 'basic', hero: 'ken-burns', sections: 'scroll-reveal', accents: ['count-up'] },
  'dining-premium': { catalogVersion: 1, status: 'legacy', tier: 'premium', hero: 'video-hero', sections: 'scroll-reveal', accents: ['spotlight', 'split-text'] },
  'beauty-premium': { catalogVersion: 1, status: 'legacy', tier: 'premium', hero: 'video-hero', sections: 'scroll-reveal', accents: ['parallax', 'hover-video'] },
  'office-basic': { catalogVersion: 1, status: 'legacy', tier: 'basic', hero: 'mask-reveal', sections: 'scroll-reveal', accents: ['count-up'] },
  'cinematic-hero': {
    catalogVersion: 1,
    status: 'legacy',
    tier: 'premium',
    hero: 'video-hero',
    sections: 'scroll-reveal',
    accents: ['scroll-scrub', 'split-text', 'parallax'],
    composite: 'cinematic-hero',
  },
  // v2: lightweight base motion only. A dominant experience lives in motion.signatures.
  'base-calm-v2': {
    catalogVersion: 2,
    status: 'active',
    tier: 'basic',
    hero: 'ken-burns',
    sections: 'scroll-reveal',
    accents: ['mask-reveal'],
  },
  'base-flow-v2': {
    catalogVersion: 2,
    status: 'active',
    tier: 'basic',
    hero: 'ken-burns',
    sections: 'scroll-reveal',
    accents: ['marquee'],
  },
  'base-editorial-v2': {
    catalogVersion: 2,
    status: 'active',
    tier: 'basic',
    hero: 'mask-reveal',
    sections: 'scroll-reveal',
    accents: ['mask-reveal'],
  },
  'base-premium-v2': {
    catalogVersion: 2,
    status: 'active',
    tier: 'premium',
    hero: 'ken-burns',
    sections: 'scroll-reveal',
    accents: ['mask-reveal', 'parallax'],
  },
} as const satisfies Record<string, MotionPreset>;

export type PresetId = keyof typeof MOTION_PRESETS;

/** tier별 기본 프리셋 (매핑 없는 업종·검증 실패 폴백) */
export const DEFAULT_PRESET: Record<MotionTier, PresetId> = {
  basic: 'base-calm-v2',
  premium: 'base-premium-v2',
};

export const ACTIVE_PRESET_IDS = [
  'base-calm-v2',
  'base-flow-v2',
  'base-editorial-v2',
  'base-premium-v2',
] as const satisfies readonly PresetId[];

/**
 * 업종(SitePurposeId) → tier별 프리셋. 업종 프리셋 6개를 목적에 결정적으로 배정한다.
 * 매핑에 없거나 미래에 추가된 목적은 DEFAULT_PRESET 로 폴백 → 전 업종 커버(테스트 보장).
 */
// [제품 확정] 소개형 6종만. deprecated 목적(레거시 draft 재생성)은 DEFAULT_PRESET로 폴백(Partial).
const PURPOSE_PRESET: Partial<Record<SitePurposeId, Record<MotionTier, PresetId>>> = {
  local_store: { basic: 'base-flow-v2', premium: 'base-premium-v2' },
  booking_service: { basic: 'base-calm-v2', premium: 'base-premium-v2' },
  edu_membership: { basic: 'base-calm-v2', premium: 'base-premium-v2' },
  company_brand: { basic: 'base-editorial-v2', premium: 'base-premium-v2' },
  portfolio: { basic: 'base-editorial-v2', premium: 'base-premium-v2' },
  one_page: { basic: 'base-calm-v2', premium: 'base-premium-v2' },
};

/** 업종+티어 → 프리셋 id (모션 값은 LLM이 아니라 이 코드가 결정한다) */
export function resolvePresetForIndustry(purpose: SitePurposeId, tier: MotionTier): PresetId {
  return (PURPOSE_PRESET[purpose] ?? DEFAULT_PRESET)[tier];
}

export function isPresetId(id: string): id is PresetId {
  return Object.prototype.hasOwnProperty.call(MOTION_PRESETS, id);
}
