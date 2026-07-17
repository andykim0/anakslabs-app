import type { MonthlyReportEmailMessage } from './types';

const RESEND_EMAIL_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10_000;

export type ReportEmailSendFailureCode =
  | 'not_configured'
  | 'invalid_input'
  | 'request_failed'
  | 'provider_rejected'
  | 'invalid_response';

export type ReportEmailSendResult =
  | { ok: true; providerId: string }
  | {
      ok: false;
      code: ReportEmailSendFailureCode;
      retryable: boolean;
      status?: number;
      message: string;
    };

export interface ResendReportEmailInput {
  apiKey: string;
  from: string;
  to: string;
  message: MonthlyReportEmailMessage;
  /** Stable for one report delivery attempt; Resend retains provider keys for 24 hours. */
  idempotencyKey: string;
}

export interface ResendTransportOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function emailAddress(value: string): boolean {
  return !/[\r\n]/.test(value) && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value.trim());
}

function fromAddress(value: string): boolean {
  if (/[\r\n]/.test(value)) return false;
  const trimmed = value.trim();
  const bracketed = /<([^<>]+)>$/.exec(trimmed);
  return emailAddress(bracketed?.[1] ?? trimmed);
}

function invalid(message: string): ReportEmailSendResult {
  return { ok: false, code: 'invalid_input', retryable: false, message };
}

function retryableStatus(status: number, providerName: string): boolean {
  if (providerName === 'invalid_idempotent_request') return false;
  if (providerName === 'concurrent_idempotent_requests') return true;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

/**
 * Fail-soft Resend REST transport. It never throws into report generation; the
 * caller persists the returned delivery failure and may retry it later.
 */
export async function sendReportEmailViaResend(
  input: ResendReportEmailInput,
  options: ResendTransportOptions = {},
): Promise<ReportEmailSendResult> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    return {
      ok: false,
      code: 'not_configured',
      retryable: true,
      message: 'RESEND_API_KEY is not configured',
    };
  }
  if (!fromAddress(input.from)) return invalid('REPORT_FROM_EMAIL is invalid');
  if (!emailAddress(input.to)) return invalid('The report recipient is invalid');
  if (!input.message.subject.trim() || !input.message.html.trim() || !input.message.text.trim()) {
    return invalid('The report email content is incomplete');
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 256 || /[\r\n]/.test(idempotencyKey)) {
    return invalid('The Resend idempotency key must contain 1–256 characters');
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(RESEND_EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json; charset=utf-8',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        from: input.from.trim(),
        to: [input.to.trim()],
        subject: input.message.subject,
        html: input.message.html,
        text: input.message.text,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as
      | { id?: unknown; name?: unknown; message?: unknown }
      | null;
    if (!response.ok) {
      const providerName = typeof payload?.name === 'string' ? payload.name : '';
      return {
        ok: false,
        code: 'provider_rejected',
        retryable: retryableStatus(response.status, providerName),
        status: response.status,
        // Provider error text can echo an address. Keep persisted failure data PII-free.
        message: `Resend rejected the request with HTTP ${response.status}`,
      };
    }
    if (typeof payload?.id !== 'string' || !payload.id.trim()) {
      return {
        ok: false,
        code: 'invalid_response',
        retryable: true,
        status: response.status,
        message: 'Resend returned no email id',
      };
    }
    return { ok: true, providerId: payload.id };
  } catch (error) {
    return {
      ok: false,
      code: 'request_failed',
      retryable: true,
      message: error instanceof Error && error.name === 'AbortError'
        ? 'Resend request timed out'
        : 'Resend request failed',
    };
  } finally {
    clearTimeout(timer);
  }
}
