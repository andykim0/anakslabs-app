/**
 * [W3] 히어로 영상 연출 라이브러리.
 *
 * 다섯 선택은 고객이 고르는 연출 방향이며, 최종 렌더는 모두 V-batch의
 * cinematic-hero 합성(데스크톱 scrub·모바일 loop·reduced poster)을 재사용한다.
 * previewClass는 CSS 대표 예시용, promptSeed는 승인 후 Veo 모션 방향용이다.
 */

export const SCROLLYTELLING_MOTION_ID = 'scrollytelling-manifesto' as const;

export const HERO_VIDEO_MOTION_IDS = [
  'cinematic-scrub',
  'boomerang-loop',
  'slow-zoom',
  'parallax-depth',
  SCROLLYTELLING_MOTION_ID,
] as const;

/** v2 신규 선택에는 실제로 서로 다른 production renderer를 가진 두 기존 signature만 남긴다. */
export const ACTIVE_HERO_VIDEO_MOTION_IDS = [
  'cinematic-scrub',
  SCROLLYTELLING_MOTION_ID,
] as const satisfies readonly HeroVideoMotionId[];

/** 저장 호환 전용. prompt direction 의미는 유지하지만 신규 선택/자동 배정에서는 제외한다. */
export const LEGACY_HERO_VIDEO_MOTION_IDS = [
  'boomerang-loop',
  'slow-zoom',
  'parallax-depth',
] as const satisfies readonly HeroVideoMotionId[];

export type HeroVideoMotionId = (typeof HERO_VIDEO_MOTION_IDS)[number];

export interface HeroVideoMotionSpec {
  status: 'active' | 'legacy';
  label: string;
  description: string;
  previewClass: string;
  promptSeed: string;
  heroTechnique: 'video-hero';
  rendererPresetId: 'cinematic-hero';
}

export const HERO_VIDEO_MOTIONS = {
  'cinematic-scrub': {
    status: 'active',
    label: 'Cinematic scrub',
    description: 'The scene advances with the page. Mobile uses a gentle loop.',
    previewClass: 'hvm-preview-scrub',
    promptSeed: 'Measured cinematic camera progression with restrained depth and a stable ending frame.',
    heroTechnique: 'video-hero',
    rendererPresetId: 'cinematic-hero',
  },
  'boomerang-loop': {
    status: 'legacy',
    label: 'Boomerang loop',
    description: 'A short back-and-forth rhythm with a seamless transition.',
    previewClass: 'hvm-preview-boomerang',
    promptSeed: 'A gentle returning camera arc with a seamless rhythmic loop and no abrupt subject motion.',
    heroTechnique: 'video-hero',
    rendererPresetId: 'cinematic-hero',
  },
  'slow-zoom': {
    status: 'legacy',
    label: 'Slow zoom',
    description: 'A gradual push into the image that preserves texture and atmosphere.',
    previewClass: 'hvm-preview-zoom',
    promptSeed: 'Very slow restrained push in with subtle ambient depth and a calm stable composition.',
    heroTechnique: 'video-hero',
    rendererPresetId: 'cinematic-hero',
  },
  'parallax-depth': {
    status: 'legacy',
    label: 'Parallax depth',
    description: 'Foreground and background layers move at different speeds to create depth.',
    previewClass: 'hvm-preview-parallax',
    promptSeed: 'Subtle layered depth with restrained lateral camera drift and preserved spatial relationships.',
    heroTechnique: 'video-hero',
    rendererPresetId: 'cinematic-hero',
  },
  [SCROLLYTELLING_MOTION_ID]: {
    status: 'active',
    label: 'Manifesto across the page',
    description: 'One video carries the brand story across several sections.',
    previewClass: 'hvm-preview-manifesto',
    promptSeed: 'Restrained continuous camera drift across a layered composition with measured depth and a calm seamless loop.',
    heroTechnique: 'video-hero',
    rendererPresetId: 'cinematic-hero',
  },
} as const satisfies Record<HeroVideoMotionId, HeroVideoMotionSpec>;

/** SS5 절제 게이트: 일반 업종에는 페이지 관통 선택 자체를 노출하지 않는다. */
export function heroVideoMotionIdsForContext(allowScrollytelling: boolean): readonly HeroVideoMotionId[] {
  return allowScrollytelling
    ? ACTIVE_HERO_VIDEO_MOTION_IDS
    : ACTIVE_HERO_VIDEO_MOTION_IDS.filter((id) => id !== SCROLLYTELLING_MOTION_ID);
}

export function isHeroVideoMotionId(value: string | undefined): value is HeroVideoMotionId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(HERO_VIDEO_MOTIONS, value));
}

export function heroVideoMotionById(value: string | undefined): HeroVideoMotionSpec | undefined {
  return isHeroVideoMotionId(value) ? HERO_VIDEO_MOTIONS[value] : undefined;
}
