/**
 * [마케팅] 루트 도메인(앱 호스트) robots. 대시보드·API는 색인 제외.
 * (테넌트 도메인의 robots.txt는 proxy가 /s/[host]/robots.txt로 rewrite — 무충돌)
 */
import type { MetadataRoute } from 'next';
import { ROOT_DOMAIN } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const base = `https://${ROOT_DOMAIN}`;
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard/', '/api/', '/preview/'] },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
