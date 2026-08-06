import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import {
  MANUAL_COLLECTION_CHANNELS,
  RECORDABLE_MANUAL_COLLECTION_PRODUCT_KINDS,
} from '@/lib/payments/manual-collection-core';
import { getManualCollectionsRepository } from '@/lib/payments/manual-collections';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

const schema = z.object({
  clientId: z.string().trim().min(1).max(80).nullable().optional(),
  customerName: z.string().trim().min(1).max(100).nullable().optional(),
  customerContact: z.string().trim().min(1).max(200).nullable().optional(),
  siteId: z.string().trim().min(1).max(80).nullable().optional(),
  productKind: z.enum(RECORDABLE_MANUAL_COLLECTION_PRODUCT_KINDS),
  amountKrw: z.number().int().positive(),
  channel: z.enum(MANUAL_COLLECTION_CHANNELS),
  collectionReference: z.string().trim().min(1).max(160),
  memo: z.string().trim().max(500).nullable().optional(),
  creditPackCredits: z.number().int().positive().optional(),
}).strict();

export const POST = withApiHandler(async (request) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, schema);
  if (!body.ok) return body.res;

  const { clients, sites } = getDataServices();
  const client = body.data.clientId ? await clients.getById(body.data.clientId) : null;
  if (body.data.clientId && !client) {
    return apiError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  }
  if (!body.data.clientId && (!body.data.customerName || !body.data.customerContact)) {
    return apiError(400, 'CUSTOMER_REQUIRED', 'Choose an existing account, or enter the client name and contact note.');
  }
  if (body.data.clientId && (body.data.customerName || body.data.customerContact)) {
    return apiError(400, 'CUSTOMER_AMBIGUOUS', 'Record either an existing account or a manually entered client, not both.');
  }
  if (body.data.siteId) {
    const site = await sites.getById(body.data.siteId);
    if (!client || !site || site.clientId !== client.id) {
      return apiError(422, 'SITE_OWNERSHIP_MISMATCH', 'The selected site does not belong to this client.');
    }
  }

  try {
    const result = await getManualCollectionsRepository().record(body.data);
    return NextResponse.json({
      ok: true,
      duplicated: result.duplicated,
      entry: result.record.entry,
      payment: result.record.payment,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/AMOUNT_MISMATCH|PRODUCT_INVALID|unknown credit pack/i.test(message)) {
      return apiError(422, 'MANUAL_COLLECTION_AMOUNT_MISMATCH', 'Only amounts matching the current price list can be recorded.');
    }
    if (/REFERENCE_CONFLICT|conflicts with existing evidence/i.test(message)) {
      return apiError(409, 'MANUAL_COLLECTION_REFERENCE_CONFLICT', 'This reference number is already used by another collection.');
    }
    throw error;
  }
});
