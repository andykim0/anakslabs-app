/**
 * [motion 4단계 — V3] 히어로 영상 생성 (Premium).
 *  POST  → fast 시안 N안(기본 2) 순차 생성. 비용 가드 3종 + Premium tier(파이프라인 내부). 산출물은 미적용.
 *  PATCH → 고객이 고른 시안을 draftConfig 히어로 background.video로 적용 + 선택 로그.
 *
 * 실패/가드 위반은 명확한 에러 → 클라가 "영상은 준비되는 대로" 안내로 폴백(사이트는 ken-burns로 항상 완성).
 * Veo 폴링이 길어(최대 ~5분) route maxDuration을 300s로. mock 모드는 즉시.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '../../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../../_lib/guards';
import { hasVideoAddon } from '@/lib/services/entitlements';
import { videoGenConfig } from '@/lib/env';
import { isSafeMediaSrc } from '@/lib/safe-url';
import {
  applyHeroVideoToConfig,
  generateHeroVideo,
  HERO_SOURCE_UNAVAILABLE,
  heroVideoContext,
  isHeroSourceUnavailableError,
  recordHeroVideoSelection,
  type HeroVideoResult,
} from '@/lib/ai/video-pipeline';

export const maxDuration = 300; // Veo 폴링 대비 (Vercel Pro 상한)

type Ctx = { params: Promise<{ siteId: string }> };

const draftsBody = z.object({
  count: z.number().int().min(1).max(2).optional(),
  // 자유 카피·상품명이 아니라 등록 무드 선택만 받는다.
  tone: z.array(z.string().trim().min(1).max(40)).max(2).optional(),
  // 출처 판정용 표식일 뿐 fetch URL로 사용하지 않는다. 실제 hero src와 exact match해야 효력이 있다.
  heroPhotoUrl: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine(
      (value) => isSafeMediaSrc(value) && !/^(?:blob:|data:video\/)/i.test(value),
      '사진 주소 형식이 올바르지 않습니다.',
    )
    .optional(),
});

const applyBody = z.object({
  videoUrl: z.string().min(1),
  posterUrl: z.string().min(1),
  prompt: z.string().max(2000).optional(),
  model: z.string().max(120).optional(),
});

/** POST — fast 시안 생성 */
export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();
  if (!hasVideoAddon(client.tier)) return apiError(403, 'VIDEO_GEN_ADDON', 'AI 영상 히어로는 영상 애드온이 필요합니다. 애드온을 추가해 주세요.');

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();
  const config = site.draftConfig ?? site.siteConfig;
  if (!config) return apiError(409, 'NO_DRAFT', '초안이 없습니다. 에디터에서 사이트를 먼저 편집해 주세요.');

  const body = await parseBody(request, draftsBody);
  if (!body.ok) return body.res;
  const count = body.data.count ?? 2;

  const ctx = heroVideoContext(config, { tone: body.data.tone, heroPhotoUrl: body.data.heroPhotoUrl });
  if (!ctx) return apiError(409, 'NO_HERO_IMAGE', '히어로 배경 이미지가 없어 영상을 만들 수 없습니다.');

  // 사이트당 상한 사전 확인 (병렬 레이스 회피 위해 순차 생성)
  const { videoGen } = getDataServices();
  const cfg = videoGenConfig();
  const remaining = cfg.maxPerSite - (await videoGen.countBySite(siteId));
  if (remaining < count) {
    return apiError(429, 'VIDEO_GEN_SITE_CAP', `이 사이트의 영상 생성 상한(${cfg.maxPerSite}회)에 도달했습니다. 에디터에서 크레딧으로 재생성할 수 있어요.`);
  }

  const drafts: HeroVideoResult[] = [];
  try {
    for (let i = 0; i < count; i++) {
      // generateHeroVideo가 시작 이미지와 킬스위치·tier·상한을 다시 검증한다. 첫 실패면 그대로 중단.
      drafts.push(
        await generateHeroVideo({
          siteId,
          tier: client.tier,
          ctx,
          stage: 'draft',
          sourceOrigin: request.nextUrl.origin,
        }),
      );
    }
  } catch (error) {
    if (isHeroSourceUnavailableError(error)) {
      return apiError(409, HERO_SOURCE_UNAVAILABLE, '히어로 시작 이미지를 불러올 수 없어 영상 생성을 중단했습니다.');
    }
    throw error;
  }
  return NextResponse.json({ drafts });
});

/** PATCH — 선택한 시안 적용 */
export const PATCH = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();
  const config = site.draftConfig ?? site.siteConfig;
  if (!config) return apiError(409, 'NO_DRAFT', '초안이 없습니다.');

  const body = await parseBody(request, applyBody);
  if (!body.ok) return body.res;

  const next = applyHeroVideoToConfig(config, body.data.videoUrl, body.data.posterUrl);
  await getDataServices().sites.saveDraft(siteId, next);
  await recordHeroVideoSelection({
    siteId,
    tier: client.tier,
    model: body.data.model ?? 'unknown',
    videoUrl: body.data.videoUrl,
    prompt: body.data.prompt ?? '',
  });
  return NextResponse.json({ ok: true });
});
