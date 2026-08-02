import 'server-only';

import { assertPublicHttpUrl } from '@/lib/scan/ssrf';
import { probeSocialLinks } from '@/lib/scan/social-probe';
import {
  CrawlError,
  crawlConsentedSiteCore,
  crawlDesignatedSite as crawlDesignatedSiteCore,
  type CrawlDependencies,
} from './crawler-core';
import { US_MEDICAL_OUTREACH_PROFILE_ID } from '@/lib/scan/profiles';
import { explicitlyUnverifiedTlsFetch } from './insecure-tls-fetch';
import { requireUsMedicalDemoConsent } from './consent';
import { createConsentedRenderedPageSession } from './consented-renderer';

export {
  CrawlError,
  type CrawlDependencies,
  type CrawlErrorCode,
} from './crawler-core';

export function crawlDesignatedSite(
  input: {
    url: string;
    allowTlsHttpFallback?: boolean;
    allowInvalidTlsCertificate?: boolean;
    scanProfileId?: typeof US_MEDICAL_OUTREACH_PROFILE_ID;
  },
  dependencies: CrawlDependencies = {},
) {
  return crawlDesignatedSiteCore(input, {
    ...dependencies,
    validateUrl: dependencies.validateUrl ?? assertPublicHttpUrl,
    probeSocialLinks: dependencies.probeSocialLinks ?? probeSocialLinks,
    ...(input.allowInvalidTlsCertificate === true
      ? {
          invalidTlsFetchFn: dependencies.invalidTlsFetchFn
            ?? explicitlyUnverifiedTlsFetch,
        }
      : {}),
  });
}

export async function crawlConsentedUsMedicalSite(
  input: {
    url: string;
    consentId: string;
    prospectId: string;
    allowTlsHttpFallback?: boolean;
    allowInvalidTlsCertificate?: boolean;
  },
  dependencies: CrawlDependencies = {},
) {
  const consent = await requireUsMedicalDemoConsent({
    consentId: input.consentId,
    prospectId: input.prospectId,
  });
  let ownedRenderer: Awaited<ReturnType<typeof createConsentedRenderedPageSession>> | undefined;
  try {
    if (!dependencies.renderPage) {
      try {
        ownedRenderer = await createConsentedRenderedPageSession({
          acceptInvalidTlsCertificate: input.allowInvalidTlsCertificate === true,
        });
      } catch (error) {
        throw new CrawlError(
          'RENDER_FAILED',
          `동의 기반 수집 렌더러를 시작할 수 없습니다: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const artifact = await crawlConsentedSiteCore({
      url: input.url,
      allowTlsHttpFallback: input.allowTlsHttpFallback,
      allowInvalidTlsCertificate: input.allowInvalidTlsCertificate,
      scanProfileId: US_MEDICAL_OUTREACH_PROFILE_ID,
    }, {
      ...dependencies,
      renderPage: dependencies.renderPage ?? ownedRenderer!.renderPage,
      validateUrl: dependencies.validateUrl ?? assertPublicHttpUrl,
      probeSocialLinks: dependencies.probeSocialLinks ?? probeSocialLinks,
      ...(input.allowInvalidTlsCertificate === true
        ? {
            invalidTlsFetchFn: dependencies.invalidTlsFetchFn
              ?? explicitlyUnverifiedTlsFetch,
          }
        : {}),
    });
    return {
      ...artifact,
      crawlPolicyId: 'us-medical-consented-v1' as const,
      consentEvidence: {
        consentId: consent.id,
        prospectId: consent.prospectId,
        scope: consent.scope,
        consentedAt: consent.consentedAt,
      },
    };
  } finally {
    await ownedRenderer?.close().catch(() => undefined);
  }
}
