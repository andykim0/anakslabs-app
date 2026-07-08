/**
 * [§5] GET /api/sites/[siteId]/export/download — 백업 zip 다운로드.
 *  - mock: 스토어에 보관된 버퍼를 스트리밍
 *  - 실모드: Storage 서명 URL로 리다이렉트
 */
import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/env';
import { getDataServices } from '@/lib/data';
import { getMockExportBlob } from '@/lib/data/mock/exports';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '@/app/api/_lib/guards';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ siteId: string }> };

export const GET = withApiHandler<Ctx>(async (_request, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();
  if ((site.exportStatus ?? 'none') !== 'ready' || !site.exportUrl) {
    return apiError(404, 'EXPORT_NOT_READY', '준비된 백업이 없습니다. 먼저 백업을 생성해 주세요.');
  }

  if (isMockMode()) {
    const blob = getMockExportBlob(site.exportUrl);
    if (!blob) {
      return apiError(404, 'EXPORT_EXPIRED', '백업 파일이 만료되었거나 없습니다. 다시 생성해 주세요.');
    }
    return new NextResponse(new Uint8Array(blob.buffer), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${blob.filename}"`,
        'content-length': String(blob.buffer.length),
      },
    });
  }

  const signed = await getDataServices().exports.getDownloadUrl(site.exportUrl);
  return NextResponse.redirect(signed);
});
