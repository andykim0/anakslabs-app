import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { getDataServices } from '@/lib/data';
import { saveInstagramCredential } from '@/lib/connectors/instagram-repository';
import { refreshInstagramConnector } from '@/lib/connectors/instagram-service';

export const runtime = 'nodejs';

const bodySchema = z.object({
  siteId: z.string().uuid(),
  accessToken: z.string().trim().min(20).max(4_096),
  tokenExpiresAt: z.string().datetime().nullable().optional(),
}).strict();

export const POST = withApiHandler(async (request) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const site = await getDataServices().sites.getById(body.data.siteId);
  if (!site) return apiError(404, 'SITE_NOT_FOUND', '사이트를 찾을 수 없습니다.');

  const saved = await saveInstagramCredential(body.data);
  const refreshed = await refreshInstagramConnector(body.data.siteId);
  return NextResponse.json({
    ok: true,
    keyVersion: saved.keyVersion,
    cachedItems: refreshed.itemCount,
  });
});
