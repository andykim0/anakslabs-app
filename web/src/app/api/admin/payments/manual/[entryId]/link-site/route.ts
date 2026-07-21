import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { getManualCollectionsRepository } from '@/lib/payments/manual-collections';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

type Ctx = { params: Promise<{ entryId: string }> };

const schema = z.object({
  siteId: z.string().trim().min(1).max(80),
  memo: z.string().trim().max(500).nullable().optional(),
}).strict();

export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, schema);
  if (!body.ok) return body.res;
  const { entryId } = await params;

  const site = await getDataServices().sites.getById(body.data.siteId);
  if (!site) return apiError(404, 'SITE_NOT_FOUND', '연결할 사이트를 찾을 수 없습니다.');

  try {
    const result = await getManualCollectionsRepository().linkSite({
      entryId,
      siteId: site.id,
      memo: body.data.memo,
    });
    return NextResponse.json({ ok: true, duplicated: result.duplicated, entry: result.record.entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/OWNERSHIP_MISMATCH/i.test(message)) {
      return apiError(422, 'SITE_OWNERSHIP_MISMATCH', '선택한 사이트가 연결 고객 소유가 아닙니다.');
    }
    if (/CANCELLED|ALREADY_LINKED|CLIENT_REQUIRED/i.test(message)) {
      return apiError(409, 'MANUAL_COLLECTION_LINK_CONFLICT', '계정을 먼저 연결하거나 기존 연결 상태를 확인해 주세요.');
    }
    if (/NOT_FOUND/i.test(message)) {
      return apiError(404, 'MANUAL_COLLECTION_NOT_FOUND', '수금 기록을 찾을 수 없습니다.');
    }
    throw error;
  }
});
