/**
 * [motion-system] 모션 기법 레지스트리 — 규칙을 코드로 강제하는 단일 진실.
 *
 * 철학: 생성 LLM은 모션 기준을 '지어낼' 수 없다. 여기 열거된 13개 ID만 존재하고,
 * 어떤 기법을 쓸지는 업종 매핑(presets.ts)이 결정한다. 위반은 타입에러 또는 검증 거부.
 * 절제가 프리미엄: 페이지당 시그니처(weight "medium") 1개, 무한 반복 최대 2개.
 */
import type { MotionTier } from '@/lib/types/site';

export type MotionTechniqueSpec = {
  /** v2 catalog exposure. Legacy techniques remain renderable for persisted sites. */
  status: 'active' | 'legacy';
  tier: MotionTier;
  weight: 'light' | 'medium';
  /** 한국어, 에디터 UI 노출용 */
  role: string;
  maxPerPage: number;
  infinite: boolean;
  darkSectionOnly?: boolean;
  costKrwPerSite?: number;
  /** premium 필수, basic 금지 — 테스트로 강제. basic 다운그레이드 시 대체 기법 */
  basicFallback?: string;
};

/** 여러 기법을 한 시그니처 예산으로 묶는 합성 정의. */
export interface CompositeSignatureSpec {
  tier: MotionTier;
  techniques: readonly string[];
  signatureUnits: number;
  basicFallback: string;
}

/** 확정 데이터 (13종). 추가·삭제·개명 금지 — 프롬프트 명시값 그대로. */
export const MOTION_TECHNIQUES = {
  // ---------- Basic ----------
  'scroll-reveal': { status: 'active', tier: 'basic', weight: 'light', role: 'Staggered section entrance', maxPerPage: 99, infinite: false },
  'ken-burns': { status: 'active', tier: 'basic', weight: 'light', role: 'Slow zoom and pan for a static hero image', maxPerPage: 1, infinite: true },
  'count-up': { status: 'legacy', tier: 'basic', weight: 'light', role: 'Legacy count-up for verified metrics', maxPerPage: 3, infinite: false },
  'mask-reveal': { status: 'active', tier: 'basic', weight: 'light', role: 'Image entrance using clip-path', maxPerPage: 2, infinite: false },
  'marquee': { status: 'active', tier: 'basic', weight: 'light', role: 'Flowing band for partner marks or menu items', maxPerPage: 1, infinite: true },
  'micro-hover': { status: 'legacy', tier: 'basic', weight: 'light', role: 'Base UI affordance only; not a selectable motion', maxPerPage: 99, infinite: false },
  // ---------- Premium ----------
  'video-hero': { status: 'active', tier: 'premium', weight: 'medium', role: 'Looping cinematic hero video', maxPerPage: 1, infinite: true, costKrwPerSite: 10000, basicFallback: 'ken-burns' },
  // [V-batch] cinematic-hero 합성에서만 활성. 데스크톱은 currentTime scrub,
  // 모바일·seek 실패는 pinned loop, reduced-motion은 poster로 강등한다.
  'scroll-scrub': { status: 'active', tier: 'premium', weight: 'medium', role: 'Maps scroll to a playhead inside a signature', maxPerPage: 1, infinite: false, basicFallback: 'scroll-reveal' },
  'parallax': { status: 'active', tier: 'premium', weight: 'light', role: 'Layered depth for one section per page', maxPerPage: 1, infinite: false, basicFallback: 'scroll-reveal' },
  'split-text': { status: 'active', tier: 'premium', weight: 'light', role: 'Word-by-word hero headline entrance', maxPerPage: 1, infinite: false, basicFallback: 'scroll-reveal' },
  'stacking-cards': { status: 'legacy', tier: 'premium', weight: 'light', role: 'Legacy card entrance', maxPerPage: 1, infinite: false, basicFallback: 'scroll-reveal' },
  'spotlight': { status: 'legacy', tier: 'premium', weight: 'light', role: 'Legacy cursor-tracking light', maxPerPage: 1, infinite: false, darkSectionOnly: true, basicFallback: 'micro-hover' },
  'hover-video': { status: 'active', tier: 'premium', weight: 'light', role: 'Video playback on gallery or menu hover', maxPerPage: 4, infinite: false, basicFallback: 'micro-hover' },
} as const satisfies Record<string, MotionTechniqueSpec>;

