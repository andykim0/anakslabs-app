/**
 * [v4 Phase 3 · F1] 테넌트 사이트 자동 헤더 내비 — 페이지 목록에서 생성.
 * 순수 컴포넌트(JS 0, 훅 없음) — 서빙(서버)·에디터 프리뷰(클라)·Export 모두 동일 출력.
 *
 * 표시 조건: nav.enabled !== false 이고 내비 노출 페이지(showInNav !== false) ≥ 2.
 * (페이지 1개 사이트는 헤더 미표시 — 기존 단일 페이지 사이트 회귀 0)
 * [F1] 데스크톱은 최대 NAV_MAX_INLINE(6)개 인라인 + 초과분 '더보기' 드롭다운, 모바일은 햄버거.
 *  둘 다 native <details>/<summary>(JS 0) + Tailwind xl: 반응형으로 구현(SSR/Export 동일 출력).
 * 링크: navLabel ?? title, href '/'+slug (홈은 '/'), 현재 페이지 강조. theme 폰트/팔레트 적용.
 */
import type { SiteConfig, SitePage } from '@/lib/types/site';
import { themeColor, themeRadius } from '@/lib/design/site-theme-tokens';
import { marqueeIsActive, marqueeRootStyle } from './ClinicMarquee';
import { ledgerIsActive, ledgerRootStyle } from './ClinicLedger';

/** Link slots the 1200px bar seats before it stops being a bar. */
const NAV_MAX_INLINE = 6;
/** A disclosure that hides one link is not a menu; below this the treatment stays in the bar. */
const NAV_GROUP_MIN_COLLAPSED = 2;

export interface TenantNavigationItem {
  id: string;
  slug: string;
  title: string;
  navLabel?: string;
}

/**
 * [T1] 브랜드 라벨 = 상호만 — meta.title의 '— 업종 · 지역' 부제는 제거(모바일 잘림 원인).
 * 헤더 외에 블로그 고지 문구도 같은 이름을 불러야 하므로 규칙을 한 곳에 둔다.
 */
export function tenantBrandName(config: SiteConfig): string {
  const rawName = config.businessInfo?.businessName?.trim() || config.meta.title || '';
  return rawName.split('—')[0].trim() || rawName;
}

