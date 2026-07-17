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
import { getManualCollectionsRepository } from '@/lib/payments/manual-collections';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { clients, sites, credits, editRequests, payments, domains } = getDataServices();
  const [clientList, siteList, qaQueue, paymentList, customHostnameCount, manualRecords] = await Promise.all([
    clients.listAll(),
    sites.listAll(),
    editRequests.listQaQueue(),
    payments.listAll(),
    domains.countHostnames(),
    getManualCollectionsRepository().listAll(),
  ]);

  const ledgers = await Promise.all(clientList.map((c) => credits.getLedger(c.id)));
  let granted = 0;
  let consumed = 0;
  for (const entry of ledgers.flat()) {
    if (entry.amount > 0) granted += entry.amount;
    else consumed += Math.abs(entry.amount);
  }

  const clientById = new Map(clientList.map((client) => [client.id, client]));
  const siteById = new Map(siteList.map((site) => [site.id, site]));
  const reversedEntryIds = new Set(
    manualRecords.flatMap(({ entry }) => entry.reversesEntryId ? [entry.reversesEntryId] : []),
  );

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
    revenue: buildAdminOpsRevenueMetrics(paymentList, new Date(), {
      manualEntries: manualRecords.map(({ entry }) => entry),
      sites: siteList,
    }),
    manualCollections: manualRecords.slice(0, 20).map(({ entry }) => ({
      entryId: entry.id,
      paymentId: entry.paymentId,
      clientId: entry.clientId,
      clientName: clientById.get(entry.clientId)?.name ?? '알 수 없는 고객',
      siteId: entry.siteId,
      siteName: entry.siteId ? siteById.get(entry.siteId)?.name ?? '알 수 없는 사이트' : null,
      productKind: entry.productKind,
      direction: entry.direction,
      amountKrw: entry.amountKrw,
      channel: entry.channel,
      collectionReference: entry.collectionReference,
      memo: entry.memo,
      createdAt: entry.createdAt,
      reversible: entry.direction === 'receipt' && !reversedEntryIds.has(entry.id),
    })),
  });
});
