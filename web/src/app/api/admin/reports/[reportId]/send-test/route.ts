/**
 * POST /api/admin/reports/[reportId]/send-test
 *
 * Sends one stored monthly report's real email to an internal address so an operator can
 * read exactly what the customer receives. It is not a delivery: the customer's row is
 * never claimed, counted, or marked sent, and the idempotency key is deliberately distinct
 * from the delivery's so a test can never consume the real send's dedup window.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { sendMonthlyReportTestEmail } from '@/lib/reporting/test-send';
import {
  INTERNAL_REPORT_TEST_DOMAIN,
  INTERNAL_REPORT_TEST_RECIPIENT_MAX,
} from '@/lib/reporting/test-send-core';

type Ctx = { params: Promise<{ reportId: string }> };

const schema = z
  .object({
    recipient: z.string().trim().min(3).max(INTERNAL_REPORT_TEST_RECIPIENT_MAX),
  })
  .strict();

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const body = await parseBody(request, schema);
  if (!body.ok) return body.res;
  const { reportId } = await params;

  const result = await sendMonthlyReportTestEmail({
    reportId,
    recipient: body.data.recipient,
  });
  if (result.status === 'invalid_recipient') {
    return apiError(
      400,
      'REPORT_TEST_RECIPIENT_NOT_INTERNAL',
      `A report test send may only be addressed to an @${INTERNAL_REPORT_TEST_DOMAIN} address.`,
    );
  }
  if (result.status === 'not_found') {
    return apiError(404, 'REPORT_NOT_FOUND', 'Report not found.');
  }
  if (result.status === 'send_failed') {
    return apiError(
      502,
      'REPORT_TEST_SEND_FAILED',
      'The email provider did not accept the test send.',
      { providerCode: result.code },
    );
  }
  return NextResponse.json({
    ok: true,
    recipient: result.recipient,
    providerMessageId: result.providerId,
  });
});
