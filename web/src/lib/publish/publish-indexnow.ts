import { after } from 'next/server';
import type { Site } from '@/lib/types/domain';
import { submitIndexNow } from '@/lib/seo/indexnow';

/**
 * Tell the search engines a site's pages changed, after the response has gone out.
 *
 * Shared by the customer publish route and the operator publish route so a site delivered from
 * an approved preview is announced exactly like one the customer published themselves.
 */
export function notifyIndexNowAfterPublish(published: Site): void {
  if (!published.domain || !published.siteConfig) return;
  const host = published.domain;
  const urls = published.siteConfig.pages.map((page) =>
    page.slug === '' ? `https://${host}` : `https://${host}/${page.slug}`,
  );
  after(async () => {
    try {
      await submitIndexNow(host, urls);
    } catch (error) {
      console.warn('[publish-indexnow] notification failed:', {
        host,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  });
}
