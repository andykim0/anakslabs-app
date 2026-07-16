import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { AEO_RULES } from '@/lib/scan/checks/aeo';
import { GEO_RULES } from '@/lib/scan/checks/geo';
import { SEO_RULES } from '@/lib/scan/checks/seo';
import type { RuleContext, ScanRule } from '@/lib/scan/rules';

const ROBOTS = {
  url: 'https://example.kr/robots.txt',
  status: 200,
  ok: true,
  body: 'User-agent: *\nAllow: /\nSitemap: https://example.kr/sitemap.xml',
  contentType: 'text/plain',
  truncated: false,
};

const SITEMAP = {
  url: 'https://example.kr/sitemap.xml',
  status: 200,
  ok: true,
  body: '<urlset><url><loc>https://example.kr</loc></url></urlset>',
  contentType: 'application/xml',
  truncated: false,
};

function context(html: string, overrides: Partial<RuleContext> = {}): RuleContext {
  const root = parse(html);
  const visible = parse(html);
  for (const element of visible.querySelectorAll('script, style, noscript, template')) {
    element.remove();
  }
  return {
    root,
    rawHtml: html,
    visibleText: visible.text.replace(/\s+/g, ' ').trim(),
    url: new URL('https://example.kr/'),
    status: 200,
    contentType: 'text/html; charset=utf-8',
    xRobotsTag: '',
    truncated: false,
    ttfbMs: 100,
    robots: ROBOTS,
    sitemap: SITEMAP,
    ...overrides,
  };
}

function failed(rules: readonly ScanRule[], code: string, ctx: RuleContext): boolean {
  const rule = rules.find((candidate) => candidate.code === code);
  assert.ok(rule, `missing rule ${code}`);
  return rule.failed(ctx);
}

const COMPANY_HTML = `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><title>아낙스랩스 웹사이트 제작</title>
<meta name="description" content="한국 사업자를 위한 웹사이트 제작 서비스">
</head><body><header><nav><a href="/">홈</a></nav></header><main>
<h1>아낙스랩스 웹사이트 제작</h1>
<section><h2>서비스 소개</h2><p>${'검색과 사용자가 이해할 수 있는 구체적인 서비스 설명입니다. '.repeat(8)}</p></section>
</main><footer>아낙스랩스</footer></body></html>`;

describe('conditional AEO/GEO checks', () => {
  test('ordinary company page is not forced to add FAQ, table, author, date, or local address', () => {
    const ctx = context(COMPANY_HTML);
    assert.equal(failed(AEO_RULES, 'aeo_question_headings', ctx), false);
    assert.equal(failed(AEO_RULES, 'aeo_lists_tables', ctx), false);
    assert.equal(failed(GEO_RULES, 'geo_dates', ctx), false);
    assert.equal(failed(GEO_RULES, 'geo_author', ctx), false);
    assert.equal(failed(GEO_RULES, 'geo_business_info', ctx), false);
  });

  test('FAQ-like content needs explicit question boundaries', () => {
    const ctx = context(
      COMPANY_HTML.replace(
        '<h2>서비스 소개</h2>',
        '<h2>자주 묻는 질문</h2><p>예약 가능한가요? 네, 가능합니다. 비용은 얼마인가요? 상담 후 안내합니다.</p>',
      ),
    );
    assert.equal(failed(AEO_RULES, 'aeo_question_headings', ctx), true);
  });

  test('article pages require accountable author and freshness signals', () => {
    const article = context(
      COMPANY_HTML.replace('<section>', '<article class="article-content">').replace(
        '</section>',
        '</article>',
      ),
    );
    assert.equal(failed(GEO_RULES, 'geo_dates', article), true);
    assert.equal(failed(GEO_RULES, 'geo_author', article), true);

    const complete = context(
      COMPANY_HTML.replace(
        '<head>',
        '<head><meta name="author" content="김아낙스"><meta property="article:published_time" content="2026-07-16">',
      )
        .replace('<section>', '<article class="article-content">')
        .replace('</section>', '</article>'),
    );
    assert.equal(failed(GEO_RULES, 'geo_dates', complete), false);
    assert.equal(failed(GEO_RULES, 'geo_author', complete), false);
  });
});

