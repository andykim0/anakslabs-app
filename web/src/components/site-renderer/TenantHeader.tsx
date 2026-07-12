/**
 * [v4 Phase 3 · F1] 테넌트 사이트 자동 헤더 내비 — 페이지 목록에서 생성.
 * 순수 컴포넌트(JS 0, 훅 없음) — 서빙(서버)·에디터 프리뷰(클라)·Export 모두 동일 출력.
 *
 * 표시 조건: nav.enabled !== false 이고 내비 노출 페이지(showInNav !== false) ≥ 2.
 * (페이지 1개 사이트는 헤더 미표시 — 기존 단일 페이지 사이트 회귀 0)
 * [F1] 데스크톱은 최대 NAV_MAX_INLINE(6)개 인라인 + 초과분 '더보기' 드롭다운, 모바일은 햄버거.
 *  둘 다 native <details>/<summary>(JS 0) + Tailwind md: 반응형으로 구현(SSR/Export 동일 출력).
 * 링크: navLabel ?? title, href '/'+slug (홈은 '/'), 현재 페이지 강조. theme 폰트/팔레트 적용.
 */
import type { SiteConfig, SitePage } from '@/lib/types/site';

const NAV_MAX_INLINE = 6;

export function TenantHeader({
  config,
  currentSlug,
  /** Export: 링크를 상대 파일명('./about.html')으로 재작성 (홈은 './index.html') */
  hrefForSlug,
}: {
  config: SiteConfig;
  currentSlug: string;
  hrefForSlug?: (slug: string) => string;
}) {
  const navPages = config.pages.filter((p) => p.showInNav !== false);
  const enabled = config.nav?.enabled !== false && navPages.length >= 2;
  if (!enabled) return null;

  const theme = config.theme;
  const siteName = config.businessInfo?.businessName?.trim() || config.meta.title || '';
  const linkFor = (slug: string) => (hrefForSlug ? hrefForSlug(slug) : slug === '' ? '/' : `/${slug}`);
  const labelOf = (p: SitePage) => p.navLabel ?? p.title;

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
    backgroundColor: theme.palette.surface,
    border: `1px solid ${theme.palette.muted}33`,
    borderRadius: theme.radius ?? 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
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
        backgroundColor: theme.palette.surface,
        borderBottom: `1px solid ${theme.palette.muted}22`,
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
          }}
        >
          {siteName}
        </a>

        {/* 데스크톱 내비 (md+) — 인라인 최대 6개 + 초과분 '더보기' 드롭다운 */}
        <nav className="hidden md:flex" style={{ gap: 20, alignItems: 'center' }}>
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
              <summary style={summaryStyle}>더보기 ▾</summary>
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

        {/* 모바일 햄버거 (<md) — 전체 페이지 드롭다운 */}
        <details className="md:hidden" style={{ position: 'relative' }}>
          <summary aria-label="메뉴 열기" style={{ ...summaryStyle, fontSize: 22, lineHeight: 1, color: theme.palette.text }}>
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
