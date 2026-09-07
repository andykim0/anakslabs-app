/**
 * GET /api/admin/clients/[id]/sites/[siteId]/publish-gate — 발행을 눌러보기 전에 게이트 결과를 읽는다.
 *
 * 왜 필요한가: 지금까지 콘솔이 "이 사이트는 발행할 수 없다"를 알아내는 유일한 방법은 실제로
 * 발행을 눌러 409 를 받는 것이었다. 오퍼레이터는 그 시점에 이미 고객에게 날짜를 말한 뒤다.
 *
 * 이 라우트는 게이트를 새로 쓰지 않는다. 저장된 draft 의 SiteConfig 를 `publishSiteWithAudits`
 * 와 같은 합성(`preflightScan` → `checkPublish(..., { scan, artifact })`)으로 다시 채점할 뿐이라
 * 화면의 문구와 실제 거부 사유가 어긋날 수 없다. 읽기 전용 — 아무것도 쓰지 않고, 승인된 바이트를
 * 다시 컴파일하지도 않는다.
 */
import { NextResponse } from 'next/server';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { getDataServices } from '@/lib/data';
import { evaluateStoredConfigGate } from '@/lib/publish/stored-config-gate';
import { siteUrlOf } from '@/lib/seo/structured-data';

type Ctx = { params: Promise<{ id: string; siteId: string }> };

export const GET = withApiHandler<Ctx>(async (_request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const { id: clientId, siteId } = await params;

  const { clients, sites } = getDataServices();
  const site = await sites.getById(siteId);
  if (!site || site.clientId !== clientId) {
    return apiError(404, 'SITE_NOT_FOUND', 'Site not found.');
  }
  const owner = await clients.getById(site.clientId);
  if (!owner) return apiError(404, 'CLIENT_NOT_FOUND', 'Client not found.');

  // The draft is what publish reads. A site with no draft has nothing to score yet.
  const config = site.draftConfig ?? site.siteConfig;
  if (!config) {
    return apiError(409, 'SITE_DRAFT_MISSING', 'This site has no draft to check.');
  }

  try {
    return NextResponse.json({
      gate: evaluateStoredConfigGate(config, owner.tier, {
        // The same URL publish scores against, so the two readings match exactly.
        ...(siteUrlOf(site.domain) ? { siteUrl: siteUrlOf(site.domain) } : {}),
        deliveredFromPreview: Boolean(site.deliveredFromPreviewId),
      }),
    });
  } catch {
    // Same fail-closed posture as publish: an audit we could not run is not a pass.
    return apiError(
      503,
      'PUBLISH_AUDIT_UNAVAILABLE',
      '발행 전 품질 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
});