describe('Korean local and entity signals', () => {
  test('LocalBusiness schema and visible local page need both phone and address', () => {
    const html = COMPANY_HTML.replace(
      '</head>',
      `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"LocalBusiness","name":"테스트 카페","url":"https://example.kr","telephone":"02-123-4567"}
      </script></head>`,
    ).replace('</main>', '<p>전화 02-123-4567</p></main>');
    const ctx = context(html);
    assert.equal(failed(AEO_RULES, 'aeo_local_business_details', ctx), true);
    assert.equal(failed(GEO_RULES, 'geo_business_info', ctx), true);
  });

  test('schema name, phone, and address must also be visible to users', () => {
    const schema =
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"숨은 카페","url":"https://example.kr","telephone":"02-999-8888","address":{"@type":"PostalAddress","streetAddress":"서울특별시 종로구 세종대로 1"}}</script>';
    const hidden = context(COMPANY_HTML.replace('</head>', `${schema}</head>`));
    assert.equal(failed(AEO_RULES, 'aeo_jsonld_visibility', hidden), true);

    const visible = context(
      COMPANY_HTML.replace('</head>', `${schema}</head>`).replace(
        '</main>',
        '<p>숨은 카페 · 02-999-8888 · 서울특별시 종로구 세종대로 1</p></main>',
      ),
    );
    assert.equal(failed(AEO_RULES, 'aeo_jsonld_visibility', visible), false);
  });

  test('visible Naver/Kakao channel links are connected through sameAs', () => {
    const visibleOnly = context(
      COMPANY_HTML.replace(
        '</main>',
        '<a href="https://blog.naver.com/example">공식 네이버 블로그</a></main>',
      ),
    );
    assert.equal(failed(GEO_RULES, 'geo_channel_identity', visibleOnly), true);

    const connected = context(
      COMPANY_HTML.replace(
        '</head>',
        '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"아낙스랩스","url":"https://example.kr","sameAs":["https://blog.naver.com/example"]}</script></head>',
      ).replace('</main>', '<a href="https://blog.naver.com/example">공식 네이버 블로그</a></main>'),
    );
    assert.equal(failed(GEO_RULES, 'geo_channel_identity', connected), false);
  });
});

describe('crawler and snippet eligibility', () => {
  test('detects OAI-SearchBot block independently from other crawlers', () => {
    const ctx = context(COMPANY_HTML, {
      robots: {
        ...ROBOTS,
        body: 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: *\nAllow: /',
      },
    });
    assert.equal(failed(GEO_RULES, 'geo_oai_search_blocked', ctx), true);
    assert.equal(failed(GEO_RULES, 'geo_perplexity_blocked', ctx), false);
  });

  test('detects Naver and Daum policies with their documented robots tokens', () => {
    const ctx = context(COMPANY_HTML, {
      robots: {
        ...ROBOTS,
        body: 'User-agent: Yeti\nDisallow: /\n\nUser-agent: Daum\nDisallow: /private',
      },
      url: new URL('https://example.kr/private/notice'),
    });
    assert.equal(failed(SEO_RULES, 'seo_naver_yeti_blocked', ctx), true);
    assert.equal(failed(SEO_RULES, 'seo_daum_blocked', ctx), true);
  });

  test('detects snippet restrictions and Naver source-info opt-out', () => {
    const ctx = context(
      COMPANY_HTML.replace(
        '</head>',
        '<meta name="robots" content="nosnippet, nosourceinfo"></head>',
      ),
    );
    assert.equal(failed(GEO_RULES, 'geo_snippet_restricted', ctx), true);
    assert.equal(failed(GEO_RULES, 'geo_naver_sourceinfo_disabled', ctx), true);
  });

  test('distinguishes an HTML error page from a valid robots.txt response', () => {
    const ctx = context(COMPANY_HTML, {
      robots: {
        ...ROBOTS,
        body: '<html><title>Not found</title></html>',
        contentType: 'text/html',
      },
    });
    assert.equal(failed(SEO_RULES, 'seo_robots_invalid', ctx), true);
  });

  test('detects a short not-found screen returned with HTTP 200', () => {
    const ctx = context(
      '<html lang="ko"><head><title>페이지를 찾을 수 없습니다</title></head><body><main><h1>404 Not Found</h1><p>주소를 확인해주세요.</p></main></body></html>',
    );
    assert.equal(failed(SEO_RULES, 'seo_soft_404', ctx), true);
  });
});

describe('structured-data validity', () => {
  test('reports malformed JSON-LD instead of treating it as absent', () => {
    const ctx = context(
      COMPANY_HTML.replace(
        '</head>',
        '<script type="application/ld+json">{"@type":"Organization",}</script></head>',
      ),
    );
    assert.equal(failed(AEO_RULES, 'aeo_jsonld_invalid', ctx), true);
    assert.equal(failed(AEO_RULES, 'aeo_jsonld_missing', ctx), false);
  });
});
