/**
 * [§6] 사업자 정보 조회/저장.
 *   GET   /api/me/business-info → { businessInfo }
 *   PATCH /api/me/business-info { ...BusinessInfo } → { ok, businessInfo }
 * 발행 게이트(BUSINESS_INFO_REQUIRED) 해소 + 법적 푸터/법무 페이지 소스.
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { businessInfoSchema } from '@/app/api/_lib/schemas';
import { parseBody, withApiHandler } from '@/app/api/_lib/http';
import { getAuthedClient, unauthorized } from '@/app/api/_lib/guards';

export const GET = withApiHandler(async () => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();
  return NextResponse.json({ businessInfo: client.businessInfo ?? null });
});

export const PATCH = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const body = await parseBody(request, businessInfoSchema);
  if (!body.ok) return body.res;

  await getDataServices().clients.updateBusinessInfo(client.id, body.data);
  return NextResponse.json({ ok: true, businessInfo: body.data });
});
