/**
 * [motion-system] 모션 기법 레지스트리 — 규칙을 코드로 강제하는 단일 진실.
 *
 * 철학: 생성 LLM은 모션 기준을 '지어낼' 수 없다. 여기 열거된 13개 ID만 존재하고,
 * 어떤 기법을 쓸지는 업종 매핑(presets.ts)이 결정한다. 위반은 타입에러 또는 검증 거부.
 * 절제가 프리미엄: 페이지당 시그니처(weight "medium") 1개, 무한 반복 최대 2개.
 */
import type { MotionTier } from '@/lib/types/site';

export type MotionTechniqueSpec = {
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
  'scroll-reveal': { tier: 'basic', weight: 'light', role: '섹션 등장 모션(스태거) — 정적인 느낌 제거', maxPerPage: 99, infinite: false },
  'ken-burns': { tier: 'basic', weight: 'light', role: '정지 이미지의 느린 줌/팬 — Basic 히어로 담당', maxPerPage: 1, infinite: true },
  'count-up': { tier: 'basic', weight: 'light', role: '통계·실적 숫자 카운트업 (시술 건수·방문자 등)', maxPerPage: 3, infinite: false },
  'mask-reveal': { tier: 'basic', weight: 'light', role: '이미지 등장 연출(clip-path)', maxPerPage: 2, infinite: false },
  'marquee': { tier: 'basic', weight: 'light', role: '파트너 로고·메뉴 흐름 띠', maxPerPage: 1, infinite: true },
  'micro-hover': { tier: 'basic', weight: 'light', role: '버튼 lift·카드 그림자 기본 마이크로 인터랙션', maxPerPage: 99, infinite: false },
  // ---------- Premium ----------
  'video-hero': { tier: 'premium', weight: 'medium', role: 'AI 시네마틱 영상 히어로(루프) — 간판 기능', maxPerPage: 1, infinite: true, costKrwPerSite: 10000, basicFallback: 'ken-burns' },
  // [motion 4단계 처분] scroll-scrub: 렌더러 capability는 3단계에 구현(pin+currentTime 스크럽)했으나 보류 유지 —
  // ① 어느 프리셋에도 미배정(방출 경로 없음) ② 스크럽엔 촘촘한 키프레임(-g 1) 재인코딩이 필요한데 인프라 부재.
  // 활성화 조건: (a) ffmpeg 등 -g 1 재인코딩 처리 경로 확보 (b) 프리셋 accents에 배정. 지우지 않고 문서화 유지.
  'scroll-scrub': { tier: 'premium', weight: 'medium', role: '스크롤=재생헤드 연출 — 데모에서 가장 팔리는 기법', maxPerPage: 1, infinite: false, basicFallback: 'scroll-reveal' },
  'parallax': { tier: 'premium', weight: 'light', role: '레이어 깊이감 (페이지당 1섹션)', maxPerPage: 1, infinite: false, basicFallback: 'scroll-reveal' },
  'split-text': { tier: 'premium', weight: 'light', role: '히어로 헤드라인 단어별 등장', maxPerPage: 1, infinite: false, basicFallback: 'scroll-reveal' },
  'stacking-cards': { tier: 'premium', weight: 'light', role: '메뉴·시술·서비스 스티키 카드', maxPerPage: 1, infinite: false, basicFallback: 'scroll-reveal' },
  'spotlight': { tier: 'premium', weight: 'light', role: '커서 추적 빛 — 다크 무드 업종 한정', maxPerPage: 1, infinite: false, darkSectionOnly: true, basicFallback: 'micro-hover' },
  'hover-video': { tier: 'premium', weight: 'light', role: '갤러리·메뉴 썸네일 호버 재생', maxPerPage: 4, infinite: false, basicFallback: 'micro-hover' },
} as const satisfies Record<string, MotionTechniqueSpec>;

export type TechniqueId = keyof typeof MOTION_TECHNIQUES;
export type BasicTechniqueId = {
  [K in TechniqueId]: (typeof MOTION_TECHNIQUES)[K]['tier'] extends 'basic' ? K : never;
}[TechniqueId];
export type PremiumTechniqueId = {
  [K in TechniqueId]: (typeof MOTION_TECHNIQUES)[K]['tier'] extends 'premium' ? K : never;
}[TechniqueId];

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
