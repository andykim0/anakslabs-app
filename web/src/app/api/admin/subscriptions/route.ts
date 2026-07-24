import { NextResponse } from 'next/server';
import { getDataServices } from '@/lib/data';
import { PRICING } from '@/lib/pricing';
import { previousMonthRangesKst } from '@/lib/reporting/period';
import { getMonthlyReportsRepository } from '@/lib/reporting/repository';
import { listSiteSubscriptionsForAdmin } from '@/lib/subscriptions/service';
import type { Site } from '@/lib/types/domain';
import { withApiHandler } from '../../_lib/http';
import { requireAdminOr403 } from '../../_lib/guards';

function publishedReportSite(site: Site): boolean {
  return Boolean(
    site
    && (site.status === 'live' || site.status === 'pending_dns')
    && site.siteConfig,
  );
}

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const now = new Date();
  const reportPeriodMonth = previousMonthRangesKst(now).report.month;
  const { clients, sites } = getDataServices();
  const reportsRepository = getMonthlyReportsRepository();
  const [listing, allClients, allSites, reports] = await Promise.all([
    listSiteSubscriptionsForAdmin(now),
    clients.listAll(),
    sites.listAll(),
    reportsRepository.listForService({ periodMonth: reportPeriodMonth }),
  ]);
  const clientById = new Map(allClients.map((client) => [client.id, client] as const));
  const sitesByClient = new Map<string, typeof allSites>();
  for (const site of allSites) {
    const rows = sitesByClient.get(site.clientId) ?? [];
    rows.push(site);
    sitesByClient.set(site.clientId, rows);
  }
  const reportBySite = new Map(reports.map((report) => [report.siteId, report] as const));

  const items = listing.items.map(({ state, active }) => {
    const client = clientById.get(state.clientId);
    const reportRows = (sitesByClient.get(state.clientId) ?? [])
      .filter(publishedReportSite)
      .map((site) => {
        const report = reportBySite.get(site.id);
        return {
          siteId: site.id,
          siteName: site.name,
          siteStatus: site.status,
          reportId: report?.id ?? null,
          deliveryStatus: report?.deliveryStatus ?? (active ? 'not-generated' as const : 'not-eligible' as const),
          deliveryAttempts: report?.deliveryAttempts ?? 0,
          lastErrorCode: report?.lastErrorCode ?? null,
          sentAt: report?.sentAt ?? null,
        };
      });
    return {
      clientId: state.clientId,
      clientName: client?.name ?? '(알 수 없음)',
      clientEmail: client?.email ?? '(알 수 없음)',
      status: state.status,
      active,
      currentPeriodEnd: state.currentPeriodEnd,
      updatedAt: state.updatedAt,
      reports: reportRows,
    };
  });
  const allReportRows = items.flatMap((item) => item.reports);
  const activeCount = listing.items.filter((item) => item.active).length;

  return NextResponse.json({
    asOf: listing.asOf,
    reportPeriodMonth,
    summary: {
      active: activeCount,
      pastDue: listing.items.filter((item) => item.state.status === 'past_due').length,
      suspended: listing.items.filter((item) => item.state.status === 'suspended').length,
      cancelled: listing.items.filter((item) => item.state.status === 'cancelled').length,
      mrrKrw: activeCount * PRICING.subscription.monthlyEquivalent,
      newThisMonth: listing.summary.newCount,
      cancelledThisMonth: listing.summary.cancelledCount,
      reportAccepted: allReportRows.filter((row) => row.deliveryStatus === 'sent').length,
      reportFailed: allReportRows.filter((row) => row.deliveryStatus === 'failed').length,
      reportMissing: allReportRows.filter((row) => row.deliveryStatus === 'not-generated').length,
    },
    items,
  });
});
