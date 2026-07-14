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

type Ctx = { params: Promise<{ siteId: string }> };

export const GET = withApiHandler<Ctx>(async (_request, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  return NextResponse.json({ site });
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
  // [motion-system] 플랜 기준 모션 새니타이즈 — 위반은 403이 아니라 자동 강등 + changes 안내.
  const { config: sanitized, changes } = sanitizeMotion(classified, client.tier);
  await getDataServices().sites.saveDraft(siteId, sanitized);
  return NextResponse.json({
    ok: true,
    savedAt: new Date().toISOString(),
    ...(changes.length ? { motionChanges: changes } : {}),
  });
});
