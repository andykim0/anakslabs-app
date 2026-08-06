/**
 * [§5] POST /api/sites/[siteId]/export — 발행본 정적 백업(zip) 생성.
 *      GET  /api/sites/[siteId]/export — 백업 상태 + 다운로드 URL 조회.
 *
 * 자산 수십 개 다운로드·압축이 있으므로 Node 런타임 + 60초.
 */
import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/env';
import { getDataServices } from '@/lib/data';
import { runSiteExport } from '@/lib/export/run-export';
import {
  MedicalAdPublicBoundaryError,
  medicalPolicyErrorDetails,
} from '@/lib/content/medical-ad-enforcement';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '@/app/api/_lib/guards';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ siteId: string }> };

/** ready 상태의 백업에 대한 다운로드 URL (mock: 스트리밍 라우트 / 실모드: 서명 URL) */
async function downloadUrlFor(siteId: string, objectPath: string): Promise<string> {
  if (isMockMode()) return `/api/sites/${siteId}/export/download`;
  return getDataServices().exports.getDownloadUrl(objectPath);
}

export const POST = withApiHandler<Ctx>(async (_request, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();
  if (!site.siteConfig) {
    return apiError(400, 'PUBLISH_REQUIRED', 'Only a site with a published version can be backed up. Publish it first.');
  }

  let result;
  try {
    result = await runSiteExport(site);
  } catch (error) {
    if (error instanceof MedicalAdPublicBoundaryError) {
      return apiError(
        409,
        error.code,
        '의료광고 안전 검사를 통과한 발행본만 백업할 수 있습니다.',
        medicalPolicyErrorDetails(error.result),
      );
    }
    throw error;
  }
  const downloadUrl = await downloadUrlFor(siteId, result.objectPath);
  return NextResponse.json({ status: 'ready', warnings: result.warnings, downloadUrl });
});

export const GET = withApiHandler<Ctx>(async (_request, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  const status = site.exportStatus ?? 'none';
  let downloadUrl: string | null = null;
  if (status === 'ready' && site.exportUrl) {
    downloadUrl = await downloadUrlFor(siteId, site.exportUrl);
  }
  return NextResponse.json({ status, downloadUrl, requestedAt: site.exportRequestedAt ?? null });
});
