/**
 * POST /api/sites/[siteId]/publish — 발행 (draft → 발행본, status='live', 서브도메인 할당).
 * body: { humanChecks: { ...3개 true }, businessInfoConfirmed?: true }.
 * 사업자 정보 확인은 KO/default 사이트 또는 선택 입력된 US 정보에만 요구하고,
 * 사람만 판단할 수 있는 최종 확인은 모든 발행에서 서버가 재검증한다.
 * 응답: { site, url } — url은 라이브 주소.
 *
 * 모든 발행 게이트는 lib/publish/publish-site-service.ts 에 한 벌만 있고, 오퍼레이터 콘솔의
 * /api/admin/clients/[id]/sites/[siteId]/publish 가 같은 함수를 호출한다. 이 라우트가 따로
 * 가지는 것은 고객 세션 인증과 응답 모양뿐이다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { apiError, withApiHandler } from '../../../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../../../_lib/guards';
import { notifyIndexNowAfterPublish } from '@/lib/publish/publish-indexnow';
import { publishSiteWithAudits } from '@/lib/publish/publish-site-service';

type Ctx = { params: Promise<{ siteId: string }> };

export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  // Read the request body once, then let the shared service validate the locale-specific
  // operator confirmation and the human checks.
  let body: { businessInfoConfirmed?: unknown; humanChecks?: unknown } | null = null;
  try {
    body = (await request.json()) as { businessInfoConfirmed?: unknown; humanChecks?: unknown } | null;
  } catch {
    body = null;
  }

  const result = await publishSiteWithAudits({
    site,
    owner: client,
    humanChecks: body?.humanChecks,
    businessInfoConfirmed: body?.businessInfoConfirmed,
  });
  if (!result.ok) {
    return apiError(result.status, result.code, result.message, result.details);
  }

  notifyIndexNowAfterPublish(result.published);

  return NextResponse.json({
    site: result.published,
    url: result.url,
    preflight: result.preflight,
  });
});
