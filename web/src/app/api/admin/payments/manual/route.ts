import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import {
  MANUAL_COLLECTION_CHANNELS,
  MANUAL_COLLECTION_PRODUCT_KINDS,
} from '@/lib/payments/manual-collection-core';
import { getManualCollectionsRepository } from '@/lib/payments/manual-collections';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

const schema = z.object({
  clientId: z.string().trim().min(1).max(80).nullable().optional(),
  customerName: z.string().trim().min(1).max(100).nullable().optional(),
  customerContact: z.string().trim().min(1).max(200).nullable().optional(),
  siteId: z.string().trim().min(1).max(80).nullable().optional(),
  productKind: z.enum(MANUAL_COLLECTION_PRODUCT_KINDS),
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
    return apiError(404, 'CLIENT_NOT_FOUND', '고객을 찾을 수 없습니다.');
  }
  if (!body.data.clientId && (!body.data.customerName || !body.data.customerContact)) {
    return apiError(400, 'CUSTOMER_REQUIRED', '기존 계정을 고르거나 고객 이름과 연락처 메모를 입력해 주세요.');
  }
  if (body.data.clientId && (body.data.customerName || body.data.customerContact)) {
    return apiError(400, 'CUSTOMER_AMBIGUOUS', '기존 계정과 직접 입력 고객을 동시에 기록할 수 없습니다.');
  }
  if (body.data.siteId) {
    const site = await sites.getById(body.data.siteId);
    if (!client || !site || site.clientId !== client.id) {
      return apiError(422, 'SITE_OWNERSHIP_MISMATCH', '선택한 사이트가 고객 소유가 아닙니다.');
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
      return apiError(422, 'MANUAL_COLLECTION_AMOUNT_MISMATCH', '현재 가격표와 일치하는 금액만 기록할 수 있습니다.');
    }
    if (/REFERENCE_CONFLICT|conflicts with existing evidence/i.test(message)) {
      return apiError(409, 'MANUAL_COLLECTION_REFERENCE_CONFLICT', '이미 다른 수금에 사용된 참조번호입니다.');
    }
    throw error;
  }
});
