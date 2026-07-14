/**
 * [motion 4단계 — V3] 히어로 영상 파이프라인 — 순수 로직 (server-only 없음, 단위 테스트 가능).
 * 비용 가드 판정·모션 프롬프트 조립·컨텍스트 도출·config 적용. 실호출/DB/저장은 video-pipeline.ts.
 */
import type { MotionTier, SiteConfig } from '@/lib/types/site';
import { NO_TEXT_DIRECTIVE, isDarkColor } from '@/lib/design/quality-standards';
import {
  ambientSubjectFor,
  FAITHFUL_PHOTO_MOTION_DIRECTIVE,
  moodPromptForTone,
  productSafetyDirective,
} from '@/lib/design/image-subjects';
import { findVideoConcept } from '@/lib/motion/video-concepts';
import { hasVideoAddon } from '@/lib/services/entitlements';

/** fast=온보딩 시안(저렴), 표준=고화질 재생성(에디터, 크레딧). env로 모델 id 오버라이드. */
export const FAST_MODEL = process.env.VEO_FAST_MODEL || 'veo-3.1-fast-generate-preview';
export const STANDARD_MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-preview';

export type VideoGenStage = 'draft' | 'final';

export interface VideoGuardConfig {
  enabled: boolean;
  maxPerSite: number;
  dailyCap: number;
}

/**
 * 비용 가드 3종 + 영상 애드온 판정 (순수). 위반 시 에러 메시지(코드 프리픽스), 통과 시 null.
 *  (a) 킬스위치  (b) 영상 애드온 보유(=tier premium)  (c) 사이트당 상한  (d) 일일 전역 상한.
 * [U3] 애드온 미보유 사이트는 여기서 서버 강제 차단 — 클라 표식(videoRequested)만으론 Veo 미호출.
 */
export function videoGuardError(
  cfg: VideoGuardConfig,
  tier: MotionTier,
  countBySite: number,
  countToday: number,
): string | null {
  if (!cfg.enabled) return 'VIDEO_GEN_DISABLED: 영상 생성이 비활성화되어 있습니다 (VIDEO_GEN_ENABLED=1 필요).';
  if (!hasVideoAddon(tier)) return 'VIDEO_GEN_ADDON: AI 영상 히어로는 영상 애드온이 필요합니다.';
  if (countBySite >= cfg.maxPerSite) return `VIDEO_GEN_SITE_CAP: 이 사이트의 영상 생성 상한(${cfg.maxPerSite}회)에 도달했습니다.`;
  if (countToday >= cfg.dailyCap) return `VIDEO_GEN_DAILY_CAP: 오늘 영상 생성 상한(${cfg.dailyCap}회)에 도달했습니다.`;
  return null;
}

/** 유료 영상 진입점이 신뢰할 수 있는 고정 프롬프트인지 판별하는 서버 내부 마커. */
export const REGISTERED_VIDEO_PROMPT_MARKER = 'DABOIM_REGISTERED_MOTION_V1';

export { FAITHFUL_PHOTO_MOTION_DIRECTIVE };

const DEFAULT_AMBIENT_MOOD = 'calm spacious mood with diffused light';

export type HeroVideoSource = 'ambient-ai' | 'uploaded-photo';

/**
 * 설문 tone은 자유 텍스트를 그대로 Veo에 넘기지 않고 등록된 영어 무드로만 접는다.
 * 미지 tone은 팔레트 명암 폴백을 사용하므로 상호·상품·요청 원문이 양의 피사체로 새지 않는다.
 */
export function ambientMoodFromTone(tone: readonly string[] | undefined, dark: boolean): string {
  return moodPromptForTone(
    tone,
    dark ? 'refined elegant dark mood' : DEFAULT_AMBIENT_MOOD,
  );
}

/** 자유 카피에서는 제품이 아니라 카메라·빛의 움직임만 화이트리스트로 복원한다. */
function cameraDirectionFor(hint: string): string {
  if (/macro|close[- ]?up/i.test(hint)) return 'restrained macro framing with shallow focus';
  if (/dolly|depth/i.test(hint)) return 'slow restrained dolly movement with gentle depth';
  if (/dusk|temporal|time[- ]?shift/i.test(hint)) return 'soft passing light with a restrained temporal shift';
  if (/documentary|professional|focused/i.test(hint)) return 'measured documentary camera drift';
  return 'slow restrained camera drift with subtle ambient light movement';
}

