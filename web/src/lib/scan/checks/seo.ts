/**
 * SEO rules for Korean-market discoverability.
 *
 * The checks combine protocol-level eligibility (HTTP, robots, noindex),
 * Naver-specific crawl behavior (Yeti, SSR-readable HTML, absolute canonical),
 * and broadly supported page signals. They intentionally avoid claiming that
 * a passing score guarantees ranking.
 */
import type { ScanRule, RuleContext } from '../rules';
import { CLIENT_RENDER_RISK_CODE } from '../limitations';
import { looksClientRendered } from '../rendering-limit';
import { parseRobotsTxt, robotsAllows } from '../robots';
import { sitemapLooksValid } from '../sitemap';
import {
  canonicalHref,
  hasKoreanText,
  hasNoIndex,
} from '../signals';

function metaContent(ctx: RuleContext, selector: string): string {
  return ctx.root.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
}

function crawlerBlocked(ctx: RuleContext, crawler: string): boolean {
  // 일시 오류는 명시적 Disallow와 구분해 별도 규칙 한 건으로 알린다.
  if (!ctx.robots.ok) return false;
  return !robotsAllows(ctx.robots.body, crawler, ctx.url);
}

function robotsTemporarilyUnavailable(ctx: RuleContext): boolean {
  return ctx.robots.status === 429 || (ctx.robots.status !== null && ctx.robots.status >= 500);
}

function robotsLooksValid(ctx: RuleContext): boolean {
  if (!ctx.robots.ok) return false;
  if (/text\/html/i.test(ctx.robots.contentType)) return false;
  const parsed = parseRobotsTxt(ctx.robots.body);
  return !ctx.robots.truncated && parsed.recognizedDirectives > 0;
}

function canonicalInvalid(ctx: RuleContext): boolean {
  const href = canonicalHref(ctx.root);
  if (!href) return false;
  try {
    const canonical = new URL(href);
    return (
      !['http:', 'https:'].includes(canonical.protocol) ||
      Boolean(canonical.hash) ||
      canonical.origin !== ctx.url.origin
    );
  } catch {
    return true;
  }
}

function looksLikeSoft404(ctx: RuleContext): boolean {
  if (ctx.status < 200 || ctx.status >= 300) return false;
  const title = ctx.root.querySelector('title')?.text.trim() ?? '';
  const heading = ctx.root.querySelector('h1')?.text.trim() ?? '';
  const marker =
    /(?:^|\b)404(?:\b|$)|not\s+found|page\s+not\s+found|페이지를?\s*찾을\s*수\s*없|존재하지\s*않는\s*페이지|사이트를?\s*찾을\s*수\s*없/i;
  return marker.test(`${title} ${heading}`) && ctx.visibleText.replace(/\s+/g, '').length < 800;
}

