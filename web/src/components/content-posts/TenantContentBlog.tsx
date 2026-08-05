import type { SiteConfig } from '@/lib/types/site';
import type { PublishedContentPost } from '@/lib/content-fulfillment/contracts';
import { CONTENT_BLOG_NAV_ITEM } from '@/lib/content-fulfillment/public-projection';
import { projectAuthoritativePublicContact, resolvePublicContact } from '@/lib/seo/public-contact';
import { TenantHeader, tenantBrandName } from '@/components/site-renderer/TenantHeader';
import { contentPostEducationalNotice } from '@/lib/legal/notices';
import { LegalFooter } from '@/components/site-renderer/LegalFooter';
import { PublicContactBar } from '@/components/site-renderer/PublicContactBar';
import { themeColor, themeRadius } from '@/lib/design/site-theme-tokens';
import { fontPairingResources } from '@/lib/fonts/resources';
import {
  googleFontUrls,
  needsPretendard,
  PRETENDARD_CSS_URL,
} from '@/components/site-renderer/fonts';

const BLOG_CSS = `
.anaks-content-blog{min-height:70dvh}
.anaks-content-blog__inner{width:min(100% - 48px,960px);margin:0 auto;padding:clamp(72px,10vw,144px) 0}
.anaks-content-blog__notice{width:min(100% - 48px,960px);margin:0 auto;padding:20px 0 clamp(48px,6vw,96px)}
.anaks-content-blog__title{word-break:keep-all;overflow-wrap:break-word}
.anaks-content-blog__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:44px}
.anaks-content-blog__card{min-width:0}
.anaks-content-blog__article{width:min(100% - 48px,760px);margin:0 auto;padding:clamp(72px,10vw,144px) 0}
.anaks-content-blog__article p,.anaks-content-blog__article li{word-break:keep-all;overflow-wrap:break-word}
.anaks-content-blog__table-wrap{max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;margin-top:28px}
.anaks-content-blog__table{width:100%;min-width:560px;border-collapse:collapse}
.anaks-content-blog__table th,.anaks-content-blog__table td{padding:14px 16px;text-align:left;vertical-align:top}
@media(max-width:767px){
  .anaks-content-blog__inner,.anaks-content-blog__article{width:min(100% - 32px,760px);padding:64px 0 88px}
  .anaks-content-blog__grid{grid-template-columns:1fr;gap:14px;margin-top:32px}
}
`;

export interface TenantContentBlogProps {
  config: SiteConfig;
  posts: readonly PublishedContentPost[];
  post?: PublishedContentPost;
  hrefForSlug?: (slug: string) => string;
  hrefForPost?: (slug: string) => string;
  listHref?: string;
}