/** 모션 프롬프트 — 등록 무드와 출처 모드만 삽입(루프·컷없음·6~8초 고정). */
export function buildMotionPrompt(povMood: string, source: HeroVideoSource = 'ambient-ai'): string {
  // 자유 입력은 분류 힌트로만 쓰고, 출력은 H2 단일 레지스트리 어휘로 다시 조립한다.
  const mood = moodPromptForTone(povMood, DEFAULT_AMBIENT_MOOD);
  const camera = cameraDirectionFor(povMood);
  const sourceDirective =
    source === 'uploaded-photo'
      ? FAITHFUL_PHOTO_MOTION_DIRECTIVE
      : `Animate the supplied AI mood artwork without introducing literal commercial items. ` +
        `Ambient focus: ${ambientSubjectFor({ tone: povMood, fallbackMood: mood, seed: 'cinematic-hero' })}. ` +
        `${productSafetyDirective('photo')}`;
  return (
    `${REGISTERED_VIDEO_PROMPT_MARKER}. ${mood}. ${sourceDirective}. ` +
    `Camera direction: ${camera}. Return near the starting framing, seamless loop, no cuts, no camera shake, ` +
    `6-8 seconds. ${NO_TEXT_DIRECTIVE}.`
  );
}

/**
 * 모든 유료 영상 호출의 defense-in-depth. 등록 골격이 아닌 원문은 내용 자체를 폐기하고
 * 안전한 ambient 프롬프트로 대체한다(edit-request의 requestedContent도 여기서 차단).
 */
export function ensureRegisteredVideoPrompt(prompt: string): string {
  const source: HeroVideoSource = prompt.includes(FAITHFUL_PHOTO_MOTION_DIRECTIVE)
    ? 'uploaded-photo'
    : 'ambient-ai';
  return buildMotionPrompt(prompt, source);
}

export interface HeroVideoContext {
  heroImageUrl: string;
  povMood: string;
  source: HeroVideoSource;
}

export interface HeroVideoHint {
  /** 자유 tone은 ambientMoodFromTone의 등록 무드로만 변환된다. */
  tone?: readonly string[];
  /** 실제 홈 hero src와 문자열이 정확히 같을 때만 업로드 사진 출처로 인정한다. */
  heroPhotoUrl?: string;
}

function homeHero(config: SiteConfig) {
  const home = config.pages.find((page) => page.slug === '');
  const hero = home?.sections.find((section) => section.type === 'hero' && !section.hidden);
  return home && hero ? { home, hero } : null;
}

/**
 * 사이트 config(+안전 힌트)에서 영상 생성 맥락 도출. heroImageUrl은 홈의 실제 hero 배경 이미지다.
 * 배열 0/0이 아니라 slug='' 홈과 type='hero'를 탐색한다. tone은 등록 무드로만 변환하고,
 * 컨셉 promptSeed도 카메라·빛 방향만 더한다. heroPhotoUrl은 실제 src와 exact match일 때만 사진 출처다.
 * 히어로 배경 이미지가 없으면 null(image-to-video·poster 불가 → 호출부가 ken-burns 폴백 유지).
 */
export function heroVideoContext(config: SiteConfig, hint?: HeroVideoHint): HeroVideoContext | null {
  const found = homeHero(config);
  const heroImageUrl = found?.hero.background.image?.src;
  if (!heroImageUrl) return null;
  const dark = isDarkColor(config.theme.palette.background);
  const toneMood = ambientMoodFromTone(hint?.tone, dark);
  const conceptMood = findVideoConcept(config.motion?.videoConceptId)?.promptSeed;
  const povMood = conceptMood ? `${toneMood}, ${conceptMood}` : toneMood;
  // mock 업로드는 data:image URL이라 거대한 값을 API body로 다시 보내지 않는다. 실모드는 exact-match만 신뢰한다.
  const isMockUploadedPhoto = !hint?.heroPhotoUrl && heroImageUrl.startsWith('data:image/');
  const source: HeroVideoSource =
    hint?.heroPhotoUrl === heroImageUrl || isMockUploadedPhoto ? 'uploaded-photo' : 'ambient-ai';
  return { heroImageUrl, povMood, source };
}

/** 홈의 실제 hero(type='hero')에 background.video={src,poster} 세팅. */
export function applyHeroVideoToConfig(config: SiteConfig, videoUrl: string, posterUrl: string): SiteConfig {
  const found = homeHero(config);
  if (!found) return config;
  return {
    ...config,
    pages: config.pages.map((page) =>
      page === found.home
        ? {
            ...page,
            sections: page.sections.map((section) =>
              section === found.hero
                ? { ...section, background: { ...section.background, video: { src: videoUrl, poster: posterUrl } } }
                : section,
            ),
          }
        : page,
    ),
  };
}

/** 상대 mock hero src를 현재 요청 origin에 결합한다. fetch 가능한 http(s)만 허용한다. */
export function resolveHeroSourceUrl(src: string, sourceOrigin?: string): string | null {
  try {
    const absolute = new URL(src);
    return absolute.protocol === 'http:' || absolute.protocol === 'https:' ? absolute.href : null;
  } catch {
    if (!sourceOrigin || !src.startsWith('/')) return null;
    try {
      const origin = new URL(sourceOrigin);
      if (origin.protocol !== 'http:' && origin.protocol !== 'https:') return null;
      return new URL(src, origin).href;
    } catch {
      return null;
    }
  }
}
