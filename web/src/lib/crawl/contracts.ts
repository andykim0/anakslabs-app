import type { StructuredImportFacts } from '@/lib/import/extract';

export const CRAWL_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const CRAWL_ARTIFACT_RETENTION_DAYS = 30;
export const SHARED_PREVIEW_RETENTION_DAYS = 14;

export const DESIGNATED_CRAWL_POLICY = {
  maxPages: 20,
  minRequestIntervalMs: 1_000,
  maxRedirects: 3,
  requestTimeoutMs: 8_000,
  maxHtmlBytes: 1_000_000,
  maxSitemaps: 3,
} as const;

/**
 * The pilot exception requires both this server-owned exact-host allowlist and
 * an explicit admin request flag. TLS verification is never disabled: an
 * approved certificate failure may only fall back to the public HTTP origin.
 */
export const APPROVED_TLS_HTTP_FALLBACK_HOSTS = new Set([
  'iidgn.com',
  'www.iidgn.com',
]);

/** Identifiable, contactable crawler identity. Kept in one server-owned source. */
export const DABOIM_CRAWLER_USER_AGENT =
  'Mozilla/5.0 (compatible; DaboimCrawler/1.0; +https://anakslabs.com/privacy; contact=help@anakslabs.com)';

export type CrawlImageRole = 'atmosphere' | 'figure' | 'unknown';
export type CrawlConnectorKind =
  | 'tel'
  | 'naver_map'
  | 'naver_booking'
  | 'kakao_channel'
  | 'instagram'
  | 'other_social';

export interface CrawlImageCandidate {
  url: string;
  alt: string;
  role: CrawlImageRole;
  declaredWidth?: number;
  declaredHeight?: number;
}

export interface CrawlConnectorCandidate {
  kind: CrawlConnectorKind;
  url: string;
  label?: string;
}

export interface CrawlPageArtifact {
  url: string;
  status: number;
  contentType: string;
  lastModified?: string;
  title?: string;
  description?: string;
  headings: string[];
  text: string;
  structured: StructuredImportFacts;
  images: CrawlImageCandidate[];
  connectors: CrawlConnectorCandidate[];
}

export interface CrawlTlsObservation {
  httpsUrl: string;
  status: 'valid' | 'certificate_error' | 'unavailable';
  errorCode?: string;
  httpFallbackApproved: boolean;
  httpFallbackUsed: boolean;
}

export interface CrawlRobotsObservation {
  url: string;
  status: number;
  sitemaps: string[];
  crawlerAllowed: boolean;
}

export interface CrawlSkippedUrl {
  url: string;
  reason: 'auth_or_account' | 'side_effect' | 'auth_redirect';
}

export interface CrawlArtifactPayload {
  schemaVersion: typeof CRAWL_ARTIFACT_SCHEMA_VERSION;
  seedUrl: string;
  finalOrigin: string;
  observedAt: string;
  tls: CrawlTlsObservation;
  robots: CrawlRobotsObservation;
  pages: CrawlPageArtifact[];
  skippedUrls: CrawlSkippedUrl[];
  stoppedReason?: 'page_limit' | 'queue_exhausted';
}

export interface CrawlArtifactRecord {
  id: string;
  seedUrl: string;
  finalOrigin: string;
  artifact: CrawlArtifactPayload;
  decayResult: unknown | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}
