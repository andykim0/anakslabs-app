/**
 * [CITE$] What "this customer" means to the judge. Pure.
 */
import type { Site } from '@/lib/types/domain';
import { normalizeCitationHost } from './judge';
import type { CitationIdentity } from './types';
import type { CitationQuestionSubject } from './questions-core';

/**
 * A site stores exactly one host in `domain`: the platform subdomain for a hosted site,
 * or the customer's own domain once it is on a custom domain. There is no second column
 * holding the other one, so the honest maximum is that host plus anything a caller can
 * prove separately.
 */
export function citationIdentityForSite(
  site: Pick<Site, 'name' | 'domain' | 'siteConfig'>,
  extraDomains: readonly string[] = [],
): CitationIdentity {
  const businessName = site.name.trim();
  const legalName = site.siteConfig?.businessInfo?.businessName?.trim() ?? '';
  const aliases = legalName && legalName !== businessName ? [legalName] : [];
  const domains = [...new Set(
    [site.domain ?? '', ...extraDomains]
      .map((domain) => normalizeCitationHost(domain ?? ''))
      .filter((domain) => domain !== ''),
  )];
  return { businessName, aliases, domains };
}

/** A site with nothing to compare a source host against cannot be measured for LINKED. */
export function citationIdentityIsMeasurable(identity: CitationIdentity): boolean {
  return identity.businessName !== '' && identity.domains.length > 0;
}

export function citationSubjectForSite(
  site: Pick<Site, 'name' | 'siteConfig'>,
): CitationQuestionSubject {
  const meta = site.siteConfig?.meta;
  return {
    name: site.name.trim(),
    region: meta?.region?.trim() ?? '',
    // industryClass is the richer server-owned taxonomy; industryId is the older one.
    industry: meta?.industryClass ?? meta?.industryId ?? 'other',
    locale: meta?.locale ?? 'ko-KR',
  };
}
