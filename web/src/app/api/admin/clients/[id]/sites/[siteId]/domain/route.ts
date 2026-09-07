/**
 * POST /api/admin/clients/[id]/sites/[siteId]/domain — 오퍼레이터가 고객 도메인을 연결한다.
 *   body: { hostname } → Cloudflare for SaaS custom hostname 등록 + 검증용 DNS 레코드 안내.
 *
 * 고객 경로(`POST /api/domains`, 세션 인증 + 소유 확인)와 **같은 서비스 함수**를 호출한다:
 * `getDataServices().domains.requestCustomDomain(siteId, hostname)`. Cloudflare 호출과 sites
 * 갱신은 전부 그 안(data/supabase/domains.ts)에 있으므로 여기 복제된 로직은 없고,
 * mock 모드에서는 MockDomainService 가 같은 자리에서 응답한다.
 *
 * 상태 폴링은 고객 경로의 GET /api/domains?siteId= 와 동일한 서비스(checkStatus)를 쓴다.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { hostnameSchema } from '@/app/api/_lib/schemas';
import { getDataServices } from '@/lib/data';

type Ctx = { params: Promise<{ id: string; siteId: string }> };

const bodySchema = z.object({ hostname: hostnameSchema }).strict();

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const { id: clientId, siteId } = await params;

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const { sites, domains } = getDataServices();
  const site = await sites.getById(siteId);
  if (!site || site.clientId !== clientId) {
    return apiError(404, 'SITE_NOT_FOUND', 'Site not found.');
  }

  const status = await domains.requestCustomDomain(siteId, body.data.hostname);
  return NextResponse.json({ siteId, status }, { status: 201 });
});

export const GET = withApiHandler<Ctx>(async (_request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const { id: clientId, siteId } = await params;

  const { sites, domains } = getDataServices();
  const site = await sites.getById(siteId);
  if (!site || site.clientId !== clientId) {
    return apiError(404, 'SITE_NOT_FOUND', 'Site not found.');
  }
  if (site.domainType !== 'custom') {
    return apiError(404, 'NO_CUSTOM_DOMAIN', 'This site has no custom domain in progress.');
  }

  const status = await domains.checkStatus(siteId);
  return NextResponse.json({ siteId, status });
});
