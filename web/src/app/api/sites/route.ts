/**
 * GET /api/sites — 내 사이트 목록.
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../_lib/http';
import { getAuthedClient, unauthorized } from '../_lib/guards';

export const GET = withApiHandler(async () => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const sites = await getDataServices().sites.listByClient(client.id);
  return NextResponse.json({ sites });
});
