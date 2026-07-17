import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { MockMonthlyReportsRepository } from './repository-mock';
import {
  assertReportInsertInput,
  cutoffMonthFromIso,
  MONTHLY_REPORT_DELIVERY_STATUSES,
  monthlyPerformanceReportSchema,
  normalizeClaimedAt,
  normalizeDeliveryResult,
  normalizeReportListLimit,
  type MonthlyReportRecord,
  type MonthlyReportsRepository,
} from './repository-core';

interface MonthlyReportRow {
  id: string;
  site_id: string;
  client_id: string;
  period_month: string;
  report_payload: unknown;
  delivery_status: MonthlyReportRecord['deliveryStatus'];
  delivery_attempts: number | string;
  last_error_code: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: MonthlyReportRow): MonthlyReportRecord {
  const report = monthlyPerformanceReportSchema.parse(row.report_payload);
  const periodMonth = row.period_month.slice(0, 7);
  if (report.siteId !== row.site_id || report.period.month !== periodMonth) {
    throw new Error('MONTHLY_REPORT_DATABASE_IDENTITY_MISMATCH');
  }
  const deliveryAttempts = Number(row.delivery_attempts);
  if (!Number.isSafeInteger(deliveryAttempts) || deliveryAttempts < 0) {
    throw new Error('MONTHLY_REPORT_DATABASE_ATTEMPTS_INVALID');
  }
  if (!(MONTHLY_REPORT_DELIVERY_STATUSES as readonly string[]).includes(row.delivery_status)) {
    throw new Error('MONTHLY_REPORT_DATABASE_DELIVERY_STATUS_INVALID');
  }
  return {
    id: row.id,
    siteId: row.site_id,
    clientId: row.client_id,
    periodMonth,
    report,
    deliveryStatus: row.delivery_status,
    deliveryAttempts,
    lastErrorCode: row.last_error_code,
    providerMessageId: row.provider_message_id,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

export class SupabaseMonthlyReportsRepository implements MonthlyReportsRepository {
  async insertIfAbsent(input: Parameters<MonthlyReportsRepository['insertIfAbsent']>[0]) {
    assertReportInsertInput(input);
    const { data, error } = await getServiceRoleClient().rpc('insert_monthly_site_report', {
      p_site_id: input.siteId,
      p_period_month: `${input.periodMonth}-01`,
      p_report_payload: input.report,
    });
    if (error) throw new Error(`monthly report insert failed: ${error.message}`);
    const result = asObject(data, 'MONTHLY_REPORT_INSERT_RESULT_INVALID');
    const record = toRecord(result.record as MonthlyReportRow);
    if (record.clientId !== input.clientId) {
      throw new Error('MONTHLY_REPORT_DATABASE_OWNER_MISMATCH');
    }
    return {
      record,
      created: result.created === true,
    };
  }

  async listByClient(input: Parameters<MonthlyReportsRepository['listByClient']>[0]) {
    const limit = normalizeReportListLimit(input.limit);
    const { data, error } = await getServiceRoleClient()
      .from('monthly_site_reports')
      .select('*')
      .eq('client_id', input.clientId)
      .order('period_month', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`monthly report list failed: ${error.message}`);
    return ((data ?? []) as MonthlyReportRow[]).map(toRecord);
  }

  async get(input: Parameters<MonthlyReportsRepository['get']>[0]) {
    const { data, error } = await getServiceRoleClient()
      .from('monthly_site_reports')
      .select('*')
      .eq('id', input.reportId)
      .eq('client_id', input.clientId)
      .maybeSingle();
    if (error) throw new Error(`monthly report get failed: ${error.message}`);
    return data ? toRecord(data as MonthlyReportRow) : null;
  }

  async getByIdForService(reportId: string) {
    const { data, error } = await getServiceRoleClient()
      .from('monthly_site_reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle();
    if (error) throw new Error(`monthly report service get failed: ${error.message}`);
    return data ? toRecord(data as MonthlyReportRow) : null;
  }

  async claimDelivery(input: Parameters<MonthlyReportsRepository['claimDelivery']>[0]) {
    const { data, error } = await getServiceRoleClient().rpc('claim_monthly_report_delivery', {
      p_report_id: input.reportId,
      p_claimed_at: normalizeClaimedAt(input.claimedAt),
    });
    if (error) throw new Error(`monthly report claim failed: ${error.message}`);
    return data ? toRecord(data as MonthlyReportRow) : null;
  }

  async markDeliveryResult(input: Parameters<MonthlyReportsRepository['markDeliveryResult']>[0]) {
    const normalized = normalizeDeliveryResult(input);
    const { data, error } = await getServiceRoleClient().rpc('mark_monthly_report_delivery', {
      p_report_id: input.reportId,
      p_status: input.status,
      p_error_code: normalized.errorCode,
      p_provider_message_id: normalized.providerMessageId,
      p_completed_at: normalized.completedAt,
    });
    if (error) throw new Error(`monthly report mark result failed: ${error.message}`);
    return toRecord(data as MonthlyReportRow);
  }

  async purgeOlderThan(cutoffIso: string): Promise<number> {
    const cutoffMonth = cutoffMonthFromIso(cutoffIso);
    const { data, error } = await getServiceRoleClient().rpc('purge_monthly_site_reports', {
      p_cutoff_month: `${cutoffMonth}-01`,
    });
    if (error) throw new Error(`monthly report purge failed: ${error.message}`);
    const deleted = Number(data);
    if (!Number.isSafeInteger(deleted) || deleted < 0) {
      throw new Error('MONTHLY_REPORT_PURGE_RESULT_INVALID');
    }
    return deleted;
  }
}

export function getMonthlyReportsRepository(): MonthlyReportsRepository {
  return isMockMode()
    ? new MockMonthlyReportsRepository()
    : new SupabaseMonthlyReportsRepository();
}

export type {
  InsertMonthlyReportInput,
  MarkMonthlyReportDeliveryInput,
  MonthlyReportDeliveryResultStatus,
  MonthlyReportDeliveryStatus,
  MonthlyReportRecord,
  MonthlyReportsRepository,
} from './repository-core';
