/**
 * [motion 4단계 — V3] 히어로 영상 파이프라인 — 실호출·DB 오케스트레이션 (server-only).
 * 순수 로직(가드 판정·프롬프트·컨텍스트·적용)은 video-pipeline-core.ts(테스트 가능). 여기선 getDataServices로
 * 실제 카운트·로그·생성을 수행한다. 비용 안전(1급): 모든 생성이 assertVideoGenAllowed를 먼저 통과.
 */
import 'server-only';
import type { MotionTier } from '@/lib/types/site';
import { videoGenConfig, isMockMode } from '@/lib/env';
import { getDataServices } from '@/lib/data';
import {
  buildMotionPrompt,
  videoGuardError,
  FAST_MODEL,
  STANDARD_MODEL,
  type HeroVideoContext,
  type VideoGenStage,
} from './video-pipeline-core';

export {
  buildMotionPrompt,
  heroVideoContext,
  applyHeroVideoToConfig,
  FAST_MODEL,
  STANDARD_MODEL,
  type HeroVideoContext,
  type VideoGenStage,
} from './video-pipeline-core';

/** 비용 가드 3종 + tier — 위반 시 명확한 typed Error. 카운트는 videoGen 로그 기준. */
export async function assertVideoGenAllowed(siteId: string, tier: MotionTier): Promise<void> {
  const { videoGen } = getDataServices();
  const [bySite, today] = await Promise.all([videoGen.countBySite(siteId), videoGen.countToday()]);
  const cfg = videoGenConfig();
  // mock 모드는 실호출·실비용이 없어 킬스위치가 무의미 → 우회(데모 동작). tier·상한 가드는 유지.
  const enabled = cfg.enabled || isMockMode();
  const err = videoGuardError({ ...cfg, enabled }, tier, bySite, today);
  if (err) throw new Error(err);
}

export interface HeroVideoResult {
  videoUrl: string;
  posterUrl: string;
  prompt: string;
  model: string;
}

/**
 * 히어로 영상 1개 생성 (image-to-video). 가드 통과 후에만 실행. posterUrl=입력 이미지(시작 프레임).
 * 원가 발생 시점(호출 직전)에 videoGen.record → 실패해도 카운트되어 재시도 폭주 방지.
 * mock 모드는 실호출 없이 고정 클립을 반환하지만 가드·로그는 동일하게 동작한다.
 */
export async function generateHeroVideo(input: {
  siteId: string;
  tier: MotionTier;
  ctx: HeroVideoContext;
  stage: VideoGenStage;
}): Promise<HeroVideoResult> {
  await assertVideoGenAllowed(input.siteId, input.tier);
  const model = input.stage === 'final' ? STANDARD_MODEL : FAST_MODEL;
  const prompt = buildMotionPrompt(input.ctx.povMood, input.ctx.subject);
  const { ai, videoGen } = getDataServices();
  const image = await fetchImageAsBase64(input.ctx.heroImageUrl);
  await videoGen.record({ siteId: input.siteId, tier: input.tier, model, stage: input.stage, prompt });
  const { url } = await ai.generateVideo({ prompt, ...(image ? { image } : {}), model });
  return { videoUrl: url, posterUrl: input.ctx.heroImageUrl, prompt, model };
}

/** 선택된 시안 로그(원가 없음 — 카운트 제외). 어느 시안·프롬프트가 채택됐는지 튜닝 데이터. */
export async function recordHeroVideoSelection(input: {
  siteId: string;
  tier: MotionTier;
  model: string;
  videoUrl: string;
  prompt: string;
}): Promise<void> {
  const { videoGen } = getDataServices();
  await videoGen.record({
    siteId: input.siteId,
    tier: input.tier,
    model: input.model,
    stage: 'select',
    prompt: input.prompt,
    detail: input.videoUrl,
  });
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | undefined> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const mimeType = res.headers.get('content-type') || 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return undefined;
    return { base64: buf.toString('base64'), mimeType };
  } catch {
    return undefined; // 이미지 못 가져오면 text-to-video 폴백(poster는 여전히 heroImageUrl)
  }
}
