import { NextResponse } from 'next/server';
import { getContentQueueRepository } from '@/lib/admin/content-queue-repository';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { withApiHandler } from '@/app/api/_lib/http';
import { contentQueueItemDto } from './_lib';

export const GET = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const repository = getContentQueueRepository();
  const [items, sourceCount] = await Promise.all([
    repository.listNonterminal(),
    repository.countNonterminal(),
  ]);
  return NextResponse.json({
    items: items.map(contentQueueItemDto),
    integrity: {
      sourceCount,
      queueCount: items.length,
      missingCount: Math.max(0, sourceCount - items.length),
    },
  });
});
