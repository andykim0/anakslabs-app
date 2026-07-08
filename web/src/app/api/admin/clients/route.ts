/**
 * GET /api/admin/clients — 전체 고객 목록 (+크레딧 잔액).
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { clients, credits } = getDataServices();
  const list = await clients.listAll();
  const enriched = await Promise.all(
    list.map(async (client) => {
      const balance = await credits.getBalance(client.id);
      return { ...client, balance: balance.balance };
    }),
  );

  return NextResponse.json({ clients: enriched });
});
