import { NextResponse, type NextRequest } from 'next/server';
import { grantMonthlySubscriptionCredits } from '@/lib/subscriptions/service';
import { runMonthlyReports } from '@/lib/reporting/runner';
import { purgeExpiredReportingData } from '@/lib/reporting/retention-service';
import { purgeExpiredCrawlerRecords } from '@/lib/crawl/repository';
import { isCronAuthorized } from '../_lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function run(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  // Jobs are isolated: report/email, credits, and retention failures must not
  // suppress one another's durable work.
  const [reports, credits, retention, crawlerRetention] = await Promise.allSettled([
    runMonthlyReports(),
    grantMonthlySubscriptionCredits(),
    purgeExpiredReportingData(),
    purgeExpiredCrawlerRecords(),
  ]);
  const ok = (
    reports.status === 'fulfilled'
    && credits.status === 'fulfilled'
    && retention.status === 'fulfilled'
    && crawlerRetention.status === 'fulfilled'
  );
  return NextResponse.json(
    {
      ok,
      reports: reports.status === 'fulfilled'
        ? reports.value
        : { error: 'REPORT_RUN_FAILED' },
      credits: credits.status === 'fulfilled'
        ? credits.value
        : { error: 'SUBSCRIPTION_GRANT_FAILED' },
      retention: retention.status === 'fulfilled'
        ? retention.value
        : { error: 'REPORTING_RETENTION_FAILED' },
      crawlerRetention: crawlerRetention.status === 'fulfilled'
        ? crawlerRetention.value
        : { error: 'CRAWLER_RETENTION_FAILED' },
    },
    { status: ok ? 200 : 500 },
  );
}

export const GET = run;
export const POST = run;
