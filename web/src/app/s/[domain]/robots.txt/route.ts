/**
 * Tenant robots policy. Public sites explicitly allow Korea's Naver Yeti and
 * the search-specific AI crawlers used by ChatGPT and Perplexity.
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
  const body = `User-agent: Yeti
Allow: /

User-agent: Googlebot
Allow: /

User-agent: bingbot
Allow: /

User-agent: Daum
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`;
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
