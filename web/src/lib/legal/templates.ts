import type { SiteConfig } from '@/lib/types/site';

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  title: string;
  updatedNote: string;
  sections: LegalSection[];
}

/**
 * US tenant legal copy is intentionally absent until counsel approves it. These records are
 * workflow placeholders, not privacy-policy or terms copy, and must never be rendered as legal
 * documents.
 */
export const US_TENANT_LEGAL_PLACEHOLDERS = Object.freeze({
  privacy: {
    document: 'privacy',
    status: 'pending-counsel-review',
    publishable: false,
  },
  terms: {
    document: 'terms',
    status: 'pending-counsel-review',
    publishable: false,
  },
} as const);

export const US_TENANT_LEGAL_DOCUMENTS_ENABLED = false as const;

export const US_PERSONAL_DATA_LEGAL_DOCUMENTS_REQUIRED_MESSAGE =
  'This site collects personal information through a form, so approved policy documents are required before publication.';

/** Pins only newly issued sites in this US fork; stored legacy configs stay untouched. */
export function pinUsTenantLocaleForNewSite(config: SiteConfig): SiteConfig {
  if (config.meta.locale === 'en-US' && config.meta.jurisdiction === 'US') return config;
  return {
    ...config,
    meta: {
      ...config.meta,
      locale: 'en-US',
      jurisdiction: 'US',
    },
  };
}

export class UsTenantLegalDocumentsPendingError extends Error {
  readonly code = 'US_TENANT_LEGAL_DOCUMENTS_PENDING';

  constructor() {
    super(US_PERSONAL_DATA_LEGAL_DOCUMENTS_REQUIRED_MESSAGE);
    this.name = 'UsTenantLegalDocumentsPendingError';
  }
}

export function siteCollectsPersonalData(config: SiteConfig): boolean {
  return config.pages.some((page) =>
    page.sections.some((section) => section.elements.some((element) => element.kind === 'form')),
  );
}

/**
 * Business-operator details remain a Korean publication requirement. US tenants may provide
 * them voluntarily; when present, the renderer continues to show the existing LegalFooter.
 */
export function businessInfoRequiredForPublish(config: SiteConfig): boolean {
  return config.meta.locale !== 'en-US';
}

export function usTenantLegalDocumentsRequired(config: SiteConfig): boolean {
  return config.meta.locale === 'en-US' && siteCollectsPersonalData(config);
}

export function assertUsTenantLegalDocumentsReady(config: SiteConfig): void {
  if (usTenantLegalDocumentsRequired(config) && !US_TENANT_LEGAL_DOCUMENTS_ENABLED) {
    throw new UsTenantLegalDocumentsPendingError();
  }
}

export function usPrivacyPolicy(config: SiteConfig): LegalDocument {
  assertUsTenantLegalDocumentsReady(config);
  throw new UsTenantLegalDocumentsPendingError();
}

export function usTermsOfService(config: SiteConfig): LegalDocument {
  assertUsTenantLegalDocumentsReady(config);
  throw new UsTenantLegalDocumentsPendingError();
}

export const ANONYMOUS_SITE_EVENT_DISCLOSURE = {
  heading: 'Anonymous performance measurement and monthly reporting',
  collected:
    'We store daily, site-level aggregate counts for page views; phone, booking, directions, message, social-link, and form-submission actions; and broad source categories such as Google, Instagram, direct or on-site, and other.',
  purpose:
    'Aggregate data is used only to operate the site and prepare its monthly performance report.',
  excluded:
    'Names, contact details, patient information, form contents, raw IP addresses, raw user-agent strings, raw referrers, visitor identifiers, session identifiers, clicked destination URLs, and other identifying values are not stored in the performance data store.',
  retention:
    'Aggregate performance data and monthly reports are retained for 24 months after the reporting month, then deleted.',
  legalReview:
    'Pending final legal review before this disclosure is used on a live tenant site.',
} as const;

export const EXTERNAL_AI_PROCESSING_DISCLOSURE = {
  heading: 'External AI processing',
  processors: 'Google and Anthropic services may process a customer-requested generation task.',
  data:
    'Only the business information, instructions, content, images, or documents selected for that task are sent. Passwords and payment credentials are not sent.',
  purpose: 'Processing is limited to the generation or document-recognition task the customer requested.',
  terms: 'Provider, location, retention, and deletion terms remain pending final contract and legal review.',
  legalReview: 'Pending final legal review. This is not tenant privacy-policy language.',
} as const;

export const DESIGNATED_CRAWL_DISCLOSURE = {
  heading: 'Designated public-page review',
  collected:
    'An operator may review public pages designated for a private migration proposal. Authentication and explicit robots exclusions are not bypassed.',
  purpose: 'The material is used only for the private proposal shown to the business owner.',
  retention: 'Retention terms remain pending final legal review.',
  imageRights: 'Image publication remains gated on the applicable rights and compliance review.',
  legalReview: 'Pending final legal review. This is not tenant privacy-policy language.',
} as const;

export const US_DEMO_VIEW_DISCLOSURE = {
  heading: 'Private demo measurement',
  collected:
    'A private demo may measure view count, viewing time band, active time, maximum scroll depth, viewed sections, and device category. A browser or session identifier may be pseudonymized again on the server, and an IP address is not stored raw; only a versioned HMAC-SHA-256 value may be retained.',
  purpose: 'The data is used only to review demo quality and plan follow-up.',
  excluded:
    'Raw IP addresses, raw user-agent strings, full referrers, patient information or other protected health information (PHI), and inquiry or booking contents are not stored.',
  retention: 'Demo-view rows and alert records are retained for up to 90 days, then deleted.',
  legalReview: 'Pending final legal review before outreach measurement is enabled.',
} as const;
