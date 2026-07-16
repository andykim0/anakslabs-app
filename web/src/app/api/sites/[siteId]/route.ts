/**
 * GET  /api/sites/[siteId]  — 사이트 단건 조회 (소유권 검증).
 * PATCH /api/sites/[siteId] — 에디터 초안 저장. body: { draftConfig: SiteConfig }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SiteConfig } from '@/lib/types/site';
import { getDataServices } from '@/lib/data';
import { parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../_lib/guards';
import { siteConfigSchema } from '../../_lib/schemas';
import { sanitizeMotion } from '@/lib/motion/validate';
import { preserveSiteClassification } from '@/lib/onboarding/site-classification';
import { resolveStoredBeforeAfterMotionOptions } from '@/lib/motion/before-after-activation';
import { validateConfigAssetRefsForSave } from '@/lib/assets/owned-refs';
import {
  preservePersistedAssetUsagesInPreview,
  resolveSiteAssetPolicy,
} from '@/lib/assets/assignment';

type Ctx = { params: Promise<{ siteId: string }> };

export const GET = withApiHandler<Ctx>(async (_request, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  // Dashboard previews are a production render surface too. Project both
  // persisted snapshots through the server policy without mutating storage;
  // legacy-bypass/observe return the original config objects unchanged.
  const projectPreview = async (config: SiteConfig | null) => {
    if (!config) return null;
    const policy = await resolveSiteAssetPolicy({
      operation: 'audit',
      config,
      clientId: client.id,
      siteId,
      assetPolicyVersion: site.assetPolicyVersion,
      phase: 'preview',
    });
    return preservePersistedAssetUsagesInPreview({
      projectedConfig: policy.config,
      persistedConfig: config,
    });
  };
  const [draftConfig, siteConfig] = await Promise.all([
    projectPreview(site.draftConfig),
    projectPreview(site.siteConfig),
  ]);
  const previewSite = draftConfig === site.draftConfig && siteConfig === site.siteConfig
    ? site
    : { ...site, draftConfig, siteConfig };

  return NextResponse.json({ site: previewSite });
});

const patchSchema = z.object({
  draftConfig: siteConfigSchema,
});

export const PATCH = withApiHandler<Ctx>(async (request, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  const body = await parseBody(request, patchSchema);
  if (!body.ok) return body.res;

  // [SS5] 목적/템플릿은 생성 시 확정된 서버 분류다. PATCH body로 바꿔 절제 게이트를 우회할 수 없다.
  const persistedConfig = site.draftConfig ?? site.siteConfig;
  const classified = preserveSiteClassification(body.data.draftConfig as SiteConfig, persistedConfig);
  const assetValidated = await validateConfigAssetRefsForSave({
    config: classified,
    persistedConfig,
    clientId: client.id,
    siteId,
  });
  // [motion-system] 플랜 기준 모션 새니타이즈 — 위반은 403이 아니라 자동 강등 + changes 안내.
  // 민감 scene는 저장된 URL/클라이언트 provenance를 신뢰하지 않고 현재 owner/site 레지스트리로 재검증한다.
  const provenance = await resolveStoredBeforeAfterMotionOptions({ config: assetValidated, clientId: client.id, siteId });
  const { config: sanitized, changes } = sanitizeMotion(
    assetValidated,
    client.tier,
    provenance.ok ? provenance.options : { ownerId: client.id, siteId },
  );
  if (!provenance.ok) changes.push(`전후 비교 연출을 비활성화했습니다: ${provenance.message}`);
  const assetPolicy = await resolveSiteAssetPolicy({
    // An editor save is an assignment boundary: recompute the server-owned
    // usage manifest from the actual slots before persisting. Preview-only
    // reads use `audit`; writes must never preserve a stale client manifest.
    operation: 'assign',
    config: sanitized,
    clientId: client.id,
    siteId,
    assetPolicyVersion: site.assetPolicyVersion,
    phase: 'preview',
  });
  await getDataServices().sites.saveDraft(siteId, assetPolicy.config);
  return NextResponse.json({
    ok: true,
    savedAt: new Date().toISOString(),
    ...(changes.length ? { motionChanges: changes } : {}),
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
