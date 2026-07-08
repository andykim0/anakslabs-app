/**
 * GET /api/payments — 내 결제 이력.
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../_lib/http';
import { getAuthedClient, unauthorized } from '../_lib/guards';

export const GET = withApiHandler(async () => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const payments = await getDataServices().payments.listByClient(client.id);
  return NextResponse.json({ payments });
});
