import type { MedicalAdViolation } from '@/lib/content/medical-ad-policy';
import type { SiteConfig } from '@/lib/types/site';

export type KoClinicSourceKind =
  | 'business_name'
  | 'page_title'
  | 'heading'
  | 'paragraph'
  | 'list_item'
  | 'category'
  | 'author'
  | 'published_date'
  | 'related_link'
  | 'public_notice';

export interface KoClinicSourceBlock {
  id: string;
  kind: KoClinicSourceKind;
  text: string;
  sourceUrl: string;
  sourceLocator: string;
  sourceSha256: string;
  /** Verbatim source field label when the factual value came from a labelled row. */
  sourceLabel?: string;
  href?: string;
}

export interface KoClinicSourceImage {
  id: string;
  sourceUrl: string;
  sourcePageUrl: string;
  sourceLocator: string;
  sourceReferenceSha256: string;
  alt: string;
  classification: 'content' | 'ui-chrome';
  exclusionReason?: string;
}

export interface KoClinicExtractedPage {
  sourceUrl: string;
  sourceHtmlSha256: string;
  title: KoClinicSourceBlock;
  businessName?: KoClinicSourceBlock;
  description?: string;
  blocks: readonly KoClinicSourceBlock[];
  images: readonly KoClinicSourceImage[];
  relatedLinks: readonly KoClinicSourceBlock[];
  board?: {
    table: string;
    wrId: number;
  };
}

export interface KoClinicPublicationHold {
  sourceUrl: string;
  reason: string;
  ruleId: string;
  sourceBlockIds: readonly string[];
}

export interface KoClinicAdDiagnostic {
  sourceUrl: string;
  blockId: string;
  sourceLocator: string;
  text: string;
  violation: MedicalAdViolation;
}

export interface KoClinicOptimizedImage {
  sourceUrl: string;
  publicPath: string;
  sourceSha256: string;
  optimizedSha256: string;
  sourceBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  alt: string;
  analysis: {
    version: 1;
    engine: 'apple-vision-v1';
    recognizedLineCount: number;
    recognizedCharacterCount: number;
    textAreaRatio: number;
    textDense: boolean;
    /** Mean WCAG relative luminance for the left 55% hero-copy candidate region. */
    heroTextRegionLuminance: number;
  };
}

export interface KoClinicUnavailableImage {
  sourceUrl: string;
  sourceReferenceSha256: string;
  status: 404;
  reason: 'source-http-404';
}

export interface KoClinicCompilation {
  config: SiteConfig;
  sourceManifest: readonly KoClinicSourceBlock[];
  imageManifest: readonly KoClinicOptimizedImage[];
  publicationHolds: readonly KoClinicPublicationHold[];
  adDiagnostics: readonly KoClinicAdDiagnostic[];
  sourceUrlBySlug: Readonly<Record<string, string>>;
}
