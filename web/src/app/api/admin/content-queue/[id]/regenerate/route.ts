import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { generateAdminContentPost } from '@/lib/admin/content-fulfillment-service';
import { ContentQueueError } from '@/lib/admin/content-queue-core';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import { contentQueueErrorResponse, contentQueueItemDto } from '../../_lib';

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ topic: z.string().trim().min(2).max(240) }).strict();

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.');
  const { id } = await params;
  try {
    const item = await generateAdminContentPost({
      id,
      actorId,
      topic: body.data.topic,
      regeneration: true,
    });
    return NextResponse.json({ ok: true, item: contentQueueItemDto(item) });
  } catch (error) {
    if (error instanceof ContentQueueError) return contentQueueErrorResponse(error);
    throw error;
  }
});
