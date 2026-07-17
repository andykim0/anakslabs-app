import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { deriveVideoQueueItem } from '@/lib/admin/video-fulfillment-core';
import { getHeroVideoFulfillmentRepository } from '@/lib/admin/video-fulfillment-repository';
import { heroVideoMotionById } from '@/lib/motion/hero-video-motions';
import { findVideoConcept } from '@/lib/motion/video-concepts';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

const DAY_MS = 86_400_000;

function waitingDays(requestedAt: string, nowMs: number): number {
  const requestedMs = Date.parse(requestedAt);
  if (!Number.isFinite(requestedMs)) return 0;
  return Math.max(0, Math.floor((nowMs - requestedMs) / DAY_MS));
}

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const { clients, sites } = getDataServices();
  const fulfillments = getHeroVideoFulfillmentRepository();
  const [allClients, allSites, recentCompletions] = await Promise.all([
    clients.listAll(),
    sites.listAll(),
    fulfillments.listRecent(100),
  ]);
  // Recent history is presentation-only. Queue eligibility must consult the
  // authoritative per-site completion lookup so an older completion can never
  // fall out of the window and re-enter the queue.
  const completionsBySite = await Promise.all(
    allSites.map(async (site) => [site.id, await fulfillments.getBySite(site.id)] as const),
  );
  const clientById = new Map(allClients.map((client) => [client.id, client] as const));
  const siteById = new Map(allSites.map((site) => [site.id, site] as const));
  const completionBySite = new Map(completionsBySite);
  const nowMs = Date.now();

  const items = allSites.flatMap((site) => {
    const client = clientById.get(site.clientId);
    if (!client) return [];
    const item = deriveVideoQueueItem({
      site,
      client,
      completion: completionBySite.get(site.id),
    });
    if (!item) return [];
    return [{
      siteId: item.siteId,
      clientId: item.clientId,
      clientName: item.clientName,
      siteName: item.siteName,
      siteStatus: site.status,
      industryClass: item.industryClass,
      heroImageUrl: item.heroImageUrl,
      motionLabel: heroVideoMotionById(item.heroMotionId ?? undefined)?.label
        ?? item.heroMotionId
        ?? '시네마틱 스크럽',
      videoConceptLabel: findVideoConcept(item.videoConceptId ?? undefined)?.label ?? null,
      requestedAt: item.requestedAt,
      timingSource: item.requestedAtSource,
      waitingDays: waitingDays(item.requestedAt, nowMs),
      blockedReason: item.blockedReason === 'missing-hero-image'
        ? 'hero-source-missing' as const
        : item.blockedReason === 'asset-policy-v2-required'
          ? 'asset-policy-v2-required' as const
          : item.blockedReason === 'hero-poster-mismatch'
            ? 'hero-source-mismatch' as const
            : null,
    }];
  }).sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));

  return NextResponse.json({
    items,
    recentCompletions: recentCompletions.map((row) => ({
      ...row,
      siteName: siteById.get(row.siteId)?.name ?? '(삭제된 사이트)',
      clientName: clientById.get(row.clientId)?.name ?? '(알 수 없음)',
      timingSource: row.requestedAtSource,
    })),
  });
});
