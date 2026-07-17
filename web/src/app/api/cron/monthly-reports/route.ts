import { NextResponse, type NextRequest } from 'next/server';
import { grantMonthlySubscriptionCredits } from '@/lib/subscriptions/service';
import { runMonthlyReports } from '@/lib/reporting/runner';
import { isCronAuthorized } from '../_lib/auth';

export const dynamic = 'force-dynamic';

async function run(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  // The two benefits are isolated: an email/report problem must not suppress
  // the monthly credit grant, and a grant problem must not discard reports.
  const [reports, credits] = await Promise.allSettled([
    runMonthlyReports(),
    grantMonthlySubscriptionCredits(),
  ]);
  const ok = reports.status === 'fulfilled' && credits.status === 'fulfilled';
  return NextResponse.json(
    {
      ok,
      reports: reports.status === 'fulfilled'
        ? reports.value
        : { error: 'REPORT_RUN_FAILED' },
      credits: credits.status === 'fulfilled'
        ? credits.value
        : { error: 'SUBSCRIPTION_GRANT_FAILED' },
    },
    { status: ok ? 200 : 500 },
  );
}

export const GET = run;
export const POST = run;
