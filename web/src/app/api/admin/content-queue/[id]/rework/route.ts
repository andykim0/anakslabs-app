import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { reworkAdminContentPost } from '@/lib/admin/content-fulfillment-service';
import { ContentQueueError } from '@/lib/admin/content-queue-core';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { contentQueueErrorResponse, contentQueueItemDto } from '../../_lib';

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ topic: z.string().trim().min(2).max(240) }).strict();

export const maxDuration = 300;

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', 'Administrator access is required.');
  const { id } = await params;
  try {
    const item = await reworkAdminContentPost({ id, actorId, topic: body.data.topic });
    return NextResponse.json({ ok: true, item: contentQueueItemDto(item) });
  } catch (error) {
    if (error instanceof ContentQueueError) return contentQueueErrorResponse(error);
    throw error;
  }
});
