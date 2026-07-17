import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { applyHeroVideoToConfig } from '@/lib/ai/video-pipeline-core';
import { getHeroVideoFulfillmentRepository } from '@/lib/admin/video-fulfillment-repository';
import { siteVideoFulfillmentState } from '@/lib/admin/video-fulfillment-core';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { resolveOwnedAssetRecords, toAssetRef } from '@/lib/assets/registry';
import { resolveSiteAssetPolicy } from '@/lib/assets/assignment';
import type { AssetRecord } from '@/lib/assets/provenance';
import type { Site } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { apiError, parseBody, withApiHandler } from '../../../../_lib/http';
import { requireAdminOr403 } from '../../../../_lib/guards';

type Ctx = { params: Promise<{ siteId: string }> };

const completeBody = z.object({
  videoAssetId: z.string().uuid(),
}).strict();

function heroPoster(config: SiteConfig): string | null {
  return config.pages
    .find((page) => page.slug === '')
    ?.sections.find((section) => section.type === 'hero' && !section.hidden)
    ?.background.image?.src ?? null;
}

function activeConfig(site: Site): SiteConfig | null {
  return site?.draftConfig ?? site?.siteConfig ?? null;
}

export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { siteId } = await params;
  const body = await parseBody(request, completeBody);
  if (!body.ok) return body.res;

  // Invalid flag dependencies are an operational error, never a silent legacy downgrade.
  assetProvenanceConfig();

  const { sites, clients } = getDataServices();
  const repository = getHeroVideoFulfillmentRepository();
  const [site, existing] = await Promise.all([
    sites.getById(siteId),
    repository.getBySite(siteId),
  ]);
  if (!site) return apiError(404, 'SITE_NOT_FOUND', '사이트를 찾을 수 없습니다.');
  const client = await clients.getById(site.clientId);
  if (!client) return apiError(409, 'CLIENT_NOT_FOUND', '사이트 소유 고객을 확인할 수 없습니다.');

  if (existing) {
    if (existing.videoAssetId !== body.data.videoAssetId) {
      return apiError(409, 'VIDEO_FULFILLMENT_CONFLICT', '이 사이트는 다른 영상 자산으로 이행 완료되었습니다.');
    }
    return NextResponse.json({ ok: true, duplicated: true });
  }

  const state = siteVideoFulfillmentState({ site, client });
  if (!state.pending) {
    return apiError(409, 'VIDEO_FULFILLMENT_NOT_PENDING', '애드온 권한·명시적 요청·미이행 상태를 모두 확인할 수 없습니다.');
  }
  if (state.blockedReason) {
    return apiError(409, 'HERO_SOURCE_MISSING', '히어로 원본 이미지가 없어 poster와 영상을 안전하게 적용할 수 없습니다.');
  }

  let videoRecord: AssetRecord | undefined;
  try {
    [videoRecord] = await resolveOwnedAssetRecords({
      assetIds: [body.data.videoAssetId],
      clientId: client.id,
      siteId,
    });
  } catch {
    return apiError(422, 'VIDEO_ASSET_PROVENANCE_MISMATCH', '영상 자산의 소유·사이트 귀속 기록을 확인할 수 없습니다.');
  }
  if (
    !videoRecord
    || videoRecord.origin !== 'ai_generated'
    || videoRecord.mediaType !== 'video'
    || !videoRecord.storageBucket
    || !videoRecord.storageKey
  ) {
    return apiError(422, 'VIDEO_ASSET_PROVENANCE_INVALID', '서버가 등록한 AI 영상 자산만 이행에 사용할 수 있습니다.');
  }

  const current = activeConfig(site);
  const posterUrl = current ? heroPoster(current) : null;
  if (!posterUrl) return apiError(409, 'HERO_SOURCE_MISSING', '히어로 poster 원본을 확인할 수 없습니다.');
  const trustedAssetRef = toAssetRef(videoRecord);

  const applyAndAuthorize = async (config: SiteConfig | null) => {
    if (!config) return null;
    const applied = applyHeroVideoToConfig(
      config,
      videoRecord.canonicalUrl,
      posterUrl,
      trustedAssetRef,
    );
    const policy = await resolveSiteAssetPolicy({
      operation: 'assign',
      config: applied,
      clientId: client.id,
      siteId,
      assetPolicyVersion: site.assetPolicyVersion,
      phase: 'regeneration',
    });
    const retainedVideo = policy.config.pages
      .find((page) => page.slug === '')
      ?.sections.find((section) => section.type === 'hero' && !section.hidden)
      ?.background.video;
    if (retainedVideo?.src !== videoRecord.canonicalUrl || retainedVideo.poster !== posterUrl) {
      throw new Error('VIDEO_FULFILLMENT_POLICY_REJECTED');
    }
    return policy.config;
  };

  let nextDraftConfig;
  let nextSiteConfig;
  try {
    [nextDraftConfig, nextSiteConfig] = await Promise.all([
      applyAndAuthorize(site.draftConfig),
      applyAndAuthorize(site.siteConfig),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === 'VIDEO_FULFILLMENT_POLICY_REJECTED') {
      return apiError(422, 'VIDEO_FULFILLMENT_POLICY_REJECTED', '현재 자산 정책에서 이 영상의 배정을 승인할 수 없습니다.');
    }
    throw error;
  }

  try {
    await repository.complete({
      siteId,
      clientId: client.id,
      videoAssetId: videoRecord.id,
      canonicalVideoUrl: videoRecord.canonicalUrl,
      posterUrl,
      expectedDraftConfig: site.draftConfig,
      expectedSiteConfig: site.siteConfig,
      nextDraftConfig,
      nextSiteConfig,
      requestedAt: state.requestedAt,
      requestedAtSource: state.requestedAtSource,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/CONFIG_CHANGED|changed concurrently|40001/i.test(message)) {
      return apiError(409, 'VIDEO_FULFILLMENT_CONFIG_CHANGED', '고객의 최근 편집이 탐지됐습니다. 큐를 새로고침한 뒤 다시 적용해 주세요.');
    }
    if (/RETRY_CONFLICT|conflicts with completed history|23505/i.test(message)) {
      return apiError(409, 'VIDEO_FULFILLMENT_CONFLICT', '이 사이트의 이행 이력과 요청한 자산이 다릅니다.');
    }
    if (/PROVENANCE|asset provenance|42501/i.test(message)) {
      return apiError(422, 'VIDEO_ASSET_PROVENANCE_MISMATCH', '영상 자산의 서버 출처 기록을 재확인해 주세요.');
    }
    throw error;
  }

  return NextResponse.json({ ok: true, duplicated: false });
});
