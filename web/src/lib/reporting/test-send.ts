import 'server-only';

import { getDataServices } from '@/lib/data';
import { reportDashboardUrl } from './dashboard-url';
import { buildMonthlyReportEmail } from './email';
import { getMonthlyReportsRepository } from './repository';
import { sendReportTestEmail } from './resend';
import {
  normalizeInternalTestRecipient,
  reportTestSendIdempotencyKey,
} from './test-send-core';

export type ReportTestSendOutcome =
  | { status: 'sent'; recipient: string; providerId: string }
  | { status: 'not_found' }
  | { status: 'invalid_recipient' }
  | { status: 'send_failed'; code: string };

/**
 * [RPT$] Send one stored report's REAL email to an internal address.
 *
 * The customer's delivery row is read and never written: no claim, no attempt counter, no
 * `sent` mark, no provider id. A test send must be invisible to the delivery state machine,
 * or an operator checking the email would be recording a delivery that never happened —
 * and the row would then be ineligible for the retry that the customer is still owed.
 */
export async function sendMonthlyReportTestEmail(input: {
  reportId: string;
  recipient: string;
}): Promise<ReportTestSendOutcome> {
  const recipient = normalizeInternalTestRecipient(input.recipient);
  if (!recipient) return { status: 'invalid_recipient' };

  const record = await getMonthlyReportsRepository().getByIdForService(input.reportId.trim());
  if (!record) return { status: 'not_found' };
  const site = await getDataServices().sites.getById(record.siteId);
  // A report whose site is gone has no name to head the email with; refuse rather than guess.
  if (!site || site.clientId !== record.clientId) return { status: 'not_found' };

  const message = buildMonthlyReportEmail({
    siteName: site.name,
    dashboardUrl: reportDashboardUrl(),
    report: record.report,
  });
  const result = await sendReportTestEmail({
    to: recipient,
    message,
    idempotencyKey: reportTestSendIdempotencyKey(record.id, recipient),
  });
  if (!result.ok) {
    // Stable code only — the provider's own text can echo an address.
    return { status: 'send_failed', code: `RESEND_${result.code.toUpperCase()}` };
  }
  return { status: 'sent', recipient, providerId: result.providerId };
}
