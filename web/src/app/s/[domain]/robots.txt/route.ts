/**
 * Tenant robots policy. Public sites explicitly allow Korea's Naver Yeti and
 * the search-specific AI crawlers used by ChatGPT and Perplexity.
 */
import { getDataServices } from '@/lib/data';
import { tenantScreenVerdict } from '../_tenant-screen';

type Ctx = { params: Promise<{ domain: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { domain } = await params;
  const host = decodeURIComponent(domain).trim().toLowerCase();
  const verdict = tenantScreenVerdict(await getDataServices().sites.getByDomain(host));

  // 발행본 없거나 정지, 또는 의료광고 스크린 실패 → 색인 차단 (sitemap 광고도 하지 않는다)
  if (!verdict.serve) {
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
