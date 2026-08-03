/**
 * [마케팅] 루트 도메인(앱 호스트) sitemap.
 * proxy.ts는 앱 호스트(ROOT_DOMAIN/www/localhost)를 그대로 통과시키므로 이 sitemap은
 * 루트 도메인에서만 서빙된다(테넌트 도메인은 /s/[host]/sitemap.xml로 rewrite — 무충돌).
 */
import type { MetadataRoute } from 'next';
import { ROOT_DOMAIN } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${ROOT_DOMAIN}`;
  const staticPaths = ['', '/clinic', '/privacy', '/terms'];
  return staticPaths.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));
}
