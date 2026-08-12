import type { SiteConfig } from '@/lib/types/site';

export const US_DEMO_SOURCE_ORIGIN = 'prospect_public_source' as const;
export const US_DEMO_RENDER_MODES = ['outreach-safe', 'preview-full'] as const;
export type UsDemoRenderMode = (typeof US_DEMO_RENDER_MODES)[number];
export const US_DEMO_LOCALE_CONTRACT = Object.freeze({
  locale: 'en-US',
  jurisdiction: 'US',
} as const);
// Provenance-manifest compatibility only. This is not SiteMeta and is never used to classify
// a rendered site; retaining the legacy byte avoids changing existing US manifest SHA values.
export const US_DEMO_SOURCE_MANIFEST_MARKET = 'US-CA' as const;

export type ProspectPublicSourceKind =
  | 'business_name'
  | 'introduction'
  | 'service'
  | 'service_detail'
  | 'provider_name'
  | 'provider_credential'
  | 'provider_bio'
  | 'insurance'
  | 'price_or_financing'
  | 'faq_question'
  | 'faq_answer'
  | 'cta'
  | 'phone'
  | 'address'
  | 'opening_hours';

export interface ProspectPublicSourceBlock {
  id: string;
  origin: typeof US_DEMO_SOURCE_ORIGIN;
  kind: ProspectPublicSourceKind;
  text: string;
  sourceUrl: string;
  sourceLocation: {
    field: string;
    ordinal: number;
  };
  originalSha256: string;
}

export type UsMedicalAdReviewCategory =
  | 'absolute-outcome'
  | 'unsupported-outcome'
  | 'comparative-superiority'
  | 'unverified-credential';

export interface UsMedicalAdViolation {
  category: UsMedicalAdReviewCategory;
  severity: 'block' | 'review';
  matchedText: string;
  rationale: string;
}

/**
 * Manual finishing can only curate already captured source blocks. It has no free-copy field,
 * so hand finishing cannot become a translation or unsupported-claim back door.
 */
export interface UsDemoManualFinish {
  includeBlockIds?: readonly string[];
  orderedBlockIds?: readonly string[];
  approvedReviewBlockIds?: readonly string[];
}

export interface UsDemoSourceManifest {
  version: 1;
  origin: typeof US_DEMO_SOURCE_ORIGIN;
  locale: 'en-US';
  market: typeof US_DEMO_SOURCE_MANIFEST_MARKET;
  jurisdiction: 'US';
  blocks: readonly ProspectPublicSourceBlock[];
  usedBlockIds: readonly string[];
  excluded: readonly {
    blockId: string;
    reason: 'policy-block' | 'review-required' | 'manual-exclusion' | 'unsupported-slot';
    violations?: readonly UsMedicalAdViolation[];
  }[];
  /** Multipage clinic previews only. IDs remain immutable crawl projections; no bytes are copied. */
  images?: readonly ProspectPublicSourceImage[];
  /** Multipage clinic previews only. IDs are derived from the immutable crawl projection. */
  usedImageIds?: readonly string[];
}

export interface ProspectPublicSourceImage {
  id: string;
  origin: typeof US_DEMO_SOURCE_ORIGIN;
  url: string;
  alt: string;
  sourcePageUrl: string;
  sourceLocation: {
    field: 'images';
    ordinal: number;
  };
  originalSha256: string;
}

/**
 * Ticket D4. One record per hero slot, so the ranking can be inspected per artifact instead of
 * inferred from the rendered page. The same rule settles at different stages on different sites,
 * which is the whole reason the stage is recorded rather than just the winner.
 */
export interface ClinicHeroDecision {
  pageSlug: string;
  /** What finally paints the hero: the practice's own photo, licensed stock, or nothing. */
  outcome: 'source' | 'stock' | 'none';
  imageUrl?: string;
  tieBreak:
    | 'atmosphere'
    | 'known-area'
    | 'pool-order'
    | 'only-candidate'
    | 'no-candidate';
  /** Hero-eligible candidates left after the gate, the cap and the previous-hero dedup. */
  candidateCount: number;
}

export interface UsMedicalDemoCompilation {
  config: SiteConfig;
  sourceManifest: UsDemoSourceManifest;
  /** Additive output marker; the default outreach-safe output omits it for byte compatibility. */
  renderMode?: 'preview-full';
  /** Additive; present for the full preview, which is the only mode that allocates heroes. */
  heroDecisions?: readonly ClinicHeroDecision[];
}

export const INSUFFICIENT_ENGLISH_SOURCE = 'INSUFFICIENT_ENGLISH_SOURCE' as const;

export class UsDemoCompileError extends Error {
  constructor(
    public readonly code: typeof INSUFFICIENT_ENGLISH_SOURCE | 'INVALID_MANUAL_FINISH',
    message: string,
  ) {
    super(message);
    this.name = 'UsDemoCompileError';
  }
}
