/**
 * [Q7] "움직임 고르기" — 히어로 모션 선택지 레지스트리 (rules as code).
 * 온보딩 종료 후 첫 생성 직전, 고객이 고르는 선택지는 전부 여기 열거된 id뿐(LLM·자유 텍스트 없음).
 * 카피는 비숙련자용 쉬운 한국어. 검증(미등록·티어 초과 강등)은 sanitizeMotion이 담당.
 */
import type { MotionTier } from '@/lib/types/site';
import { MOTION_TECHNIQUES, type TechniqueId } from './registry';

export type HeroChoiceId = TechniqueId | 'none';

export interface HeroMotionChoice {
  id: HeroChoiceId;
  /** 비숙련자용 라벨 — 예: "사진이 천천히 커지는 느낌" */
  label: string;
  description: string;
}

const BASIC_CHOICES = [
  {
    id: 'ken-burns',
    label: '사진이 천천히 커지는 느낌',
    description: '차분하고 은은해요 — 카페·공방에 잘 어울려요',
  },
  {
    id: 'mask-reveal',
    label: '사진이 스르륵 나타나는 느낌',
    description: '스크롤할 때 사진이 부드럽게 열려요 — 깔끔한 인상',
  },
  {
    id: 'none',
    label: '움직임 최소',
    description: '거의 움직이지 않아요 — 차분한 게 좋다면 이걸로',
  },
] as const satisfies readonly HeroMotionChoice[];

export const HERO_MOTION_CHOICES = {
  basic: BASIC_CHOICES,
  premium: [
    {
      id: 'video-hero',
      label: '사진 대신 짧은 영상이 흐르는 느낌',
      description: '첫 화면에 영상이 배경으로 흐릅니다 — 가장 시선을 끌어요',
    },
    ...BASIC_CHOICES,
  ],
} as const satisfies Record<MotionTier, readonly HeroMotionChoice[]>;

/** 티어별 선택지 (UI 노출용) */
export function heroChoicesForTier(tier: MotionTier): readonly HeroMotionChoice[] {
  return HERO_MOTION_CHOICES[tier];
}

/** 해당 티어에서 허용되는 heroTechnique 값인지 — sanitizeMotion이 사용 */
export function isAllowedHeroChoice(tier: MotionTier, id: string): boolean {
  return HERO_MOTION_CHOICES[tier].some((c) => c.id === id);
}

/** 등록된 기법 id인지(어느 티어든) — 티어 초과 판정 메시지 분기용 */
export function isKnownHeroChoice(id: string): boolean {
  return id === 'none' || Object.prototype.hasOwnProperty.call(MOTION_TECHNIQUES, id);
}
