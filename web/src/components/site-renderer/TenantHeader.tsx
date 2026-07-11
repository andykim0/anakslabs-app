/**
 * [v4 Phase 3] 테넌트 사이트 자동 헤더 내비 — 페이지 목록에서 생성.
 * 순수 컴포넌트(JS 0, 훅 없음) — 서빙(서버)·에디터 프리뷰(클라)·Export 모두 동일 출력.
 *
 * 표시 조건: nav.enabled !== false 이고 내비 노출 페이지(showInNav !== false) ≥ 2.
 * (페이지 1개 사이트는 헤더 미표시 — 기존 단일 페이지 사이트 회귀 0)
 * 링크: navLabel ?? title, href '/'+slug (홈은 '/'), 현재 페이지 강조. theme 폰트/팔레트 적용.
 */
import type { SiteConfig } from '@/lib/types/site';

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
          flexWrap: 'wrap',
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
        <nav style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {navPages.map((p) => {
            const active = p.slug === currentSlug;
            return (
              <a
                key={p.id}
                href={linkFor(p.slug)}
                aria-current={active ? 'page' : undefined}
                style={{
                  fontSize: 14,
                  color: active ? theme.palette.primary : theme.palette.muted,
                  fontWeight: active ? 600 : 400,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.navLabel ?? p.title}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
