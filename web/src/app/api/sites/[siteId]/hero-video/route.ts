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
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { resolveOwnedAssetRecords, toAssetRef } from '@/lib/assets/registry';
import { resolveSiteAssetPolicy } from '@/lib/assets/assignment';
import {
  applyHeroVideoToConfig,
  assertVideoGenAllowed,
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

const appliedMediaSrc = z
  .string()
  .trim()
  .min(1)
  .refine(isSafeMediaSrc, '이미지/영상 주소 형식이 올바르지 않습니다.');

const applyBody = z.object({
  videoUrl: appliedMediaSrc,
  posterUrl: appliedMediaSrc,
  prompt: z.string().max(2000).optional(),
  model: z.string().max(120).optional(),
  assetId: z.string().uuid().optional(),
});

/** VIDEO_GEN typed prefix를 비용 발생 전 API 응답으로 변환한다. */
function videoGuardResponse(error: unknown): NextResponse | null {
  const raw = error instanceof Error ? error.message : String(error);
  const separator = raw.indexOf(':');
  const code = separator >= 0 ? raw.slice(0, separator) : raw;
  const message = separator >= 0 ? raw.slice(separator + 1).trim() : raw;

  if (code === 'VIDEO_GEN_ADDON') return apiError(403, code, message);
  if (code === 'VIDEO_GEN_DISABLED' || code === 'VIDEO_GEN_SYNC_UNSAFE') {
    return apiError(503, code, message);
  }
  if (code === 'VIDEO_GEN_SITE_CAP' || code === 'VIDEO_GEN_DAILY_CAP') {
    return apiError(429, code, message);
  }
  return null;
}

/** POST — fast 시안 생성 */
export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();
  if (!hasVideoAddon(client.tier)) return apiError(403, 'VIDEO_GEN_ADDON', 'An AI video hero requires AI video homepage approval.');

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();
  const config = site.draftConfig ?? site.siteConfig;
  if (!config) return apiError(409, 'NO_DRAFT', 'There is no draft yet. Edit the site in the editor first.');

  const body = await parseBody(request, draftsBody);
  if (!body.ok) return body.res;
  const count = body.data.count ?? 2;

  // provenance dependency 오류는 VIDEO_GEN 비용 가드·로그·Veo 호출 전에 중단한다.
  assetProvenanceConfig();

  // 킬스위치→애드온→상한→동기 전송 가드를 이미지 fetch·로그·Veo 호출 전에 통과한다.
  try {
    await assertVideoGenAllowed(siteId, client.tier);
  } catch (error) {
    const response = videoGuardResponse(error);
    if (response) return response;
    throw error;
  }

  const ctx = heroVideoContext(config, { tone: body.data.tone, heroPhotoUrl: body.data.heroPhotoUrl });
  if (!ctx) return apiError(409, 'NO_HERO_IMAGE', 'There is no hero background image, so a video cannot be made.');

  // 사이트당 상한 사전 확인 (병렬 레이스 회피 위해 순차 생성)
  const { videoGen } = getDataServices();
  const cfg = videoGenConfig();
  const remaining = cfg.maxPerSite - (await videoGen.countBySite(siteId));
  if (remaining < count) {
    return apiError(429, 'VIDEO_GEN_SITE_CAP', `This site reached its video generation limit (${cfg.maxPerSite}). You can regenerate with credits in the editor.`);
  }

  const drafts: HeroVideoResult[] = [];
  try {
    for (let i = 0; i < count; i++) {
      // generateHeroVideo가 시작 이미지와 킬스위치·tier·상한을 다시 검증한다. 첫 실패면 그대로 중단.
      drafts.push(
        await generateHeroVideo({
          clientId: client.id,
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
      return apiError(409, HERO_SOURCE_UNAVAILABLE, 'The hero starting image could not be loaded, so video generation stopped.');
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
  if (!hasVideoAddon(client.tier)) return apiError(403, 'VIDEO_GEN_ADDON', 'An AI video hero requires AI video homepage approval.');

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();
  const config = site.draftConfig ?? site.siteConfig;
  if (!config) return apiError(409, 'NO_DRAFT', 'There is no draft.');

  const body = await parseBody(request, applyBody);
  if (!body.ok) return body.res;

  const provenance = assetProvenanceConfig();
  let trustedAssetRef: { assetId: string; url: string } | undefined;
  if (provenance.write) {
    if (!body.data.assetId) {
      return apiError(422, 'ASSET_PROVENANCE_REQUIRED', 'The server provenance record for this video asset could not be confirmed. Generate the draft again.');
    }
    try {
      const [record] = await resolveOwnedAssetRecords({
        assetIds: [body.data.assetId],
        clientId: client.id,
        siteId,
      });
      if (!record || record.origin !== 'ai_generated' || record.mediaType !== 'video') {
        throw new Error('The selected asset is not a server-generated video.');
      }
      trustedAssetRef = toAssetRef(record);
      if (trustedAssetRef.url !== body.data.videoUrl) {
        throw new Error('The selected video URL does not match its canonical registry record.');
      }
    } catch {
      return apiError(422, 'ASSET_PROVENANCE_MISMATCH', 'The ownership or storage address for this video asset does not match.');
    }
  } else if (body.data.assetId) {
    return apiError(422, 'ASSET_PROVENANCE_DISABLED', 'The current asset provenance mode does not accept an assetId.');
  }

  const next = applyHeroVideoToConfig(
    config,
    body.data.videoUrl,
    body.data.posterUrl,
    trustedAssetRef,
  );
  const assetPolicy = await resolveSiteAssetPolicy({
    operation: 'assign',
    config: next,
    clientId: client.id,
    siteId,
    assetPolicyVersion: site.assetPolicyVersion,
    phase: 'regeneration',
  });
  await getDataServices().sites.saveDraft(siteId, assetPolicy.config);
  await recordHeroVideoSelection({
    siteId,
    tier: client.tier,
    model: body.data.model ?? 'unknown',
    videoUrl: body.data.videoUrl,
    prompt: body.data.prompt ?? '',
  });
  return NextResponse.json({
    ok: true,
    ...(assetPolicy.violations.length
      ? {
          assetWarnings: assetPolicy.violations.map(({ slotKey, reason, fallbackIntent }) => ({
            slotKey,
            reason,
            fallbackIntent,
          })),
        }
      : {}),
  });
});
