import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SuspendedNotice } from '@/components/site-renderer';
import { TenantContentBlog } from '@/components/content-posts/TenantContentBlog';
import { contentBlogMetadata } from '@/lib/content-fulfillment/public-projection';
import { getSiteByDomain, getPublishedPostsForSite } from '../_shared';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const site = await getSiteByDomain(domain);
  if (!site?.siteConfig || !site.domain) {
    return { title: '사이트를 찾을 수 없습니다', robots: { index: false } };
  }
  const posts = await getPublishedPostsForSite(site.id);
  if (posts.length === 0) {
    return { title: '사이트를 찾을 수 없습니다', robots: { index: false } };
  }
  return contentBlogMetadata(site);
}

export default async function TenantBlogPage({ params }: Props) {
  const { domain } = await params;
  const site = await getSiteByDomain(domain);
  if (!site?.siteConfig || !site.domain) notFound();
  const posts = await getPublishedPostsForSite(site.id);
  if (posts.length === 0) notFound();
  if (site.status === 'suspended') return <SuspendedNotice siteName={site.name} />;
  return <TenantContentBlog config={site.siteConfig} posts={posts} />;
}
