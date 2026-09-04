/**
 * [CITE$] Monthly citation check cron.
 *
 * MONTH SEMANTICS — read `reporting/runner-core.ts` before changing anything here.
 *
 *   The monthly report for month M is built on the 1st of M+1 (the previous-month
 *   period, resolved in the site's own time zone) and its row is INSERT-ONCE. So probes
 *   for month M must be stored under run_month = M, and the report builder must read the
 *   probes for ITS OWN period — the previous month — never "the current month".
 *
 *   Concretely: probes taken on the 1st-3rd of August are stored under 2026-08-01 and
 *   appear in the August report that is built on 1 September. A test pins this
 *   (`report-period.test.ts`): a probe stored on M-02 shows up in the report built on
 *   (M+1)-01.
 *
 * SCHEDULE — daily at 23:45 UTC. The runner self-limits to the (question x engine) pairs
 * that have no row for the month yet, so the first days of each month do the work and
 * every later day is a no-op. Running daily rather than monthly means a failed or
 * rate-limited day heals itself the next day instead of losing a month.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { citationCheckConfig } from '@/lib/env';
import { runCitationChecks } from '@/lib/citation-check/runner';
import { isCronAuthorized } from '../_lib/auth';

export const dynamic = 'force-dynamic';
/**
 * The plan supports 300 s (`sites/[siteId]/hero-video/route.ts` already uses it). The
 * runner stops dispatching at 240 s and each probe times out at 25 s, so the last probe
 * lands by 265 s. Note that `auth.test.ts` pins the MONTHLY-REPORTS route at 60 s; that
 * route is untouched.
 */
export const maxDuration = 300;

async function run(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  if (!citationCheckConfig().enabled) {
    return NextResponse.json({ ok: true, skipped: 'disabled' });
  }

  try {
    const result = await runCitationChecks();
    return NextResponse.json({ ok: true, citationChecks: result });
  } catch {
    // A stable code only — a provider message can quote the request.
    return NextResponse.json(
      { ok: false, error: { code: 'CITATION_RUN_FAILED' } },
      { status: 500 },
    );
  }
}

export const GET = run;
export const POST = run;
