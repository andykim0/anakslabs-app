import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminEditQueueError } from '@/lib/admin/edit-queue-core';
import { completeEditFulfillment } from '@/lib/admin/edit-fulfillment-service';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { apiError, parseBody, withApiHandler } from '../../../../_lib/http';
import { requireAdminOr403 } from '../../../../_lib/guards';

type Ctx = { params: Promise<{ id: string }> };

const completionBody = z.object({ siteAppliedConfirmed: z.literal(true) }).strict();

function errorResponse(error: AdminEditQueueError): NextResponse {
  if (error.code === 'ADMIN_EDIT_REQUEST_NOT_FOUND') {
    return apiError(404, error.code, 'Edit request not found.');
  }
  if (error.code === 'ADMIN_EDIT_REQUEST_INPUT_INVALID') {
    return apiError(400, error.code, 'The edit request ID is not valid.');
  }
  return apiError(409, error.code, 'This request was rejected, or its current state does not allow completion.');
}

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const body = await parseBody(request, completionBody);
  if (!body.ok) return body.res;

  const { id } = await params;
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', 'Administrator access is required.');
  try {
    const result = await completeEditFulfillment({ editRequestId: id, actorType: 'admin', actorId });
    return NextResponse.json({ ok: true, duplicated: result.duplicated });
  } catch (error) {
    if (error instanceof AdminEditQueueError) return errorResponse(error);
    throw error;
  }
});
