import 'server-only';

import { assertPublicHttpUrl } from '@/lib/scan/ssrf';
import { probeSocialLinks } from '@/lib/scan/social-probe';
import {
  crawlDesignatedSite as crawlDesignatedSiteCore,
  type CrawlDependencies,
} from './crawler-core';

export {
  CrawlError,
  type CrawlDependencies,
  type CrawlErrorCode,
} from './crawler-core';

export function crawlDesignatedSite(
  input: { url: string; allowTlsHttpFallback?: boolean },
  dependencies: CrawlDependencies = {},
) {
  return crawlDesignatedSiteCore(input, {
    ...dependencies,
    validateUrl: dependencies.validateUrl ?? assertPublicHttpUrl,
    probeSocialLinks: dependencies.probeSocialLinks ?? probeSocialLinks,
  });
}
