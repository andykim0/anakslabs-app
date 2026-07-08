/**
 * GET /api/admin/clients — 전체 고객 목록 (관리자 전용).
 * 응답: components/admin/api.ts 의 AdminClientRow[] 계약과 1:1 (배열 그대로 반환).
 */
import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { clients, sites, credits } = getDataServices();
  const [clientList, siteList] = await Promise.all([clients.listAll(), sites.listAll()]);

  const siteCounts = new Map<string, number>();
  for (const site of siteList) {
    siteCounts.set(site.clientId, (siteCounts.get(site.clientId) ?? 0) + 1);
  }

  const rows = await Promise.all(
    clientList.map(async (client) => {
      const balance = await credits.getBalance(client.id);
      return {
        id: client.id,
        name: client.name,
        email: client.email,
        tier: client.tier,
        status: client.status,
        balance: balance.balance,
        siteCount: siteCounts.get(client.id) ?? 0,
        createdAt: client.createdAt,
      };
    }),
  );

  return NextResponse.json(rows);
});
