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
import { tenantScreenVerdict } from '../_tenant-screen';

type Ctx = { params: Promise<{ domain: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { domain } = await params;
  const host = decodeURIComponent(domain).trim().toLowerCase();
  const verdict = tenantScreenVerdict(await getDataServices().sites.getByDomain(host));

  // 미발행·정지뿐 아니라 의료광고 스크린 실패도 HTML과 동일하게 404. 아웃라인 자체가 유출이다.
  if (!verdict.serve) {
    return new Response('Not found', { status: 404 });
  }

  const site = verdict.site;
  const posts = await getPublishedContentPostsRepository().listPublishedBySite(site.id);
  return new Response(buildTenantLlmsText({ host, site, posts }), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
