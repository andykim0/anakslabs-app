import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { approveAdminContentPost } from '@/lib/admin/content-fulfillment-service';
import { ContentQueueError } from '@/lib/admin/content-queue-core';
import { getContentQueueRepository } from '@/lib/admin/content-queue-repository';
import { safeCatalogApprovalOverrideRequired } from '@/lib/admin/content-safe-catalog-policy';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { contentQueueErrorResponse } from '../../_lib';

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({
  expectedVersionId: z.string().uuid(),
  approvalConfirmed: z.literal(true),
  safeCatalogOverrideConfirmed: z.literal(true).optional(),
}).strict();

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', 'Administrator access is required.');
  const { id } = await params;
  try {
    const item = await getContentQueueRepository().getById(id);
    if (safeCatalogApprovalOverrideRequired({
      item,
      expectedVersionId: body.data.expectedVersionId,
      overrideConfirmed: body.data.safeCatalogOverrideConfirmed === true,
    })) {
      return apiError(
        409,
        'CONTENT_POST_SAFE_CATALOG_OVERRIDE_REQUIRED',
        'Safe-catalog fallback drafts require an explicit operator override before approval.',
      );
    }
    const result = await approveAdminContentPost({
      id,
      expectedVersionId: body.data.expectedVersionId,
      actorId,
      safeCatalogOverrideConfirmed: body.data.safeCatalogOverrideConfirmed === true,
    });
    return NextResponse.json({ ok: true, duplicated: result.duplicated });
  } catch (error) {
    if (error instanceof ContentQueueError) return contentQueueErrorResponse(error);
    throw error;
  }
});
