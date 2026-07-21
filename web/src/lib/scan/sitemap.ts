import type { ProbedResource } from './fetch-target';
import { parseRobotsTxt } from './robots';

const MAX_ROBOTS_SITEMAPS = 3;

export function sitemapLooksValid(resource: ProbedResource): boolean {
  if (!resource.ok || resource.truncated) return false;
  if (/text\/html/i.test(resource.contentType)) return false;
  const body = resource.body.replace(/^\uFEFF/, '').trim();
  return /<(?:urlset|sitemapindex)\b/i.test(body) && /<loc>\s*https?:\/\//i.test(body);
}

/**
 * robots.txt가 선언한 위치를 먼저 따른다. 선언이 있으면 기본 경로를 섞지 않아
 * 실제 맞춤 sitemap이 유효한 사이트를 /sitemap.xml 404로 오판하지 않는다.
 */
export async function probeDeclaredSitemap(
  origin: string,
  robots: ProbedResource,
  probe: (origin: string, path: string) => Promise<ProbedResource>,
): Promise<ProbedResource> {
  const declared = robots.ok
    ? parseRobotsTxt(robots.body).sitemaps.slice(0, MAX_ROBOTS_SITEMAPS)
    : [];
  const candidates = declared.length > 0 ? declared : ['/sitemap.xml'];
  let first: ProbedResource | undefined;
  for (const candidate of candidates) {
    const resource = await probe(origin, candidate);
    first ??= resource;
    if (sitemapLooksValid(resource)) return resource;
  }
  return first ?? {
    url: new URL('/sitemap.xml', origin).toString(),
    status: null,
    ok: false,
    body: '',
    contentType: '',
    truncated: false,
  };
}
