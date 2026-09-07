/**
 * POST /api/admin/content-queue/run-month
 *
 * The console's "Run this month". It calls the same runner the cron does — same caps, same
 * deadline, same idempotence — so the operator button and the unattended job cannot drift apart.
 * The only difference is the actor: the append-only event ledger records the administrator who
 * pressed it rather than `cron:content-fulfillment`.
 *
 * `siteId` narrows the run to one site. Omit it to run every eligible site.
 *
 * This provisions and generates. It never approves and never publishes.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { runContentFulfillmentBatch } from '@/lib/admin/content-fulfillment-batch';
import { ContentQueueError } from '@/lib/admin/content-queue-core';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { contentQueueErrorResponse } from '../_lib';

const bodySchema = z.object({ siteId: z.string().uuid().optional() }).strict();

/** Same budget as the cron route; the runner stops dispatching at 170 s either way. */
export const maxDuration = 300;

export const POST = withApiHandler(async (request) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  // The actor lands in append-only content_post_events and can never be corrected afterwards,
  // so it must be the operator who actually pressed the button — not a constant.
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', 'Administrator access is required.');

  try {
    const result = await runContentFulfillmentBatch({
      actorId,
      options: body.data.siteId ? { siteId: body.data.siteId } : {},
    });
    return NextResponse.json({ ok: true, contentFulfillment: result });
  } catch (error) {
    if (error instanceof ContentQueueError) return contentQueueErrorResponse(error);
    throw error;
  }
});
