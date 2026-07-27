/**
 * Tenant XML sitemap containing only canonical, indexable content pages.
 * noindex legal documents are intentionally excluded.
 */
import { getDataServices } from '@/lib/data';
import { getPublishedContentPostsRepository } from '@/lib/content-fulfillment/repository';
import { buildTenantSitemapXml } from '@/lib/content-fulfillment/public-projection';

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
  // 발행본의 canonical 페이지만 포함한다. privacy/terms와 미승인 포스트는 제외한다.
  const body = buildTenantSitemapXml({ host, site, posts });
  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
