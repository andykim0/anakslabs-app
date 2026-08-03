/**
 * [v4] 테넌트 서브페이지 서빙 — /s/[domain]/{slug} (단일 세그먼트).
 * path가 단일 세그먼트이고 해당 slug 페이지가 있으면 그 페이지를 렌더, 아니면 404.
 * (proxy가 원경로를 보존해 rewrite하므로 이 라우트가 받는다. privacy/terms 등은 별도 라우트가 선점)
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findPage } from '@/lib/types/site';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';
import { getSiteByDomain, tenantMetadata, TenantPageBody } from '../_shared';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ domain: string; path: string[] }>;
}

/** path[] → 유효한 단일 세그먼트 slug면 반환, 아니면 null (홈 '' 은 page.tsx가 처리) */
function resolveSlug(path: string[]): string | null {
  if (path.length !== 1) return null;
  const slug = path[0];
  return slug ? slug : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, path } = await params;
  const slug = resolveSlug(path);
  if (slug === null) return { title: `Site not found · ${PUBLIC_BRAND_NAMES.brand}`, robots: { index: false } };
  const site = await getSiteByDomain(domain);
  return tenantMetadata(site, slug);
}

export default async function TenantSubPage({ params }: Props) {
  const { domain, path } = await params;
  const slug = resolveSlug(path);
  if (slug === null) notFound();
  const site = await getSiteByDomain(domain);
  if (!site?.siteConfig || !findPage(site.siteConfig, slug)) notFound();
  return <TenantPageBody site={site} pageSlug={slug} />;
}
