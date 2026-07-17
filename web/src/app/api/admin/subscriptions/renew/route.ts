/** 관리자 수동 수금(크몽 포함) → 권위 구독 기간 갱신. service-role RPC만 호출한다. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { renewSiteSubscriptionManually } from '@/lib/subscriptions/service';

const schema = z.object({
  clientId: z.string().min(1).max(80),
  /** 영수증/거래 ID처럼 재시도해도 같은 안정 키를 사용한다. */
  idempotencyKey: z.string().trim().min(1).max(160),
  periodMonths: z.number().int().min(1).max(12).default(1),
}).strict();

export const POST = withApiHandler(async (request) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, schema);
  if (!body.ok) return body.res;

  const client = await getDataServices().clients.getById(body.data.clientId);
  if (!client) return apiError(404, 'CLIENT_NOT_FOUND', '고객을 찾을 수 없습니다.');

  const result = await renewSiteSubscriptionManually(body.data);
  return NextResponse.json({
    ok: true,
    duplicated: result.duplicated,
    subscription: result.state,
  });
});
