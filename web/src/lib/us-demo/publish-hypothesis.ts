import 'server-only';

import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';
import { renderStaticDocument } from '@/lib/export/render-static';
import {
  compareUsDemoStructure,
  sourcePageUrlForDemoPage,
} from './structure-diff';

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

/** preview-full diff projection. Each demo page is compared with its nearest factual source page. */
export function buildUsDemoStructureComparisons(
  artifact: CrawlArtifactPayload,
  config: SiteConfig,
  pageSlugs?: ReadonlySet<string>,
) {
  return config.pages.filter((page) => !pageSlugs || pageSlugs.has(page.slug)).map((page) => {
    const publishHypothesisHtml = renderStaticDocument({
      config,
      pageSlug: page.slug,
      siteUrl: PUBLISH_HYPOTHESIS_ORIGIN,
      lang: 'en-US',
    });
    const sourcePageUrl = sourcePageUrlForDemoPage(artifact, page);
    return {
      pageSlug: page.slug,
      pageTitle: page.title,
      sourcePageUrl,
      comparison: compareUsDemoStructure({
        artifact,
        publishHypothesisHtml,
        hypothesisUrl: page.slug
          ? `${PUBLISH_HYPOTHESIS_ORIGIN}/${page.slug}`
          : `${PUBLISH_HYPOTHESIS_ORIGIN}/`,
        sourcePageUrl,
      }),
      publishHypothesisHtml,
    };
  });
}
