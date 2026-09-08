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
import {
  chartAxisMax,
  chartFigureDescription,
  chartSourceLine,
  formatChartValue,
} from '@/lib/content-fulfillment/chart-figure';
import type { ContentPostChartBlock } from '@/lib/content-fulfillment/contracts';
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
/* ---- the chart figure ---------------------------------------------------------------------
   The article's only picture, and it is made of the article's own numbers.

   THE TYPE SIZES BELOW ARE SVG USER UNITS, NOT SCREEN PIXELS, AND THAT IS THE WHOLE TRICK. The
   figure is one <svg viewBox="0 0 560 H"> at width:100%, so the browser scales the entire drawing
   by containerWidth/560 — about 1.06 in the 68ch reading column and about 0.64 on a 390px phone.
   Left alone, an 11px label would render at 7px on that phone, which is what a chart drawn once
   and scaled everywhere always does. Restating the sizes larger under the mobile query cancels
   the shrink: 21 user units × 0.64 lands at ~13px on screen, close to the ~15px the same label
   occupies on a desktop. One SVG, one geometry, legible type at both ends.

   No colour appears here. Every fill is an attribute on the element, resolved from the practice's
   own palette, because this stylesheet ships to every generated theme. */
.anaks-content-blog__chart{position:relative;margin:clamp(30px,3.6vw,42px) 0}
.anaks-content-blog__chart-head{display:block;margin-bottom:14px}
.anaks-content-blog__chart svg{display:block;width:100%;max-width:100%;height:auto}
.anaks-content-blog__chart svg text{font-family:inherit}
.anaks-content-blog__chart .c-lab{font-size:14px;letter-spacing:.005em}
.anaks-content-blog__chart .c-val{font-size:18px;font-weight:700;letter-spacing:-0.02em}
.anaks-content-blog__chart .c-big{font-size:38px;font-weight:700;letter-spacing:-0.03em}
.anaks-content-blog__chart .c-idx{font-size:14px;font-weight:700}
.anaks-content-blog__chart .c-tick{font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.anaks-content-blog__chart .c-note{font-size:12px}
.anaks-content-blog__chart-src{margin-top:14px}
/* Redundant in text, and reachable by anything that reads rather than looks. Not display:none —
   that would take the numbers away from a screen reader, which is the one audience the table
   exists for.

   THE CLIP IS ON A WRAPPER, AND THE TABLE IS INSIDE IT. A table element treats width as a
   minimum and grows to its own min-content, so putting this class on the table itself left a
   512px element sticking out of the document — which on a phone made Chrome widen the layout
   viewport to 527px and render the whole article at 74%. Nothing looked broken; every
   measurement was simply wrong. overflow:hidden on an out-of-flow wrapper clips the table
   instead, so it contributes nothing to scrollable overflow. */
.anaks-content-blog__sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);border:0}
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
  .anaks-content-blog__cta{width:min(100% - 32px,68ch)}
  .anaks-content-blog__related{width:min(100% - 32px,680px)}
  .anaks-content-blog__related-grid{grid-template-columns:1fr}
  .anaks-content-blog__chart .c-lab{font-size:21px}
  .anaks-content-blog__chart .c-val{font-size:26px}
  .anaks-content-blog__chart .c-big{font-size:52px}
  .anaks-content-blog__chart .c-idx{font-size:20px}
  .anaks-content-blog__chart .c-tick{font-size:18px}
  .anaks-content-blog__chart .c-note{font-size:18px}
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
 * The blog carries no images, by product decision.
 *
 * There is no `siteId` and no `coverSrc` on this contract any more, and their absence is the
 * feature: both existed only to choose a picture for an article, and an article's only figure is
 * now the chart it draws from its own sourced numbers. The generated-cover pipeline behind
 * `CONTENT_COVER_IMAGES_ENABLED` still stores what it stores — it simply has no reader here.
 */
