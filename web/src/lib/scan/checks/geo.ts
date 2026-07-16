/**
 * GEO rules — can generative search systems retrieve, understand, and cite the
 * page with enough context and evidence?
 *
 * There is no special "AI ranking file": the rules prioritize crawler access,
 * snippet eligibility, clear entity/topic signals, first-party evidence, and
 * content patterns that make a faithful citation possible.
 */
import type { ScanRule, RuleContext } from '../rules';
import { robotsAllows } from '../robots';
import {
  hasBusinessNumber,
  hasKoreanAddress,
  hasKoreanText,
  hasLocalBusinessType,
  hasNaverSourceInfoRestriction,
  hasPhone,
  hasSnippetRestriction,
  hasUnsourcedClaimSignals,
  isArticleLike,
  jsonLdReport,
  jsonLdSameAs,
  supportedChannelUrls,
  titleHeadingAligned,
} from '../signals';

function crawlerBlocked(ctx: RuleContext, crawler: string): boolean {
  if (ctx.robots.status === 429 || (ctx.robots.status !== null && ctx.robots.status >= 500)) {
    return true;
  }
  if (!ctx.robots.ok) return false;
  return !robotsAllows(ctx.robots.body, crawler, ctx.url);
}

function hasAuthor(ctx: RuleContext): boolean {
  if (ctx.root.querySelector('meta[name="author"], [rel="author"], [itemprop="author"]')) return true;
  const report = jsonLdReport(ctx.root);
  return report.nodes.some((node) => {
    const author = node.author;
    if (typeof author === 'string') return Boolean(author.trim());
    if (Array.isArray(author)) return author.length > 0;
    return Boolean(author && typeof author === 'object');
  });
}

function hasDate(ctx: RuleContext): boolean {
  if (
    ctx.root.querySelector(
      'time[datetime], meta[property="article:published_time"], meta[property="article:modified_time"]',
    )
  ) {
    return true;
  }
  return jsonLdReport(ctx.root).nodes.some(
    (node) =>
      (typeof node.datePublished === 'string' && Boolean(node.datePublished.trim())) ||
      (typeof node.dateModified === 'string' && Boolean(node.dateModified.trim())),
  );
}

function isLocalPage(ctx: RuleContext): boolean {
  const report = jsonLdReport(ctx.root);
  return (
    hasLocalBusinessType(report) ||
    hasPhone(ctx.visibleText) ||
    hasKoreanAddress(ctx.visibleText) ||
    hasBusinessNumber(ctx.visibleText) ||
    Boolean(
      ctx.root.querySelector(
        'a[href*="map.naver.com"], a[href*="place.naver.com"], a[href*="map.kakao.com"], a[href*="place.map.kakao.com"]',
      ),
    )
  );
}

function normalizeIdentityUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return raw.trim().replace(/\/+$/, '').toLowerCase();
  }
}

