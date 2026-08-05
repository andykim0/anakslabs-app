/**
 * POST /api/admin/clients/[id]/sites/[siteId]/content-slots
 *
 * Creates this month's draft slots for one site. Idempotent: re-running fills only the ordinals
 * that are missing, so an operator can press the button twice without duplicating the month.
 *
 * Scheduling this on a cron is deliberately out of scope for this change — the operator triggers
 * it per site until the cadence job exists.
 */
import { NextResponse } from 'next/server';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { getDataServices } from '@/lib/data';
import { getContentQueueRepository } from '@/lib/admin/content-queue-repository';
import { ContentQueueError } from '@/lib/admin/content-queue-core';
import { contentQueueErrorResponse } from '@/app/api/admin/content-queue/_lib';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { siteFulfillmentPlan } from '@/lib/content-fulfillment/site-fulfillment';
import { deliveredCountForPeriod } from '@/lib/content-fulfillment/delivery';

type Ctx = { params: Promise<{ id: string; siteId: string }> };

export const POST = withApiHandler<Ctx>(async (_request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  // The actor lands in append-only content_post_events and can never be corrected afterwards,
  // so it must be the operator who actually pressed the button — not a constant.
  const actorId = await getCurrentAdminActorId();
  // Same sentence requireAdminOr403 now returns, so one endpoint never answers in two languages.
  if (!actorId) return apiError(403, 'FORBIDDEN', 'Administrator access is required.');
  const { id: clientId, siteId } = await params;

  const site = await getDataServices().sites.getById(siteId);
  if (!site || site.clientId !== clientId) {
    return apiError(404, 'SITE_NOT_FOUND', 'Site not found.');
  }

  const plan = siteFulfillmentPlan(site);
  if (!plan.pricingModelVersion || plan.committed === null) {
    return apiError(
      409,
      'CONTENT_CONTRACT_UNRESOLVED',
      'This site carries no industry profile and pricing model version to bill content against.',
    );
  }

  const repository = getContentQueueRepository();
  let result;
  try {
    result = await repository.provisionMonthlySlots({
      clientId,
      siteId,
      pricingModelVersion: plan.pricingModelVersion,
      periodMonth: plan.periodMonth,
      count: plan.committed,
      actorId,
    });
  } catch (error) {
    if (error instanceof ContentQueueError) return contentQueueErrorResponse(error);
    throw error;
  }

  return NextResponse.json({
    siteId,
    periodMonth: result.periodMonth,
    timezone: plan.timeZone,
    created: result.created,
    existing: result.existing,
    committed: plan.committed,
    delivered: deliveredCountForPeriod(result.items, plan.periodMonth),
    slotCount: result.items.length,
  }, { status: result.created > 0 ? 201 : 200 });
});
