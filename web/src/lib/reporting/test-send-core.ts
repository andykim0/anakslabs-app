/**
 * [RPT$] Operator test send — pure rules. No I/O, no clock.
 *
 * A test send exists so an operator can read the exact email a customer receives before
 * (or after) it goes out. Two rules make that safe:
 *
 *  1. The recipient must be an internal address. A route that can post the report to any
 *     address is a route that can be pointed at a customer, and the customer's copy is the
 *     monthly cron's job alone.
 *  2. The idempotency key is deliberately DIFFERENT from the customer delivery's
 *     (`monthly-report:<id>`). Sharing it would let a test send consume Resend's 24-hour
 *     dedup window for that report and silently swallow the real delivery.
 */

/** The only domain a report test send may be addressed to. */
export const INTERNAL_REPORT_TEST_DOMAIN = 'anakslabs.com';

/**
 * Bounded so the derived idempotency key can never approach Resend's 256-character limit.
 * No internal mailbox is anywhere near this long.
 */
export const INTERNAL_REPORT_TEST_RECIPIENT_MAX = 100;

/**
 * What the mock-mode stub reports instead of a Resend id. Deliberately not uuid-shaped, so
 * a stubbed acceptance can never be mistaken for a provider receipt in a log or a screenshot.
 */
export const MOCK_REPORT_TEST_PROVIDER_ID = 'mock-report-test-accepted';

/**
 * Normalize an operator-supplied recipient, or return null when it is not an internal
 * address. The domain is compared case-insensitively; the local part keeps its case,
 * because a mail server is entitled to treat it as significant.
 */
export function normalizeInternalTestRecipient(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > INTERNAL_REPORT_TEST_RECIPIENT_MAX) return null;
  // Header injection and any whitespace at all are rejected before parsing.
  if (/\s/u.test(trimmed)) return null;
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  // Exact match: `anakslabs.com.example.org` and `evil-anakslabs.com` are not internal.
  if (domain !== INTERNAL_REPORT_TEST_DOMAIN) return null;
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/u.test(local)) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  return `${local}@${domain}`;
}

/**
 * `monthly-report-test:<reportId>:<recipient>` — distinct from the customer delivery key,
 * and stable per (report, recipient) so a double-clicked button does not send twice.
 */
export function reportTestSendIdempotencyKey(reportId: string, recipient: string): string {
  const id = reportId.trim();
  if (!id) throw new TypeError('A report id is required for a test send idempotency key');
  const key = `monthly-report-test:${id}:${recipient}`;
  if (key.length > 256) {
    throw new RangeError('The report test send idempotency key is too long');
  }
  return key;
}
