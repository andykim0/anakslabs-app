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

const NAV_MAX_INLINE = 6;
/** Above this many treatment pages the bar stops being readable. */
const NAV_GROUP_THRESHOLD = 3;

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
  const brandLogo = config.pages
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
   * navigation. Past three, treatments collapse under the services index they already belong to.
   * The parent stays a real anchor: a toggle that only toggles is a dead end for anyone who
   * expected the index page.
   */
  const procedurePages = navPages.filter((page) => (
    'sections' in page && page.id.startsWith('clinic-procedure-')
  ));
  const servicesIndex = navPages.find((page) => page.slug === 'services');
  const grouped = procedurePages.length > NAV_GROUP_THRESHOLD;
  const groupedIds = new Set(
    grouped
      ? procedurePages.filter((page) => page !== servicesIndex).map((page) => page.id)
      : [],
  );
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
      style={{
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
