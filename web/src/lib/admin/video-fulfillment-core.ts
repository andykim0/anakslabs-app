import type { Client, Site } from '@/lib/types/domain';
import type { MotionIndustryClass, SiteConfig } from '@/lib/types/site';
import { heroVideoResumePlan } from '@/lib/onboarding/hero-video-process';

export type VideoFulfillmentRequestedAtSource = 'recorded' | 'site-created-fallback';

export interface VideoFulfillmentRecord {
  id: string;
  siteId: string;
  clientId: string;
  videoAssetId: string;
  canonicalVideoUrl: string;
  posterUrl: string;
  requestedAt: string;
  requestedAtSource: VideoFulfillmentRequestedAtSource;
  completedAt: string;
}

export type VideoFulfillmentBlockedReason = 'missing-hero-image';

export interface VideoQueueItem {
  siteId: string;
  clientId: string;
  siteName: string;
  siteDomain: string | null;
  clientName: string;
  clientEmail: string;
  industryClass: MotionIndustryClass | 'other';
  purposeId: string | null;
  heroImageUrl: string | null;
  heroImageChoice: string | null;
  heroMotionId: string | null;
  videoConceptId: string | null;
  requestedAt: string;
  requestedAtSource: VideoFulfillmentRequestedAtSource;
  fulfillmentStatus: 'ready' | 'blocked';
  blockedReason: VideoFulfillmentBlockedReason | null;
}

export type VideoFulfillmentIneligibleReason =
  | 'addon-not-owned'
  | 'not-requested'
  | 'already-applied'
  | 'completed';

export type SiteVideoFulfillmentState =
  | { pending: false; reason: VideoFulfillmentIneligibleReason }
  | {
      pending: true;
      config: SiteConfig;
      configSource: 'draft' | 'published';
      requestedAt: string;
      requestedAtSource: VideoFulfillmentRequestedAtSource;
      blockedReason: VideoFulfillmentBlockedReason | null;
    };

export interface VideoFulfillmentRequestTiming {
  requestedAt: string;
  requestedAtSource: VideoFulfillmentRequestedAtSource;
}

function activeConfig(site: Site): { config: SiteConfig; source: 'draft' | 'published' } | null {
  if (site.draftConfig) return { config: site.draftConfig, source: 'draft' };
  if (site.siteConfig) return { config: site.siteConfig, source: 'published' };
  return null;
}

function appliedInEitherConfig(site: Site): boolean {
  return [site.draftConfig, site.siteConfig].some((config) => heroVideoResumePlan(config).applied);
}

