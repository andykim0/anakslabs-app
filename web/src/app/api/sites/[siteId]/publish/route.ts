/**
 * POST /api/sites/[siteId]/publish — 발행 (draft → 발행본, status='live', 서브도메인 할당).
 * 응답: { site, url } — url은 라이브 주소.
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { apiError, withApiHandler } from '../../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../../_lib/guards';

type Ctx = { params: Promise<{ siteId: string }> };

export const POST = withApiHandler<Ctx>(async (_request, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  if (!site.draftConfig) {
    return apiError(409, 'NO_DRAFT', '발행할 초안이 없습니다. 에디터에서 사이트를 먼저 편집해 주세요.');
  }

  const published = await getDataServices().sites.publish(siteId);
  return NextResponse.json({
    site: published,
    url: published.domain ? `https://${published.domain}` : null,
  });
});
