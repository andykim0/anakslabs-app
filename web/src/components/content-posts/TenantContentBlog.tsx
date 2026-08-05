import type { SiteConfig } from '@/lib/types/site';
import type { PublishedContentPost } from '@/lib/content-fulfillment/contracts';
import { CONTENT_BLOG_NAV_ITEM } from '@/lib/content-fulfillment/public-projection';
import { projectAuthoritativePublicContact, resolvePublicContact } from '@/lib/seo/public-contact';
import { TenantHeader, tenantBrandName } from '@/components/site-renderer/TenantHeader';
import { contentPostEducationalNotice } from '@/lib/legal/notices';
import { postCoverImage } from '@/lib/content-fulfillment/post-cover';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';
import { LegalFooter } from '@/components/site-renderer/LegalFooter';
import { PublicContactBar } from '@/components/site-renderer/PublicContactBar';
import { themeColor, themeRadius } from '@/lib/design/site-theme-tokens';
import { pickOutlineColor } from '@/lib/design/button-contrast';
import { fontPairingResources } from '@/lib/fonts/resources';
import {
  googleFontUrls,
  needsPretendard,
  PRETENDARD_CSS_URL,
} from '@/components/site-renderer/fonts';

/**
 * The tenant's own theme owns colour and type; this stylesheet owns rhythm and structure only.
 * Every value here is either geometry or inherited — no literal colour appears, because the same
 * markup has to hold up across every generated palette, light or dark, serif or sans.
 */
const BLOG_CSS = `
.anaks-content-blog{min-height:70dvh}
.anaks-content-blog__band{padding:clamp(56px,8vw,104px) 0 clamp(40px,5vw,64px)}
.anaks-content-blog__inner{width:min(100% - 48px,1080px);margin:0 auto}
.anaks-content-blog__feed{width:min(100% - 48px,1080px);margin:0 auto;padding:clamp(40px,5vw,72px) 0 clamp(72px,9vw,128px)}
.anaks-content-blog__notice{width:min(100% - 48px,68ch);margin:0 auto;padding:28px 0 clamp(56px,7vw,104px)}
.anaks-content-blog__title{word-break:keep-all;overflow-wrap:break-word}
.anaks-content-blog__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(20px,2.5vw,32px)}
.anaks-content-blog__card{position:relative;min-width:0;display:flex;flex-direction:column;overflow:hidden;transition:border-color .18s ease}
.anaks-content-blog__card:hover{border-color:var(--anaks-blog-accent)}
.anaks-content-blog__card:hover .anaks-content-blog__card-title{color:var(--anaks-blog-accent)}
.anaks-content-blog__card-title{transition:color .18s ease}
/* One real link per card, stretched so the whole card is the target. */
.anaks-content-blog__card-link::after{content:"";position:absolute;inset:0}
.anaks-content-blog__card-link:focus-visible{outline:2px solid var(--anaks-blog-accent);outline-offset:3px}
/* With a cover the slot takes an editorial ratio; without one it is a short colour field, not a
   hole where a photo should be. Both are finished states — covers simply expand the slot. */
.anaks-content-blog__media{position:relative;width:100%;height:104px;overflow:hidden}
.anaks-content-blog__media--feature{height:132px}
.anaks-content-blog__media--cover{height:auto;aspect-ratio:3/2}
.anaks-content-blog__media--cover.anaks-content-blog__media--feature{aspect-ratio:21/9}
.anaks-content-blog__media img{width:100%;height:100%;object-fit:cover;display:block}
.anaks-content-blog__body{display:flex;flex-direction:column;flex:1;padding:clamp(20px,2.6vw,30px)}
.anaks-content-blog__feature{display:grid;grid-template-columns:1fr;overflow:hidden}
.anaks-content-blog__article{width:min(100% - 48px,68ch);margin:0 auto;padding:clamp(48px,6vw,80px) 0 clamp(24px,3vw,40px)}
.anaks-content-blog__article p,.anaks-content-blog__article li{word-break:keep-all;overflow-wrap:break-word}
/* The app's Tailwind preflight strips list markers, so a numbered step list published as an
   ordered list was rendering unnumbered on the live route. Restore markers explicitly here: this
   stylesheet travels with the export too, so both surfaces agree regardless of preflight.
   Spacing via margins, never display:grid — that removes the marker box entirely. */
.anaks-content-blog__article ol{list-style:decimal}
.anaks-content-blog__article ul{list-style:disc}
.anaks-content-blog__article li + li{margin-top:8px}
.anaks-content-blog__article li::marker{color:var(--anaks-blog-accent)}
.anaks-content-blog__table-wrap{max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;margin-top:32px}
.anaks-content-blog__table{width:100%;min-width:560px;border-collapse:collapse}
.anaks-content-blog__table th,.anaks-content-blog__table td{padding:14px 16px;text-align:left;vertical-align:top}
@media(max-width:767px){
  .anaks-content-blog__inner,.anaks-content-blog__feed{width:min(100% - 32px,680px)}
  .anaks-content-blog__article{width:min(100% - 32px,68ch);padding:40px 0 24px}
  .anaks-content-blog__notice{width:min(100% - 32px,68ch)}
  .anaks-content-blog__grid{grid-template-columns:1fr;gap:16px}
  .anaks-content-blog__media--feature{aspect-ratio:16/9}
}
@media(prefers-reduced-motion:reduce){
  .anaks-content-blog__card,.anaks-content-blog__card-title{transition:none}
}
`;