export type TechniqueId = keyof typeof MOTION_TECHNIQUES;
export type BasicTechniqueId = {
  [K in TechniqueId]: (typeof MOTION_TECHNIQUES)[K]['tier'] extends 'basic' ? K : never;
}[TechniqueId];
export type PremiumTechniqueId = {
  [K in TechniqueId]: (typeof MOTION_TECHNIQUES)[K]['tier'] extends 'premium' ? K : never;
}[TechniqueId];

/** 신규 생성/온보딩에서 사용할 수 있는 가벼운 production base catalog. */
export const ACTIVE_BASE_TECHNIQUE_IDS = [
  'scroll-reveal',
  'ken-burns',
  'mask-reveal',
  'marquee',
  'video-hero',
  'scroll-scrub',
  'split-text',
  'parallax',
  'hover-video',
] as const satisfies readonly TechniqueId[];

export type ActiveBaseTechniqueId = (typeof ACTIVE_BASE_TECHNIQUE_IDS)[number];

/** 삭제하지 않는 읽기/렌더 호환 catalog. 신규 자동 배정과 선택 UI에서는 제외한다. */
export const LEGACY_TECHNIQUE_IDS = [
  'count-up',
  'spotlight',
  'stacking-cards',
  'micro-hover',
] as const satisfies readonly TechniqueId[];

/** cinematic-hero는 구성 기법 네 개를 페이지당 하나의 합성 시그니처로 센다. */
export const COMPOSITE_SIGNATURES = {
  'cinematic-hero': {
    tier: 'premium',
    techniques: ['video-hero', 'scroll-scrub', 'split-text', 'parallax'],
    signatureUnits: 1,
    basicFallback: 'ken-burns',
  },
} as const satisfies Record<string, CompositeSignatureSpec>;

export type CompositeSignatureId = keyof typeof COMPOSITE_SIGNATURES;

/**
 * 금지 기법 — 레지스트리에 절대 등장하지 않는다(테스트로 공집합 강제).
 * 금지 사유: ① 성능 리스크 — SEO 회사의 자기모순 ② 소상공인 업종 톤 불일치
 * ③ 에디터 유지보수 표면적. 향후 '에이전시급 커스텀' 최상위 티어 후보로만 보류.
 */
export const FORBIDDEN_TECHNIQUES = [
  'webgl-shader',
  'image-trail',
  'custom-cursor',
  'kinetic-typography',
  'scroll-hijack',
  'autoplay-sound',
  'entry-splash',
] as const;

/** signature = weight "medium". 페이지당 시그니처 1개, 무한 반복 2개 상한. */
export const MOTION_LIMITS = { maxInfinitePerPage: 2, maxSignaturePerPage: 1 } as const;

/** 런타임 판정 헬퍼 */
export function isTechniqueId(id: string): id is TechniqueId {
  return Object.prototype.hasOwnProperty.call(MOTION_TECHNIQUES, id);
}
export function isForbiddenTechnique(id: string): boolean {
  return (FORBIDDEN_TECHNIQUES as readonly string[]).includes(id);
}

/**
 * 페이지의 시그니처 예산을 계산한다. 합성 기법이 포함한 medium 구성 기법은 다시 세지 않는다.
 * 예: cinematic-hero + video-hero + scroll-scrub = 1개 시그니처.
 */
export function countMotionSignatures(ids: readonly TechniqueId[], compositeId?: CompositeSignatureId): number {
  const covered = new Map<string, number>();
  let count = 0;

  if (compositeId) {
    const composite = COMPOSITE_SIGNATURES[compositeId];
    const complete = composite.techniques.every((child) => ids.includes(child as TechniqueId));
    if (complete) {
      count += composite.signatureUnits;
      for (const child of composite.techniques) covered.set(child, (covered.get(child) ?? 0) + 1);
    }
  }

  for (const id of ids) {
    const spec = MOTION_TECHNIQUES[id];
    if (spec.weight !== 'medium') continue;
    const remaining = covered.get(id) ?? 0;
    if (remaining > 0) covered.set(id, remaining - 1);
    else count += 1;
  }
  return count;
}
