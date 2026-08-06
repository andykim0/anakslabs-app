import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { applyHeroVideoToConfig } from '@/lib/ai/video-pipeline-core';
import { getHeroVideoFulfillmentRepository } from '@/lib/admin/video-fulfillment-repository';
import {
  siteVideoFulfillmentState,
  type VideoFulfillmentBlockedReason,
} from '@/lib/admin/video-fulfillment-core';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { resolveOwnedAssetRecords, toAssetRef } from '@/lib/assets/registry';
import { resolveSiteAssetPolicy } from '@/lib/assets/assignment';
import { resolveStoredBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';
import { preflightScan } from '@/lib/scan/preflight';
import { checkPublish } from '@/lib/publish/preflight';
import { siteUrlOf } from '@/lib/seo/structured-data';
import type { AssetRecord } from '@/lib/assets/provenance';
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

function blockedFulfillmentResponse(reason: VideoFulfillmentBlockedReason): NextResponse {
  if (reason === 'asset-policy-v2-required') {
    return apiError(
      409,
      'VIDEO_FULFILLMENT_ASSET_POLICY_REQUIRED',
      '자산 출처 정책 v2가 확인되지 않아 영상을 안전하게 적용할 수 없습니다.',
    );
  }
  if (reason === 'hero-poster-mismatch') {
    return apiError(
      409,
      'VIDEO_FULFILLMENT_HERO_SOURCE_MISMATCH',
      '초안과 발행본의 히어로 원본이 달라 같은 poster를 적용할 수 없습니다.',
    );
  }
  return apiError(
    409,
    'HERO_SOURCE_MISSING',
    '히어로 원본 이미지가 없어 poster와 영상을 안전하게 적용할 수 없습니다.',
  );
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
  if (!site) return apiError(404, 'SITE_NOT_FOUND', 'Site not found.');
  const client = await clients.getById(site.clientId);
  if (!client) return apiError(409, 'CLIENT_NOT_FOUND', 'The client who owns this site could not be resolved.');

  if (existing) {
    if (existing.videoAssetId !== body.data.videoAssetId) {
      return apiError(409, 'VIDEO_FULFILLMENT_CONFLICT', 'This site was already fulfilled with a different video asset.');
    }
    return NextResponse.json({ ok: true, duplicated: true });
  }

  const state = siteVideoFulfillmentState({ site, client });
  if (!state.pending) {
    return apiError(409, 'VIDEO_FULFILLMENT_NOT_PENDING', 'The add-on entitlement, the explicit request, and the unfulfilled state could not all be confirmed.');
  }
  if (state.blockedReason) {
    return blockedFulfillmentResponse(state.blockedReason);
  }

  let videoRecord: AssetRecord | undefined;
  try {
    [videoRecord] = await resolveOwnedAssetRecords({
      assetIds: [body.data.videoAssetId],
      clientId: client.id,
      siteId,
    });
  } catch {
    return apiError(422, 'VIDEO_ASSET_PROVENANCE_MISMATCH', 'The ownership and site binding records for this video asset could not be confirmed.');
  }
  if (
    !videoRecord
    || videoRecord.origin !== 'ai_generated'
    || videoRecord.mediaType !== 'video'
    || !videoRecord.storageBucket
    || !videoRecord.storageKey
  ) {
    return apiError(422, 'VIDEO_ASSET_PROVENANCE_INVALID', 'Only server-registered AI video assets can be used for fulfillment.');
  }

  const posterUrl = heroPoster(state.config);
  if (!posterUrl) return apiError(409, 'HERO_SOURCE_MISSING', 'The hero poster source could not be confirmed.');
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
      return apiError(422, 'VIDEO_FULFILLMENT_POLICY_REJECTED', 'The current asset policy does not allow assigning this video.');
    }
    throw error;
  }

  // Updating an existing live snapshot is equivalent to publishing a new
  // artifact. Audit the exact policy-authorized object that the atomic
  // repository call will persist; warnings remain non-blocking by contract.
  if (nextSiteConfig) {
    let motionProvenance: Awaited<ReturnType<typeof resolveStoredBeforeAfterMotionOptions>>;
    try {
      motionProvenance = await resolveStoredBeforeAfterMotionOptions({
        config: nextSiteConfig,
        clientId: client.id,
        siteId,
      });
    } catch (error) {
      console.error('[video-fulfillment] live motion provenance audit unavailable', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return apiError(
        503,
        'VIDEO_FULFILLMENT_PUBLISH_AUDIT_UNAVAILABLE',
        '영상 적용 전 발행 자산 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
    if (!motionProvenance.ok) {
      return apiError(
        409,
        'VIDEO_FULFILLMENT_PUBLISH_PROVENANCE_BLOCKED',
        motionProvenance.message,
        { reason: motionProvenance.code },
      );
    }

    let scan: ReturnType<typeof preflightScan>;
    let publishGate: ReturnType<typeof checkPublish>;
    try {
      scan = preflightScan(nextSiteConfig, {
        siteUrl: siteUrlOf(site.domain) || undefined,
        tier: client.tier,
        motionOwnerId: client.id,
        motionSiteId: siteId,
        motionAssets: motionProvenance.options.assets,
      });
      publishGate = checkPublish(nextSiteConfig, client.tier, {
        scan: { total: scan.scores.total, grade: scan.grade },
        artifact: scan.publishAudit,
      });
    } catch (error) {
      console.error('[video-fulfillment] live artifact audit unavailable', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return apiError(
        503,
        'VIDEO_FULFILLMENT_PUBLISH_AUDIT_UNAVAILABLE',
        '영상 적용 전 발행 품질 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
    if (!publishGate.ok) {
      return apiError(
        409,
        'VIDEO_FULFILLMENT_PUBLISH_QUALITY_BLOCKED',
        publishGate.blockers.join(' '),
        { blockers: publishGate.blockers },
      );
    }
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
      return apiError(409, 'VIDEO_FULFILLMENT_CONFIG_CHANGED', 'The client edited this site recently. Refresh the queue and apply again.');
    }
    if (/RETRY_CONFLICT|conflicts with completed history|23505/i.test(message)) {
      return apiError(409, 'VIDEO_FULFILLMENT_CONFLICT', 'The requested asset does not match the fulfillment history for this site.');
    }
    if (/PROVENANCE|asset provenance|42501/i.test(message)) {
      return apiError(422, 'VIDEO_ASSET_PROVENANCE_MISMATCH', 'Re-check the server provenance record for this video asset.');
    }
    throw error;
  }

  return NextResponse.json({ ok: true, duplicated: false });
});
