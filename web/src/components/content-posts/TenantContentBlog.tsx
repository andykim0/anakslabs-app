import type { SiteConfig } from '@/lib/types/site';
import type { PublishedContentPost } from '@/lib/content-fulfillment/contracts';
import { CONTENT_BLOG_NAV_ITEM } from '@/lib/content-fulfillment/public-projection';
import {
  articleCategory,
  articleHighlightIndex,
  articleKeyFacts,
  articleReadingMinutes,
  type ArticleKeyFacts,
} from '@/lib/content-fulfillment/article-structure';
import { resolveBlogBookingTarget } from '@/lib/content-fulfillment/booking-target';
import { projectAuthoritativePublicContact, resolvePublicContact } from '@/lib/seo/public-contact';
import { TenantHeader, tenantBrandName } from '@/components/site-renderer/TenantHeader';
import { contentPostEducationalNotice } from '@/lib/legal/notices';
import { postCoverImage } from '@/lib/content-fulfillment/post-cover';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';
import { LegalFooter } from '@/components/site-renderer/LegalFooter';
import { PublicContactBar } from '@/components/site-renderer/PublicContactBar';
import { themeColor, themeRadius } from '@/lib/design/site-theme-tokens';
import { pickButtonTextColor, pickOutlineColor } from '@/lib/design/button-contrast';
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
/* ---- article furniture -------------------------------------------------------------------
   Reading progress. The width is driven by --scroll-progress, which the shared motion runtime
   already projects onto any [data-m-progress] element — so this adds no second scroll listener,
   no new script, and no reduced-motion branch of its own: that runtime returns before it drives
   anything when the user asks for reduced motion, and with no JS at all the variable never leaves
   its 0 default. Both cases leave a bar of zero width, which is the honest state. */
.anaks-content-blog__progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:40;pointer-events:none;transform-origin:0 50%;transform:scaleX(var(--scroll-progress,0));will-change:transform}
/* The cover is the largest element on the page, so the box is reserved by ratio and by explicit
   width/height on the image itself — the layout never moves when the file arrives. */
.anaks-content-blog__cover{position:relative;width:min(100% - 48px,1180px);margin:0 auto;aspect-ratio:21/9;overflow:hidden}
.anaks-content-blog__cover img{display:block;width:100%;height:100%;object-fit:cover}
.anaks-content-blog__plate{position:absolute;inset:0;overflow:hidden}
.anaks-content-blog__plate svg{position:absolute;inset:0;width:100%;height:100%}
.anaks-content-blog__kicker{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-bottom:20px}
.anaks-content-blog__chip{display:inline-block;padding:5px 12px;line-height:1.2}
.anaks-content-blog__h2wrap{margin-top:60px}
.anaks-content-blog__h2wrap:first-child{margin-top:0}
/* Checklists are the block this generator emits most, and a flat disc list buries them. The panel
   treatment is scoped to its own class so the plain ul rule above still governs ordinary lists. */
.anaks-content-blog__article ul.anaks-content-blog__checklist{list-style:none;margin-top:28px;padding:clamp(20px,2.4vw,28px)}
.anaks-content-blog__checklist li{display:grid;grid-template-columns:18px 1fr;gap:14px;align-items:start}
.anaks-content-blog__checklist li + li{margin-top:11px}
.anaks-content-blog__checklist li::marker{content:none}
.anaks-content-blog__tick{width:18px;height:18px;margin-top:5px;border-radius:3px}
/* The machine-readable answers, printed. Same text as the FAQPage JSON-LD beside it. */
.anaks-content-blog__facts{margin-top:44px;overflow:hidden}
.anaks-content-blog__facts-head{padding:clamp(16px,2vw,22px) clamp(18px,2.2vw,26px)}
.anaks-content-blog__facts-body{padding:clamp(18px,2.2vw,26px)}
/* The Q/A pairs are sibling wrappers, so the rhythm belongs between the wrappers — targeting the
   heading itself never matched, and the pairs ran together. */
