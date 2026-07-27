/**
 * [S-batch] 정적 발행 문서 셸 — <head>(title/description/OG/canonical/JSON-LD) + <html> 래핑.
 * render-static(server-only·react-dom 직렬화)에서 순수 조립부만 분리 — node:test로 직접 검증.
 * 서빙 레이어(canonical·JSON-LD)는 lib/seo/structured-data 단일 소스를 소비해 /s와 동일.
 */
import type { SiteConfig } from '@/lib/types/site';
import { findPage } from '@/lib/types/site';
import { canonicalUrlFor, jsonLdScriptContent } from '@/lib/seo/structured-data';
import { pageLcpImageSrc } from './motion-scene-assets';

/** 렌더러 auto 모드 반응형 전환 + 최소 리셋 (Tailwind 없이 동작) */
const BASE_DOC_CSS = [
  '*{margin:0;padding:0;box-sizing:border-box}',
  'html{-webkit-text-size-adjust:100%}',
  'body{min-height:100dvh}',
  'img,video{max-width:100%}',
  '.hidden{display:none}',
  '@media(min-width:768px){.md\\:block{display:block}.md\\:hidden{display:none}}',
  '@media(min-width:1280px){.xl\\:block{display:block}.xl\\:flex{display:flex}.xl\\:hidden{display:none}}',
].join('');

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openGraphImageUrl(raw: string | undefined, siteUrl: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!siteUrl) return raw;
  try {
    const url = new URL(raw, `${siteUrl.replace(/\/+$/, '')}/`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export interface DocumentShellInput {
  config: SiteConfig;
  pageSlug: string;
  /** 자동 헤더 내비 HTML (미사용 시 '') */
  headerHtml: string;
  /** SiteRenderer 직렬화 본문 */
  bodyHtml: string;
  /**
   * [S-batch] 사이트 라이브 URL(예: https://xxx.anakslabs.com) — 있으면 canonical + JSON-LD 방출.
   * 미상이면 둘 다 생략(오프라인 zip 하위호환).
   */
  siteUrl?: string;
  fontFaceCss?: string;
  headExtraHtml?: string;
  bodyAppendHtml?: string;
  lang?: string;
  /** SiteConfig page 바깥의 별도 published 표면만 사용한다. 미지정 시 기존 계산 바이트 불변. */
  documentTitle?: string;
  documentDescription?: string;
  canonicalOverride?: string | null;
  jsonLdOverride?: string | null;
  openGraphType?: 'website' | 'article';
}

/** 페이지의 단 하나뿐인 hero/signature 이미지 LCP 후보를 먼저 가져오게 한다. */
export function heroPosterPreloadHtml(config: SiteConfig, pageSlug: string): string {
  const poster = pageLcpImageSrc(config, pageSlug);
  if (!poster) return '';
  return `<link rel="preload" as="image" href="${escapeAttr(poster)}" fetchpriority="high">`;
}

/** React 19가 body 앞에 자동 삽입한 같은 preload를 제거해 head의 명시적 힌트 하나만 남긴다. */
function stripDuplicateLcpPreload(bodyHtml: string, poster: string | undefined): string {
  if (!poster) return bodyHtml;
  const escapedPoster = escapeAttr(poster);
  return bodyHtml.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = /\brel="([^"]*)"/i.exec(tag)?.[1]?.toLowerCase();
    const as = /\bas="([^"]*)"/i.exec(tag)?.[1]?.toLowerCase();
    const href = /\bhref="([^"]*)"/i.exec(tag)?.[1];
    return rel === 'preload' && as === 'image' && href === escapedPoster ? '' : tag;
  });
}

/** 완전한 <!doctype html> 문서 문자열 조립 (순수) */
export function buildDocumentShell(input: DocumentShellInput): string {
  const { config, pageSlug } = input;
  const page = findPage(config, pageSlug);
  const isHome = pageSlug === '';
  const meta = config.meta;
  // 홈은 사이트 제목, 서브페이지는 "페이지명 · 사이트명" (서빙 tenantMetadata와 동일 규칙)
  const docTitle = input.documentTitle ?? (isHome || !page ? meta.title : `${page.title} · ${meta.title}`);
  const description = input.documentDescription ?? meta.description;

  // [S-batch] 서빙 레이어 — canonical + JSON-LD (단일 소스, siteUrl 없으면 생략)
  const canonical = input.canonicalOverride !== undefined
    ? input.canonicalOverride
    : input.siteUrl
      ? canonicalUrlFor(input.siteUrl, pageSlug)
      : null;
  const jsonLd = input.jsonLdOverride !== undefined
    ? input.jsonLdOverride
    : input.siteUrl
      ? jsonLdScriptContent(config, input.siteUrl.replace(/\/+$/, ''), pageSlug)
      : null;
  const poster = pageLcpImageSrc(config, pageSlug);
  const posterPreload = heroPosterPreloadHtml(config, pageSlug);
  const bodyHtml = stripDuplicateLcpPreload(input.bodyHtml, poster);
  const ogImage = openGraphImageUrl(meta.ogImage, input.siteUrl);

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
    config.searchVerification?.naver
      ? `<meta name="naver-site-verification" content="${escapeAttr(config.searchVerification.naver)}">`
      : '',
    config.searchVerification?.google
      ? `<meta name="google-site-verification" content="${escapeAttr(config.searchVerification.google)}">`
      : '',
    `<title>${escapeHtml(docTitle)}</title>`,
    description ? `<meta name="description" content="${escapeAttr(description)}">` : '',
    canonical ? `<link rel="canonical" href="${escapeAttr(canonical)}">` : '',
    // [P1] 파비콘 — 라이브 tenantMetadata(icons)와 파리티(seo_favicon)
    '<link rel="icon" href="/favicon.ico">',
    posterPreload,
    `<meta property="og:title" content="${escapeAttr(docTitle)}">`,
    `<meta property="og:type" content="${input.openGraphType ?? 'website'}">`,
    '<meta property="og:locale" content="ko_KR">',
    `<meta property="og:site_name" content="${escapeAttr(meta.title)}">`,
    canonical ? `<meta property="og:url" content="${escapeAttr(canonical)}">` : '',
    description ? `<meta property="og:description" content="${escapeAttr(description)}">` : '',
    ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}">` : '',
    jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : '',
    `<style>${BASE_DOC_CSS}</style>`,
    input.fontFaceCss ? `<style>${input.fontFaceCss}</style>` : '',
    input.headExtraHtml ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html lang="${input.lang ?? 'ko'}">
<head>
${head}
</head>
<body>
${input.headerHtml}${bodyHtml}
${input.bodyAppendHtml ?? ''}
</body>
</html>
`;
}
