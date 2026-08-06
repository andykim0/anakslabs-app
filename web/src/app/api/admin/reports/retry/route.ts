import { NextResponse } from 'next/server';
import { z } from 'zod';
import { retryMonthlyReport } from '@/lib/reporting/runner';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { requireAdminOr403 } from '@/app/api/_lib/guards';

const schema = z.object({ reportId: z.string().trim().min(1).max(100) }).strict();

export const POST = withApiHandler(async (request) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, schema);
  if (!body.ok) return body.res;

  const result = await retryMonthlyReport(body.data.reportId);
  if (result.status === 'not_found') {
    return apiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
  }
  if (result.status === 'ineligible') {
    return apiError(409, 'SUBSCRIPTION_INACTIVE', 'This is not an active site subscription.');
  }
  if (result.status === 'not_retryable') {
    return apiError(
      409,
      'REPORT_NOT_RETRYABLE',
      '실패로 확인된 발송만 재시도할 수 있습니다. 전송 불명 상태는 운영 확인이 필요합니다.',
    );
  }
  return NextResponse.json({ ok: result.status === 'sent', deliveryStatus: result.status });
});
