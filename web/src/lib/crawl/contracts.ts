import type { StructuredImportFacts } from '@/lib/import/extract';
import type { DecayScoreResult } from '@/lib/scan/decay-contract';
import type { ClinicAccentPreset, SiteConfig } from '@/lib/types/site';
import type { AiVisibilitySummary } from '@/lib/scan/ai-visibility';
import type { ScanProfileId } from '@/lib/scan/rules';
import type { ClinicPaletteOrigin } from '@/lib/us-demo/clinic-palette';
import type { UsDemoRenderMode } from '@/lib/us-demo/contracts';

export const CRAWL_ARTIFACT_SCHEMA_VERSION = 1 as const;
/**
 * Must outlive every preview lifetime below, and the ordering is the whole point.
 *
 * shared_site_previews.crawl_artifact_id is ON DELETE CASCADE (migration 0046), and the retention
 * purge deletes expired artifacts as well as expired previews. So an artifact that expires before
 * the preview it owns takes a live preview with it: at 30 days against a 45-day US demo, an
 * outreach link we told a clinic was good for forty-five days stopped resolving on day thirty,
 * with nothing in its own record to explain why. One day of slack keeps the artifact from
 * expiring in the same cron tick as the preview.
 */
export const CRAWL_ARTIFACT_RETENTION_DAYS = 46;
export const SHARED_PREVIEW_RETENTION_DAYS = 14;
export const US_MEDICAL_PREVIEW_RETENTION_DAYS = 45;

export function sharedPreviewRetentionDays(input: {
  renderMode: SharedSitePreviewRecord['renderMode'];
  siteConfig: Pick<SiteConfig, 'meta'>;
}): number {
  const isUsMedicalPreview = input.renderMode !== 'standard'
    && input.siteConfig.meta.locale === 'en-US'
    && input.siteConfig.meta.jurisdiction === 'US';
  return isUsMedicalPreview
    ? US_MEDICAL_PREVIEW_RETENTION_DAYS
    : SHARED_PREVIEW_RETENTION_DAYS;
}

export const DESIGNATED_CRAWL_POLICY = {
  maxPages: 100,
  minRequestIntervalMs: 1_000,
  maxRedirects: 3,
  maxRateLimitRetryDelayMs: 30_000,
  requestTimeoutMs: 8_000,
  maxHtmlBytes: 1_000_000,
  maxSitemaps: 3,
  /**
   * The real bound. A page cap is a guess about how long a site takes; this is the thing the
   * platform actually enforces, so the crawl measures itself against it and stops on its own
   * terms while it still has an artifact to hand back. Sits under the route's 300s maxDuration
   * with room for the compile and the response.
   *
   * Measured on the three sample practices through this route: 1.26, 1.40 and 1.60 seconds per
   * page, so a hundred pages projects to roughly 130-170s. The budget is what protects the
   * slower prospect that projection does not describe.
   */
  wallClockBudgetMs: 240_000,
} as const;

/**
 * A separately authorized full-transfer crawl. Consent expands volume only: robots, the
 * identifiable UA, redirect safety, and the one-request-per-second floor remain unchanged.
 */
export const CONSENTED_CRAWL_POLICY = {
  ...DESIGNATED_CRAWL_POLICY,
  maxPages: 100,
  id: 'us-medical-consented-v1',
} as const;

export function consentedCrawlMaxPages(
  raw = process.env.US_CONSENTED_CRAWL_MAX_PAGES,
): number {
  if (raw === undefined || raw.trim() === '') return CONSENTED_CRAWL_POLICY.maxPages;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 500
    ? parsed
    : CONSENTED_CRAWL_POLICY.maxPages;
}

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
export const ANAKS_LABS_CRAWLER_USER_AGENT =
  'Mozilla/5.0 (compatible; AnaksLabsCrawler/1.0; +https://anakslabs.com/privacy; contact=contact@anakslabs.com)';

export type CrawlImageRole = 'atmosphere' | 'figure' | 'unknown';
export type CrawlConnectorKind =
  | 'tel'
  | 'naver_map'
  | 'naver_booking'
  | 'kakao_channel'
  | 'instagram'
  | 'other_social'
  | 'us_booking'
  | 'google_maps';

export interface CrawlImageCandidate {
  url: string;
  alt: string;
  role: CrawlImageRole;
  declaredWidth?: number;
  declaredHeight?: number;
  /** Browser-observed dimensions; additive metadata only. No image bytes are ingested. */
  renderedDimensions?: {
    naturalWidth: number;
    naturalHeight: number;
    displayedWidth: number;
    displayedHeight: number;
  };
}

export interface CrawlRenderedImageMeasurement {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  displayedWidth: number;
  displayedHeight: number;
}

