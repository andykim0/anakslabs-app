/**
 * [v3 Phase 3] GET /api/sites/[siteId]/forms — 문의함 (소유자 전용).
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '@/app/api/_lib/http';
import { getAuthedClient, getOwnedSite, siteNotFound, unauthorized } from '@/app/api/_lib/guards';

type Ctx = { params: Promise<{ siteId: string }> };

export const GET = withApiHandler<Ctx>(async (_request, { params }) => {
  const { siteId } = await params;
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const site = await getOwnedSite(siteId, client.id);
  if (!site) return siteNotFound();

  const submissions = await getDataServices().formSubmissions.listBySite(siteId);
  return NextResponse.json({ submissions });
});
