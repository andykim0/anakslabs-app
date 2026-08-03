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
    label: 'Slow image zoom',
    description: 'A quiet, restrained motion for tactile spaces and services.',
  },
  {
    id: 'mask-reveal',
    label: 'Soft image reveal',
    description: 'Images open gently on scroll for a clean presentation.',
  },
  {
    id: 'none',
    label: 'Minimal motion',
    description: 'Nearly static for a calm, direct presentation.',
  },
] as const satisfies readonly HeroMotionChoice[];

export const HERO_MOTION_CHOICES = {
  basic: BASIC_CHOICES,
  premium: [
    {
      id: 'video-hero',
      label: 'Short background video',
      description: 'A short video plays behind the opening section.',
    },
    ...BASIC_CHOICES,
  ],
} as const satisfies Record<MotionTier, readonly HeroMotionChoice[]>;

/**
 * [U2] 표시용 전체 선택지 — 영상 애드온(video-hero)을 누구에게나 노출한다(단일 제품 + 유료 애드온).
 * 능력 게이팅(애드온 미보유 시 강등)은 sanitizeMotion·생성 경로가 담당하고, UI는 전 선택지를 보여준다.
 */
export const ALL_HERO_CHOICES: readonly HeroMotionChoice[] = HERO_MOTION_CHOICES.premium;

/** 티어별 선택지 (sanitize의 티어 초과 판정용 — 능력 게이팅). UI 노출은 ALL_HERO_CHOICES 사용. */
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
