/**
 * 멀티테넌트 사이트 서빙 — proxy가 테넌트 호스트를 /s/[domain]으로 rewrite.
 * 발행본(siteConfig)만 서빙. 앱 chrome 없이 순수 사이트만 렌더.
 *
 * 데모: http://localhost:3000/s/harodam.anakslabs.com
 *      http://harodam.localhost:3000 (proxy의 .localhost 매핑)
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getDataServices } from '@/lib/data';
import { SiteRenderer, SuspendedNotice } from '@/components/site-renderer';

// 발행 즉시 반영되어야 하므로 항상 요청 시 렌더 (캐싱 최적화는 ISR 도입 시)
export const dynamic = 'force-dynamic';

/** generateMetadata + page 중복 조회 방지 (요청 단위 dedupe) */
const getSiteByDomain = cache(async (rawDomain: string) => {
  let domain: string;
  try {
    domain = decodeURIComponent(rawDomain).trim().toLowerCase();
  } catch {
    return null;
  }
  if (!domain) return null;
  return getDataServices().sites.getByDomain(domain);
});

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const site = await getSiteByDomain(domain);

  if (!site?.siteConfig) {
    return {
      title: '사이트를 찾을 수 없습니다 · 아낙스랩스',
      robots: { index: false },
    };
  }

  const meta = site.siteConfig.meta;
  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
      ...(meta.ogImage ? { images: [{ url: meta.ogImage }] } : {}),
    },
    // 정지된 사이트는 색인 제외
    ...(site.status === 'suspended' ? { robots: { index: false } } : {}),
  };
}

export default async function TenantSitePage({ params }: Props) {
  const { domain } = await params;
  const site = await getSiteByDomain(domain);

  if (!site?.siteConfig) notFound();

  if (site.status === 'suspended') {
    return <SuspendedNotice siteName={site.name} />;
  }

  return <SiteRenderer config={site.siteConfig} mode="auto" />;
}