export interface TenantContentBlogProps {
  config: SiteConfig;
  posts: readonly PublishedContentPost[];
  post?: PublishedContentPost;
  hrefForSlug?: (slug: string) => string;
  hrefForPost?: (slug: string) => string;
  listHref?: string;
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

/* ============================================================================================
   THE CHART FIGURE

   The article's one picture, drawn from the article's own sourced numbers. It replaces the cover
   photograph, and the replacement is the point: a stock photograph of a stranger's mouth says
   nothing about this practice and cannot be checked, whereas a bar carrying a number the honesty
   gate made cite a source is a claim the practice can stand behind.

   Everything is one inline SVG per figure — no chart library, no runtime, no animation, so
   nothing here has a reduced-motion branch to get wrong. The drawing is redundant in text three
   times over: every value is printed on the mark, the whole figure is repeated as a
   visually-hidden data table, and a source line sits underneath naming where the numbers came
   from. A reader who cannot see the bars loses the shape and not one number.
   ============================================================================================ */

/** The SVG coordinate space every figure is drawn in. Scaled to the reading column by CSS. */
const CHART_VIEW_W = 560;
/** Vertical pitch of one wrapped label line, sized for the larger mobile type. */
const CHART_LINE_H = 26;

/**
 * Greedy wrap for a label, measured in characters rather than glyphs.
 *
 * SVG text does not wrap, and a label long enough to run past the viewBox is silently clipped —
 * text lost from the page with no error anywhere. Character budgets are computed from the *mobile*
 * type size, which is the larger of the two in user units, so a line that fits on a phone also
 * fits on a desktop with room to spare. `maxLines` budgets are set above the schema's 80-character
 * ceiling for every kind, so a valid label always fits; the overflow branch exists for the one
 * shape a budget cannot absorb, a single unbroken word.
 */
function wrapChartLabel(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (lines.length === maxLines - 1) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

/** Advance estimate for the mobile type size, used only to decide which side of a bar a value sits on. */
function estimateChartTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}

interface ChartInk {
  /** Bar and node fill. */
  mark: string;
  /** Unfilled remainder of the scale. */
  track: string;
  /** Ink for a value printed on top of a filled bar. */
  onMark: string;
  label: string;
  value: string;
  accentText: string;
}

/**
 * The accessible name and description of one drawing.
 *
 * `<title>` and `<desc>` have to be children of the `<svg>` that carries `role="img"` — the ids
 * exist so `aria-labelledby` can name both in order, which is the pattern that works across
 * engines that ignore a bare `<title>`. The three kind components each build their own viewBox, so
 * the frame travels into them rather than wrapping them.
 */
interface ChartFrame {
  titleId: string;
  descriptionId: string;
  title: string;
  description: string;
}

function chartSvgAria(frame: ChartFrame) {
  return {
    role: 'img',
    'aria-labelledby': `${frame.titleId} ${frame.descriptionId}`,
  } as const;
}

function ChartSvgLabels({ frame }: { frame: ChartFrame }) {
  return (
    <>
      <title id={frame.titleId}>{frame.title}</title>
      <desc id={frame.descriptionId}>{frame.description}</desc>
    </>
  );
}

/**
 * The figure's own data table, hidden from sight and not from anything that reads.
 *
 * This is what makes the chart safe to publish at all: a stored chart is a set of numbers, and a
 * number that exists only as a rectangle is a number a screen reader, a text-only browser, an
 * assistant and a copy-paste all lose. It carries exactly the stored values, in stored order.
 */
function ChartDataTable({
  block,
  config,
}: {
  block: ContentPostChartBlock;
  config: SiteConfig;
}) {
  const hasNotes = block.items.some((item) => item.note);
  const isSteps = block.kind === 'steps';
  return (
    <div className="anaks-content-blog__sr">
      <table>
      <caption>
        {block.unit ? `${block.title} (${block.unit})` : block.title}
      </caption>
      <thead>
        <tr>
          {isSteps ? <th scope="col">Step</th> : null}
          <th scope="col">{isSteps ? 'What happens' : 'Label'}</th>
          <th scope="col">{block.unit ? `Value in ${block.unit}` : 'Value'}</th>
          {hasNotes ? <th scope="col">Note</th> : null}
        </tr>
      </thead>
      <tbody>
        {block.items.map((item, index) => (
          <tr key={`${item.label}-${index}`}>
            {isSteps ? <th scope="row">{index + 1}</th> : null}
            {isSteps ? <td>{item.label}</td> : <th scope="row">{item.label}</th>}
            <td>{formatChartValue(item.value, block.unit)}</td>
            {hasNotes ? <td>{item.note ?? ''}</td> : null}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={(isSteps ? 3 : 2) + (hasNotes ? 1 : 0)}>
            {block.caption ?? `Figure published by ${tenantBrandName(config)}.`}
          </td>
        </tr>
      </tfoot>
      </table>
    </div>
  );
}

/** Horizontal bars on one zero-based scale — the reference shape, and the default. */
function ChartBars({
  block,
  ink,
  axisMax,
  frame,
}: {
  block: ContentPostChartBlock;
  ink: ChartInk;
  axisMax: number;
  frame: ChartFrame;
}) {
  const hasNotes = block.items.some((item) => item.note);
  const wrapped = block.items.map((item) => wrapChartLabel(item.label, 50, 2));
  const labelLines = Math.max(...wrapped.map((lines) => lines.length));
  const labelBlock = labelLines * CHART_LINE_H;
  const barOffset = labelBlock + 8;
  // The trailing gap is what separates one bar from the *next* row's label, and it is sized for
  // the mobile type: those labels are 21 user units rather than 14, so a gap tuned on a desktop
  // render closes up to nothing on a phone and the chart reads as one striped block.
  const pitch = barOffset + 18 + (hasNotes ? 52 : 34);
  const rowTop = (index: number) => 4 + pitch * index;
  const lastBarY = rowTop(block.items.length - 1) + barOffset;
  const axisY = lastBarY + 38;
  const tickY = axisY + 20;
  const axisLabel = formatChartValue(axisMax, block.unit);
  return (
    <svg
      viewBox={`0 0 ${CHART_VIEW_W} ${tickY + 8}`}
      xmlns="http://www.w3.org/2000/svg"
      {...chartSvgAria(frame)}
    >
      <ChartSvgLabels frame={frame} />
      {block.items.map((item, index) => {
        const top = rowTop(index);
        const barY = top + barOffset;
        const fillWidth = Math.max(2, (item.value / axisMax) * CHART_VIEW_W);
        const printed = formatChartValue(item.value, block.unit);
        const estimated = estimateChartTextWidth(printed, 26);
        const inside = fillWidth >= estimated + 28;
        return (
          <g key={`${item.label}-${index}`}>
            {/* Bottom-aligned inside the shared label block. Every row reserves the height of
                the tallest label in the figure, so a top-aligned single-line label would float
                a full line above its own bar while a wrapped one sat right on top of it — the
                same figure, two different rhythms. */}
            {wrapped[index]!.map((line, lineIndex) => (
              <text
                key={lineIndex}
                className="c-lab"
                x={0}
                y={top + 18 + (labelLines - wrapped[index]!.length + lineIndex) * CHART_LINE_H}
                fill={ink.label}
              >
                {line}
              </text>
            ))}
            <rect x={0} y={barY} width={CHART_VIEW_W} height={18} rx={9} fill={ink.track} />
            <rect x={0} y={barY} width={fillWidth} height={18} rx={9} fill={ink.mark} />
            <text
              className="c-val"
              x={inside ? fillWidth - 12 : Math.min(fillWidth + 12, CHART_VIEW_W - estimated)}
              y={barY + 14}
              textAnchor={inside ? 'end' : 'start'}
              fill={inside ? ink.onMark : ink.value}
            >
              {printed}
            </text>
            {item.note ? (
              <text className="c-note" x={0} y={barY + 40} fill={ink.label}>{item.note}</text>
            ) : null}
          </g>
        );
      })}
      {/* The scale, printed. It starts at zero and says where it ends — a bar chart whose
          baseline is not zero exaggerates every difference drawn on it. */}
      <line x1={0} y1={axisY} x2={CHART_VIEW_W} y2={axisY} stroke={ink.track} strokeWidth={1.5} />
      <text className="c-tick" x={0} y={tickY} fill={ink.label}>0</text>
      <text className="c-tick" x={CHART_VIEW_W} y={tickY} textAnchor="end" fill={ink.label}>
        {axisLabel}
      </text>
    </svg>
  );
}

/** Exactly two values set against each other, each printed at display size above its own bar. */
function ChartCompare({
  block,
  ink,
  axisMax,
  frame,
}: {
  block: ContentPostChartBlock;
  ink: ChartInk;
  axisMax: number;
  frame: ChartFrame;
}) {
  const hasNotes = block.items.some((item) => item.note);
  const gap = 28;
  const columnWidth = (CHART_VIEW_W - gap) / 2;
  const wrapped = block.items.map((item) => wrapChartLabel(item.label, 24, 4));
  const labelLines = Math.max(...wrapped.map((lines) => lines.length));
  const barY = 78 + (labelLines - 1) * CHART_LINE_H + 14;
  const axisY = barY + 18 + (hasNotes ? 44 : 16);
  const tickY = axisY + 20;
  return (
    <svg
      viewBox={`0 0 ${CHART_VIEW_W} ${tickY + 8}`}
      xmlns="http://www.w3.org/2000/svg"
      {...chartSvgAria(frame)}
    >
      <ChartSvgLabels frame={frame} />
      {block.items.map((item, index) => {
        const x = index * (columnWidth + gap);
        const fillWidth = Math.max(2, (item.value / axisMax) * columnWidth);
        return (
          <g key={`${item.label}-${index}`}>
            <text
              className="c-big"
              x={x}
              y={54}
              fill={index === 0 ? ink.accentText : ink.value}
            >
              {formatChartValue(item.value, block.unit)}
            </text>
            {wrapped[index]!.map((line, lineIndex) => (
              <text
                key={lineIndex}
                className="c-lab"
                x={x}
                y={78 + lineIndex * CHART_LINE_H}
                fill={ink.label}
              >
                {line}
              </text>
            ))}
            <rect x={x} y={barY} width={columnWidth} height={18} rx={9} fill={ink.track} />
            {/* Both bars are the practice's accent; the second is drawn back so the pair reads as
                one comparison rather than two unrelated colours. */}
            <rect
              x={x}
              y={barY}
              width={fillWidth}
              height={18}
              rx={9}
              fill={ink.mark}
              fillOpacity={index === 0 ? 1 : 0.45}
            />
            {item.note ? (
              <text className="c-note" x={x} y={barY + 40} fill={ink.label}>{item.note}</text>
            ) : null}
          </g>
        );
      })}
      <line x1={0} y1={axisY} x2={CHART_VIEW_W} y2={axisY} stroke={ink.track} strokeWidth={1.5} />
      <text className="c-tick" x={0} y={tickY} fill={ink.label}>0</text>
      <text className="c-tick" x={CHART_VIEW_W} y={tickY} textAnchor="end" fill={ink.label}>
        {`${formatChartValue(axisMax, block.unit)} · same scale`}
      </text>
    </svg>
  );
}

/** An ordered sequence, each step carrying its own duration or count. */
function ChartSteps({
  block,
  ink,
  frame,
}: {
  block: ContentPostChartBlock;
  ink: ChartInk;
  frame: ChartFrame;
}) {
  const hasNotes = block.items.some((item) => item.note);
  const wrapped = block.items.map((item) => wrapChartLabel(item.label, 33, 3));
  const labelLines = Math.max(...wrapped.map((lines) => lines.length));
  const labelBlock = labelLines * CHART_LINE_H;
  const pitch = 22 + labelBlock + (hasNotes ? 46 : 18);
  const rowTop = (index: number) => 2 + pitch * index;
  const lastTop = rowTop(block.items.length - 1);
  const height = lastTop + 22 + labelBlock + (hasNotes ? 34 : 12);
  return (
    <svg
      viewBox={`0 0 ${CHART_VIEW_W} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      {...chartSvgAria(frame)}
    >
      <ChartSvgLabels frame={frame} />
      {/* The rail is drawn first so every node sits on top of it. */}
      <line
        x1={16}
        y1={rowTop(0) + 16}
        x2={16}
        y2={lastTop + 16}
        stroke={ink.track}
        strokeWidth={2}
      />
      {block.items.map((item, index) => {
        const top = rowTop(index);
        return (
          <g key={`${item.label}-${index}`}>
            <circle cx={16} cy={top + 16} r={15} fill={ink.mark} />
            <text className="c-idx" x={16} y={top + 21} textAnchor="middle" fill={ink.onMark}>
              {index + 1}
            </text>
            {wrapped[index]!.map((line, lineIndex) => (
              <text
                key={lineIndex}
                className="c-lab"
                x={44}
                y={top + 20 + lineIndex * CHART_LINE_H}
                fill={ink.label}
              >
                {line}
              </text>
            ))}
            <text
              className="c-val"
              x={CHART_VIEW_W}
              y={top + 20}
              textAnchor="end"
              fill={ink.value}
            >
              {formatChartValue(item.value, block.unit)}
            </text>
            {item.note ? (
              <text
                className="c-note"
                x={44}
                y={top + 24 + labelBlock}
                fill={ink.label}
              >
                {item.note}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * One stored `chart` block, rendered.
 *
 * `role="img"` with `<title>` and `<desc>` names the drawing without pretending to narrate it: the
 * description says what shape the marks are in and where the scale runs, and then points at the
 * table, which is where the numbers actually live for anything that reads.
 */
function ChartFigure({
  block,
  config,
  post,
  index,
}: {
  block: ContentPostChartBlock;
  config: SiteConfig;
  post: PublishedContentPost;
  index: number;
}) {
  const accent = blogAccent(config.theme);
  const surface = themeColor(config.theme, 'surfaceSubtle');
  const ink: ChartInk = {
    mark: accent,
    track: `${themeColor(config.theme, 'border')}3D`,
    onMark: pickButtonTextColor(accent, config.theme.palette),
    label: config.theme.palette.muted,
    value: config.theme.palette.text,
    accentText: pickOutlineColor(surface, accent, config.theme.palette),
  };
  const axisMax = chartAxisMax(block.items.map((item) => item.value), block.unit);
  const titleId = `anaks-chart-${index}-title`;
  const descriptionId = `anaks-chart-${index}-desc`;
  const frame: ChartFrame = {
    titleId,
    descriptionId,
    title: block.unit ? `${block.title} (${block.unit})` : block.title,
    description: chartFigureDescription(block),
  };
  const source = chartSourceLine({
    sourceRefs: block.sourceRefs,
    snapshot: post.integrity?.sourceSnapshot ?? null,
    brandName: tenantBrandName(config),
  });
  return (
    <figure
      className="anaks-content-blog__chart"
      style={{ fontFamily: config.theme.fonts.body }}
    >
      <figcaption className="anaks-content-blog__chart-head">
        <span
          style={{
            color: config.theme.palette.text,
            display: 'block',
            fontFamily: config.theme.fonts.heading,
            fontSize: 'clamp(16px, 1.9vw, 18px)',
            fontWeight: 600,
            letterSpacing: '-0.012em',
            lineHeight: 1.35,
          }}
        >
          {block.title}
        </span>
        {block.unit ? (
          <span
            style={{
              color: config.theme.palette.muted,
              display: 'block',
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: '0.1em',
              marginTop: 6,
              textTransform: 'uppercase',
            }}
          >
            {/* The unit, and for the two kinds that share one axis, where that axis ends. A
                reader who knows the ceiling can read a bar; one who does not is looking at a
                shape. `steps` prints no ceiling because it has no shared scale to state. */}
            {block.kind === 'steps'
              ? block.unit
              : `${block.unit} · scale 0 to ${formatChartValue(axisMax)}`}
          </span>
        ) : null}
      </figcaption>
      {block.kind === 'compare' ? (
        <ChartCompare block={block} ink={ink} axisMax={axisMax} frame={frame} />
      ) : block.kind === 'steps' ? (
        <ChartSteps block={block} ink={ink} frame={frame} />
      ) : (
        <ChartBars block={block} ink={ink} axisMax={axisMax} frame={frame} />
      )}
      <ChartDataTable block={block} config={config} />
      <p
        className="anaks-content-blog__chart-src"
        style={{
          color: config.theme.palette.muted,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {source.lead}
        {source.citations.map((citation, citationIndex) => (
          <span key={citation.label}>
            {citationIndex === 0 ? ' ' : ' · '}
            {citation.href ? (
              <a
                href={citation.href}
                rel="noopener noreferrer nofollow"
                style={{ color: 'inherit' }}
              >
                {citation.label}
              </a>
            ) : citation.label}
          </span>
        ))}
        {block.caption ? ` ${block.caption}` : ''}
      </p>
    </figure>
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
        {/*
          One block, not two. The back-link and the kicker used to sit either side of a 21:9 cover
          slot and each carried half the gap that surrounded it; with the cover gone those two
          paddings met and left ~100px of nothing between a link and a date line.
        */}
        <div
          className="anaks-content-blog__inner"
          style={{ maxWidth: '68ch' }}
          {...revealProps(motion)}
        >
          <a
            href={listHref}
            style={{
              color: backLink,
              display: 'inline-block',
              fontFamily: config.theme.fonts.body,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.06em',
              marginBottom: 'clamp(28px, 3.4vw, 44px)',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}
          >
            ← Back to the blog
          </a>
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
          if (block.type === 'chart') {
            return (
              <ChartFigure
                key={index}
                block={block}
                config={config}
                post={post}
                index={index}
              />
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

/**
 * One card in the index: a date, a title, a rule and the stored summary. Nothing else.
 *
 * It used to open with a picture slot — a rotating stock photograph of a declared service, or a
 * gradient field when there was none. Both are gone. A field of colour above every card was only
 * ever a way of not leaving a hole where a photograph should be, and a page that has decided it
 * carries no photographs has no hole to fill.
 */
function PostCard({
  post,
  config,
  hrefForPost,
  feature = false,
  motion,
}: {
  post: PublishedContentPost;
  config: SiteConfig;
  hrefForPost: (slug: string) => string;
  feature?: boolean;
  motion: boolean;
}) {
  const { text, muted } = config.theme.palette;
  const accent = blogAccent(config.theme);
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
  hrefForPost,
  motion,
}: {
  posts: readonly PublishedContentPost[];
  config: SiteConfig;
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
