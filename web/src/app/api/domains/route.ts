/**
 * POST /api/domains — 커스텀 도메인 연결 요청 (Cloudflare for SaaS custom hostname 등록).
 *   body: { siteId, hostname } → 검증용 DNS 레코드 안내 반환.
 * GET /api/domains?siteId= — 검증/SSL 상태 폴링.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '../_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '../_lib/guards';
import { hostnameSchema } from '../_lib/schemas';

const bodySchema = z.object({
  siteId: z.string().min(1),
  hostname: hostnameSchema,
});

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { siteId, hostname } = body.data;

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  const status = await getDataServices().domains.requestCustomDomain(siteId, hostname);
  return NextResponse.json({ status }, { status: 201 });
});

export const GET = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId) {
    return apiError(400, 'VALIDATION_ERROR', 'A siteId query parameter is required.');
  }

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  if (site.domainType !== 'custom') {
    return apiError(404, 'NO_CUSTOM_DOMAIN', 'This site has no custom domain in progress.');
  }

  const status = await getDataServices().domains.checkStatus(siteId);
  return NextResponse.json({ status });
});