export interface CrawlConsentedSourceBlock {
  text: string;
  sourceLocator: string;
  sourceElementPath: string;
  sourceSha256: string;
  tagName: string;
  heading: boolean;
  exclusion?: 'footer-legal' | 'navigation-label' | 'skip-link' | 'overlay-ui-chrome';
  navigationDestinations?: Array<{
    url: string;
    label: string;
  }>;
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
  /**
   * Full source-block projection for an owner-consented transfer. Omitted from the designated
   * crawl so its bounded legacy artifact stays byte-compatible.
   */
  consentedSource?: {
    version: 1;
    blocks: CrawlConsentedSourceBlock[];
  };
  /** US outreach crawl only: minimized signal projection computed while source HTML is in memory. */
  aiVisibilitySummary?: AiVisibilitySummary;
  /** Present only when an explicitly supplied browser renderer was used. */
  accessObservation?: CrawlPageAccessObservation;
  decay: DecayScoreResult;
}

export interface CrawlTlsObservation {
  httpsUrl: string;
  status: 'valid' | 'certificate_error' | 'unavailable';
  errorCode?: string;
  httpFallbackApproved: boolean;
  httpFallbackUsed: boolean;
  /** Explicit per-run opt-in only. TLS verification remains enabled by default. */
  certificateWarningAccepted?: boolean;
}

export interface CrawlModalReleaseObservation {
  version: 1;
  beforeDomSha256: string;
  afterDomSha256: string;
  removedNodeCount: number;
  removedSelectors: string[];
}

export interface CrawlPageAccessObservation {
  version: 1;
  renderAttempts: number;
  fullScrollCompleted: boolean;
  screenshotSegments: Array<{ y: number; height: number }>;
  modalRelease?: CrawlModalReleaseObservation;
}

export interface CrawlPageFailure {
  url: string;
  stage: 'access';
  code:
    | 'auth_redirect'
    | 'fetch_failed'
    | 'http_error'
    | 'not_html'
    | 'rate_limited'
    | 'redirect_loop'
    | 'render_failed'
    | 'too_large';
  status?: number;
  attempts: number;
  detail?: string;
}

export interface CrawlAccessWarning {
  code: 'tls_certificate_verification_bypassed';
  url: string;
  detail: string;
}

export interface CrawlRobotsObservation {
  url: string;
  status: number;
  sitemaps: string[];
  crawlerAllowed: boolean;
  /** Additive redirect evidence; legacy artifacts omit it. Includes requested and final URL. */
  redirectChain?: string[];
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
  /** Omitted for the byte-compatible designated crawl path. */
  crawlPolicyId?: 'us-medical-consented-v1';
  /** Minimal linkage only; consent identity and notes remain in the immutable consent ledger. */
  consentEvidence?: {
    consentId: string;
    prospectId: string;
    scope: 'demo-by-email';
    consentedAt: string;
  };
  /** Consented-only same-origin destination ledger. URLs are discovered navigation targets. */
  crawlCoverage?: {
    crawledPages: number;
    estimatedSourcePages: number;
    coverageRate: number;
    uncrawledDestinations: string[];
  };
  /** Additive profile marker. Omission preserves the existing designated-crawl artifact bytes. */
  scanProfileId?: ScanProfileId;
  /**
   * US medical crawl only. Computed while HTML is in memory; no raw CSS and no logo bytes are
   * retained. The candidate hexes are kept because §2-2's extraction cannot run without them:
   * a four-value accent preset is a routing decision, not the practice's colour.
   */
  clinicPaletteProjection?: {
    version: 1;
    kind: 'css' | 'logo';
    sourceSha256: string;
    accentPreset: ClinicAccentPreset;
    /** §2-2 priority order, capped. Omitted by artifacts crawled before this field existed. */
    rawCandidates?: ReadonlyArray<{ origin: ClinicPaletteOrigin; hex: string }>;
  };
  tls: CrawlTlsObservation;
  robots: CrawlRobotsObservation;
  pages: CrawlPageArtifact[];
  skippedUrls: CrawlSkippedUrl[];
  /** Additive failure ledger. Omitted for legacy all-success crawls. */
  pageFailures?: CrawlPageFailure[];
  /** Additive explicit-risk ledger. Omitted when no opt-in was used. */
  accessWarnings?: CrawlAccessWarning[];
  /**
   * Why the crawl ended. `time_budget` means the wall-clock bound was reached and everything
   * collected up to that point was kept: before this existed the route simply timed out, the
   * whole artifact was lost, and an operator had to re-crawl someone else's site from nothing.
   */
  stoppedReason?: 'page_limit' | 'queue_exhausted' | 'time_budget';
}

export interface CrawlArtifactRecord {
  id: string;
  seedUrl: string;
  finalOrigin: string;
  artifact: CrawlArtifactPayload;
  decayResult: DecayScoreResult | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface SharedSitePreviewRecord {
  id: string;
  /**
   * The raw material this preview was compiled from, or null once that artifact was purged
   * (0066 replaced 0046's cascade with `on delete set null`). Delivery never reads it: the
   * approved `siteConfig` below is the whole artefact the customer said yes to.
   */
  crawlArtifactId: string | null;
  tokenHash: string;
  sourceUrl: string;
  siteConfig: SiteConfig;
  renderMode: 'standard' | UsDemoRenderMode;
  noticeVersion: 1;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  /**
   * What the compiler knew when this preview was built. Null for import previews, which have no
   * compiler audit, and for previews written before the column existed.
   */
  compilationAudit: unknown;
}
