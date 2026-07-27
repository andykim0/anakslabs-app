/**
 * Optional machine-readable site outline.
 *
 * This is provided as a convenience for tools that voluntarily consume the
 * emerging format. It is not treated as a ranking/indexing signal and does not
 * replace crawlable HTML, robots policy, sitemaps, or structured data.
 */
import { getDataServices } from '@/lib/data';
import { getPublishedContentPostsRepository } from '@/lib/content-fulfillment/repository';
import { buildTenantLlmsText } from '@/lib/content-fulfillment/public-projection';

type Ctx = { params: Promise<{ domain: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { domain } = await params;
  const host = decodeURIComponent(domain).trim().toLowerCase();
  const site = await getDataServices().sites.getByDomain(host);

  if (!site?.siteConfig || site.status === 'suspended') {
    return new Response('Not found', { status: 404 });
  }

  const posts = await getPublishedContentPostsRepository().listPublishedBySite(site.id);
  return new Response(buildTenantLlmsText({ host, site, posts }), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
