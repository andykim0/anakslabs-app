/**
 * Tenant XML sitemap containing only canonical, indexable content pages.
 * noindex legal documents are intentionally excluded.
 */
import { getDataServices } from '@/lib/data';

type Ctx = { params: Promise<{ domain: string }> };

export const dynamic = 'force-dynamic';

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { domain } = await params;
  const host = decodeURIComponent(domain).trim().toLowerCase();
  const site = await getDataServices().sites.getByDomain(host);

  if (!site?.siteConfig || site.status === 'suspended') {
    return new Response('Not found', { status: 404 });
  }

  const base = `https://${host}`;
  const lastmod = (site.publishedAt ?? site.createdAt ?? '').slice(0, 10);
  // 발행본의 canonical 페이지만 포함한다. privacy/terms는 noindex이므로 제외한다.
  const pagePaths = site.siteConfig.pages.map((p) => (p.slug === '' ? '' : `/${p.slug}`));
  const urls = pagePaths.map((path) => {
    const loc = xmlEscape(`${base}${path}`);
    return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
