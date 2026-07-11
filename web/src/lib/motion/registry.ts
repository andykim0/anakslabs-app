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
