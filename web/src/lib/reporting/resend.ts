import 'server-only';

import { isMockMode } from '@/lib/env';
import type { MonthlyReportEmailMessage } from './types';
import { sendReportEmailViaResend, type ReportEmailSendResult } from './resend-core';
import { MOCK_REPORT_TEST_PROVIDER_ID } from './test-send-core';

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

/**
 * [RPT$] Operator test send — the SAME transport, a different recipient and key.
 *
 * In mock mode without Resend secrets (the demo default) the adapter is a stub: it accepts
 * and reports a mock id without touching the network, so a demo deployment can exercise
 * the whole route. Supplying both `RESEND_API_KEY` and `REPORT_FROM_EMAIL` is the explicit
 * operator opt-in that makes this internal-only route send for real — that is how the
 * live Resend path gets proven end to end without ever mailing a customer.
 */
export async function sendReportTestEmail(input: {
  to: string;
  message: MonthlyReportEmailMessage;
  idempotencyKey: string;
}): Promise<ReportEmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? '';
  const from = process.env.REPORT_FROM_EMAIL?.trim() ?? '';
  if (isMockMode() && (!apiKey || !from)) {
    return { ok: true, providerId: MOCK_REPORT_TEST_PROVIDER_ID };
  }
  return sendReportEmailViaResend({
    apiKey,
    from,
    to: input.to,
    message: input.message,
    idempotencyKey: input.idempotencyKey,
  });
}