export function TenantHeader({
  config,
  currentSlug,
  /** Export: 링크를 상대 파일명('./about.html')으로 재작성 (홈은 './index.html') */
  hrefForSlug,
  /** 별도 published 레코드가 실제 존재할 때만 파생되는 내비 항목. */
  additionalItems,
}: {
  config: SiteConfig;
  currentSlug: string;
  hrefForSlug?: (slug: string) => string;
  additionalItems?: readonly TenantNavigationItem[];
}) {
  const navPages: (SitePage | TenantNavigationItem)[] = additionalItems?.length
    ? [...config.pages.filter((p) => p.showInNav !== false), ...additionalItems]
    : config.pages.filter((p) => p.showInNav !== false);
  const enabled = config.nav?.enabled !== false && navPages.length >= 2;
  if (!enabled) return null;

  const theme = config.theme;
  const siteName = tenantBrandName(config);
  /**
   * THE US DEMO HEADER SHOWS THE PRACTICE'S NAME, NOT ITS LOGO FILE.
   *
   * A prospect's own wordmark is the right thing to show and the wrong thing to guarantee. The
   * mark is a URL on their site: we never fetch its bytes (source-images.ts:446,508 — deliberate,
   * a demo must not hot-link-load a prospect's assets at compile time), so at the moment the
   * header is built its ink is unknown. Brentwood's header shipped blank because
   * Logo-Original-Smile-300x97.png is a white wordmark on transparent, sitting on a #F2F2F2 bar.
   *
   * MEASURED, once, offline, across all seven corpora, precisely so this rule is not a guess.
   * Mean ink luminance of the chosen mark against the #F2F2F2 header surface:
   *
   *   cameods          no mark found      (already text)
   *   enameldentistry  no mark found      (already text)
   *   iddental         0.054   9.04:1     legible
   *   apaaesthetic     0.009  15.80:1     legible
   *   oradentistry     0.305   2.64:1     below 3:1
   *   originalsmile    1.000   1.12:1     invisible
   *   dental360        —       —          logo-web.png does not decode: sharp refuses it and
   *                                       Chrome loads it to naturalWidth 0, so the header was
   *                                       drawing a broken image, not a mark
   *
   * THREE of the five marks that exist fail, and NOTHING in the filename or alt separates them
   * from the two that pass: the invisible one (Brentwood) carries no hint at all, while the
   * marginal one (Ora) is `ora-logo-big-footer.png`, whose "footer" token is the hint
   * SECONDARY_LOGO_RE uses to DE-prioritise a mark. A filename rule would have to demote the one
   * that renders and keep the one that does not.
   *
   * A neutral chip was the other candidate and fails on the same undecidability: Brentwood's
   * white ink needs a dark chip, iddental's and apa's near-black ink needs a light one, and
   * picking per-practice needs exactly the luminance we cannot have. One chip colour cannot serve
   * both, so it would trade one blank header for two.
   *
   * The name is decidable for 7 of 7, and it is the practice's actual name since the name repair
   * (`tenantBrandName`). So the demo header renders it alone.
   *
   * WHAT THIS COSTS, said plainly: iddental and apa have marks that render well, and they lose
   * them. That is the trade — two headers that were fine become plain, so that three that were
   * blank, broken or barely there become readable. The alternative buys those two back only by
   * keeping a coin flip on every practice we have not measured, which is every practice that is
   * not one of these seven.
   *
   * SCOPE is both US clinic surfaces, because both build a header from a prospect's crawled mark
   * and neither can see it: `compileUsMedicalFullPreview` and clinic-engine's
   * `compileRobustClinicArtifact` under US_MEDICAL_OUTREACH_PROFILE, which is what the
   * locale/jurisdiction pair identifies. A ko-KR clinic-route header sets neither and is
   * untouched, as are all non-clinic tenant sites.
   *
   * The logo element itself stays in the SiteConfig untouched — same selection rule, same
   * `assetRefs`, same audit — so nothing downstream loses sight of which mark the practice uses.
   */
  const isUsMedicalDemo = config.meta.locale === 'en-US' && config.meta.jurisdiction === 'US';
  const brandLogo = isUsMedicalDemo
    ? undefined
    : config.pages
      .flatMap((page) => page.sections)
      .flatMap((section) => section.elements)
      .find((element) => (
        element.kind === 'image'
        && element.id.startsWith('clinic-route-brand-logo-')
      ));
  const linkFor = (slug: string) => (hrefForSlug ? hrefForSlug(slug) : slug === '' ? '/' : `/${slug}`);
  const labelOf = (p: SitePage | TenantNavigationItem) => p.navLabel ?? p.title;

  /**
   * A rebuild of a real practice produces one page per treatment, and a flat bar of twelve is not
   * navigation — but collapsing all twelve was worse. Every demo we sent showed a practice
   * "Home | Contact | Treatments ▾": the pages the rebuild exists to show off were, without
   * exception, behind a toggle nobody opens. Treatments now hold their place in the bar in source
   * order and only the ones the bar has no room for collapse. The parent stays a real anchor: a
   * toggle that only toggles is a dead end for anyone who expected the index page.
   *
   * The budget is spent on treatments because the rest of the bar is the site's spine — Home,
   * Contact, a services index — and dropping those into a disclosure is never the right trade.
   * One slot is reserved for the disclosure itself.
   */
  const procedurePages = navPages.filter((page) => (
    'sections' in page && page.id.startsWith('clinic-procedure-')
  ));
  const servicesIndex = navPages.find((page) => page.slug === 'services');
  const collapsible = procedurePages.filter((page) => page !== servicesIndex);
  const inlineProcedureBudget = Math.max(
    0,
    NAV_MAX_INLINE - (navPages.length - collapsible.length) - 1,
  );
  const collapsed = collapsible.slice(inlineProcedureBudget);
  const grouped = collapsed.length >= NAV_GROUP_MIN_COLLAPSED;
  const groupedIds = new Set(grouped ? collapsed.map((page) => page.id) : []);
  const topLevel = navPages.filter((page) => !groupedIds.has(page.id));
  const groupItems = navPages.filter((page) => groupedIds.has(page.id));
  const inline = topLevel.slice(0, NAV_MAX_INLINE);
  const overflow = topLevel.slice(NAV_MAX_INLINE);
  // Without a real index there is no page to send anyone to, so no parent anchor is invented;
  // the disclosure stands on its own and says what it opens.
  const groupHref = servicesIndex ? linkFor(servicesIndex.slug) : undefined;

  const linkStyle = (active: boolean) => ({
    fontSize: 14,
    color: active ? theme.palette.primary : theme.palette.muted,
    fontWeight: active ? 600 : 400,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  });
  // 드롭다운(더보기/햄버거) 패널 공통 스타일
  const panelStyle = {
    position: 'absolute' as const,
    right: 0,
    top: '100%',
    marginTop: 8,
    minWidth: 176,
    backgroundColor: themeColor(theme, 'surfaceStrong'),
    border: theme.tokens
      ? `1px solid ${themeColor(theme, 'border')}`
      : `1px solid ${theme.palette.muted}33`,
    borderRadius: theme.tokens ? themeRadius(theme, 'soft', 6) : (theme.radius ?? 6),
    boxShadow: theme.tokens?.shadow.medium ?? '0 8px 24px rgba(0,0,0,0.18)',
    padding: '6px 0',
    zIndex: 60,
  };
  const panelLinkStyle = (active: boolean) => ({
    display: 'block',
    padding: '9px 16px',
    fontSize: 14,
    color: active ? theme.palette.primary : theme.palette.text,
    fontWeight: active ? 600 : 400,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  });
  const summaryStyle = {
    listStyle: 'none' as const,
    cursor: 'pointer',
    fontSize: 14,
    color: theme.palette.muted,
    userSelect: 'none' as const,
  };

  return (
    <>
      {/*
       * These rules exist because the header does, so they ship with it rather than with every
       * site. A published tenant has no chrome above the header and both offsets stay zero; the
       * preview surface reports the height of its own sticky notice, so the header stops below it
       * instead of behind it. Anchor targets clear both, otherwise a jump lands under the header.
       */}
      <style>{`
.anaks-site { --anaks-chrome-offset: 0px; --anaks-header-offset: 0px; }
.anaks-site [data-anchor] {
  scroll-margin-top: calc(var(--anaks-chrome-offset) + var(--anaks-header-offset) + 12px);
}
.anaks-tenant-header a:focus-visible,
.anaks-tenant-header summary:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
  border-radius: 4px;
}
`}</style>
      {/*
       * details/summary already gives a keyboard-operable disclosure with no JavaScript, and it
       * is what Export and the static render ship. This adds only what the element lacks:
       * aria-expanded mirroring its open state, Escape to close, and focus returning to the
       * summary that opened it. Focus is never trapped — the menu is a disclosure, not a dialog,
       * and trapping would strand anyone who opened it by accident.
       */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var g=document.querySelectorAll('[data-clinic-nav-group]');`
            + `if(!g.length)return;g.forEach(function(d){var s=d.querySelector('summary');`
            + `if(!s)return;s.setAttribute('aria-expanded',d.open?'true':'false');`
            + `d.addEventListener('toggle',function(){s.setAttribute('aria-expanded',d.open?'true':'false');});`
            + `d.addEventListener('keydown',function(e){if(e.key==='Escape'&&d.open){`
            + `d.open=false;s.focus();e.stopPropagation();}});});})();`,
        }}
      />
    <header
      className="anaks-tenant-header"
      {...(config.clinicMaster?.designLanguage
        ? { 'data-clinic-design-language': config.clinicMaster.designLanguage }
        : {})}
      style={{
        /**
         * MARQUEE's variables are set on the .anaks-site root, and this header renders outside it
         * — the same reason the utility strip carries its own. Absent the stored field this
         * spreads nothing and every byte below is untouched, which the rendered-HTML gate proves.
         */
        ...(marqueeIsActive(config) && config.clinicMaster
          ? marqueeRootStyle(config.clinicMaster)
          : {}),
        ...(ledgerIsActive(config) && config.clinicMaster
          ? ledgerRootStyle(config.clinicMaster)
          : {}),
        position: 'sticky',
        // Zero on a published site; the preview surface reports the height of its own sticky
        // notice so the header stops below it instead of scrolling underneath it.
        top: 'var(--anaks-chrome-offset, 0px)',
        zIndex: 50,
        backgroundColor: themeColor(theme, 'surfaceSubtle'),
        borderBottom: theme.tokens
          ? `1px solid ${themeColor(theme, 'border')}`
          : `1px solid ${theme.palette.muted}22`,
        fontFamily: theme.fonts.body,
        backdropFilter: 'saturate(1.2)',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 24px',
        }}
      >
        <a
          href={linkFor('')}
          style={{
            ...(brandLogo ? { display: 'flex', alignItems: 'center', gap: 10 } : {}),
            fontFamily: theme.fonts.heading,
            fontWeight: 600,
            fontSize: 18,
            color: theme.palette.text,
            textDecoration: 'none',
            marginRight: 'auto',
            whiteSpace: 'nowrap',
            // [T1] 긴 상호가 내비·햄버거를 밀어내지 않게 — 잘림은 말줄임으로
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            flex: '0 1 auto',
          }}
        >
          {brandLogo?.kind === 'image' ? (
            <>
              {/* Source logo stays a normal image contract; clinic-route alone emits this pin. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brandLogo.src}
                alt=""
                aria-hidden="true"
                loading="eager"
                decoding="async"
                style={{
                  display: 'block',
                  width: 'auto',
                  maxWidth: 144,
                  height: 32,
                  objectFit: 'contain',
                  flexShrink: 0,
                }}
              />
              <span>{siteName}</span>
            </>
          ) : siteName}
        </a>

        {/* 데스크톱 내비 (xl+) — 인라인 최대 6개 + 초과분 '더보기' 드롭다운 */}
        <nav className="hidden xl:flex" style={{ gap: 20, alignItems: 'center', flexShrink: 0 }}>
          {inline.map((p) => (
            <a
              key={p.id}
              href={linkFor(p.slug)}
              aria-current={p.slug === currentSlug ? 'page' : undefined}
              style={linkStyle(p.slug === currentSlug)}
            >
              {labelOf(p)}
            </a>
          ))}
          {grouped && groupItems.length > 0 && (
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {/* The index page keeps its own anchor; the button only opens the list. */}
              {groupHref && (
                <a href={groupHref} style={linkStyle(currentSlug === 'services')}>Services</a>
              )}
              <details data-clinic-nav-group style={{ position: 'relative' }}>
                <summary
                  aria-label="Show all treatments"
                  style={{ ...summaryStyle, ...(groupHref ? { fontSize: 12 } : {}) }}
                >
                  {groupHref ? '▾' : 'Treatments ▾'}
                </summary>
                <div style={panelStyle}>
                  {groupItems.map((p) => (
                    <a
                      key={p.id}
                      href={linkFor(p.slug)}
                      aria-current={p.slug === currentSlug ? 'page' : undefined}
                      style={panelLinkStyle(p.slug === currentSlug)}
                    >
                      {labelOf(p)}
                    </a>
                  ))}
                </div>
              </details>
            </span>
          )}
          {overflow.length > 0 && (
            <details data-clinic-nav-group style={{ position: 'relative' }}>
              <summary style={summaryStyle}>
                More ▾
              </summary>
              <div style={panelStyle}>
                {overflow.map((p) => (
                  <a
                    key={p.id}
                    href={linkFor(p.slug)}
                    aria-current={p.slug === currentSlug ? 'page' : undefined}
                    style={panelLinkStyle(p.slug === currentSlug)}
                  >
                    {labelOf(p)}
                  </a>
                ))}
              </div>
            </details>
          )}
        </nav>

        {/* 축소/모바일 햄버거 (<xl) — 전체 페이지 드롭다운 */}
        <details className="xl:hidden" style={{ position: 'relative', flexShrink: 0 }}>
          <summary
            aria-label="Open menu"
            style={{ ...summaryStyle, fontSize: 22, lineHeight: 1, color: theme.palette.text }}
          >
            ☰
          </summary>
          <div style={panelStyle}>
            {topLevel.map((p) => (
              <a
                key={p.id}
                href={linkFor(p.slug)}
                aria-current={p.slug === currentSlug ? 'page' : undefined}
                style={panelLinkStyle(p.slug === currentSlug)}
              >
                {labelOf(p)}
              </a>
            ))}
            {grouped && groupItems.length > 0 && (
              <details data-clinic-nav-group>
                <summary style={{ ...summaryStyle, padding: '9px 16px' }}>
                  All treatments ▾
                </summary>
                {groupItems.map((p) => (
                  <a
                    key={p.id}
                    href={linkFor(p.slug)}
                    aria-current={p.slug === currentSlug ? 'page' : undefined}
                    style={{ ...panelLinkStyle(p.slug === currentSlug), paddingLeft: 28 }}
                  >
                    {labelOf(p)}
                  </a>
                ))}
              </details>
            )}
          </div>
        </details>
      </div>
    </header>
    </>
  );
}
