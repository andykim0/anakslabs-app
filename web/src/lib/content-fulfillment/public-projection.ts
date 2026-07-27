import type { Metadata } from 'next';
import type { Site } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import type { PublishedContentPost } from './contracts';

export const CONTENT_BLOG_NAV_ITEM = {
  id: 'content-blog',
  slug: 'blog',
  title: '블로그',
  navLabel: '블로그',
} as const;

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function contentPostUrl(baseUrl: string, slug?: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return slug ? `${base}/blog/${slug}` : `${base}/blog`;
}

/** Empty posts intentionally reproduce the pre-CONTENT sitemap byte for byte. */
export function buildTenantSitemapXml(input: {
  host: string;
  site: Site;
  posts: readonly PublishedContentPost[];
}): string {
  const base = `https://${input.host}`;
  const siteLastmod = (input.site.publishedAt ?? input.site.createdAt ?? '').slice(0, 10);
  const pagePaths = input.site.siteConfig?.pages.map((page) =>
    page.slug === '' ? '' : `/${page.slug}`) ?? [];
  const urls = pagePaths.map((path) => {
    const loc = xmlEscape(`${base}${path}`);
    return `  <url><loc>${loc}</loc>${siteLastmod ? `<lastmod>${siteLastmod}</lastmod>` : ''}</url>`;
  });

  if (input.posts.length > 0) {
    const newest = input.posts.reduce(
      (latest, post) => post.updatedAt > latest ? post.updatedAt : latest,
      input.posts[0]!.updatedAt,
    ).slice(0, 10);
    urls.push(
      `  <url><loc>${xmlEscape(contentPostUrl(base))}</loc>${newest ? `<lastmod>${newest}</lastmod>` : ''}</url>`,
    );
    for (const post of input.posts) {
      const lastmod = post.updatedAt.slice(0, 10);
      urls.push(
        `  <url><loc>${xmlEscape(contentPostUrl(base, post.slug))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`,
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

/** Empty posts intentionally reproduce the pre-CONTENT llms.txt byte for byte. */
export function buildTenantLlmsText(input: {
  host: string;
  site: Site;
  posts: readonly PublishedContentPost[];
}): string {
  const config = input.site.siteConfig;
  if (!config) return '';
  const info = config.businessInfo;
  const name = info?.businessName?.trim() || config.meta.title || input.site.name;
  const base = `https://${input.host}`;
  const lines = [`# ${name}`, ''];
  if (config.meta.description) lines.push(`> ${config.meta.description}`, '');

  lines.push('## 페이지');
  for (const page of config.pages) {
    const url = page.slug === '' ? base : `${base}/${page.slug}`;
    lines.push('', `### ${page.title} (${url})`);
    for (const section of page.sections.filter((item) => !item.hidden)) {
      lines.push(`- ${section.name}`);
    }
  }

  if (info) {
    lines.push('', '## 연락처');
    if (info.phone) lines.push(`- 전화: ${info.phone}`);
    if (info.address) lines.push(`- 주소: ${info.address}`);
    if (info.email) lines.push(`- 이메일: ${info.email}`);
  }

  lines.push('', '## 링크');
  for (const page of config.pages) {
    const url = page.slug === '' ? base : `${base}/${page.slug}`;
    lines.push(`- ${page.title}: ${url}`);
  }

  if (input.posts.length > 0) {
    lines.push(`- 블로그: ${contentPostUrl(base)}`, '', '## 글');
    for (const post of input.posts) {
      lines.push(`- ${post.title}: ${contentPostUrl(base, post.slug)}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function robotsFor(site: Site): Metadata['robots'] {
  return site.status === 'suspended'
    ? { index: false, follow: false }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-image-preview': 'large',
          'max-snippet': -1,
          'max-video-preview': -1,
        },
      };
}

function verificationFor(config: SiteConfig): Metadata['verification'] {
  return {
    ...(config.searchVerification?.google ? { google: config.searchVerification.google } : {}),
    ...(config.searchVerification?.naver
      ? { other: { 'naver-site-verification': config.searchVerification.naver } }
      : {}),
  };
}

export function contentBlogMetadata(
  site: Site,
  post?: PublishedContentPost,
): Metadata {
  const config = site.siteConfig!;
  const base = `https://${site.domain}`;
  const canonical = contentPostUrl(base, post?.slug);
  const title = post ? `${post.title} · ${config.meta.title}` : `블로그 · ${config.meta.title}`;
  const description = post?.summary ?? config.meta.description;
  return {
    title,
    description,
    verification: verificationFor(config),
    alternates: { canonical },
    icons: { icon: '/favicon.ico' },
    openGraph: {
      type: post ? 'article' : 'website',
      siteName: config.meta.title,
      locale: 'ko_KR',
      title,
      description,
      url: canonical,
    },
    twitter: { card: 'summary', title, description },
    robots: robotsFor(site),
  };
}

export function contentPostJsonLd(
  site: Site,
  post: PublishedContentPost,
): string {
  const config = site.siteConfig!;
  const url = contentPostUrl(`https://${site.domain}`, post.slug);
  const publisher = config.businessInfo?.businessName?.trim() || config.meta.title;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: url,
    url,
    publisher: {
      '@type': 'Organization',
      name: publisher,
      url: `https://${site.domain}`,
    },
  }).replace(/</g, '\\u003c');
}
