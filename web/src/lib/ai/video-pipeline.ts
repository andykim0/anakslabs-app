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
  ensureRegisteredVideoPrompt,
  resolveHeroSourceUrl,
  videoGuardError,
  FAST_MODEL,
  STANDARD_MODEL,
  type HeroVideoContext,
  type HeroVideoSource,
  type VideoGenStage,
} from './video-pipeline-core';

export {
  buildMotionPrompt,
  ensureRegisteredVideoPrompt,
  heroVideoContext,
  applyHeroVideoToConfig,
  FAITHFUL_PHOTO_MOTION_DIRECTIVE,
  REGISTERED_VIDEO_PROMPT_MARKER,
  FAST_MODEL,
  STANDARD_MODEL,
  type HeroVideoContext,
  type HeroVideoSource,
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

export interface GuardedVideoResult {
  url: string;
  poster?: string;
}

export const HERO_SOURCE_UNAVAILABLE = 'HERO_SOURCE_UNAVAILABLE';

export function isHeroSourceUnavailableError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(`${HERO_SOURCE_UNAVAILABLE}:`);
}

/**
 * 모든 유료 영상 호출의 단일 진입점. 순서는 반드시 guard → 원가 로그 → 생성이다.
 * 생성 자체의 장기 HTTP 리팩터와 -g1 후처리는 별도 백엔드 배치에서 다룬다.
 */
export async function generateGuardedVideo(input: {
  siteId: string;
  tier: MotionTier;
  prompt: string;
  model: string;
  stage: VideoGenStage;
  image?: { base64: string; mimeType: string };
  /** 서버가 검증한 히어로 출처. 일반 편집 요청은 미지정=ambient-ai. */
  source?: HeroVideoSource;
}): Promise<GuardedVideoResult> {
  // 마커 문자열을 흉내 낸 요청도 신뢰하지 않는다. 매 호출마다 등록 어휘로 전체를 재조립한다.
  // 이후 비용 로그와 실제 AI 호출은 반드시 같은 정제 프롬프트를 사용한다.
  const safePrompt = buildMotionPrompt(input.prompt, input.source ?? 'ambient-ai');
  await assertVideoGenAllowed(input.siteId, input.tier);
  const { ai, videoGen } = getDataServices();
  await videoGen.record({
    siteId: input.siteId,
    tier: input.tier,
    model: input.model,
    stage: input.stage,
    prompt: safePrompt,
  });
  return ai.generateVideo({
    prompt: safePrompt,
    ...(input.image ? { image: input.image } : {}),
    model: input.model,
  });
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
  /** `/mock.jpg` 같은 상대 시작 이미지를 fetch하기 위한 현재 API 요청 origin. */
  sourceOrigin?: string;
}): Promise<HeroVideoResult> {
  const model = input.stage === 'final' ? STANDARD_MODEL : FAST_MODEL;
  const prompt = buildMotionPrompt(input.ctx.povMood, input.ctx.source);
  // 시작 이미지가 없으면 image-to-video가 text-to-video로 변질된다. 가드·로그·AI 호출 전에 중단한다.
  const image = await fetchImageAsBase64(input.ctx.heroImageUrl, input.sourceOrigin);
  if (!image) {
    throw new Error(`${HERO_SOURCE_UNAVAILABLE}: 히어로 시작 이미지를 불러올 수 없습니다.`);
  }
  const { url } = await generateGuardedVideo({
    siteId: input.siteId,
    tier: input.tier,
    // 공용 진입점이 이 안전 맥락으로 같은 최종 프롬프트를 조립한다(완성 문자열 재파싱 금지).
    prompt: input.ctx.povMood,
    model,
    stage: input.stage,
    image,
    source: input.ctx.source,
  });
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
  const safePrompt = ensureRegisteredVideoPrompt(input.prompt);
  await videoGen.record({
    siteId: input.siteId,
    tier: input.tier,
    model: input.model,
    stage: 'select',
    prompt: safePrompt,
    detail: input.videoUrl,
  });
}

async function fetchImageAsBase64(
  url: string,
  sourceOrigin?: string,
): Promise<{ base64: string; mimeType: string } | undefined> {
  // MOCK_MODE 업로드는 data:image URL이다. 서버 fetch 없이 시작 이미지 bytes로 복원한다.
  const dataImage = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/\r\n]+={0,2})$/i.exec(url);
  if (dataImage) {
    const bytes = Buffer.from(dataImage[2].replace(/\s/g, ''), 'base64');
    if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) return undefined;
    return { base64: bytes.toString('base64'), mimeType: dataImage[1].toLowerCase() };
  }
  const fetchUrl = resolveHeroSourceUrl(url, sourceOrigin);
  if (!fetchUrl) return undefined;
  try {
    const res = await fetch(fetchUrl, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const mimeType = res.headers.get('content-type') || 'image/png';
    if (!mimeType.toLowerCase().startsWith('image/')) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return undefined;
    return { base64: buf.toString('base64'), mimeType };
  } catch {
    return undefined;
  }
}
