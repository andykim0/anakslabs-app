/**
 * 멀티테넌트 사이트 서빙 (홈 페이지, slug '') — proxy가 테넌트 호스트를 /s/[domain]으로 rewrite.
 * [v4] 홈은 이 라우트, 서브페이지는 [...path]/page.tsx. 공통 로직은 _shared.tsx.
 *
 * 데모: http://localhost:3000/s/hwarodam.anakslabs.com
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findPage } from '@/lib/types/site';
import { getSiteByDomain, tenantMetadata, TenantPageBody } from './_shared';

// 발행 즉시 반영되어야 하므로 항상 요청 시 렌더
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const site = await getSiteByDomain(domain);
  return tenantMetadata(site, '');
}

export default async function TenantSitePage({ params }: Props) {
  const { domain } = await params;
  const site = await getSiteByDomain(domain);
  if (!site?.siteConfig || !findPage(site.siteConfig, '')) notFound();
  return <TenantPageBody site={site} pageSlug="" />;
}
