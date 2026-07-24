import { z } from 'zod';
import type { MonthlyPerformanceReport } from './types';

export const MONTHLY_REPORT_DELIVERY_STATUSES = [
  'pending',
  'sending',
  'sent',
  'failed',
  'delivery_unknown',
] as const;

export type MonthlyReportDeliveryStatus =
  (typeof MONTHLY_REPORT_DELIVERY_STATUSES)[number];

export type MonthlyReportDeliveryResultStatus = Extract<
  MonthlyReportDeliveryStatus,
  'sent' | 'failed' | 'delivery_unknown'
>;

const ISO_DATE_TIME = z.string().datetime({ offset: true });
const KST_MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const COUNT = z.number().int().nonnegative().safe();

const monthRangeSchema = z
  .object({
    month: KST_MONTH,
    startDate: z.string().date(),
    endExclusiveDate: z.string().date(),
    startIso: ISO_DATE_TIME,
    endExclusiveIso: ISO_DATE_TIME,
  })
  .strict();

const metricSchema = z
  .object({
    current: COUNT,
    previous: COUNT,
    changePercent: z.number().int().nullable(),
  })
  .strict();

const reportSourceSchema = z
  .object({
    source: z.enum(['naver', 'google', 'instagram', 'direct', 'other']),
    label: z.string().min(1),
    count: COUNT,
    previousCount: COUNT,
    sharePercent: z.number().int().min(0).max(100),
    changePercent: z.number().int().nullable(),
  })
  .strict();

const commonReportShape = {
  siteId: z.string().trim().min(1),
  period: monthRangeSchema,
  comparisonPeriod: monthRangeSchema,
  sources: z.array(reportSourceSchema),
  hasCurrentData: z.boolean(),
  hasComparisonData: z.boolean(),
  insight: z.string().trim().min(1),
};

const legacyMetricsSchema = z
  .object({
    pageviews: metricSchema,
    phoneClicks: metricSchema,
    reservationClicks: metricSchema,
    directionsClicks: metricSchema,
    formSubmissions: metricSchema,
  })
  .strict();

const monthlyPerformanceReportV1Schema = z
  .object({
    ...commonReportShape,
    schemaVersion: z.literal(1),
    metrics: legacyMetricsSchema,
  })
  .strict();

const monthlyPerformanceReportV2Schema = z
  .object({
    ...commonReportShape,
    schemaVersion: z.literal(2),
    metrics: legacyMetricsSchema.extend({
      chatClicks: metricSchema,
      instagramClicks: metricSchema,
      consultationActions: metricSchema,
    }).strict(),
  })
  .strict();

/** 저장된 v1은 그대로 읽고, 신규 v2만 추가로 허용한다. */
export const monthlyPerformanceReportSchema = z.discriminatedUnion('schemaVersion', [
  monthlyPerformanceReportV1Schema,
  monthlyPerformanceReportV2Schema,
]);