export const GEO_RULES: ScanRule[] = [
  {
    code: 'geo_oai_search_blocked',
    pillar: 'geo',
    severity: 'critical',
    weight: 16,
    label: 'robots.txt가 OAI-SearchBot 수집을 막고 있습니다',
    detail: 'ChatGPT 검색의 요약·인용 대상이 되려면 OpenAI의 검색 전용 크롤러가 공개 페이지를 수집할 수 있어야 합니다.',
    failed: (ctx) => crawlerBlocked(ctx, 'OAI-SearchBot'),
  },
  {
    code: 'geo_perplexity_blocked',
    pillar: 'geo',
    severity: 'critical',
    weight: 14,
    label: 'robots.txt가 PerplexityBot 수집을 막고 있습니다',
    detail: 'Perplexity 검색 응답에서 페이지를 검색·인용하려면 PerplexityBot의 공개 콘텐츠 수집 경로가 열려 있어야 합니다.',
    failed: (ctx) => crawlerBlocked(ctx, 'PerplexityBot'),
  },
  {
    code: 'geo_snippet_restricted',
    pillar: 'geo',
    severity: 'critical',
    weight: 16,
    label: '검색 요약과 AI 인용에 사용할 본문 발췌가 차단되어 있습니다',
    detail: 'nosnippet, max-snippet:0, noindex 같은 지시어는 검색결과 요약과 생성형 검색의 본문 사용을 제한합니다.',
    failed: (ctx) => hasSnippetRestriction(ctx.root, ctx.xRobotsTag),
  },
  {
    code: 'geo_naver_sourceinfo_disabled',
    pillar: 'geo',
    severity: 'info',
    weight: 3,
    label: '네이버 AI 출처 설명이 비활성화되어 있습니다',
    detail: 'nosourceinfo가 설정되어 네이버가 AI 검색 등에서 이 페이지를 출처로 설명하는 기능을 사용하지 않도록 요청한 상태입니다.',
    failed: (ctx) => hasNaverSourceInfoRestriction(ctx.root),
  },
  {
    code: 'geo_no_text',
    pillar: 'geo',
    severity: 'critical',
    weight: 18,
    label: 'AI가 읽을 본문 텍스트가 거의 없습니다',
    detail: '보이는 텍스트가 200자 미만입니다. 핵심 정보가 이미지나 클라이언트 실행 뒤에만 있으면 검색·답변 시스템이 읽지 못할 수 있습니다.',
    failed: (ctx) => ctx.visibleText.replace(/\s+/g, '').length < 200,
  },
  {
    code: 'geo_low_text_ratio',
    pillar: 'geo',
    severity: 'warn',
    weight: 8,
    label: '마크업 대비 본문 비율이 낮습니다',
    detail: '코드 대비 실제 텍스트가 적어 페이지의 핵심 설명과 근거를 빠르게 구분하기 어려운 구조입니다.',
    failed: (ctx) => {
      if (ctx.rawHtml.length === 0) return true;
      const visibleLength = ctx.visibleText.length;
      if (visibleLength < 200) return false;
      return visibleLength / ctx.rawHtml.length < 0.05 && visibleLength < 1200;
    },
  },
  {
    code: 'geo_business_info',
    pillar: 'geo',
    severity: 'warn',
    weight: 12,
    label: '지역 업체의 연락처 또는 주소가 불완전합니다',
    detail: '방문형·지역형 서비스 페이지라면 실제 화면에 일관된 전화번호와 한국 주소를 함께 제공해 업체 정보를 검증할 수 있게 하세요.',
    failed: (ctx) =>
      isLocalPage(ctx) && (!hasPhone(ctx.visibleText) || !hasKoreanAddress(ctx.visibleText)),
  },
  {
    code: 'geo_dates',
    pillar: 'geo',
    severity: 'warn',
    weight: 7,
    label: '콘텐츠의 작성·수정 날짜가 없습니다',
    detail: '기사·가이드형 페이지에 날짜가 없어 생성형 검색 시스템과 사용자가 정보의 최신성을 판단하기 어렵습니다.',
    failed: (ctx) => isArticleLike(ctx.root, jsonLdReport(ctx.root), ctx.url) && !hasDate(ctx),
  },
  {
    code: 'geo_lang',
    pillar: 'geo',
    severity: 'critical',
    weight: 10,
    label: '문서 언어 선언(lang)이 없습니다',
    detail: '<html lang> 속성이 없어 검색·답변 시스템이 문서 언어와 지역 문맥을 추측해야 합니다.',
    failed: (ctx) => !(ctx.root.querySelector('html')?.getAttribute('lang') ?? '').trim(),
  },
  {
    code: 'geo_korean_lang_mismatch',
    pillar: 'geo',
    severity: 'warn',
    weight: 6,
    label: '한국어 본문과 문서 언어 선언이 맞지 않습니다',
    detail: '본문은 한국어인데 html lang이 ko 계열이 아니어서 한국어 검색과 음성·답변 처리에서 언어 신호가 충돌합니다.',
    failed: (ctx) => {
      if (!hasKoreanText(ctx.visibleText)) return false;
      const lang = ctx.root.querySelector('html')?.getAttribute('lang')?.trim().toLowerCase() ?? '';
      return Boolean(lang) && lang !== 'ko' && !lang.startsWith('ko-');
    },
  },
  {
    code: 'geo_author',
    pillar: 'geo',
    severity: 'warn',
    weight: 7,
    label: '콘텐츠 작성자 또는 검토 주체가 없습니다',
    detail: '기사·가이드형 페이지에서 책임 주체를 확인할 수 없어 경험·전문성·출처를 평가하기 어렵습니다.',
    failed: (ctx) => isArticleLike(ctx.root, jsonLdReport(ctx.root), ctx.url) && !hasAuthor(ctx),
  },
  {
    code: 'geo_channel_identity',
    pillar: 'geo',
    severity: 'info',
    weight: 5,
    label: '공식 채널 링크가 구조화된 엔티티와 연결되지 않았습니다',
    detail: '네이버 블로그·스마트스토어·카카오·인스타그램 등 화면에 보이는 공식 채널은 Organization/Person의 sameAs에도 연결하세요.',
    failed: (ctx) => {
      const visible = supportedChannelUrls(ctx.root).map(normalizeIdentityUrl);
      if (visible.length === 0) return false;
      const sameAs = jsonLdSameAs(jsonLdReport(ctx.root)).map(normalizeIdentityUrl);
      return visible.some((url) => !sameAs.includes(url));
    },
  },
  {
    code: 'geo_unsourced_claims',
    pillar: 'geo',
    severity: 'warn',
    weight: 9,
    label: '수치·연구 주장에 확인 가능한 출처가 없습니다',
    detail: '통계·조사·연구 결과를 인용한다면 원문 링크, 발행 주체와 기준 시점을 함께 밝혀 생성형 검색이 근거를 검증할 수 있게 하세요.',
    failed: (ctx) => hasUnsourcedClaimSignals(ctx.root, ctx.visibleText),
  },
  {
    code: 'geo_topic_alignment',
    pillar: 'geo',
    severity: 'warn',
    weight: 7,
    label: '페이지 제목과 대표 제목의 주제가 연결되지 않습니다',
    detail: 'title과 H1의 핵심 용어가 전혀 겹치지 않아 검색·답변 시스템이 페이지의 대표 주제를 확정하기 어렵습니다.',
    failed: (ctx) => !titleHeadingAligned(ctx.root),
  },
  {
    code: 'geo_empty_page',
    pillar: 'geo',
    severity: 'critical',
    weight: 10,
    label: '페이지가 사실상 비어 있습니다',
    detail: '본문 요소가 거의 없어 질문에 답하거나 인용할 콘텐츠 자체가 없는 상태입니다.',
    failed: (ctx) => ctx.root.querySelectorAll('p, li, h1, h2, h3, td, dd').length < 3,
  },
];
