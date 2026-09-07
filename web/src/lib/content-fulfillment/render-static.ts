import 'server-only';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { Site } from '@/lib/types/domain';
import { TenantContentBlog } from '@/components/content-posts/TenantContentBlog';
import { buildDocumentShell } from '@/lib/export/document-shell';
import {
  contentPostFaqJsonLd,
  contentPostJsonLd,
  contentPostUrl,
} from './public-projection';
import type { PublishedContentPost } from './contracts';

const CDN_FONT_LINK_RE =
  /<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard)[^>]*>/gi;

function staticBlogBody(input: {
  site: Site;
  posts: readonly PublishedContentPost[];
  post?: PublishedContentPost;
  fontFaceCss?: string;
  coverRewrites?: ReadonlyMap<string, string>;
}): string {
  const isDetail = Boolean(input.post);
  let body = renderToStaticMarkup(createElement(TenantContentBlog, {
    config: input.site.siteConfig!,
    siteId: input.site.id,
    // Bundled covers live beside the pages; a detail file sits one directory deeper.
    coverSrc: (src: string) => {
      const bundled = input.coverRewrites?.get(src);
      if (!bundled) return src;
      return isDetail ? `../${bundled}` : bundled;
    },
    posts: input.posts,
    post: input.post,
    hrefForSlug: (slug: string) => {
      if (isDetail) return slug === '' ? '../index.html' : `../${slug}.html`;
      return slug === '' ? './index.html' : slug === 'blog' ? './blog.html' : `./${slug}.html`;
    },
    hrefForPost: (slug: string) => `./blog/${slug}.html`,
    listHref: isDetail ? '../blog.html' : './blog.html',
  }));
  if (input.fontFaceCss) {
    body = body.replace(CDN_FONT_LINK_RE, '');
    // Pin markup and the pinned @font-face CSS both carry checked-in asset paths for live
    // serving. selfHostFonts flattens every pinned file to assets/fonts/<basename>, so both
    // font namespaces rewrite the same way — a Latin-pinned US clinic is the common case here,
    // and leaving /fonts/latin/ absolute puts a 404 in every exported bundle.
    body = body.replace(
      /\/fonts\/(?:korean|latin)\//gu,
      isDetail ? '../assets/fonts/' : 'assets/fonts/',
    );
  }
  return body;
}

export interface StaticContentPostFile {
  name: string;
  html: string;
}

export function renderStaticContentPostFiles(input: {
  site: Site;
  posts: readonly PublishedContentPost[];
  fontFaceCss?: string;
  /** Bundled paths for render-time cover images, keyed by the URL the live site serves. */
  coverRewrites?: ReadonlyMap<string, string>;
}): StaticContentPostFile[] {
  if (!input.site.siteConfig || !input.site.domain || input.posts.length === 0) return [];
  const baseUrl = `https://${input.site.domain}`;
  const config = input.site.siteConfig;
  const listTitle = `블로그 · ${config.meta.title}`;
  const listBody = staticBlogBody(input);
  const files: StaticContentPostFile[] = [{
    name: 'blog.html',
    html: buildDocumentShell({
      config,
      pageSlug: 'blog',
      lang: config.meta.locale ?? 'ko',
      headerHtml: '',
      bodyHtml: listBody,
      siteUrl: baseUrl,
      fontFaceCss: input.fontFaceCss,
      documentTitle: listTitle,
      documentDescription: config.meta.description,
      canonicalOverride: contentPostUrl(baseUrl),
      jsonLdOverride: null,
    }),
  }];

  for (const post of input.posts) {
    const faqJsonLd = contentPostFaqJsonLd(input.site, post);
    files.push({
      name: `blog/${post.slug}.html`,
      html: buildDocumentShell({
        config,
        pageSlug: `blog/${post.slug}`,
        lang: config.meta.locale ?? 'ko',
        headerHtml: '',
        bodyHtml: staticBlogBody({ ...input, post }),
        siteUrl: baseUrl,
        fontFaceCss: input.fontFaceCss,
        documentTitle: `${post.title} · ${config.meta.title}`,
        documentDescription: post.summary,
        canonicalOverride: contentPostUrl(baseUrl, post.slug),
        jsonLdOverride: contentPostJsonLd(input.site, post),
        ...(faqJsonLd ? { additionalJsonLd: [faqJsonLd] } : {}),
        openGraphType: 'article',
      }),
    });
  }
  return files;
}
