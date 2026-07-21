import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parse } from 'node-html-parser';
import { AEO_RULES } from '@/lib/scan/checks/aeo';
import { GEO_RULES } from '@/lib/scan/checks/geo';
import { SEO_RULES } from '@/lib/scan/checks/seo';
import type { ProbedResource } from '@/lib/scan/fetch-target';
import { actionableIssueCount, groupScanIssues } from '@/lib/scan/issue-groups';
import { retryTransientProbe } from '@/lib/scan/probe-retry';
import { createRuleRunState, runRules, type RuleContext } from '@/lib/scan/rules';
import { buildScores, SCAN_SCORE_CAPACITY } from '@/lib/scan/score';

const ROBOTS: ProbedResource = {
  url: 'https://example.kr/robots.txt',
  status: 200,
  ok: true,
  body: 'User-agent: *\nAllow: /\nSitemap: https://example.kr/sitemap.xml',
  contentType: 'text/plain',
  truncated: false,
};

const SITEMAP: ProbedResource = {
  url: 'https://example.kr/sitemap.xml',
  status: 200,
  ok: true,
  body: '<urlset><url><loc>https://example.kr/</loc></url></urlset>',
  contentType: 'application/xml',
  truncated: false,
};

const HEALTHY_HTML = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>다보임 홈페이지 제작</title><meta name="description" content="한국 사업자를 위한 홈페이지 제작 서비스입니다.">
<link rel="canonical" href="https://example.kr/"><link rel="icon" href="/favicon.ico">
<meta property="og:title" content="다보임 홈페이지 제작"><meta property="og:description" content="홈페이지 제작 서비스"><meta property="og:image" content="https://example.kr/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"다보임","url":"https://example.kr/"}</script>
</head><body><header><nav><a href="/">홈</a></nav></header><main><h1>다보임 홈페이지 제작</h1>
<section><h2>서비스 안내</h2><p>다보임은 한국 사업자가 손님에게 필요한 정보를 분명하게 전하는 홈페이지를 제작합니다. 페이지 구조와 공식 정보를 함께 정리합니다. 검색과 질문에 필요한 내용을 서버 HTML에 담아 여러 환경에서 읽기 쉬운 문서를 만들고, 업종에 맞는 서비스 설명과 이용 방법도 빠짐없이 구성합니다.</p><p>검색과 질문에 필요한 내용을 서버 HTML에 담아 여러 환경에서 읽기 쉬운 문서를 만듭니다.</p><ul><li>페이지 설계</li><li>공식 정보 정리</li></ul></section>
</main><footer><p>다보임 공식 홈페이지입니다.</p></footer></body></html>`;

function context(html = HEALTHY_HTML, overrides: Partial<RuleContext> = {}): RuleContext {
  const root = parse(html);
  const visible = parse(html);
  for (const element of visible.querySelectorAll('script, style, noscript, template')) element.remove();
  return {
    root,
    rawHtml: html,
    visibleText: visible.text.replace(/\s+/gu, ' ').trim(),
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

function evaluate(ctx: RuleContext) {
  const state = createRuleRunState();
  const seo = runRules(SEO_RULES, ctx, state);
  const aeo = runRules(AEO_RULES, ctx, state);
  const geo = runRules(GEO_RULES, ctx, state);
  const issues = [...seo.issues, ...aeo.issues, ...geo.issues];
  return {
    ...buildScores({ seo: seo.deducted, aeo: aeo.deducted, geo: geo.deducted }),
    issues,
    deductions: { seo: seo.deducted, aeo: aeo.deducted, geo: geo.deducted },
  };
}

function legacyScores(ctx: RuleContext) {
  const score = (rules: typeof SEO_RULES) => {
    const deducted = rules.reduce((sum, rule) => sum + (rule.failed(ctx) ? rule.weight : 0), 0);
    return Math.max(0, Math.round(100 - deducted));
  };
  const seo = score(SEO_RULES);
  const aeo = score(AEO_RULES);
  const geo = score(GEO_RULES);
  return { seo, aeo, geo, total: Math.round((seo + aeo + geo) / 3) };
}

describe('SE$ S1 점수 보정과 루트 원인', () => {
  test('필러별 원시 가중 합을 100점 감점 예산으로 정규화한다', () => {
    assert.deepEqual(SCAN_SCORE_CAPACITY, {
      seo: SEO_RULES.reduce((sum, rule) => sum + rule.weight, 0),
      aeo: AEO_RULES.reduce((sum, rule) => sum + rule.weight, 0),
      geo: GEO_RULES.reduce((sum, rule) => sum + rule.weight, 0),
    });
    assert.deepEqual(buildScores({ seo: 0, aeo: 0, geo: 0 }).scores, {
      seo: 100, aeo: 100, geo: 100, total: 100,
    });
  });

  test('한 robots 정책이 막은 crawler 6종은 대표 1건만 차감하고 상태는 모두 보존한다', () => {
    const result = evaluate(context(HEALTHY_HTML, {
      robots: { ...ROBOTS, body: 'User-agent: *\nDisallow: /\nSitemap: https://example.kr/sitemap.xml' },
    }));
    const crawlerIssues = result.issues.filter((issue) => issue.rootCause === 'robots-crawler-access');
    assert.equal(crawlerIssues.length, 6);
    assert.equal(crawlerIssues.filter((issue) => issue.scoreDeducted).length, 1);
    assert.equal(crawlerIssues.filter((issue) => issue.severity === 'info').length, 5);
    assert.equal(groupScanIssues(crawlerIssues).length, 1);
    assert.equal(actionableIssueCount(crawlerIssues), 1);
    assert.equal(result.deductions.seo, 18);
    assert.equal(result.deductions.geo, 0);
  });

  test('noindex가 만든 snippet 제한은 SEO 한 곳만 차감한다', () => {
    const html = HEALTHY_HTML.replace('</head>', '<meta name="robots" content="noindex"></head>');
    const result = evaluate(context(html));
    const directives = result.issues.filter((issue) => issue.rootCause === 'index-directive');
    assert.deepEqual(directives.map((issue) => issue.code), ['seo_noindex', 'geo_snippet_restricted']);
    assert.equal(directives.filter((issue) => issue.scoreDeducted).length, 1);
    assert.equal(result.deductions.seo, 20);
    assert.equal(result.deductions.geo, 0);
  });

  test('H1 누락과 제목 계층, 극소 본문과 빈 페이지도 각각 한 번만 차감한다', () => {
    const sparse = '<html lang="ko"><head><title>짧은 문서</title></head><body><main><p>내용</p></main></body></html>';
    const result = evaluate(context(sparse));
    for (const rootCause of ['heading-root-missing', 'insufficient-server-html']) {
      const grouped = result.issues.filter((issue) => issue.rootCause === rootCause);
      assert.ok(grouped.length >= 2, rootCause);
      assert.equal(grouped.filter((issue) => issue.scoreDeducted).length, 1, rootCause);
    }
  });

  test('robots 429/5xx는 crawler 차단으로 단정하지 않고 감액된 일시 오류 한 건으로 표시한다', () => {
    const result = evaluate(context(HEALTHY_HTML, {
      robots: { ...ROBOTS, status: 503, ok: false, body: '' },
    }));
    assert.equal(result.issues.some((issue) => /_blocked$/.test(issue.code)), false);
    assert.equal(result.issues.some((issue) => issue.code === 'seo_robots_txt'), false);
    const temporary = result.issues.filter((issue) => issue.code === 'seo_robots_temporarily_unavailable');
    assert.equal(temporary.length, 1);
    assert.equal(temporary[0].scoreDeducted, true);
    assert.equal(result.deductions.seo, 3);
  });

  test('robots 429/5xx만 짧은 지연 뒤 정확히 한 번 재시도한다', async () => {
    const responses: ProbedResource[] = [
      { ...ROBOTS, status: 503, ok: false },
      ROBOTS,
    ];
    let calls = 0;
    const waits: number[] = [];
    const result = await retryTransientProbe(
      async () => responses[calls++],
      async (milliseconds) => { waits.push(milliseconds); },
    );
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.deepEqual(waits, [120]);

    calls = 0;
    await retryTransientProbe(
      async () => {
        calls++;
        return { ...ROBOTS, status: 404, ok: false };
      },
      async () => { throw new Error('404는 재시도하면 안 됩니다'); },
    );
    assert.equal(calls, 1);
  });

  test('대표 정상/부분 문제/심각 시나리오 점수는 고정된 보정 스냅샷을 유지한다', () => {
    const healthy = evaluate(context());
    const partialHtml = HEALTHY_HTML
      .replace(/<meta name="description"[^>]+>/u, '')
      .replace(/<link rel="canonical"[^>]+>/u, '')
      .replace(/<script type="application\/ld\+json">[^<]+<\/script>/u, '')
      .replace('<html lang="ko">', '<html>');
    const partial = evaluate(context(partialHtml));
    const seriousHtml = '<html><head></head><body><div id="app"></div><script src="/app.js"></script></body></html>';
    const serious = evaluate(context(seriousHtml, {
      robots: { ...ROBOTS, body: 'User-agent: *\nDisallow: /' },
      ttfbMs: 3_500,
    }));
    const before = {
      healthy: legacyScores(context()),
      partial: legacyScores(context(partialHtml)),
      serious: legacyScores(context(seriousHtml, {
        robots: { ...ROBOTS, body: 'User-agent: *\nDisallow: /' },
        ttfbMs: 3_500,
      })),
    };
    assert.deepEqual(
      {
        before,
        after: { healthy: healthy.scores, partial: partial.scores, serious: serious.scores },
      },
      {
        before: {
          healthy: { seo: 100, aeo: 100, geo: 100, total: 100 },
          partial: { seo: 87, aeo: 93, geo: 90, total: 90 },
          serious: { seo: 0, aeo: 65, geo: 32, total: 32 },
        },
        after: {
          healthy: { seo: 100, aeo: 100, geo: 100, total: 100 },
          partial: { seo: 78, aeo: 74, geo: 74, total: 75 },
          serious: { seo: 49, aeo: 52, geo: 57, total: 53 },
        },
      },
    );
  });
});