/**
 * Accent and primary, resolved defensively.
 *
 * The palette type marks both as required, but clinic newbuild themes ship a four-colour palette
 * (background, surface, text, muted) and nothing else — so reading `palette.accent` directly
 * yields undefined at runtime and produces `undefinedD9` gradients and a contrast crash. Falling
 * back through the colours that always exist keeps the surface token-derived either way.
 */
function blogAccent(theme: SiteConfig['theme']): string {
  return theme.palette.accent || theme.palette.primary || theme.palette.text;
}

function blogPrimary(theme: SiteConfig['theme']): string {
  return theme.palette.primary || theme.palette.accent || theme.palette.text;
}

/**
 * Reveal attributes for one element.
 *
 * Gated by the site's own motion intensity: a practice that turned motion off should not have it
 * reappear on its blog. `suppressHydrationWarning` is required because the runtime adds its
 * hide/show classes before React hydrates — a real difference, on exactly the elements that opt in.
 */
function revealProps(enabled: boolean) {
  return enabled ? { 'data-m': 'reveal', suppressHydrationWarning: true } as const : {};
}

/**
 * The one recurring device on this surface: a short accent rule marking the hinge between what a
 * thing is and what it says. It sits under the section eyebrow, between a card's title and its
 * summary, and under an article title before the body — the same meaning in all three places, so
 * it reads as structure rather than ornament.
 */
function AccentRule({ color, width = 40 }: { color: string; width?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{ background: color, borderRadius: 2, height: 2, marginBlock: 16, width }}
    />
  );
}

