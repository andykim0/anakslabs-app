import 'server-only';

import { ROOT_DOMAIN } from '@/lib/env';
import { getDataServices } from '@/lib/data';
import { resolveSiteSubscription } from '@/lib/subscriptions/service';
import { sendMonthlyReportEmail } from './resend';
import { getMonthlyReportsRepository } from './repository';
import {
  retryMonthlyReportCore,
  runMonthlyReportsCore,
  type MonthlyReportRunnerDependencies,
} from './runner-core';

function dashboardUrl(): string {
  const host = ROOT_DOMAIN.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${host}/dashboard/reports`;
}

function dependencies(): MonthlyReportRunnerDependencies {
  const services = getDataServices();
  return {
    listSites: () => services.sites.listAll(),
    getClient: (clientId) => services.clients.getById(clientId),
    isSubscriptionActive: async (clientId, at) => (
      await resolveSiteSubscription(clientId, at)
    ).active,
    listSiteEvents: (input) => services.siteEvents.listBySiteRange(input),
    reports: getMonthlyReportsRepository(),
    sendEmail: sendMonthlyReportEmail,
    dashboardUrl: dashboardUrl(),
  };
}

export async function runMonthlyReports(now: Date = new Date()) {
  return runMonthlyReportsCore(dependencies(), now);
}

export async function retryMonthlyReport(reportId: string, now: Date = new Date()) {
  const deps = dependencies();
  const report = await deps.reports.getByIdForService(reportId);
  if (!report) return { status: 'not_found' as const };
  const [site, client, subscription] = await Promise.all([
    getDataServices().sites.getById(report.siteId),
    deps.getClient(report.clientId),
    resolveSiteSubscription(report.clientId, now),
  ]);
  if (!site || site.clientId !== report.clientId) return { status: 'not_found' as const };
  const status = await retryMonthlyReportCore({
    report,
    site,
    client,
    subscriptionActive: subscription.active,
    dependencies: deps,
  });
  return { status };
}
