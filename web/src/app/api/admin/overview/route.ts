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
import { manualCollectionReversibleEntryIds } from '@/lib/payments/manual-collection-core';
import { kstDateString } from '@/lib/analytics/site-event-ingest';
import { evaluateGuarantee, guaranteeDueAt } from '@/lib/guarantee';
import { listGuaranteeEvidence } from '@/lib/guarantee/evidence';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';
import { getAdminEditQueueRepository } from '@/lib/admin/edit-queue-repository';
import { getHeroVideoFulfillmentRepository } from '@/lib/admin/video-fulfillment-repository';
import { deriveVideoQueueItem } from '@/lib/admin/video-fulfillment-core';
import { fulfillmentSlaState } from '@/lib/admin/fulfillment-sla';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { clients, sites, credits, editRequests, payments, domains, siteEvents } = getDataServices();
  const [clientList, siteList, qaQueue, editQueue, paymentList, customHostnameCount, manualRecords] = await Promise.all([
    clients.listAll(),
    sites.listAll(),
    editRequests.listQaQueue(),
    getAdminEditQueueRepository().listNonterminal(),
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
  const videoRepository = getHeroVideoFulfillmentRepository();
  const videoCompletions = new Map(await Promise.all(
    siteList.map(async (site) => [site.id, await videoRepository.getBySite(site.id)] as const),
  ));
  const videoQueue = siteList.flatMap((site) => {
    const owner = clientById.get(site.clientId);
    if (!owner) return [];
    const item = deriveVideoQueueItem({ site, client: owner, completion: videoCompletions.get(site.id) });
    return item ? [item] : [];
  });
  const editOverdue = editQueue.filter((item) => fulfillmentSlaState(item.createdAt).overdue).length;
  const videoOverdue = videoQueue.filter((item) => fulfillmentSlaState(item.requestedAt).overdue).length;
  const reversibleEntryIds = manualCollectionReversibleEntryIds(
    manualRecords.map(({ entry }) => entry),
  );
  const guaranteeSites = siteList.filter((site) => site.publishedAt && site.siteConfig);
  const guaranteeEvidence = await listGuaranteeEvidence(guaranteeSites.map((site) => site.id));
  const guaranteeAsOf = new Date();
  const guaranteeRows = await Promise.all(guaranteeSites.map(async (site) => {
    const publishedAt = site.publishedAt!;
    const dueAt = guaranteeDueAt(publishedAt);
    const evidence = guaranteeEvidence.get(site.id);
    const evaluationEnd = new Date(Math.min(guaranteeAsOf.getTime(), Date.parse(dueAt)) + 86_400_000);
    const events = await siteEvents.listBySiteRange({
      siteId: site.id,
      fromDate: kstDateString(new Date(publishedAt)),
      toDate: kstDateString(evaluationEnd),
    });
    const naverReferralCount = events
      .filter((event) => event.source === 'naver' && event.eventType === 'pageview')
      .reduce((sum, event) => sum + event.count, 0);
    const evaluation = evaluateGuarantee({
      publishedAt,
      asOf: guaranteeAsOf.toISOString(),
      naverIndexed: evidence?.naverIndexed ?? null,
      naverReferralCount,
      exceptionCode: evidence?.exceptionCode ?? null,
    });
    return {
      siteId: site.id,
      siteName: site.name,
      domain: site.domain,
      publishedAt,
      naverIndexCheckedAt: evidence?.naverIndexCheckedAt ?? null,
      ...evaluation,
    };
  }));

  return NextResponse.json({
    clients: {
      total: clientList.length,
      basic: clientList.filter((c) => c.tier === 'basic').length,
      premium: clientList.filter((c) => c.tier === 'premium').length,
    },
    liveSites: siteList.filter((s) => s.status === 'live').length,
    credits: { granted, consumed, circulating: granted - consumed },
    qaPending: qaQueue.length,
    fulfillmentAlerts: {
      editOverdue,
      videoOverdue,
      total: editOverdue + videoOverdue,
    },
    customHostnameCount,
    revenue: buildAdminOpsRevenueMetrics(paymentList, new Date(), {
      manualEntries: manualRecords.map(({ entry }) => entry),
      sites: siteList,
    }),
    guarantees: guaranteeRows.sort((left, right) => left.dueAt.localeCompare(right.dueAt)),
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
      reversible: reversibleEntryIds.has(entry.id),
    })),
  });
});
