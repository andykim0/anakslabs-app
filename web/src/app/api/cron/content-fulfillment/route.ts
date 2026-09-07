/**
 * The monthly content batch, run daily.
 *
 * SCHEDULE — 22:30 UTC, deliberately clear of the other two heavy jobs: citation checks at 23:45
 * and monthly reports at 00:15. Nothing here depends on either of them; the separation is about
 * not stacking three 300-second functions on top of each other.
 *
 * MONTH SEMANTICS — each site's month is resolved in that site's OWN time zone
 * (`site-fulfillment.ts`), the same way the per-site Provision button does it. A Denver clinic
 * that rolls over at 00:30 local must be provisioned for the new month, and a UTC-shaped answer
 * would leave it on the old one for hours.
 *
 * WHY DAILY — the runner self-limits to `draft` slots, so the first days of a month do the work
 * and every later day is close to a no-op. Running daily means a failed, capped, or deadlined day
 * heals itself tomorrow instead of losing a month. What it could not reach is returned as
 * `remaining`.
 *
 * TIME BUDGET — `maxDuration = 300`. The runner stops DISPATCHING at 170 s and one generation
 * request times out at 130 s (`CONTENT_POST_GENERATION_REQUEST_TIMEOUT_MS`), so the last call
 * lands by 300 s. That is the whole ceiling with no slack, which is the trade for using the full
 * window: rows already written stand, and the next run continues.
 *
 * This never publishes. Approval remains one human decision per post — it is the honesty gate.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { contentBatchConfig } from '@/lib/content-fulfillment/batch-config';
import { runContentFulfillmentBatch } from '@/lib/admin/content-fulfillment-batch';
import { isCronAuthorized } from '../_lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function run(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  if (!contentBatchConfig().enabled) {
    return NextResponse.json({ ok: true, skipped: 'disabled' });
  }

  try {
    const result = await runContentFulfillmentBatch();
    return NextResponse.json({ ok: true, contentFulfillment: result });
  } catch {
    // A stable code only — a provider message can quote the customer's own copy.
    return NextResponse.json(
      { ok: false, error: { code: 'CONTENT_BATCH_RUN_FAILED' } },
      { status: 500 },
    );
  }
}

export const GET = run;
export const POST = run;
