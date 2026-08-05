import type { Site } from '@/lib/types/domain';
import type { SiteEventType, TrafficSource } from '@/lib/data/types';
import {
  DEFAULT_US_SITE_TIMEZONE,
  type SiteConfig,
  type UsSiteTimezone,
} from '@/lib/types/site';
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
type CollectibleSite = Pick<Site, 'siteConfig' | 'publishedAt' | 'status'> & {
  siteConfig: SiteConfig;
  publishedAt: string;
  status: 'live' | 'pending_dns';
};

export function canCollectSiteEvents(
  site: Pick<Site, 'siteConfig' | 'publishedAt' | 'status'> | null,
): site is CollectibleSite {
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

/** US 사이트의 서버 수신 시각을 발급 시 확정된 사이트 시간대의 날짜로 버킷팅한다. */
export function usSiteDateString(
  timeZone: UsSiteTimezone,
  now: Date = new Date(),
): string {
  if (!Number.isFinite(now.getTime())) throw new Error('유효한 서버 시각이 필요합니다.');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * 날짜는 브라우저 페이로드가 아니라 서버가 읽은 발행 config에서만 결정한다.
 * 반쪽 en-US 레거시 행은 새 발급 기본값과 같은 LA로 fail-closed 폴백한다.
 */
export function siteEventDateString(
  config: SiteConfig,
  now: Date = new Date(),
): string {
  return config.meta.locale === 'en-US'
    ? usSiteDateString(config.meta.timezone ?? DEFAULT_US_SITE_TIMEZONE, now)
    : kstDateString(now);
}

export interface SiteRateLimiter {
  allow(siteId: string, nowMs?: number): boolean;
  /** Operational/test introspection only; keys are opaque site IDs, never visitor identifiers. */
  bucketCount(): number;
}

/**
 * IP/세션/쿠키 없이 site 단위로만 제한한다. 방문자 식별자를 메모리에도 남기지 않는다.
 * serverless 인스턴스별 방어이며 DB의 PK upsert가 최종 쓰기 폭주를 직렬화한다.
 */
export function createSiteRateLimiter(input: {
  limit: number;
  windowMs: number;
  maxBuckets?: number;
}): SiteRateLimiter {
  const maxBuckets = input.maxBuckets ?? 10_000;
  if (
    !Number.isSafeInteger(input.limit)
    || input.limit < 1
    || !Number.isFinite(input.windowMs)
    || input.windowMs <= 0
    || !Number.isSafeInteger(maxBuckets)
    || maxBuckets < 1
  ) {
    throw new TypeError('site rate limiter requires positive finite limits');
  }

  const buckets = new Map<string, { hits: number[]; touchedAt: number }>();
  let lastSweepAt = Number.NEGATIVE_INFINITY;

  function sweepExpired(nowMs: number): void {
    for (const [siteId, bucket] of buckets) {
      const active = bucket.hits.filter((at) => nowMs - at < input.windowMs);
      if (active.length === 0) buckets.delete(siteId);
      else bucket.hits = active;
    }
    lastSweepAt = nowMs;
  }

  function reserveBucket(nowMs: number): void {
    if (buckets.size < maxBuckets) return;
    sweepExpired(nowMs);
    if (buckets.size < maxBuckets) return;

    let oldestSiteId: string | undefined;
    let oldestTouchedAt = Number.POSITIVE_INFINITY;
    for (const [siteId, bucket] of buckets) {
      if (bucket.touchedAt >= oldestTouchedAt) continue;
      oldestSiteId = siteId;
      oldestTouchedAt = bucket.touchedAt;
    }
    if (oldestSiteId !== undefined) buckets.delete(oldestSiteId);
  }

  return {
    allow(siteId, nowMs = Date.now()) {
      if (!Number.isFinite(nowMs)) return false;
      if (nowMs - lastSweepAt >= input.windowMs) sweepExpired(nowMs);

      const existing = buckets.get(siteId);
      const active = (existing?.hits ?? []).filter((at) => nowMs - at < input.windowMs);
      if (active.length >= input.limit) {
        buckets.set(siteId, { hits: active, touchedAt: nowMs });
        return false;
      }
      if (!existing) reserveBucket(nowMs);
      active.push(nowMs);
      buckets.set(siteId, { hits: active, touchedAt: nowMs });
      return true;
    },
    bucketCount() {
      return buckets.size;
    },
  };
}