export const SEO_RULES: ScanRule[] = [
  {
    code: 'seo_http_status',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 18,
    label: '페이지가 정상 HTTP 상태로 응답하지 않습니다',
    detail: '검색 대상 페이지는 2xx 상태로 응답해야 합니다. 오류 화면을 200으로 돌려주는 소프트 404도 함께 확인하세요.',
    failed: (ctx) => ctx.status < 200 || ctx.status >= 300,
  },
  {
    code: 'seo_html_response',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 10,
    label: 'HTML 문서로 응답하지 않습니다',
    detail: '검색 페이지가 HTML/XHTML이 아닌 형식으로 응답해 검색로봇이 일반 웹문서로 해석하기 어렵습니다.',
    failed: (ctx) =>
      Boolean(ctx.contentType) && !/(?:text\/html|application\/xhtml\+xml)/i.test(ctx.contentType),
  },
  {
    code: 'seo_html_truncated',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 3,
    label: 'HTML 문서가 지나치게 커서 진단이 일부만 수행되었습니다',
    detail: '초기 HTML이 1MB를 넘어 잘렸습니다. 검색로봇과 사용자가 핵심 본문을 찾기 어렵지 않도록 중복 마크업과 인라인 데이터를 줄이세요.',
    failed: (ctx) => ctx.truncated,
  },
  {
    code: CLIENT_RENDER_RISK_CODE,
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 0,
    advisory: true,
    label: '서버 HTML보다 자바스크립트 실행 뒤에 본문이 나타나는 사이트로 보입니다',
    detail: '서버가 보낸 HTML의 본문은 거의 비어 있고 앱 규모의 자바스크립트 신호가 있습니다. 브라우저 실행 뒤 내용은 이 진단에 포함되지 않아 점수가 실제보다 낮을 수 있습니다.',
    failed: (ctx) => looksClientRendered(ctx.root, ctx.visibleText),
  },
  {
    code: 'seo_soft_404',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 15,
    label: '오류 화면이 정상 페이지 상태로 응답하는 소프트 404로 보입니다',
    detail: '찾을 수 없다는 짧은 화면을 2xx로 반환하면 검색엔진이 오류 URL을 정상 문서로 오인할 수 있습니다. 실제 404/410 상태를 사용하세요.',
    failed: looksLikeSoft404,
  },
  {
    code: 'seo_noindex',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 20,
    label: '페이지에 noindex가 설정되어 있습니다',
    detail: 'meta robots 또는 X-Robots-Tag가 검색결과 색인을 명시적으로 차단하고 있습니다.',
    rootCause: 'index-directive',
    failed: (ctx) => hasNoIndex(ctx.root, ctx.xRobotsTag),
  },
  {
    code: 'seo_googlebot_blocked',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 18,
    label: 'robots.txt가 Googlebot 수집을 막고 있습니다',
    detail: 'Google 검색과 Google의 생성형 검색 기능에 필요한 기본 수집 경로가 차단된 상태입니다.',
    rootCause: 'robots-crawler-access',
    failed: (ctx) => crawlerBlocked(ctx, 'Googlebot'),
  },
  {
    code: 'seo_naver_yeti_blocked',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 20,
    label: 'robots.txt가 네이버 Yeti 수집을 막고 있습니다',
    detail: '한국 서비스의 핵심 검색로봇인 네이버 Yeti가 현재 URL을 수집할 수 없습니다.',
    rootCause: 'robots-crawler-access',
    failed: (ctx) => crawlerBlocked(ctx, 'Yeti'),
  },
  {
    code: 'seo_daum_blocked',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 14,
    label: 'robots.txt가 다음(Daum) 수집을 막고 있습니다',
    detail: '다음 검색의 공식 robots 토큰인 Daum이 현재 URL을 수집할 수 없습니다.',
    rootCause: 'robots-crawler-access',
    failed: (ctx) => crawlerBlocked(ctx, 'Daum'),
  },
  {
    code: 'seo_bingbot_blocked',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 12,
    label: 'robots.txt가 Bingbot 수집을 막고 있습니다',
    detail: 'Bing 검색과 Copilot의 웹 검색 기반이 되는 Bing 색인 수집 경로가 차단된 상태입니다.',
    rootCause: 'robots-crawler-access',
    failed: (ctx) => crawlerBlocked(ctx, 'bingbot'),
  },
  {
    code: 'seo_title_missing',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 12,
    label: '페이지 제목(title)이 없습니다',
    detail: '검색 결과에 표시될 제목이 없어 검색엔진이 페이지 주제를 파악할 수 없는 상태입니다.',
    failed: (ctx) => !(ctx.root.querySelector('title')?.text ?? '').trim(),
  },
  {
    code: 'seo_title_multiple',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 5,
    label: 'title 요소가 여러 개 있습니다',
    detail: '네이버를 포함한 검색엔진이 어느 제목을 대표 제목으로 사용할지 추가 판단해야 하는 구조입니다.',
    failed: (ctx) => ctx.root.querySelectorAll('head > title').length > 1,
  },
  {
    code: 'seo_title_length',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 3,
    label: '페이지 제목이 지나치게 짧거나 깁니다',
    detail: '고정 글자수 공식은 없지만, 너무 짧은 제목은 주제가 불명확하고 지나치게 긴 제목은 검색결과에서 축약될 수 있습니다.',
    failed: (ctx) => {
      const title = (ctx.root.querySelector('title')?.text ?? '').trim();
      return title.length > 0 && (title.length < 5 || title.length > 70);
    },
  },
  {
    code: 'seo_meta_description',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 8,
    label: '메타 설명(description)이 없습니다',
    detail: '페이지별 고유 요약문이 없어 검색엔진이 본문에서 임의로 설명을 선택해야 합니다.',
    failed: (ctx) => !metaContent(ctx, 'meta[name="description"]'),
  },
  {
    code: 'seo_h1',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 7,
    label: '대표 제목(H1) 구조에 문제가 있습니다',
    detail: '네이버 기준으로 H1이 없거나 여러 개면 페이지의 대표 주제를 해석하기 어려울 수 있습니다.',
    rootCause: (ctx) => ctx.root.querySelectorAll('h1').length === 0
      ? 'heading-root-missing'
      : 'heading-root-multiple',
    failed: (ctx) => ctx.root.querySelectorAll('h1').length !== 1,
  },
  {
    code: 'seo_canonical',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 5,
    label: '표준 URL(canonical)이 지정되지 않았습니다',
    detail: '같은 내용의 주소가 여러 개일 때 검색엔진이 어느 주소를 대표로 볼지 알 수 없습니다.',
    failed: (ctx) => !canonicalHref(ctx.root),
  },
  {
    code: 'seo_canonical_invalid',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 8,
    label: '표준 URL(canonical)이 현재 페이지와 맞지 않습니다',
    detail: 'canonical은 절대 URL이어야 하며, 실수로 다른 호스트나 fragment 주소를 가리키지 않아야 합니다.',
    failed: canonicalInvalid,
  },
  {
    code: 'seo_og',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 5,
    label: 'Open Graph 공유 정보가 불완전합니다',
    detail: '네이버 색인 보조 신호와 카카오톡 공유 미리보기에 쓰이는 제목·설명·대표 이미지 중 일부가 비어 있습니다.',
    failed: (ctx) =>
      !metaContent(ctx, 'meta[property="og:title"]') ||
      !metaContent(ctx, 'meta[property="og:description"]') ||
      !metaContent(ctx, 'meta[property="og:image"]'),
  },
  {
    code: 'seo_img_alt',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 6,
    label: 'alt 속성이 빠진 이미지가 많습니다',
    detail: '콘텐츠 이미지에 alt 속성이 없으면 네이버·구글과 보조기기가 이미지 의미를 파악하기 어렵습니다.',
    failed: (ctx) => {
      const images = ctx.root.querySelectorAll('img');
      if (images.length === 0) return false;
      const missing = images.filter((image) => image.getAttribute('alt') === undefined).length;
      return missing / images.length > 0.25;
    },
  },
  {
    code: 'seo_https',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 12,
    decaySlot: 'secureConnection',
    decayWeight: 20,
    label: 'HTTPS가 아닙니다',
    detail: '암호화되지 않은 연결(http)이라 사용자 신뢰와 안전한 검색 경험에 불리합니다.',
    failed: (ctx) => ctx.url.protocol !== 'https:',
  },
  {
    code: 'seo_viewport',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 8,
    decaySlot: 'mobileReadiness',
    decayWeight: 15,
    label: '모바일 뷰포트 설정이 없습니다',
    detail: 'viewport 메타가 없어 모바일에서 데스크톱 화면이 축소돼 보일 수 있습니다.',
    failed: (ctx) => !ctx.root.querySelector('meta[name="viewport"]'),
  },
  {
    code: 'seo_korean_encoding',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 5,
    label: '한국어 문서의 문자 인코딩 선언이 불명확합니다',
    detail: '한글 깨짐을 막으려면 HTTP Content-Type 또는 meta charset에서 UTF-8을 명확히 선언하는 것이 안전합니다.',
    failed: (ctx) => {
      if (!hasKoreanText(ctx.visibleText)) return false;
      const metaCharset =
        ctx.root.querySelector('meta[charset]')?.getAttribute('charset') ??
        ctx.root.querySelector('meta[http-equiv="content-type"]')?.getAttribute('content') ??
        '';
      return !/utf-8/i.test(`${ctx.contentType} ${metaCharset}`);
    },
  },
  {
    code: 'seo_hash_navigation',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 6,
    label: '해시 기반 페이지 이동이 발견되었습니다',
    detail: '네이버는 fragment(#)를 독립 페이지로 보지 않으므로 서로 다른 콘텐츠는 실제 경로 URL과 a href 링크로 제공해야 합니다.',
    failed: (ctx) =>
      ctx.root
        .querySelectorAll('a[href]')
        .some((anchor) => /^#!|\/#!/.test(anchor.getAttribute('href')?.trim() ?? '')),
  },
  {
    code: 'seo_robots_temporarily_unavailable',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 3,
    label: 'robots.txt를 일시적으로 확인할 수 없습니다',
    detail: '짧게 기다려 한 번 더 확인했지만 서버가 429 또는 5xx로 응답했습니다. 명시적 차단으로 단정하지 않으며 잠시 후 재진단이 필요합니다.',
    rootCause: 'robots-temporary-unavailable',
    failed: robotsTemporarilyUnavailable,
  },
  {
    code: 'seo_robots_txt',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 4,
    label: 'robots.txt를 확인할 수 없습니다',
    detail: 'robots.txt가 없어도 기본 수집은 가능하지만, 사이트맵과 검색·AI 크롤러 정책을 명시적으로 관리하기 어렵습니다.',
    failed: (ctx) => !ctx.robots.ok && !robotsTemporarilyUnavailable(ctx),
  },
  {
    code: 'seo_robots_invalid',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 10,
    label: 'robots.txt 응답 형식이 올바르지 않습니다',
    detail: 'HTML 오류 페이지, 잘린 파일, 인식 가능한 지시어가 없는 파일은 검색로봇이 의도와 다르게 해석할 수 있습니다.',
    failed: (ctx) => ctx.robots.ok && !robotsLooksValid(ctx),
  },
  {
    code: 'seo_robots_sitemap',
    pillar: 'seo',
    ownership: 'system',
    severity: 'info',
    weight: 2,
    label: 'robots.txt에 사이트맵 위치가 없습니다',
    detail: 'robots.txt의 Sitemap 지시어로 네이버·구글·빙이 사이트맵을 더 쉽게 발견하게 할 수 있습니다.',
    failed: (ctx) => ctx.robots.ok && parseRobotsTxt(ctx.robots.body).sitemaps.length === 0,
  },
  {
    code: 'seo_sitemap',
    pillar: 'seo',
    ownership: 'system',
    severity: 'warn',
    weight: 6,
    label: 'sitemap.xml을 확인할 수 없습니다',
    detail: '사이트의 canonical URL과 최신 수정일을 검색엔진에 전달하는 표준 피드가 없습니다.',
    failed: (ctx) => !ctx.sitemap.ok,
  },
  {
    code: 'seo_sitemap_invalid',
    pillar: 'seo',
    ownership: 'system',
    severity: 'critical',
    weight: 10,
    label: 'sitemap.xml 형식이 올바르지 않습니다',
    detail: '2xx 응답이어도 HTML 오류 페이지이거나 urlset/sitemapindex와 절대 loc가 없으면 유효한 사이트맵이 아닙니다.',
    failed: (ctx) => ctx.sitemap.ok && !sitemapLooksValid(ctx.sitemap),
  },
  {
    code: 'seo_speed_slow',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'warn',
    weight: 2,
    decaySlot: 'responseSpeed',
    decayWeight: 8,
    label: '서버 첫 응답이 느립니다 (1.5초 초과)',
    detail: 'Anaks Labs 진단 서버 위치에서 2회 측정한 빠른 응답이 1.5초를 넘었습니다. 실제 손님의 위치·네트워크에 따라 달라지는 참고 지표입니다.',
    failed: (ctx) => ctx.ttfbMs > 1500 && ctx.ttfbMs <= 3000,
  },
  {
    code: 'seo_speed_very_slow',
    pillar: 'seo',
    ownership: 'shared',
    severity: 'critical',
    weight: 3,
    decaySlot: 'responseSpeed',
    decayWeight: 15,
    label: '서버 첫 응답이 매우 느립니다 (3초 초과)',
    detail: 'Anaks Labs 진단 서버 위치에서 2회 측정한 빠른 응답이 3초를 넘었습니다. 실제 손님의 위치·네트워크에 따라 달라지는 참고 지표이므로 반복 측정으로 확인하세요.',
    failed: (ctx) => ctx.ttfbMs > 3000,
  },
  {
    code: 'seo_favicon',
    pillar: 'seo',
    ownership: 'system',
    severity: 'info',
    weight: 1,
    label: '파비콘이 지정되지 않았습니다',
    detail: '브라우저 탭·즐겨찾기와 일부 검색 표현에서 브랜드 식별 아이콘을 제공하지 못합니다.',
    failed: (ctx) => !ctx.root.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'),
  },
];
