import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import {
  assertVideoGenAllowed,
  generateHeroVideo,
  heroVideoContext,
  isHeroSourceUnavailableError,
} from '@/lib/ai/video-pipeline';
import { siteVideoFulfillmentState } from '@/lib/admin/video-fulfillment-core';
import { getHeroVideoFulfillmentRepository } from '@/lib/admin/video-fulfillment-repository';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import { apiError, parseBody, withApiHandler } from '../../../../_lib/http';
import { requireAdminOr403 } from '../../../../_lib/guards';

type Ctx = { params: Promise<{ siteId: string }> };

const approvalBody = z.object({ approved: z.literal(true) }).strict();

function guardResponse(error: unknown): NextResponse | null {
  const raw = error instanceof Error ? error.message : String(error);
  const separator = raw.indexOf(':');
  const code = separator >= 0 ? raw.slice(0, separator) : raw;
  const message = separator >= 0 ? raw.slice(separator + 1).trim() : raw;
  if (code === 'VIDEO_GEN_DISABLED' || code === 'VIDEO_GEN_SYNC_UNSAFE') {
    return apiError(503, code, message);
  }
  if (code === 'VIDEO_GEN_SITE_CAP' || code === 'VIDEO_GEN_DAILY_CAP') {
    return apiError(429, code, message);
  }
  return null;
}

/** 관리자 최종 디자인 승인 경계: poster를 기준으로 final 영상 정확히 1개 생성. */
export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, approvalBody);
  if (!body.ok) return body.res;

  const { siteId } = await params;
  const { sites, clients, videoGen } = getDataServices();
  const fulfillments = getHeroVideoFulfillmentRepository();
  const [site, existing] = await Promise.all([
    sites.getById(siteId),
    fulfillments.getBySite(siteId),
  ]);
  if (!site) return apiError(404, 'SITE_NOT_FOUND', '사이트를 찾을 수 없습니다.');
  if (existing) {
    return apiError(409, 'VIDEO_FULFILLMENT_COMPLETED', '이미 영상 이행이 완료된 사이트입니다.');
  }
  const client = await clients.getById(site.clientId);
  if (!client) return apiError(409, 'CLIENT_NOT_FOUND', '사이트 소유 고객을 확인할 수 없습니다.');
  const hasIncludedVideo = site.pricingModelVersion === PRICING_MODEL_VERSION;
  const generationTier = hasIncludedVideo ? 'premium' as const : client.tier;

  const state = siteVideoFulfillmentState({ site, client });
  if (!state.pending) {
    return apiError(409, 'VIDEO_FULFILLMENT_NOT_PENDING', '승인할 영상 요청이 없습니다.');
  }
  if (state.blockedReason) {
    return apiError(409, 'VIDEO_FULFILLMENT_BLOCKED', '히어로 원본과 자산 정책을 먼저 확인해 주세요.', {
      reason: state.blockedReason,
    });
  }

  assetProvenanceConfig();
  const context = heroVideoContext(state.config);
  if (!context) return apiError(409, 'HERO_SOURCE_MISSING', '히어로 원본 이미지가 없습니다.');

  // V6 베이직은 최종 승인 시점의 1회만 포함한다. 기존 사이트 6회/일일 20회 가드는 그대로 두고,
  // 현재 가격표로 발급된 사이트에만 더 엄격한 사이트 단위 단발 경계를 적용한다.
  if (hasIncludedVideo && await videoGen.countBySite(siteId) > 0) {
    return apiError(409, 'INCLUDED_VIDEO_ALREADY_GENERATED', '이 사이트의 포함 영상은 이미 1회 생성됐습니다.');
  }

  try {
    // 생성 함수가 다시 검사하지만, 관리자 승인 응답은 비용 발생 전에 가드 이유를 고정한다.
    await assertVideoGenAllowed(siteId, generationTier);
    const generated = await generateHeroVideo({
      clientId: client.id,
      siteId,
      tier: generationTier,
      ctx: context,
      stage: 'final',
      sourceOrigin: request.nextUrl.origin,
    });
    if (!generated.assetId) {
      return apiError(503, 'VIDEO_ASSET_REGISTRATION_REQUIRED', '생성 영상의 서버 자산 등록을 확인할 수 없습니다.');
    }
    if (hasIncludedVideo && client.tier !== 'premium') {
      // 기존 렌더러는 premium tier를 영상 자산 entitlement로 해석한다.
      // 실제 생성 성공 전에는 승급하지 않아 포스터 데모를 영상으로 오인하지 않는다.
      await clients.updateTier(client.id, 'premium');
    }
    return NextResponse.json({
      approved: true,
      generated: true,
      videoAssetId: generated.assetId,
      videoUrl: generated.videoUrl,
      posterUrl: generated.posterUrl,
      model: generated.model,
    });
  } catch (error) {
    if (isHeroSourceUnavailableError(error)) {
      return apiError(409, 'HERO_SOURCE_UNAVAILABLE', '히어로 원본을 불러올 수 없어 영상을 생성하지 않았습니다.');
    }
    const response = guardResponse(error);
    if (response) return response;
    throw error;
  }
});