/** Dates belong to the practice, so they are read in the practice's own time zone. */
function publishedDateLabel(post: PublishedContentPost, config: SiteConfig): string {
  const iso = post.publishedAt;
  try {
    return new Intl.DateTimeFormat(config.meta.locale ?? 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: config.meta.timezone ?? 'UTC',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Deterministic per-post variation for the coverless field. Derived from the slug so the same
 * post always paints the same way — a static export and the live page must not disagree, and a
 * page of identical fields reads as a rendering bug rather than a set of distinct articles.
 */
function slugAngle(slug: string): number {
  let hash = 0;
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) % 360;
  return 95 + (hash % 5) * 25;
}

/**
 * The cover slot. Content posts do not carry an image yet, so today every card renders the
 * fallback — which is why the fallback is designed rather than left as an empty box: it is the
 * state the product actually ships in. An `imageUrl` drops straight in when covers arrive.
 */
function PostMedia({
  config,
  slug,
  imageUrl,
  feature = false,
}: {
  config: SiteConfig;
  slug: string;
  imageUrl?: string;
  feature?: boolean;
}) {
  const accent = blogAccent(config.theme);
  const primary = blogPrimary(config.theme);
  const className = [
    'anaks-content-blog__media',
    feature ? 'anaks-content-blog__media--feature' : '',
    imageUrl ? 'anaks-content-blog__media--cover' : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      className={className}
      style={imageUrl ? undefined : {
        // Two brand stops at real strength: the field should look chosen, not unloaded.
        background: `linear-gradient(${slugAngle(slug)}deg, ${accent}D9 0%, ${primary}A6 55%, ${accent}59 100%)`,
        borderBottom: `1px solid ${themeColor(config.theme, 'border')}33`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- this tree is also rendered to
          static HTML for export, where the Next image runtime does not exist. */}
      {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : null}
    </div>
  );
}

export interface TenantContentBlogProps {
  config: SiteConfig;
  /** Needed only to pin cover selection to the site; never used to fetch anything. */
  siteId?: string;
  /**
   * Maps a cover URL to where it actually lives for this render target. The live site serves
   * `/stock/...` from public/; a static export bundles the file and needs its own relative path.
   */
  coverSrc?: (src: string) => string;
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
  motion,
}: {
  post: PublishedContentPost;
  config: SiteConfig;
  listHref: string;
  motion: boolean;
}) {
  const text = config.theme.palette.text;
  const muted = config.theme.palette.muted;
  const accent = blogAccent(config.theme);
  const bandBackground = themeColor(config.theme, 'surfaceSubtle');
  const backLink = pickOutlineColor(bandBackground, blogPrimary(config.theme), config.theme.palette);
  return (
    <>
      <header
        className="anaks-content-blog__band"
        style={{
          background: bandBackground,
          borderBottom: `1px solid ${themeColor(config.theme, 'border')}33`,
        }}
      >
        <div
          className="anaks-content-blog__inner"
          style={{ maxWidth: '68ch' }}
          {...revealProps(motion)}
        >
          <a
            href={listHref}
            style={{
              color: backLink,
              fontFamily: config.theme.fonts.body,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}
          >
            ← Back to the blog
          </a>
          <h1
            className="anaks-content-blog__title"
            style={{
              color: text,
              fontFamily: config.theme.fonts.heading,
              fontSize: 'clamp(34px, 5.4vw, 58px)',
              letterSpacing: '-0.032em',
              lineHeight: 1.12,
              marginTop: 24,
            }}
          >
            {post.title}
          </h1>
          <AccentRule color={accent} />
          <p
            style={{
              color: muted,
              fontFamily: config.theme.fonts.body,
              fontSize: 'clamp(17px, 2vw, 20px)',
              lineHeight: 1.7,
            }}
          >
            {post.summary}
          </p>
          <p
            style={{
              color: muted,
              fontFamily: config.theme.fonts.body,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.08em',
              marginTop: 24,
              textTransform: 'uppercase',
            }}
          >
            {publishedDateLabel(post, config)}
          </p>
        </div>
      </header>
      <article className="anaks-content-blog__article" {...revealProps(motion)}>
        {post.document.blocks.map((block, index) => {
          if (block.type === 'heading') {
            const Heading = block.level === 2 ? 'h2' : 'h3';
            return (
              <Heading
                key={index}
                style={{
                  color: text,
                  fontFamily: config.theme.fonts.heading,
                  fontSize: block.level === 2 ? 'clamp(25px, 3.2vw, 33px)' : 'clamp(20px, 2.5vw, 25px)',
                  lineHeight: 1.28,
                  letterSpacing: '-0.022em',
                  // A heading belongs to what follows it, so the space above is the larger gap.
                  marginTop: index === 0 ? 0 : block.level === 2 ? 60 : 44,
                  marginBottom: block.level === 2 ? 16 : 12,
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
                  paddingLeft: 22,
                  marginTop: 22,
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
                    borderRadius: themeRadius(config.theme, 'sharp', 0),
                    color: text,
                    fontFamily: config.theme.fonts.body,
                    fontSize: 16,
                    lineHeight: 1.65,
                    overflow: 'hidden',
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
                          style={{
                            background: themeColor(config.theme, 'surfaceStrong'),
                            borderBottom: `1px solid ${border}`,
                            fontFamily: config.theme.fonts.heading,
                            fontSize: 13,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                          }}
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
      </article>
    </>
  );
}

function MetaLine({ children, color, config }: {
  children: React.ReactNode;
  color: string;
  config: SiteConfig;
}) {
  return (
    <p
      style={{
        color,
        fontFamily: config.theme.fonts.body,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </p>
  );
}

function PostCard({
  post,
  config,
  siteId,
  coverSrc,
  hrefForPost,
  feature = false,
  motion,
}: {
  post: PublishedContentPost;
  config: SiteConfig;
  siteId?: string;
  coverSrc: (src: string) => string;
  hrefForPost: (slug: string) => string;
  feature?: boolean;
  motion: boolean;
}) {
  const { text, muted } = config.theme.palette;
  const accent = blogAccent(config.theme);
  const cover = siteId ? postCoverImage({ config, siteId, slug: post.slug }) : null;
  return (
    <article
      className={`anaks-content-blog__card${feature ? ' anaks-content-blog__feature' : ''}`}
      style={{
        background: themeColor(config.theme, 'surfaceStrong'),
        border: `1px solid ${themeColor(config.theme, 'border')}33`,
        borderRadius: themeRadius(config.theme, 'soft', 16),
      }}
      {...revealProps(motion)}
    >
      <PostMedia
        config={config}
        slug={post.slug}
        feature={feature}
        {...(cover ? { imageUrl: coverSrc(cover.url) } : {})}
      />
      <div className="anaks-content-blog__body">
        <MetaLine color={muted} config={config}>{publishedDateLabel(post, config)}</MetaLine>
        <h2
          className="anaks-content-blog__card-title"
          style={{
            color: text,
            fontFamily: config.theme.fonts.heading,
            fontSize: feature ? 'clamp(28px, 4vw, 44px)' : 'clamp(20px, 2.4vw, 26px)',
            letterSpacing: '-0.02em',
            lineHeight: 1.22,
            marginTop: 12,
            wordBreak: 'keep-all',
          }}
        >
          <a
            className="anaks-content-blog__card-link"
            href={hrefForPost(post.slug)}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {post.title}
          </a>
        </h2>
        <AccentRule color={accent} />
        <p
          style={{
            color: muted,
            fontFamily: config.theme.fonts.body,
            fontSize: feature ? 17 : 16,
            lineHeight: 1.72,
            wordBreak: 'keep-all',
          }}
        >
          {post.summary}
        </p>
      </div>
    </article>
  );
}

function PostList({
  posts,
  config,
  siteId,
  coverSrc,
  hrefForPost,
  motion,
}: {
  posts: readonly PublishedContentPost[];
  config: SiteConfig;
  siteId?: string;
  coverSrc: (src: string) => string;
  hrefForPost: (slug: string) => string;
  motion: boolean;
}) {
  const { text, muted } = config.theme.palette;
  const accent = blogAccent(config.theme);
  const bandBackground = themeColor(config.theme, 'surfaceSubtle');
  // The eyebrow is the only accent-coloured text here, so it is the only one that needs checking.
  const eyebrow = pickOutlineColor(bandBackground, accent, config.theme.palette);
  // Posts arrive newest first, so the newest genuinely is the lead — the asymmetry is the
  // ordering made visible, not a layout flourish.
  const [lead, ...rest] = posts;

  return (
    <>
      <section
        className="anaks-content-blog__band"
        style={{
          background: bandBackground,
          borderBottom: `1px solid ${themeColor(config.theme, 'border')}33`,
        }}
      >
        <div className="anaks-content-blog__inner" {...revealProps(motion)}>
          <MetaLine color={eyebrow} config={config}>Blog</MetaLine>
          <AccentRule color={accent} />
          <h1
            className="anaks-content-blog__title"
            style={{
              color: text,
              fontFamily: config.theme.fonts.heading,
              fontSize: 'clamp(38px, 6vw, 68px)',
              letterSpacing: '-0.035em',
              lineHeight: 1.08,
              maxWidth: '18ch',
            }}
          >
            Practical information from this practice.
          </h1>
          <p
            style={{
              color: muted,
              fontFamily: config.theme.fonts.body,
              fontSize: 'clamp(16px, 1.8vw, 18px)',
              lineHeight: 1.7,
              marginTop: 20,
              maxWidth: '52ch',
            }}
          >
            Answers to the questions patients ask most, written from this practice&apos;s own
            information.
          </p>
        </div>
      </section>

      <section className="anaks-content-blog__feed">
        {lead ? (
          <PostCard
            post={lead}
            config={config}
            siteId={siteId}
            coverSrc={coverSrc}
            hrefForPost={hrefForPost}
            motion={motion}
            feature
          />
        ) : null}
        {rest.length > 0 ? (
          <div className="anaks-content-blog__grid" style={{ marginTop: 'clamp(20px, 2.5vw, 32px)' }}>
            {rest.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                config={config}
                siteId={siteId}
                coverSrc={coverSrc}
                hrefForPost={hrefForPost}
                motion={motion}
              />
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

export function TenantContentBlog({
  config,
  siteId,
  coverSrc = (src) => src,
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
  // The site's own switch decides. Off means no markers, no stylesheet and no runtime at all.
  const motion = config.motion?.intensity !== 'off';
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
      {motion ? <style>{MOTION_CSS}</style> : null}
      <TenantHeader
        config={renderedConfig}
        currentSlug="blog"
        hrefForSlug={hrefForSlug}
        additionalItems={[CONTENT_BLOG_NAV_ITEM]}
      />
      <main
        className="anaks-site anaks-content-blog"
        {...(pinnedFontResources ? { 'data-font-pairing': pinnedFontResources.id } : {})}
        // The motion runtime adds its own state classes to this element before React hydrates,
        // so the server and client class lists legitimately differ here — and only here.
        suppressHydrationWarning
        style={{
          // An article is one continuous reading surface; the index is a feed of cards, which
          // needs the page tone behind them so each card reads as its own object.
          background: post
            ? themeColor(config.theme, 'surfaceSubtle')
            : config.theme.palette.background,
          // Hover and focus styles live in the stylesheet, so the accent has to reach them.
          ['--anaks-blog-accent' as string]: blogAccent(config.theme),
        }}
      >
        {post ? (
          <PostDocument
            post={post}
            config={renderedConfig}
            listHref={listHref}
            motion={motion}
          />
        ) : (
          <PostList
            posts={posts}
            config={renderedConfig}
            siteId={siteId}
            coverSrc={coverSrc}
            hrefForPost={hrefForPost}
            motion={motion}
          />
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
              color: config.theme.palette.muted,
              fontFamily: config.theme.fonts.body,
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            <AccentRule color={blogAccent(config.theme)} width={28} />
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
      {/*
        The blog injects the motion runtime itself rather than through the shared export shell:
        SiteRenderer already emits it for site pages, and putting it in the shell would inject it
        twice into every site export. Emitting it here keeps the live route and the blog export
        identical by construction, since both render this same tree.
      */}
      {motion ? <script dangerouslySetInnerHTML={{ __html: MOTION_RUNTIME }} /> : null}
    </>
  );
}
