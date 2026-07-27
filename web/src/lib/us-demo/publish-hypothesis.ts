import 'server-only';

import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';
import { renderStaticDocument } from '@/lib/export/render-static';
import { compareUsDemoStructure } from './structure-diff';

const PUBLISH_HYPOTHESIS_ORIGIN = 'https://publish-hypothesis.invalid';

export function buildUsDemoStructureComparison(
  artifact: CrawlArtifactPayload,
  config: SiteConfig,
) {
  const publishHypothesisHtml = renderStaticDocument({
    config,
    pageSlug: '',
    siteUrl: PUBLISH_HYPOTHESIS_ORIGIN,
    lang: 'en-US',
  });
  return {
    comparison: compareUsDemoStructure({
      artifact,
      publishHypothesisHtml,
      hypothesisUrl: `${PUBLISH_HYPOTHESIS_ORIGIN}/`,
    }),
    publishHypothesisHtml,
  };
}