function PostDocument({
  post,
  config,
  listHref,
}: {
  post: PublishedContentPost;
  config: SiteConfig;
  listHref: string;
}) {
  const text = config.theme.palette.text;
  const muted = config.theme.palette.muted;
  return (
    <article className="anaks-content-blog__article">
      <a
        href={listHref}
        style={{
          color: config.theme.palette.primary,
          fontFamily: config.theme.fonts.body,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Back to the blog
      </a>
      <p
        style={{
          color: muted,
          fontFamily: config.theme.fonts.body,
          fontSize: 14,
          marginTop: 32,
        }}
      >
        {post.publishedAt.slice(0, 10)}
      </p>
      <h1
        className="anaks-content-blog__title"
        style={{
          color: text,
          fontFamily: config.theme.fonts.heading,
          fontSize: 'clamp(36px, 6vw, 68px)',
          lineHeight: 1.14,
          letterSpacing: '-0.035em',
          marginTop: 12,
        }}
      >
        {post.title}
      </h1>
      <p
        style={{
          color: muted,
          fontFamily: config.theme.fonts.body,
          fontSize: 'clamp(18px, 2.2vw, 22px)',
          lineHeight: 1.7,
          marginTop: 28,
        }}
      >
        {post.summary}
      </p>
      <div style={{ marginTop: 56 }}>
        {post.document.blocks.map((block, index) => {
          if (block.type === 'heading') {
            const Heading = block.level === 2 ? 'h2' : 'h3';
            return (
              <Heading
                key={index}
                style={{
                  color: text,
                  fontFamily: config.theme.fonts.heading,
                  fontSize: block.level === 2 ? 'clamp(26px, 3.5vw, 38px)' : 'clamp(21px, 2.8vw, 28px)',
                  lineHeight: 1.3,
                  letterSpacing: '-0.025em',
                  marginTop: index === 0 ? 0 : 52,
                  marginBottom: 18,
                  wordBreak: 'keep-all',
                }}
              >
                {block.text}
              </Heading>
            );
          }
          if (block.type === 'list') {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List
                key={index}
                style={{
                  color: text,
                  fontFamily: config.theme.fonts.body,
                  fontSize: 18,
                  lineHeight: 1.85,
                  paddingLeft: 24,
                  marginTop: 20,
                }}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`${typeof item === 'string' ? item : item.text}-${itemIndex}`}>
                    {typeof item === 'string' ? item : item.text}
                  </li>
                ))}
              </List>
            );
          }
          if (block.type === 'table') {
            const border = themeColor(config.theme, 'border');
            return (
              <div className="anaks-content-blog__table-wrap" key={index}>
                <table
                  className="anaks-content-blog__table"
                  style={{
                    border: `1px solid ${border}`,
                    color: text,
                    fontFamily: config.theme.fonts.body,
                    fontSize: 16,
                    lineHeight: 1.65,
                  }}
                >
                  {block.caption ? (
                    <caption style={{ captionSide: 'top', color: muted, paddingBottom: 12, textAlign: 'left' }}>
                      {block.caption}
                    </caption>
                  ) : null}
                  <thead>
                    <tr>
                      {block.columns.map((column) => (
                        <th
                          key={column.key}
                          scope="col"
                          style={{ background: themeColor(config.theme, 'surfaceStrong'), borderBottom: `1px solid ${border}` }}
                        >
                          {column.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.cells.map((cell, cellIndex) => (
                          <td
                            key={`${cellIndex}-${cell.text}`}
                            style={{ borderBottom: `1px solid ${border}` }}
                          >
                            {cell.text}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          return (
            <p
              key={index}
              style={{
                color: text,
                fontFamily: config.theme.fonts.body,
                fontSize: 18,
                lineHeight: 1.9,
                marginTop: index === 0 ? 0 : 22,
              }}
            >
              {block.text}
            </p>
          );
        })}
      </div>
    </article>
  );
}

function PostList({
  posts,
  config,
  hrefForPost,
}: {
  posts: readonly PublishedContentPost[];
  config: SiteConfig;
  hrefForPost: (slug: string) => string;
}) {
  return (
    <section className="anaks-content-blog__inner">
      <p
        style={{
          color: config.theme.palette.primary,
          fontFamily: config.theme.fonts.body,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        Blog
      </p>
      <h1
        className="anaks-content-blog__title"
        style={{
          color: config.theme.palette.text,
          fontFamily: config.theme.fonts.heading,
          fontSize: 'clamp(38px, 6vw, 72px)',
          lineHeight: 1.12,
          letterSpacing: '-0.04em',
          marginTop: 12,
        }}
      >
        Practical information from this practice.
      </h1>
      <div className="anaks-content-blog__grid">
        {posts.map((post) => (
          <article
            className="anaks-content-blog__card"
            key={post.id}
            style={{
              background: themeColor(config.theme, 'surfaceStrong'),
              border: `1px solid ${themeColor(config.theme, 'border')}`,
              borderRadius: themeRadius(config.theme, 'soft', 16),
              padding: 'clamp(24px, 4vw, 36px)',
            }}
          >
            <p style={{ color: config.theme.palette.muted, fontFamily: config.theme.fonts.body, fontSize: 13 }}>
              {post.publishedAt.slice(0, 10)}
            </p>
            <h2
              style={{
                color: config.theme.palette.text,
                fontFamily: config.theme.fonts.heading,
                fontSize: 'clamp(24px, 3vw, 32px)',
                lineHeight: 1.3,
                marginTop: 14,
                wordBreak: 'keep-all',
              }}
            >
              <a href={hrefForPost(post.slug)} style={{ color: 'inherit', textDecoration: 'none' }}>
                {post.title}
              </a>
            </h2>
            <p
              style={{
                color: config.theme.palette.muted,
                fontFamily: config.theme.fonts.body,
                fontSize: 16,
                lineHeight: 1.7,
                marginTop: 16,
                wordBreak: 'keep-all',
              }}
            >
              {post.summary}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TenantContentBlog({
  config,
  posts,
  post,
  hrefForSlug,
  hrefForPost = (slug) => `/blog/${slug}`,
  listHref = '/blog',
}: TenantContentBlogProps) {
  const renderedConfig = projectAuthoritativePublicContact(config);
  const businessInfo = config.businessInfo ?? null;
  const publicContact = resolvePublicContact(renderedConfig);
  const pinnedFontResources = fontPairingResources(config.theme);
  const fontUrls = pinnedFontResources ? [] : googleFontUrls(config.theme.fonts.googleFonts);
  return (
    <>
      {!pinnedFontResources ? <link rel="preconnect" href="https://fonts.googleapis.com" /> : null}
      {!pinnedFontResources ? <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /> : null}
      {fontUrls.map((href) => <link key={href} rel="stylesheet" href={href} />)}
      {!pinnedFontResources && needsPretendard(config.theme)
        ? <link rel="stylesheet" href={PRETENDARD_CSS_URL} />
        : null}
      {pinnedFontResources ? <style>{pinnedFontResources.css}</style> : null}
      <style>{BLOG_CSS}</style>
      <TenantHeader
        config={renderedConfig}
        currentSlug="blog"
        hrefForSlug={hrefForSlug}
        additionalItems={[CONTENT_BLOG_NAV_ITEM]}
      />
      <main
        className="anaks-content-blog"
        style={{ background: config.theme.palette.background }}
      >
        {post ? (
          <PostDocument post={post} config={renderedConfig} listHref={listHref} />
        ) : (
          <PostList posts={posts} config={renderedConfig} hrefForPost={hrefForPost} />
        )}
        {/*
          Only where the sentence is true. It says "This article", so it belongs on a page that
          is an article — the index lists several and is not one, and printing it there would be
          a small false statement in the one place we promise not to make them.

          Rendered beside the article, never inside it: the stored document and its validated
          hash are what approval re-checks, and folding this sentence into document.blocks would
          change that hash and make every published version fail its own integrity gate.
        */}
        {post ? (
          <aside
            className="anaks-content-blog__notice"
            style={{
              borderTop: `1px solid ${config.theme.palette.muted}33`,
              color: config.theme.palette.muted,
              fontFamily: config.theme.fonts.body,
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            {contentPostEducationalNotice(tenantBrandName(renderedConfig))}
          </aside>
        ) : null}
      </main>
      {!businessInfo && publicContact ? (
        <PublicContactBar contact={publicContact} theme={config.theme} />
      ) : null}
      {businessInfo ? (
        <LegalFooter info={businessInfo} theme={config.theme} locale={config.meta.locale} />
      ) : null}
    </>
  );
}
