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
  if (!site) return apiError(404, 'SITE_NOT_FOUND', 'No site was found to link.');

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
      return apiError(422, 'SITE_OWNERSHIP_MISMATCH', 'The selected site does not belong to the linked client.');
    }
    if (/CANCELLED|ALREADY_LINKED|CLIENT_REQUIRED/i.test(message)) {
      return apiError(409, 'MANUAL_COLLECTION_LINK_CONFLICT', 'Link an account first, or check the existing link.');
    }
    if (/NOT_FOUND/i.test(message)) {
      return apiError(404, 'MANUAL_COLLECTION_NOT_FOUND', 'Collection record not found.');
    }
    throw error;
  }
});
