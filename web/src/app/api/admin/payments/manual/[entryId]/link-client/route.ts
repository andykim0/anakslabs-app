import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { getManualCollectionsRepository } from '@/lib/payments/manual-collections';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

type Ctx = { params: Promise<{ entryId: string }> };

const schema = z.object({
  clientId: z.string().trim().min(1).max(80),
  memo: z.string().trim().max(500).nullable().optional(),
}).strict();

export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, schema);
  if (!body.ok) return body.res;
  const { entryId } = await params;

  const client = await getDataServices().clients.getById(body.data.clientId);
  if (!client) return apiError(404, 'CLIENT_NOT_FOUND', 'No client account was found to link.');

  try {
    const result = await getManualCollectionsRepository().linkClient({
      entryId,
      clientId: client.id,
      memo: body.data.memo,
    });
    return NextResponse.json({ ok: true, duplicated: result.duplicated, entry: result.record.entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/CANCELLED|ALREADY_LINKED/i.test(message)) {
      return apiError(409, 'MANUAL_COLLECTION_LINK_CONFLICT', 'This record is cancelled or already linked to another account.');
    }
    if (/NOT_FOUND/i.test(message)) {
      return apiError(404, 'MANUAL_COLLECTION_NOT_FOUND', 'Collection record not found.');
    }
    throw error;
  }
});