export interface MonthlyReportRecord {
  id: string;
  siteId: string;
  clientId: string;
  /** Completed Korean calendar month, e.g. `2026-06`. */
  periodMonth: string;
  report: MonthlyPerformanceReport;
  deliveryStatus: MonthlyReportDeliveryStatus;
  deliveryAttempts: number;
  /** Stable machine code only. Never an exception message or recipient address. */
  lastErrorCode: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InsertMonthlyReportInput {
  siteId: string;
  clientId: string;
  periodMonth: string;
  report: MonthlyPerformanceReport;
}

export interface MarkMonthlyReportDeliveryInput {
  reportId: string;
  status: MonthlyReportDeliveryResultStatus;
  /** Required for `sent`; optional for `delivery_unknown` when the provider accepted the email. */
  providerMessageId?: string | null;
  /** Required for failed/unknown, forbidden for sent. Must be a stable code, not raw provider text. */
  errorCode?: string | null;
  completedAt?: string;
}

export interface MonthlyReportsRepository {
  insertIfAbsent(input: InsertMonthlyReportInput): Promise<{
    record: MonthlyReportRecord;
    created: boolean;
  }>;
  listByClient(input: { clientId: string; limit?: number }): Promise<MonthlyReportRecord[]>;
  /** Service/admin month view. Callers must enforce an admin or service-only guard. */
  listForService(input: { periodMonth: string }): Promise<MonthlyReportRecord[]>;
  get(input: { clientId: string; reportId: string }): Promise<MonthlyReportRecord | null>;
  /** Service/admin retry path. Callers must enforce an owned-site or admin guard. */
  getByIdForService(reportId: string): Promise<MonthlyReportRecord | null>;
  /** Only pending/failed rows can be claimed. Ambiguous delivery is never auto-reclaimed. */
  claimDelivery(input: { reportId: string; claimedAt?: string }): Promise<MonthlyReportRecord | null>;
  markDeliveryResult(input: MarkMonthlyReportDeliveryInput): Promise<MonthlyReportRecord>;
  /** Converts abandoned sending leases to review-only unknown; never retries them. */
  reconcileStaleDeliveries(input: { beforeIso: string; reconciledAt?: string }): Promise<number>;
  /** Purges records whose report month is before the month containing this instant. */
  purgeOlderThan(cutoffIso: string): Promise<number>;
}

export function normalizeReportPeriodMonth(periodMonth: string): string {
  const value = periodMonth.trim();
  if (!KST_MONTH.safeParse(value).success) {
    throw new TypeError('Monthly report periodMonth must be YYYY-MM');
  }
  return value;
}

export function assertReportInsertInput(input: InsertMonthlyReportInput): void {
  if (!input.siteId.trim() || !input.clientId.trim()) {
    throw new TypeError('Monthly report siteId and clientId are required');
  }
  normalizeReportPeriodMonth(input.periodMonth);
  const parsed = monthlyPerformanceReportSchema.safeParse(input.report);
  if (!parsed.success) throw new TypeError('Monthly report payload is invalid');
  if (input.report.siteId !== input.siteId || input.report.period.month !== input.periodMonth) {
    throw new TypeError('Monthly report identity does not match its payload');
  }
}

export function normalizeReportListLimit(limit: number | undefined): number {
  if (limit === undefined) return 24;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('Monthly report list limit must be a positive integer');
  }
  return Math.min(limit, 100);
}

export function normalizeDeliveryResult(input: MarkMonthlyReportDeliveryInput): {
  providerMessageId: string | null;
  errorCode: string | null;
  completedAt: string;
} {
  const providerMessageId = input.providerMessageId?.trim() || null;
  const errorCode = input.errorCode?.trim() || null;
  const completedAt = input.completedAt ?? new Date().toISOString();
  if (!ISO_DATE_TIME.safeParse(completedAt).success) {
    throw new TypeError('Monthly report completion time must be ISO-8601');
  }
  if (input.status === 'sent') {
    if (!providerMessageId || errorCode) {
      throw new TypeError('Sent delivery requires a provider message id and no error code');
    }
  } else if (input.status === 'failed') {
    if (providerMessageId || !errorCode || !/^[A-Z0-9_:-]{1,80}$/.test(errorCode)) {
      throw new TypeError('Failed delivery requires a stable non-PII error code only');
    }
  } else if (!errorCode || !/^[A-Z0-9_:-]{1,80}$/.test(errorCode)) {
    throw new TypeError('Unknown delivery requires a stable non-PII error code');
  }
  if (providerMessageId && providerMessageId.length > 255) {
    throw new TypeError('Provider message id is too long');
  }
  return { providerMessageId, errorCode, completedAt };
}

export function normalizeStaleReconciliation(input: {
  beforeIso: string;
  reconciledAt?: string;
}): { beforeIso: string; reconciledAt: string } {
  const reconciledAt = input.reconciledAt ?? new Date().toISOString();
  if (!ISO_DATE_TIME.safeParse(input.beforeIso).success) {
    throw new TypeError('Stale delivery boundary must be ISO-8601');
  }
  if (!ISO_DATE_TIME.safeParse(reconciledAt).success) {
    throw new TypeError('Stale delivery reconciliation time must be ISO-8601');
  }
  if (Date.parse(input.beforeIso) >= Date.parse(reconciledAt)) {
    throw new TypeError('Stale delivery boundary must precede reconciliation time');
  }
  return { beforeIso: input.beforeIso, reconciledAt };
}

export function normalizeClaimedAt(claimedAt: string | undefined): string {
  const value = claimedAt ?? new Date().toISOString();
  if (!ISO_DATE_TIME.safeParse(value).success) {
    throw new TypeError('Monthly report claim time must be ISO-8601');
  }
  return value;
}

export function cutoffMonthFromIso(cutoffIso: string): string {
  if (!ISO_DATE_TIME.safeParse(cutoffIso).success) {
    throw new TypeError('Monthly report cutoff must be ISO-8601');
  }
  // Retention follows the same Korean calendar boundary as report generation.
  return new Date(new Date(cutoffIso).getTime() + 9 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 7);
}
