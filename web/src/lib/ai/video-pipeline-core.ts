/**
 * [motion 4단계 — V3] 히어로 영상 파이프라인 — 순수 로직 (server-only 없음, 단위 테스트 가능).
 * 비용 가드 판정·모션 프롬프트 조립·컨텍스트 도출·config 적용. 실호출/DB/저장은 video-pipeline.ts.
 */
import type { MotionTier, SiteConfig } from '@/lib/types/site';
import { isDarkColor } from '@/lib/design/quality-standards';

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
 * 비용 가드 3종 + tier 판정 (순수). 위반 시 에러 메시지(코드 프리픽스), 통과 시 null.
 *  (a) 킬스위치  (b) Premium tier  (c) 사이트당 상한  (d) 일일 전역 상한.
 */
export function videoGuardError(
  cfg: VideoGuardConfig,
  tier: MotionTier,
  countBySite: number,
  countToday: number,
): string | null {
  if (!cfg.enabled) return 'VIDEO_GEN_DISABLED: 영상 생성이 비활성화되어 있습니다 (VIDEO_GEN_ENABLED=1 필요).';
  if (tier !== 'premium') return 'VIDEO_GEN_TIER: AI 영상 히어로는 Premium 전용입니다.';
  if (countBySite >= cfg.maxPerSite) return `VIDEO_GEN_SITE_CAP: 이 사이트의 영상 생성 상한(${cfg.maxPerSite}회)에 도달했습니다.`;
  if (countToday >= cfg.dailyCap) return `VIDEO_GEN_DAILY_CAP: 오늘 영상 생성 상한(${cfg.dailyCap}회)에 도달했습니다.`;
  return null;
}

/** 모션 프롬프트 — 자유 서술 금지. 고정 골격에 POV mood + 업종 소재만 삽입(루프·컷없음·6~8초 고정). */
export function buildMotionPrompt(povMood: string, subject: string): string {
  return (
    `${povMood}. Subject: ${subject}. ` +
    `Slow cinematic motion, subtle movement, returns near the starting framing, seamless loop, ` +
    `no cuts, no camera shake, 6-8 seconds. No text, no words, no logos, no watermark.`
  );
}

export interface HeroVideoContext {
  heroImageUrl: string;
  povMood: string;
  subject: string;
}

/**
 * 사이트 config(+선택 힌트)에서 영상 생성 맥락 도출. heroImageUrl은 히어로 배경 이미지(poster 후보).
 * povMood: 힌트 우선, 없으면 팔레트 명암으로 결정적 폴백. subject: 힌트 우선, 없으면 사이트 제목.
 * 히어로 배경 이미지가 없으면 null(image-to-video·poster 불가 → 호출부가 ken-burns 폴백 유지).
 */
export function heroVideoContext(config: SiteConfig, hint?: { povMood?: string; subject?: string }): HeroVideoContext | null {
  const hero = config.pages[0]?.sections[0];
  const heroImageUrl = hero?.background.image?.src;
  if (!heroImageUrl) return null;
  const povMood =
    hint?.povMood ??
    (isDarkColor(config.theme.palette.background)
      ? 'Dark cinematic mood, deep shadows with a warm accent light'
      : 'Bright, airy editorial mood with soft natural light');
  const subject = hint?.subject ?? config.meta.title;
  return { heroImageUrl, povMood, subject };
}

/** 히어로(page0/section0) background.video={src,poster} 세팅. 프리셋이 video-hero면 렌더러가 영상 방출. */
export function applyHeroVideoToConfig(config: SiteConfig, videoUrl: string, posterUrl: string): SiteConfig {
  return {
    ...config,
    pages: config.pages.map((p, pi) =>
      pi === 0
        ? {
            ...p,
            sections: p.sections.map((s, si) =>
              si === 0 ? { ...s, background: { ...s.background, video: { src: videoUrl, poster: posterUrl } } } : s,
            ),
          }
        : p,
    ),
  };
}
