/**
 * [§5] SiteRenderer → 완전한 정적 HTML 문서 문자열.
 *
 * renderToStaticMarkup으로 발행본을 직렬화한다. SiteRenderer는 순수 서버 컴포넌트
 * (async/hook 없음)라 그대로 직렬화 가능. 렌더 결과에는 폰트 <link>·BASE_CSS <style>·
 * `.anaks-site` div가 포함된다(SiteRenderer.tsx 참고).
 *
 * 정적 문서는 Tailwind를 로드하지 않으므로 렌더러가 auto 모드 전환에 쓰는 2클래스
 * (`hidden`/`md:block`/`md:hidden`)만 미니 CSS로 인라인한다. Tailwind 전체는 불필요.
 */
import 'server-only';
import { createElement } from 'react';
// App Router는 `react-dom/server`(node) 직접 import를 금지 → edge 빌드 사용.
// renderToStaticMarkup은 동기·환경중립이라 Node 런타임 라우트에서도 동작.
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { SiteConfig } from '@/lib/types/site';
import { findPage } from '@/lib/types/site';
import { SiteRenderer, TenantHeader } from '@/components/site-renderer';

/** 렌더러 auto 모드 반응형 전환 + 최소 리셋 (Tailwind 없이 동작) */
const BASE_DOC_CSS = [
  '*{margin:0;padding:0;box-sizing:border-box}',
  'html{-webkit-text-size-adjust:100%}',
  'body{min-height:100dvh}',
  'img,video{max-width:100%}',
  '.hidden{display:none}',
  '@media(min-width:768px){.md\\:block{display:block}.md\\:hidden{display:none}}',
].join('');

/** CDN 폰트 <link>(구글폰트/제이에스딜리버 Pretendard)와 preconnect 제거 — 셀프호스트 시 */
const CDN_FONT_LINK_RE =
  /<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard)[^>]*>/gi;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface RenderDocumentOptions {
  config: SiteConfig;
  /** [v4] 렌더할 페이지 slug (기본 '' = 홈). 없는 slug면 홈으로 폴백 */
  pageSlug?: string;
  /**
   * [v4] 헤더 내비 링크 href 매핑 — 정적 번들은 파일 간 상대 링크가 필요.
   * 예) (slug) => slug === '' ? './index.html' : `./${slug}.html`
   * 없으면 헤더 미렌더(단일 페이지 export 하위호환).
   */
  navHrefForSlug?: (slug: string) => string;
  /** 셀프호스트 @font-face CSS. 있으면 <head>에 인라인 + 본문 CDN 폰트 링크 제거 */
  fontFaceCss?: string;
  /** <head>에 추가할 원시 HTML (예: 셀프호스트 자산 preload) */
  headExtraHtml?: string;
  /** </body> 직전에 붙일 HTML (§6 법적 푸터·페이지 링크) */
  bodyAppendHtml?: string;
  /** 언어 속성 (기본 ko) */
  lang?: string;
}

/** 발행본 SiteConfig → `<!doctype html>` 완전 문서 문자열 */
export function renderStaticDocument(opts: RenderDocumentOptions): string {
  const { config } = opts;
  const pageSlug = opts.pageSlug ?? '';
  const page = findPage(config, pageSlug);
  const isHome = pageSlug === '';

  // [v4] 자동 헤더 내비 (파일 간 상대 링크). 표시 조건은 TenantHeader 내부 판단.
  const header = opts.navHrefForSlug
    ? renderToStaticMarkup(
        createElement(TenantHeader, {
          config,
          currentSlug: pageSlug,
          hrefForSlug: opts.navHrefForSlug,
        }),
      )
    : '';

  // [motion-system 2단계] animate:true — 모션은 이제 data-m 속성 + CSS + 인라인 바닐라 런타임(<script>)로
  // 방출된다(Reveal 클라이언트 컴포넌트 제거). renderToStaticMarkup으로 직렬화되어 내보낸 HTML 단독으로
  // (파일서버만) 동작한다. SSR/no-JS 출력은 여전히 가시(런타임이 초기화 시점에만 숨김 부여).
  let body = renderToStaticMarkup(
    createElement(SiteRenderer, { config, mode: 'auto', interactive: true, animate: true, pageSlug }),
  );

  if (opts.fontFaceCss) {
    // 셀프호스트: CDN 폰트 링크 제거 (외부 요청 0 보장)
    body = body.replace(CDN_FONT_LINK_RE, '');
  }

  const meta = config.meta;
  // 홈은 사이트 제목, 서브페이지는 "페이지명 · 사이트명" (서빙 tenantMetadata와 동일 규칙)
  const docTitle = isHome || !page ? meta.title : `${page.title} · ${meta.title}`;
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(docTitle)}</title>`,
    meta.description ? `<meta name="description" content="${escapeAttr(meta.description)}">` : '',
    `<meta property="og:title" content="${escapeAttr(docTitle)}">`,
    meta.description ? `<meta property="og:description" content="${escapeAttr(meta.description)}">` : '',
    meta.ogImage ? `<meta property="og:image" content="${escapeAttr(meta.ogImage)}">` : '',
    `<style>${BASE_DOC_CSS}</style>`,
    opts.fontFaceCss ? `<style>${opts.fontFaceCss}</style>` : '',
    opts.headExtraHtml ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html lang="${opts.lang ?? 'ko'}">
<head>
${head}
</head>
<body>
${header}${body}
${opts.bodyAppendHtml ?? ''}
</body>
</html>
`;
}
