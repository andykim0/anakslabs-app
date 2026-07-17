/** mock site_events — 방문자 행 없이 일별 집계 키만 보관한다. */
import type { SiteEventAggregate, SiteEventsRepo } from '../types';
import { assertReportingCalendarDate } from '@/lib/reporting/retention';
import { getMockStore } from './store';

function keyOf(input: {
  siteId: string;
  eventDate: string;
  eventType: string;
  source: string;
}): string {
  return [input.siteId, input.eventDate, input.eventType, input.source].join('|');
}

export class MockSiteEventsRepo implements SiteEventsRepo {
  async increment(input: Parameters<SiteEventsRepo['increment']>[0]): Promise<void> {
    const store = getMockStore();
    const site = store.sites.get(input.siteId);
    if (
      !site?.siteConfig
      || !site.publishedAt
      || !['live', 'pending_dns'].includes(site.status)
    ) {
      throw new Error('increment_site_event: 발행 중인 사이트가 아닙니다.');
    }
    const key = keyOf(input);
    const current = store.siteEvents.get(key);
    if (current) {
      current.count += 1;
      return;
    }
    store.siteEvents.set(key, {
      siteId: site.id,
      clientId: site.clientId,
      eventDate: input.eventDate,
      eventType: input.eventType,
      source: input.source,
      count: 1,
    });
  }

  async listBySiteRange(
    input: Parameters<SiteEventsRepo['listBySiteRange']>[0],
  ): Promise<SiteEventAggregate[]> {
    return [...getMockStore().siteEvents.values()]
      .filter((row) => (
        row.siteId === input.siteId
        && row.eventDate >= input.fromDate
        && row.eventDate < input.toDate
      ))
      .sort((a, b) => (
        a.eventDate.localeCompare(b.eventDate)
        || a.eventType.localeCompare(b.eventType)
        || a.source.localeCompare(b.source)
      ))
      .map((row) => structuredClone(row));
  }

  async purgeBeforeDate(beforeDate: string): Promise<number> {
    assertReportingCalendarDate(beforeDate);
    const store = getMockStore();
    let deleted = 0;
    for (const [key, row] of store.siteEvents) {
      if (row.eventDate >= beforeDate) continue;
      store.siteEvents.delete(key);
      deleted += 1;
    }
    return deleted;
  }
}
