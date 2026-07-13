/**
 * [§5] SiteRenderer → 완전한 정적 HTML 문서 문자열.
 *
 * renderToStaticMarkup으로 발행본을 직렬화한다. SiteRenderer는 순수 서버 컴포넌트
 * (async/hook 없음)라 그대로 직렬화 가능. 렌더 결과에는 폰트 <link>·BASE_CSS <style>·
 * `.anaks-site` div가 포함된다(SiteRenderer.tsx 참고).
 *
 * [S-batch] 문서 셸(head 조립: title/description/OG/canonical/JSON-LD)은 순수 모듈
 * lib/export/document-shell.ts로 분리 — node:test 검증 대상. canonical·JSON-LD는
 * lib/seo/structured-data 단일 소스로 /s 서빙과 동일하다(siteUrl 옵션 제공 시 방출).
 */
import 'server-only';
import { createElement } from 'react';
// App Router는 `react-dom/server`(node) 직접 import를 금지 → edge 빌드 사용.
// renderToStaticMarkup은 동기·환경중립이라 Node 런타임 라우트에서도 동작.
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { MotionTier, SiteConfig } from '@/lib/types/site';
import { TenantPageContent } from '@/components/site-renderer';
import { buildDocumentShell } from './document-shell';

/** CDN 폰트 <link>(구글폰트/제이에스딜리버 Pretendard)와 preconnect 제거 — 셀프호스트 시 */
const CDN_FONT_LINK_RE =
  /<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard)[^>]*>/gi;

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
  /**
   * [S-batch] 사이트 라이브 URL — 있으면 canonical + JSON-LD를 문서에 방출(/s와 단일 소스).
   * 미상이면 생략(오프라인 zip 하위호환).
   */
  siteUrl?: string;
  /** 셀프호스트 @font-face CSS. 있으면 <head>에 인라인 + 본문 CDN 폰트 링크 제거 */
  fontFaceCss?: string;
  /** <head>에 추가할 원시 HTML (예: 셀프호스트 자산 preload) */
  headExtraHtml?: string;
  /** </body> 직전에 붙일 HTML (§6 페이지 링크 등) */
  bodyAppendHtml?: string;
  /** [P1] 법적 푸터 링크 — export는 상대 파일명(./privacy.html), 미지정=서빙 '/privacy'·'/terms' */
  privacyHref?: string;
  termsHref?: string;
  /** 언어 속성 (기본 ko) */
  lang?: string;
  /** [motion 3단계] 소유자 티어 — resolveMotionPlan 티어 방어(defense-in-depth). 라우트가 client.tier 전달 */
  tier?: MotionTier;
}

/** 발행본 SiteConfig → `<!doctype html>` 완전 문서 문자열 */
export function renderStaticDocument(opts: RenderDocumentOptions): string {
  const { config } = opts;
  const pageSlug = opts.pageSlug ?? '';

  // [P1] 라이브 서빙과 공유하는 시맨틱 셸 단일 소스 — 헤더+main(아웃라인+렌더)+법적푸터를 함께 방출한다.
  // (기존엔 SiteRenderer 맨몸만 직렬화 → main/h1/아웃라인/푸터가 없어 preflight가 라이브보다 과소평가했다.)
  // navHrefForSlug 미지정(preflight)이면 절대 링크(/slug)로 헤더가 렌더된다. 법적 링크는 export만 상대.
  let body = renderToStaticMarkup(
    createElement(TenantPageContent, {
      config,
      pageSlug,
      tier: opts.tier,
      interactive: true,
      animate: true,
      hrefForSlug: opts.navHrefForSlug,
      privacyHref: opts.privacyHref,
      termsHref: opts.termsHref,
    }),
  );

  if (opts.fontFaceCss) {
    // 셀프호스트: CDN 폰트 링크 제거 (외부 요청 0 보장)
    body = body.replace(CDN_FONT_LINK_RE, '');
  }

  return buildDocumentShell({
    config,
    pageSlug,
    headerHtml: '', // 헤더는 body(TenantPageContent) 안에 포함
    bodyHtml: body,
    siteUrl: opts.siteUrl,
    fontFaceCss: opts.fontFaceCss,
    headExtraHtml: opts.headExtraHtml,
    bodyAppendHtml: opts.bodyAppendHtml,
    lang: opts.lang,
  });
}
