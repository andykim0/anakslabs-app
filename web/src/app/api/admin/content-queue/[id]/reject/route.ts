import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { rejectAdminContentPost } from '@/lib/admin/content-fulfillment-service';
import { ContentQueueError } from '@/lib/admin/content-queue-core';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { contentQueueErrorResponse } from '../../_lib';

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({
  expectedVersionId: z.string().uuid(),
  reason: z.string().trim().min(2).max(2_000),
}).strict();

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.');
  const { id } = await params;
  try {
    const result = await rejectAdminContentPost({
      id,
      expectedVersionId: body.data.expectedVersionId,
      actorId,
      reason: body.data.reason,
    });
    return NextResponse.json({ ok: true, duplicated: result.duplicated });
  } catch (error) {
    if (error instanceof ContentQueueError) return contentQueueErrorResponse(error);
    throw error;
  }
});
