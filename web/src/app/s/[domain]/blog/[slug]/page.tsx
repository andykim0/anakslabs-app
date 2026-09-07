import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SuspendedNotice } from '@/components/site-renderer';
import { TenantContentBlog } from '@/components/content-posts/TenantContentBlog';
import {
  contentBlogMetadata,
  contentPostFaqJsonLd,
  contentPostJsonLd,
} from '@/lib/content-fulfillment/public-projection';
import { getPublishedContentPostsRepository } from '@/lib/content-fulfillment/repository';
import { getSiteByDomain, getPublishedPostsForSite } from '../../_shared';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ domain: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, slug } = await params;
  const site = await getSiteByDomain(domain);
  if (!site?.siteConfig || !site.domain) {
    return { title: 'Site not available', robots: { index: false } };
  }
  const post = await getPublishedContentPostsRepository()
    .getPublishedBySiteAndSlug(site.id, slug);
  return post
    ? contentBlogMetadata(site, post)
    : { title: 'Site not available', robots: { index: false } };
}

export default async function TenantBlogPostPage({ params }: Props) {
  const { domain, slug } = await params;
  const site = await getSiteByDomain(domain);
  if (!site?.siteConfig || !site.domain) notFound();
  const [posts, post] = await Promise.all([
    getPublishedPostsForSite(site.id),
    getPublishedContentPostsRepository().getPublishedBySiteAndSlug(site.id, slug),
  ]);
  if (!post) notFound();
  if (site.status === 'suspended') return <SuspendedNotice siteName={site.name} />;
  // The second script only exists when the article carries a question set the page also prints.
  const faqJsonLd = contentPostFaqJsonLd(site, post);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: contentPostJsonLd(site, post) }}
      />
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: faqJsonLd }}
        />
      ) : null}
      <TenantContentBlog config={site.siteConfig} siteId={site.id} posts={posts} post={post} />
    </>
  );
}
