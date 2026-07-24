/** Supabase site_events 일별 집계 저장소 — 모든 쓰기는 SECURITY DEFINER RPC 경유. */
import type { SiteEventAggregate, SiteEventsRepo } from '../types';
import { assertReportingCalendarDate } from '@/lib/reporting/retention';
import { getServiceRoleClient } from './client';

interface SiteEventRow {
  site_id: string;
  client_id: string;
  event_date: string;
  event_type: SiteEventAggregate['eventType'];
  referrer_source: SiteEventAggregate['source'];
  event_count: number | string;
}

function toAggregate(row: SiteEventRow): SiteEventAggregate {
  return {
    siteId: row.site_id,
    clientId: row.client_id,
    eventDate: row.event_date,
    eventType: row.event_type,
    source: row.referrer_source,
    count: Number(row.event_count),
  };
}

export class SupabaseSiteEventsRepo implements SiteEventsRepo {
  async increment(input: Parameters<SiteEventsRepo['increment']>[0]): Promise<void> {
    const client = getServiceRoleClient();
    const { error } = input.eventId
      ? await client.rpc('record_site_event', {
          p_site_id: input.siteId,
          p_event_type: input.eventType,
          p_referrer_source: input.source,
          p_event_date: input.eventDate,
          p_event_id: input.eventId,
        })
      : await client.rpc('increment_site_event', {
          p_site_id: input.siteId,
          p_event_type: input.eventType,
          p_referrer_source: input.source,
          p_event_date: input.eventDate,
        });
    if (error) throw new Error(`site_events 집계 실패: ${error.message}`);
  }

  async listBySiteRange(
    input: Parameters<SiteEventsRepo['listBySiteRange']>[0],
  ): Promise<SiteEventAggregate[]> {
    const { data, error } = await getServiceRoleClient()
      .from('site_events')
      .select('site_id,client_id,event_date,event_type,referrer_source,event_count')
      .eq('site_id', input.siteId)
      .gte('event_date', input.fromDate)
      .lt('event_date', input.toDate)
      .order('event_date', { ascending: true });
    if (error) throw new Error(`site_events 조회 실패: ${error.message}`);
    return ((data ?? []) as SiteEventRow[]).map(toAggregate);
  }

  async purgeBeforeDate(beforeDate: string): Promise<number> {
    assertReportingCalendarDate(beforeDate);
    const { data, error } = await getServiceRoleClient().rpc('purge_site_events', {
      p_before_date: beforeDate,
    });
    if (error) throw new Error(`site_events 보관기간 삭제 실패: ${error.message}`);
    const deleted = Number(data);
    if (!Number.isSafeInteger(deleted) || deleted < 0) {
      throw new Error('site_events 보관기간 삭제 결과가 올바르지 않습니다.');
    }
    return deleted;
  }

  async purgeExpiredReceipts(beforeIso: string): Promise<number> {
    const parsed = new Date(beforeIso);
    if (!Number.isFinite(parsed.getTime())) {
      throw new TypeError('site event receipt cutoff must be ISO-8601');
    }
    const { data, error } = await getServiceRoleClient().rpc('purge_site_event_receipts', {
      p_before: parsed.toISOString(),
    });
    if (error) throw new Error(`site event receipts 정리 실패: ${error.message}`);
    const deleted = Number(data);
    if (!Number.isSafeInteger(deleted) || deleted < 0) {
      throw new Error('site event receipts 정리 결과가 올바르지 않습니다.');
    }
    return deleted;
  }
}