function validIso(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

export function siteVideoFulfillmentState(input: {
  site: Site;
  client: Client;
  completion?: VideoFulfillmentRecord | null;
  timing?: VideoFulfillmentRequestTiming | null;
}): SiteVideoFulfillmentState {
  if (input.client.id !== input.site.clientId || input.client.tier !== 'premium') {
    return { pending: false, reason: 'addon-not-owned' };
  }
  if (input.completion) return { pending: false, reason: 'completed' };
  if (appliedInEitherConfig(input.site)) return { pending: false, reason: 'already-applied' };

  const selected = activeConfig(input.site);
  if (!selected || !heroVideoResumePlan(selected.config).requested) {
    return { pending: false, reason: 'not-requested' };
  }

  const timing = input.timing && validIso(input.timing.requestedAt)
    ? input.timing
    : {
        requestedAt: input.site.createdAt,
        requestedAtSource: 'site-created-fallback' as const,
      };
  const resume = heroVideoResumePlan(selected.config);
  return {
    pending: true,
    config: selected.config,
    configSource: selected.source,
    requestedAt: timing.requestedAt,
    requestedAtSource: timing.requestedAtSource,
    blockedReason: resume.canResume ? null : 'missing-hero-image',
  };
}

/** Stable alias used by admin/API policy tests. */
export const videoFulfillmentEligibility = siteVideoFulfillmentState;

export function deriveVideoQueueItem(input: {
  site: Site;
  client: Client;
  completion?: VideoFulfillmentRecord | null;
  timing?: VideoFulfillmentRequestTiming | null;
}): VideoQueueItem | null {
  const state = siteVideoFulfillmentState(input);
  if (!state.pending) return null;
  const resume = heroVideoResumePlan(state.config);
  const heroImageUrl = state.config.pages
    .find((page) => page.slug === '')
    ?.sections.find((section) => section.type === 'hero' && !section.hidden)
    ?.background.image?.src ?? null;
  return {
    siteId: input.site.id,
    clientId: input.client.id,
    siteName: input.site.name,
    siteDomain: input.site.domain,
    clientName: input.client.name,
    clientEmail: input.client.email,
    industryClass: state.config.meta.industryClass ?? 'other',
    purposeId: state.config.meta.purposeId ?? null,
    heroImageUrl,
    heroImageChoice: resume.heroImageChoice ?? null,
    heroMotionId: state.config.motion?.heroMotionId ?? null,
    videoConceptId: state.config.motion?.videoConceptId ?? null,
    requestedAt: state.requestedAt,
    requestedAtSource: state.requestedAtSource,
    fulfillmentStatus: state.blockedReason ? 'blocked' : 'ready',
    blockedReason: state.blockedReason,
  };
}

function configHasAppliedVideo(
  config: SiteConfig | null,
  input: { assetId: string; videoUrl: string; posterUrl: string },
): boolean {
  if (!config) return true;
  const hero = config.pages
    .find((page) => page.slug === '')
    ?.sections.find((section) => section.type === 'hero' && !section.hidden);
  const ref = config.assetRefs?.find((candidate) => candidate.assetId === input.assetId);
  return hero?.background.video?.src === input.videoUrl
    && hero.background.video.poster === input.posterUrl
    && ref?.url === input.videoUrl;
}

export interface CompleteVideoFulfillmentInput {
  siteId: string;
  clientId: string;
  videoAssetId: string;
  canonicalVideoUrl: string;
  posterUrl: string;
  expectedDraftConfig: SiteConfig | null;
  expectedSiteConfig: SiteConfig | null;
  nextDraftConfig: SiteConfig | null;
  nextSiteConfig: SiteConfig | null;
  requestedAt: string;
  requestedAtSource: VideoFulfillmentRequestedAtSource;
}

function required(value: string, code: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(code);
  return trimmed;
}

function isSafeStoredMediaUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value);
}

export function normalizeCompleteVideoFulfillmentInput(
  input: CompleteVideoFulfillmentInput,
): CompleteVideoFulfillmentInput {
  const normalized = {
    ...input,
    siteId: required(input.siteId, 'VIDEO_FULFILLMENT_SITE_REQUIRED'),
    clientId: required(input.clientId, 'VIDEO_FULFILLMENT_CLIENT_REQUIRED'),
    videoAssetId: required(input.videoAssetId, 'VIDEO_FULFILLMENT_ASSET_REQUIRED'),
    canonicalVideoUrl: required(input.canonicalVideoUrl, 'VIDEO_FULFILLMENT_VIDEO_URL_REQUIRED'),
    posterUrl: required(input.posterUrl, 'VIDEO_FULFILLMENT_POSTER_REQUIRED'),
    requestedAt: required(input.requestedAt, 'VIDEO_FULFILLMENT_REQUESTED_AT_REQUIRED'),
  };
  if (!validIso(normalized.requestedAt)) {
    throw new Error('VIDEO_FULFILLMENT_REQUESTED_AT_INVALID');
  }
  if (!isSafeStoredMediaUrl(normalized.canonicalVideoUrl)
    || !isSafeStoredMediaUrl(normalized.posterUrl)) {
    throw new Error('VIDEO_FULFILLMENT_MEDIA_URL_UNSAFE');
  }
  if (!normalized.nextDraftConfig && !normalized.nextSiteConfig) {
    throw new Error('VIDEO_FULFILLMENT_NEXT_CONFIG_REQUIRED');
  }
  const applied = {
    assetId: normalized.videoAssetId,
    videoUrl: normalized.canonicalVideoUrl,
    posterUrl: normalized.posterUrl,
  };
  if (!configHasAppliedVideo(normalized.nextDraftConfig, applied)
    || !configHasAppliedVideo(normalized.nextSiteConfig, applied)) {
    throw new Error('VIDEO_FULFILLMENT_NEXT_CONFIG_INVALID');
  }
  return normalized;
}

export interface HeroVideoFulfillmentRepository {
  getBySite(siteId: string): Promise<VideoFulfillmentRecord | null>;
  listRecent(limit?: number): Promise<VideoFulfillmentRecord[]>;
  complete(input: CompleteVideoFulfillmentInput): Promise<VideoFulfillmentRecord>;
}

export function normalizeVideoFulfillmentListLimit(limit = 200): number {
  return Number.isSafeInteger(limit) && limit > 0 && limit <= 500 ? limit : 200;
}
