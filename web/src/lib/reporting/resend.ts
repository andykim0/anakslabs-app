import 'server-only';

import type { MonthlyReportEmailMessage } from './types';
import { sendReportEmailViaResend, type ReportEmailSendResult } from './resend-core';

/** Server-only environment seam. Secrets never enter client DTOs or the report record. */
export async function sendMonthlyReportEmail(input: {
  to: string;
  message: MonthlyReportEmailMessage;
  idempotencyKey: string;
}): Promise<ReportEmailSendResult> {
  return sendReportEmailViaResend({
    apiKey: process.env.RESEND_API_KEY ?? '',
    from: process.env.REPORT_FROM_EMAIL ?? '',
    to: input.to,
    message: input.message,
    idempotencyKey: input.idempotencyKey,
  });
}
