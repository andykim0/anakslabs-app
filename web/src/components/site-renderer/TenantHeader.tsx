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

export interface TenantNavigationItem {
  id: string;
  slug: string;
  title: string;
  navLabel?: string;
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
  // [T1] 브랜드 라벨 = 상호만 — meta.title의 '— 업종 · 지역' 부제는 헤더에서 제거(모바일 잘림 원인).
  //      상호는 truncate(ellipsis)로 내비/햄버거 공간을 절대 침범하지 않는다.
  const rawName = config.businessInfo?.businessName?.trim() || config.meta.title || '';
  const siteName = rawName.split('—')[0].trim() || rawName;
  const englishNavigation = config.meta.locale === 'en-US';
  const linkFor = (slug: string) => (hrefForSlug ? hrefForSlug(slug) : slug === '' ? '/' : `/${slug}`);
  const labelOf = (p: SitePage | TenantNavigationItem) => p.navLabel ?? p.title;

  const inline = navPages.slice(0, NAV_MAX_INLINE);
  const overflow = navPages.slice(NAV_MAX_INLINE);

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
    <header
      className="anaks-tenant-header"
      style={{
        position: 'sticky',
        top: 0,
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
          {siteName}
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
          {overflow.length > 0 && (
            <details style={{ position: 'relative' }}>
              <summary style={summaryStyle}>
                {englishNavigation ? 'More' : '더보기'} ▾
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
            aria-label={englishNavigation ? 'Open menu' : '메뉴 열기'}
            style={{ ...summaryStyle, fontSize: 22, lineHeight: 1, color: theme.palette.text }}
          >
            ☰
          </summary>
          <div style={panelStyle}>
            {navPages.map((p) => (
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
      </div>
    </header>
  );
}
