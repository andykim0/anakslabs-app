import { NextResponse } from 'next/server';
import { getAdminEditQueueRepository } from '@/lib/admin/edit-queue-repository';
import { getDataServices } from '@/lib/data';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

const HOUR_MS = 3_600_000;

function waitingHours(createdAt: string, nowMs: number): number {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return 0;
  return Math.max(0, Math.floor((nowMs - createdMs) / HOUR_MS));
}

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const repository = getAdminEditQueueRepository();
  const { clients, sites } = getDataServices();
  const [queue, allClients, allSites] = await Promise.all([
    repository.listNonterminal(),
    clients.listAll(),
    sites.listAll(),
  ]);
  const clientById = new Map(allClients.map((client) => [client.id, client] as const));
  const siteById = new Map(allSites.map((site) => [site.id, site] as const));
  const nowMs = Date.now();

  return NextResponse.json({
    items: queue.map((item) => {
      const site = siteById.get(item.siteId);
      return {
        id: item.id,
        clientId: item.clientId,
        clientName: clientById.get(item.clientId)?.name ?? '(알 수 없음)',
        siteId: item.siteId,
        siteName: site?.name ?? '(삭제된 사이트)',
        siteStatus: site?.status ?? null,
        type: item.type,
        status: item.status,
        requestedContent: item.requestedContent,
        createdAt: item.createdAt,
        waitingHours: waitingHours(item.createdAt, nowMs),
        isInitialRevision: item.isInitialRevision ?? false,
        netCreditCharge: item.netCreditCharge,
        creditCharged: item.creditCharged,
        ledgerEntryCount: item.ledgerEntryCount,
      };
    }),
  });
});
