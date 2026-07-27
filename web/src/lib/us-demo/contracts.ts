import type { SiteConfig } from '@/lib/types/site';

export const US_DEMO_SOURCE_ORIGIN = 'prospect_public_source' as const;
export const US_DEMO_LOCALE_CONTRACT = Object.freeze({
  locale: 'en-US',
  market: 'US-CA',
  jurisdiction: 'US',
} as const);

export type ProspectPublicSourceKind =
  | 'business_name'
  | 'introduction'
  | 'service'
  | 'provider_bio'
  | 'faq_question'
  | 'faq_answer'
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
  market: 'US-CA';
  jurisdiction: 'US';
  blocks: readonly ProspectPublicSourceBlock[];
  usedBlockIds: readonly string[];
  excluded: readonly {
    blockId: string;
    reason: 'policy-block' | 'review-required' | 'manual-exclusion' | 'unsupported-slot';
    violations?: readonly UsMedicalAdViolation[];
  }[];
}

export interface UsMedicalDemoCompilation {
  config: SiteConfig;
  sourceManifest: UsDemoSourceManifest;
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
