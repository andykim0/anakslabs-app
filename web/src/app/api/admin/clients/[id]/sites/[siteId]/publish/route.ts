/**
 * POST /api/admin/clients/[id]/sites/[siteId]/publish — 오퍼레이터가 고객 대신 발행한다.
 *
 * 왜 필요한가: US 운영대행 고객은 에디터를 열지 않는다. 승인 프리뷰를 배송해 draft 를 만들어도
 * 발행 경로가 고객 세션 뒤에만 있어서 오퍼레이터가 그 사이트를 라이브로 올릴 수 없었다.
 *
 * 이 라우트는 발행 로직을 새로 쓰지 않는다. 고객 라우트와 똑같이
 * `publishSiteWithAudits`(lib/publish/publish-site-service.ts)를 호출하므로 법무·모션 출처·
 * 자산 정책·품질 프리플라이트·발행 시 결제 게이트가 모두 그대로 돈다.
 *
 * 완화하지 않는 두 게이트:
 *  - 휴먼 3체크: 사람만 판단할 수 있는 확인이라 오퍼레이터가 **자기 이름으로** 제출한다.
 *    누가 확인했는지는 아래 감사 로그에 남는다.
 *  - 구독 결제: 활성 구독이 없으면 402 그대로 반환한다. 콘솔이 "활성 구독이 필요합니다"로 표시한다.
 *
 * body: { humanChecks: { heroPhotoAuthentic, copyIsFactual, worthThePrice }, businessInfoConfirmed? }
 */
import { NextResponse } from 'next/server';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { getDataServices } from '@/lib/data';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { notifyIndexNowAfterPublish } from '@/lib/publish/publish-indexnow';
import { publishSiteWithAudits } from '@/lib/publish/publish-site-service';

type Ctx = { params: Promise<{ id: string; siteId: string }> };

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  // The person who confirmed the human checks has to be a real operator identity, not a constant:
  // this is the only record of who looked at the screen before it went live.
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', 'Administrator access is required.');
  const { id: clientId, siteId } = await params;

  const { clients, sites } = getDataServices();
  const site = await sites.getById(siteId);
  if (!site || site.clientId !== clientId) {
    return apiError(404, 'SITE_NOT_FOUND', 'Site not found.');
  }
  const owner = await clients.getById(site.clientId);
  if (!owner) return apiError(404, 'CLIENT_NOT_FOUND', 'Client not found.');

  let body: { businessInfoConfirmed?: unknown; humanChecks?: unknown } | null = null;
  try {
    body = (await request.json()) as { businessInfoConfirmed?: unknown; humanChecks?: unknown } | null;
  } catch {
    body = null;
  }

  // Tier, subscription and asset ownership belong to the customer, so the owner account is what
  // the audits run against. The operator is the checker, not the publisher of record.
  const result = await publishSiteWithAudits({
    site,
    owner,
    humanChecks: body?.humanChecks,
    businessInfoConfirmed: body?.businessInfoConfirmed,
  });
  if (!result.ok) {
    return apiError(result.status, result.code, result.message, result.details);
  }

  console.info('[operator-publish] published on behalf of a client:', {
    actorId,
    clientId,
    siteId,
    domain: result.published.domain,
    deliveredFromPreviewId: site.deliveredFromPreviewId ?? null,
  });

  notifyIndexNowAfterPublish(result.published);

  return NextResponse.json({
    site: result.published,
    url: result.url,
    preflight: result.preflight,
    checkedBy: actorId,
  });
});
