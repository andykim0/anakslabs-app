/**
 * GET /api/admin/overview — 운영 현황 요약 (관리자 전용).
 * 응답: components/admin/api.ts 의 AdminOverview 계약과 1:1.
 *  - credits.granted  = 전체 원장 양수 행 합계
 *  - credits.consumed = 전체 원장 음수 행 절대값 합계 (소모+만료 포함)
 *  - credits.circulating = granted - consumed (유통량 정의)
 */
import { NextResponse } from 'next/server';
import { buildAdminOpsRevenueMetrics } from '@/lib/admin/ops-metrics';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { clients, sites, credits, editRequests, payments, domains } = getDataServices();
  const [clientList, siteList, qaQueue, paymentList, customHostnameCount] = await Promise.all([
    clients.listAll(),
    sites.listAll(),
    editRequests.listQaQueue(),
    payments.listAll(),
    domains.countHostnames(),
  ]);

  const ledgers = await Promise.all(clientList.map((c) => credits.getLedger(c.id)));
  let granted = 0;
  let consumed = 0;
  for (const entry of ledgers.flat()) {
    if (entry.amount > 0) granted += entry.amount;
    else consumed += Math.abs(entry.amount);
  }

  return NextResponse.json({
    clients: {
      total: clientList.length,
      basic: clientList.filter((c) => c.tier === 'basic').length,
      premium: clientList.filter((c) => c.tier === 'premium').length,
    },
    liveSites: siteList.filter((s) => s.status === 'live').length,
    credits: { granted, consumed, circulating: granted - consumed },
    qaPending: qaQueue.length,
    customHostnameCount,
    revenue: buildAdminOpsRevenueMetrics(paymentList),
  });
});
