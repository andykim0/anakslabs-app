/**
 * [v4 Phase 3] 테넌트별 sitemap.xml — 발행 사이트의 전체 페이지 + privacy/terms.
 * config.pages 각각을 URL로 (홈 slug='' → 루트, 그 외 → /{slug}).
 * proxy가 {host}/sitemap.xml → /s/{host}/sitemap.xml 로 rewrite.
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
  // 발행본의 모든 페이지(홈 slug='' → 루트) + 법적 고정 페이지
  const pagePaths = site.siteConfig.pages.map((p) => (p.slug === '' ? '' : `/${p.slug}`));
  const paths = [...pagePaths, '/privacy', '/terms'];
  const urls = paths.map((path) => {
    const loc = xmlEscape(`${base}${path}`);
    return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq></url>`;
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