.anaks-content-blog__facts-body > * + *{margin-top:26px}
.anaks-content-blog__quote{margin:44px 0;padding-left:clamp(18px,2.2vw,26px)}
.anaks-content-blog__cta{margin:clamp(48px,6vw,72px) auto 0;width:min(100% - 48px,68ch);padding:clamp(26px,3.2vw,38px);text-align:left}
.anaks-content-blog__cta a{display:inline-block;margin-top:20px;padding:14px 26px;text-decoration:none}
.anaks-content-blog__related{width:min(100% - 48px,1080px);margin:clamp(56px,7vw,88px) auto 0}
.anaks-content-blog__related-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(16px,2vw,24px);margin-top:24px}
@media(max-width:767px){
  .anaks-content-blog__inner,.anaks-content-blog__feed{width:min(100% - 32px,680px)}
  .anaks-content-blog__article{width:min(100% - 32px,68ch);padding:40px 0 24px}
  .anaks-content-blog__notice{width:min(100% - 32px,68ch)}
  .anaks-content-blog__grid{grid-template-columns:1fr;gap:16px}
  .anaks-content-blog__media--feature{aspect-ratio:16/9}
  .anaks-content-blog__cover{width:100%;aspect-ratio:16/10}
  .anaks-content-blog__cta{width:min(100% - 32px,68ch)}
  .anaks-content-blog__related{width:min(100% - 32px,680px)}
  .anaks-content-blog__related-grid{grid-template-columns:1fr}
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
  width,
  height,
  feature = false,
}: {
  config: SiteConfig;
  slug: string;
  imageUrl?: string;
  /** Present only for registry-backed covers, which know their own raster size. */
  width?: number;
  height?: number;
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
      {imageUrl ? (
        // This tree is also rendered to static HTML for export, where the Next image runtime
        // does not exist, so the plain element is the only one that works on both surfaces.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          {...(width ? { width } : {})}
          {...(height ? { height } : {})}
        />
      ) : null}
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

/**
 * The coverless state, painted from the practice's own tokens.
 *
 * Deliberately non-representational and text-free. A stock photograph of a stranger implies the
 * practice's own room and staff; a headline burned into an image cannot be read by a screen reader
 * or corrected by an editor. Colour and geometry assert nothing, so this is a finished state
 * rather than a placeholder — which matters, because with cover generation off by default it is
 * the state nearly every article ships in.
 *
 * Deterministic per slug: a static export and the live page render the same article and must not
 * disagree, and a page of identical plates reads as a rendering fault rather than distinct pieces.
 */
function CoverPlate({ config, slug }: { config: SiteConfig; slug: string }) {
  const accent = blogAccent(config.theme);
  const primary = blogPrimary(config.theme);
  const angle = slugAngle(slug);
  // A second value from the same hash, so the focal point moves with the plate's angle.
  const focus = 58 + (angle % 7) * 5;
  return (
    <div
      className="anaks-content-blog__plate"
      aria-hidden="true"
      style={{
        // `currentColor` carries the accent into the strokes below, so the motif needs no colour
        // literals of its own and inherits any future token change for free.
        color: accent,
        background:
          `radial-gradient(120% 120% at ${focus}% 22%, ${accent}59 0%, transparent 62%),`
          + ` linear-gradient(${angle}deg, ${primary}E6 0%, ${accent}BF 58%, ${primary}D9 100%)`,
      }}
    >
      <svg viewBox="0 0 1200 514" preserveAspectRatio="xMidYMid slice" role="presentation">
        <g fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.25">
          <circle cx="880" cy="180" r="96" />
          <circle cx="880" cy="180" r="168" />
          <circle cx="880" cy="180" r="252" />
          <path d="M0 392 C 220 344, 340 452, 560 404 S 940 296, 1200 356" strokeOpacity="0.16" />
          <path d="M0 452 C 260 410, 380 500, 620 452 S 980 356, 1200 414" strokeOpacity="0.1" />
        </g>
        <g fill="currentColor" fillOpacity="0.4">
          <circle cx="880" cy="180" r="7" />
          <circle cx="712" cy="180" r="3.5" />
          <circle cx="1048" cy="180" r="3.5" />
          <circle cx="880" cy="12" r="3.5" />
        </g>
      </svg>
    </div>
  );
}

/**
 * The article's hero.
 *
 * With a stored cover this is the page's largest paint, so it carries the image's real pixel
 * dimensions and `fetchPriority="high"`: the ratio box plus explicit width/height reserves the
 * space before the bytes land, which is what keeps the layout still. It is the one image on the
 * surface that is *not* lazy — deferring the element that defines the largest contentful paint
 * would delay the very thing it measures. Everything below the fold stays lazy.
 */
function CoverHero({ config, post }: { config: SiteConfig; post: PublishedContentPost }) {
  const cover = post.cover;
  return (
    <div
      className="anaks-content-blog__cover"
      style={{ borderRadius: themeRadius(config.theme, 'soft', 16) }}
    >
      {cover ? (
        // Same reason as the card image: the export renders this tree to static HTML.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover.url}
          alt=""
          decoding="async"
          fetchPriority="high"
          {...(cover.width ? { width: cover.width } : {})}
          {...(cover.height ? { height: cover.height } : {})}
        />
      ) : (
        <CoverPlate config={config} slug={post.slug} />
      )}
    </div>
  );
}

/**
 * Category · date · publisher.
 *
 * The publisher line names the practice and says it published the article, which is what actually
 * happened: the site is theirs, the article carries their name, and it went live under their
 * domain. It deliberately does not claim clinical review — approval in this product is an operator
 * action (`requireAdminOr403` guards every content-queue route; `created_by_type` is
 * `'system' | 'admin'` and has no customer value), so a "reviewed by the practice" line would be
 * a sentence the pipeline cannot support.
 */
function ArticleKicker({
  config,
  post,
  brandName,
  minutes,
}: {
  config: SiteConfig;
  post: PublishedContentPost;
  brandName: string;
  minutes: number;
}) {
  const muted = config.theme.palette.muted;
  const accent = blogAccent(config.theme);
  const chipBackground = themeColor(config.theme, 'surfaceStrong');
  const chipInk = pickOutlineColor(chipBackground, accent, config.theme.palette);
  const category = articleCategory(post.tags);
  const meta = [
    publishedDateLabel(post, config),
    `${minutes} min read`,
    `Published by ${brandName}`,
  ];
  return (
    <div className="anaks-content-blog__kicker">
      {category ? (
        <span
          className="anaks-content-blog__chip"
          style={{
            background: chipBackground,
            border: `1px solid ${themeColor(config.theme, 'border')}59`,
            borderRadius: themeRadius(config.theme, 'pill', 999),
            color: chipInk,
            fontFamily: config.theme.fonts.body,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {category}
        </span>
      ) : null}
      <span
        style={{
          color: muted,
          fontFamily: config.theme.fonts.body,
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {meta.join(' · ')}
      </span>
    </div>
  );
}

/**
 * An unordered list, set as a panel.
 *
 * The generator produces question and preparation checklists constantly and the plain disc list
 * flattened them into the surrounding prose, which is the single highest-value change on this
 * page. Only the presentation moves: the items, their order and their text are the stored ones.
 */
function Checklist({
  config,
  items,
}: {
  config: SiteConfig;
  items: readonly (string | { text: string })[];
}) {
  const accent = blogAccent(config.theme);
  return (
    <ul
      className="anaks-content-blog__checklist"
      style={{
        background: themeColor(config.theme, 'surfaceStrong'),
        border: `1px solid ${themeColor(config.theme, 'border')}40`,
        borderRadius: themeRadius(config.theme, 'soft', 14),
        color: config.theme.palette.text,
        fontFamily: config.theme.fonts.body,
        fontSize: 16.5,
        lineHeight: 1.62,
      }}
    >
      {items.map((item, index) => {
        const text = typeof item === 'string' ? item : item.text;
        return (
          <li key={`${text}-${index}`}>
            <span
              className="anaks-content-blog__tick"
              aria-hidden="true"
              style={{ background: accent, display: 'block' }}
            />
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The key-facts box: the article's own question set, printed.
 *
 * This is the component that makes the machine-readable layer visible to the person paying for it.
 * The same questions and answers are emitted as `FAQPage` JSON-LD beside the article, and both
 * come from `articleKeyFacts` over the stored document — so what an assistant can quote and what a
 * reader can see are the same sentences by construction, not by two writers agreeing. The footer
 * says so, and it is true: nothing in this box was written for the box.
 */
function KeyFactsBox({ config, facts }: { config: SiteConfig; facts: ArticleKeyFacts }) {
  const { text, muted } = config.theme.palette;
  const border = themeColor(config.theme, 'border');
  return (
    <section
      className="anaks-content-blog__facts"
      aria-label="Key facts"
      style={{
        background: config.theme.palette.surface,
        border: `1px solid ${border}66`,
        borderRadius: themeRadius(config.theme, 'soft', 16),
      }}
    >
      <header
        className="anaks-content-blog__facts-head"
        style={{
          background: themeColor(config.theme, 'surfaceSubtle'),
          borderBottom: `1px solid ${border}59`,
        }}
      >
        <h2
          style={{
            color: text,
            fontFamily: config.theme.fonts.heading,
            fontSize: 18,
            letterSpacing: '-0.01em',
            lineHeight: 1.35,
            margin: 0,
          }}
        >
          {facts.title ?? 'Key facts from this article'}
        </h2>
        <p
          style={{
            color: muted,
            fontFamily: config.theme.fonts.body,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: '0.1em',
            marginTop: 8,
            textTransform: 'uppercase',
          }}
        >
          Also published as FAQPage · quotable by assistants
        </p>
      </header>
      <div className="anaks-content-blog__facts-body">
        {facts.facts.map((fact) => (
          <div key={fact.headingIndex}>
            <h3
              className="anaks-content-blog__facts-q"
              style={{
                color: text,
                fontFamily: config.theme.fonts.heading,
                fontSize: 17.5,
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              {fact.question}
            </h3>
            <p
              style={{
                color: text,
                fontFamily: config.theme.fonts.body,
                fontSize: 16.5,
                lineHeight: 1.72,
                marginTop: 8,
              }}
            >
              {fact.answer}
            </p>
          </div>
        ))}
        <p
          style={{
            borderTop: `1px solid ${border}40`,
            color: muted,
            fontFamily: config.theme.fonts.body,
            fontSize: 13,
            lineHeight: 1.6,
            marginTop: 24,
            paddingTop: 16,
          }}
        >
          Every answer above is drawn from this article&apos;s own text.
        </p>
      </div>
    </section>
  );
}

/**
 * The booking call to action.
 *
 * `resolveBlogBookingTarget` only ever returns somewhere the practice already publishes, and this
 * renders nothing when it returns null — an article with no CTA is a supported outcome, and a
 * fabricated booking link on a clinic page is not.
 */
function BookingCta({
  config,
  brandName,
  hrefForSlug,
}: {
  config: SiteConfig;
  brandName: string;
  hrefForSlug?: (slug: string) => string;
}) {
  const target = hrefForSlug
    ? resolveBlogBookingTarget(config, hrefForSlug)
    : resolveBlogBookingTarget(config);
  if (!target) return null;
  const accent = blogAccent(config.theme);
  const buttonInk = pickButtonTextColor(accent, config.theme.palette);
  return (
    <aside
      className="anaks-content-blog__cta"
      style={{
        background: themeColor(config.theme, 'surfaceStrong'),
        border: `1px solid ${themeColor(config.theme, 'border')}40`,
        borderRadius: themeRadius(config.theme, 'soft', 16),
      }}
    >
      <p
        style={{
          color: config.theme.palette.text,
          fontFamily: config.theme.fonts.heading,
          fontSize: 'clamp(20px, 2.2vw, 25px)',
          letterSpacing: '-0.018em',
          lineHeight: 1.3,
        }}
      >
        Questions about your own care?
      </p>
      <p
        style={{
          color: config.theme.palette.muted,
          fontFamily: config.theme.fonts.body,
          fontSize: 16,
          lineHeight: 1.7,
          marginTop: 10,
        }}
      >
        {brandName} can answer them directly.
      </p>
      <a
        href={target.href}
        style={{
          background: accent,
          borderRadius: themeRadius(config.theme, 'pill', 999),
          color: buttonInk,
          fontFamily: config.theme.fonts.body,
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        {target.label}
      </a>
    </aside>
  );
}

/**
 * Up to three more articles from the same site, newest first, never this one.
 *
 * Reads the `posts` array the route already loaded for the navigation gate, so it costs no extra
 * query, and it is the same published-and-screened set the index renders.
 */
function RelatedPosts({
  config,
  posts,
  current,
  hrefForPost,
  motion,
}: {
  config: SiteConfig;
  posts: readonly PublishedContentPost[];
  current: PublishedContentPost;
  hrefForPost: (slug: string) => string;
  motion: boolean;
}) {
  const related = posts.filter((post) => post.id !== current.id).slice(0, 3);
  if (related.length === 0) return null;
  const { text, muted } = config.theme.palette;
  const accent = blogAccent(config.theme);
  return (
    <section className="anaks-content-blog__related" {...revealProps(motion)}>
      <MetaLine
        color={pickOutlineColor(themeColor(config.theme, 'surfaceSubtle'), accent, config.theme.palette)}
        config={config}
      >
        More from this practice
      </MetaLine>
      <AccentRule color={accent} />
      <div className="anaks-content-blog__related-grid">
        {related.map((post) => (
          <article
            key={post.id}
            className="anaks-content-blog__card"
            style={{
              background: themeColor(config.theme, 'surfaceStrong'),
              border: `1px solid ${themeColor(config.theme, 'border')}33`,
              borderRadius: themeRadius(config.theme, 'soft', 16),
            }}
          >
            <div className="anaks-content-blog__body">
              <MetaLine color={muted} config={config}>{publishedDateLabel(post, config)}</MetaLine>
              <h3
                className="anaks-content-blog__card-title"
                style={{
                  color: text,
                  fontFamily: config.theme.fonts.heading,
                  fontSize: 19,
                  letterSpacing: '-0.018em',
                  lineHeight: 1.28,
                  marginTop: 10,
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
              </h3>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PostDocument({
  post,
  posts,
  config,
  listHref,
  hrefForPost,
  hrefForSlug,
  motion,
}: {
  post: PublishedContentPost;
  posts: readonly PublishedContentPost[];
  config: SiteConfig;
  listHref: string;
  hrefForPost: (slug: string) => string;
  hrefForSlug?: (slug: string) => string;
  motion: boolean;
}) {
  const text = config.theme.palette.text;
  const muted = config.theme.palette.muted;
  const accent = blogAccent(config.theme);
  const bandBackground = themeColor(config.theme, 'surfaceSubtle');
  const backLink = pickOutlineColor(bandBackground, blogPrimary(config.theme), config.theme.palette);
  const brandName = tenantBrandName(config);
  // Derived once and shared: the body render skips the blocks the facts box prints, so the two
  // reads have to agree about which indices those are.
  const keyFacts = articleKeyFacts(post.document);
  const highlightIndex = articleHighlightIndex(post.document, keyFacts?.consumed);
  const minutes = articleReadingMinutes(post.document);
  return (
    <>
      <header
        className="anaks-content-blog__band"
        style={{
          background: bandBackground,
          borderBottom: `1px solid ${themeColor(config.theme, 'border')}33`,
          paddingBottom: 0,
        }}
      >
        <div
          className="anaks-content-blog__inner"
          style={{ maxWidth: '68ch', paddingBottom: 'clamp(32px, 4vw, 52px)' }}
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
        </div>
        <CoverHero config={config} post={post} />
        <div
          className="anaks-content-blog__inner"
          style={{ maxWidth: '68ch', paddingTop: 'clamp(32px, 4vw, 52px)' }}
          {...revealProps(motion)}
        >
          <ArticleKicker config={config} post={post} brandName={brandName} minutes={minutes} />
          <h1
            className="anaks-content-blog__title"
            style={{
              color: text,
              fontFamily: config.theme.fonts.heading,
              fontSize: 'clamp(34px, 5.4vw, 58px)',
              letterSpacing: '-0.032em',
              lineHeight: 1.08,
            }}
          >
            {post.title}
          </h1>
          <AccentRule color={accent} />
          <p
            style={{
              color: muted,
              fontFamily: config.theme.fonts.body,
              fontSize: 'clamp(17px, 2vw, 21px)',
              lineHeight: 1.66,
              paddingBottom: 'clamp(40px, 5vw, 64px)',
            }}
          >
            {post.summary}
          </p>
        </div>
      </header>
      {/* `data-m-progress` is the shared runtime's own hook, so the bar below inherits the
          `--scroll-progress` it writes. Progress is measured over the body, which is what a
          reader is actually working through — not the masthead above it. */}
      <article
        className="anaks-content-blog__article"
        {...revealProps(motion)}
        {...(motion ? { 'data-m-progress': '' } : {})}
      >
        {motion ? (
          <div
            className="anaks-content-blog__progress"
            aria-hidden="true"
            style={{ background: accent }}
          />
        ) : null}
        {post.document.blocks.map((block, index) => {
          // Printed inside the key-facts box instead. Skipping here is what keeps the box a
          // *render* of those blocks rather than a second copy of sentences already on the page.
          if (keyFacts?.consumed.has(index)) {
            return index === keyFacts.titleIndex
              ? <KeyFactsBox key={index} config={config} facts={keyFacts} />
              : null;
          }
          if (block.type === 'heading') {
            const Heading = block.level === 2 ? 'h2' : 'h3';
            const heading = (
              <Heading
                style={{
                  color: text,
                  fontFamily: config.theme.fonts.heading,
                  fontSize: block.level === 2 ? 'clamp(25px, 3.2vw, 32px)' : 'clamp(20px, 2.5vw, 25px)',
                  lineHeight: 1.26,
                  letterSpacing: '-0.022em',
                  // A heading belongs to what follows it, so the space above is the larger gap.
                  marginTop: block.level === 2 ? 0 : index === 0 ? 0 : 44,
                  marginBottom: block.level === 2 ? 16 : 12,
                  wordBreak: 'keep-all',
                }}
              >
                {block.text}
              </Heading>
            );
            // The rule above an h2 is the article's one recurring hinge mark, the same device the
            // index uses between a card's title and its summary.
            return block.level === 2 ? (
              <div
                key={index}
                className="anaks-content-blog__h2wrap"
                style={index === 0 ? { marginTop: 0 } : undefined}
              >
                <div
                  aria-hidden="true"
                  style={{ background: accent, borderRadius: 2, height: 3, marginBottom: 18, width: 38 }}
                />
                {heading}
              </div>
            ) : <div key={index}>{heading}</div>;
          }
          if (block.type === 'list') {
            if (!block.ordered) {
              return <Checklist key={index} config={config} items={block.items} />;
            }
            return (
              <ol
                key={index}
                style={{
                  color: text,
                  fontFamily: config.theme.fonts.body,
                  fontSize: 17.5,
                  lineHeight: 1.8,
                  paddingLeft: 22,
                  marginTop: 22,
                }}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`${typeof item === 'string' ? item : item.text}-${itemIndex}`}>
                    {typeof item === 'string' ? item : item.text}
                  </li>
                ))}
              </ol>
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
          // One paragraph carries the section, set in display type. It is promoted in place and
          // printed exactly once — the schema has no pull-quote block, and repeating a hedged
          // clinical sentence as a standalone quote is how a qualified statement becomes a claim.
          if (index === highlightIndex) {
            return (
              <p
                key={index}
                className="anaks-content-blog__quote"
                style={{
                  borderLeft: `4px solid ${accent}`,
                  color: text,
                  fontFamily: config.theme.fonts.heading,
                  fontSize: 'clamp(21px, 2.1vw, 26px)',
                  fontWeight: 600,
                  letterSpacing: '-0.014em',
                  lineHeight: 1.4,
                }}
              >
                {block.text}
              </p>
            );
          }
          return (
            <p
              key={index}
              style={{
                color: text,
                fontFamily: config.theme.fonts.body,
                // The opening paragraph is the standfirst's landing; every other one is body.
                fontSize: index === 0 ? 19 : 17.5,
                lineHeight: index === 0 ? 1.75 : 1.82,
                marginTop: index === 0 ? 0 : 22,
              }}
            >
              {block.text}
            </p>
          );
        })}
      </article>
      <BookingCta config={config} brandName={brandName} hrefForSlug={hrefForSlug} />
      <RelatedPosts
        config={config}
        posts={posts}
        current={post}
        hrefForPost={hrefForPost}
        motion={motion}
      />
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
  // A cover generated for this exact version outranks the service photo rotation: it was made
  // for this article, and the rotation is a stand-in for not having one.
  const storedCover = post.cover?.url;
  const cover = storedCover
    ? null
    : siteId ? postCoverImage({ config, siteId, slug: post.slug }) : null;
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
        {...(storedCover
          ? { imageUrl: storedCover, width: post.cover?.width, height: post.cover?.height }
          : cover ? { imageUrl: coverSrc(cover.url) } : {})}
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
            posts={posts}
            config={renderedConfig}
            listHref={listHref}
            hrefForPost={hrefForPost}
            hrefForSlug={hrefForSlug}
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
