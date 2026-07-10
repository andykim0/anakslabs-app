/**
 * [v3 Phase 7] 테넌트별 robots.txt — 발행 사이트만 크롤 허용 + sitemap 링크.
 * proxy가 {host}/robots.txt → /s/{host}/robots.txt 로 rewrite.
 */
import { getDataServices } from '@/lib/data';

type Ctx = { params: Promise<{ domain: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { domain } = await params;
  const host = decodeURIComponent(domain).trim().toLowerCase();
  const site = await getDataServices().sites.getByDomain(host);

  // 발행본 없거나 정지 → 색인 차단
  if (!site?.siteConfig || site.status === 'suspended') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const base = `https://${host}`;
  const body = `User-agent: *
Allow: /
Sitemap: ${base}/sitemap.xml
`;
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
