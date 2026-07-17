import type { Site } from '@/lib/types/domain';
import type { SiteEventType, TrafficSource } from '@/lib/data/types';
import { SITE_EVENT_NAMES, SITE_REFERRER_SOURCES } from './site-beacon';

/** Browser beacon and server ingest consume one closed wire-contract source. */
export const SITE_EVENT_TYPES = SITE_EVENT_NAMES satisfies readonly SiteEventType[];
export const TRAFFIC_SOURCES = SITE_REFERRER_SOURCES satisfies readonly TrafficSource[];

/** UA는 필터에만 사용하고 반환값/DB/로그에 절대 포함하지 않는다. */
export function isLikelyBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent?.trim()) return true;
  return /bot\b|crawler|spider|slurp|bingpreview|headless|facebookexternalhit|preview|monitoring/i.test(
    userAgent,
  );
}

/** live와 발행 후 DNS 연결 대기만 수집한다. suspended/draft/building은 fail-closed. */
export function canCollectSiteEvents(
  site: Pick<Site, 'siteConfig' | 'publishedAt' | 'status'> | null,
): boolean {
  return Boolean(
    site?.siteConfig
    && site.publishedAt
    && (site.status === 'live' || site.status === 'pending_dns'),
  );
}

/** 서버 수신 시각을 한국 달력 날짜로 고정한다. 브라우저가 날짜를 주장할 수 없다. */
export function kstDateString(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error('유효한 서버 시각이 필요합니다.');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export interface SiteRateLimiter {
  allow(siteId: string, nowMs?: number): boolean;
}

/**
 * IP/세션/쿠키 없이 site 단위로만 제한한다. 방문자 식별자를 메모리에도 남기지 않는다.
 * serverless 인스턴스별 방어이며 DB의 PK upsert가 최종 쓰기 폭주를 직렬화한다.
 */
export function createSiteRateLimiter(input: {
  limit: number;
  windowMs: number;
}): SiteRateLimiter {
  const buckets = new Map<string, number[]>();
  return {
    allow(siteId, nowMs = Date.now()) {
      const active = (buckets.get(siteId) ?? []).filter((at) => nowMs - at < input.windowMs);
      if (active.length >= input.limit) {
        buckets.set(siteId, active);
        return false;
      }
      active.push(nowMs);
      buckets.set(siteId, active);
      return true;
    },
  };
}
