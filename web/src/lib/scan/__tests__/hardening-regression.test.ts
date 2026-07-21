import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { parse } from 'node-html-parser';
import { AEO_RULES } from '@/lib/scan/checks/aeo';
import { GEO_RULES } from '@/lib/scan/checks/geo';
import { SEO_RULES } from '@/lib/scan/checks/seo';
import type { ProbedResource } from '@/lib/scan/fetch-target';
import { actionableIssueCount } from '@/lib/scan/issue-groups';
import { createRuleRunState, runRules, type RuleContext } from '@/lib/scan/rules';
import { buildScores, SCAN_SCORE_CAPACITY } from '@/lib/scan/score';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const ROBOTS: ProbedResource = {
  url: 'https://example.kr/robots.txt',
  status: 200,
  ok: true,
  body: 'User-agent: *\nDisallow: /\nSitemap: https://example.kr/sitemap.xml',
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

function hardCase(): RuleContext {
  const html = '<html><head><title>앱</title><meta name="robots" content="noindex"></head><body><div id="root"></div><script src="/static/js/main.a1b2c3d4.js"></script></body></html>';
  return {
    root: parse(html),
    rawHtml: html,
    visibleText: '앱',
    url: new URL('https://example.kr/'),
    status: 200,
    contentType: 'text/html; charset=utf-8',
    xRobotsTag: '',
    truncated: false,
    ttfbMs: 3_500,
    robots: ROBOTS,
    sitemap: SITEMAP,
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
    actionable: actionableIssueCount(issues),
  };
}

describe('SE$ S5 통합 회귀', () => {
  test('같은 입력은 보정 점수·등급·루트 원인 순서까지 완전히 결정적이다', () => {
    assert.deepEqual(evaluate(hardCase()), evaluate(hardCase()));
  });

  test('라이브와 발행 전 진단이 모두 필러 사이에 한 루트 원인 상태를 공유한다', () => {
    const live = read('src/lib/scan/index.ts');
    const preflight = read('src/lib/scan/preflight.ts');
    for (const source of [live, preflight]) {
      assert.match(source, /const runState = createRuleRunState\(\)/u);
      assert.match(source, /runRules\(SEO_RULES, ctx, runState\)/u);
      assert.match(source, /runRules\(AEO_RULES, ctx, runState\)/u);
      assert.match(source, /runRules\(GEO_RULES, ctx, runState\)/u);
    }

    const result = evaluate(hardCase());
    const crawlerStates = result.issues.filter((issue) => issue.rootCause === 'robots-crawler-access');
    assert.equal(crawlerStates.length, 6);
    assert.equal(crawlerStates.filter((issue) => issue.scoreDeducted).length, 1);
    assert.equal(actionableIssueCount(crawlerStates), 1);
  });

  test('점수 예산은 전체 규칙 가중 합과 일치하고 S1 시나리오 스냅샷 테스트를 유지한다', () => {
    assert.deepEqual(SCAN_SCORE_CAPACITY, {
      seo: SEO_RULES.reduce((sum, rule) => sum + rule.weight, 0),
      aeo: AEO_RULES.reduce((sum, rule) => sum + rule.weight, 0),
      geo: GEO_RULES.reduce((sum, rule) => sum + rule.weight, 0),
    });
    const scenarioTest = read('src/lib/scan/__tests__/hardening-s1.test.ts');
    assert.match(scenarioTest, /healthy: \{ seo: 100, aeo: 100, geo: 100, total: 100 \}/u);
    assert.match(scenarioTest, /partial: \{ seo: 78, aeo: 74, geo: 74, total: 75 \}/u);
    assert.match(scenarioTest, /serious: \{ seo: 49, aeo: 52, geo: 57, total: 53 \}/u);
  });

  test('SSRF hop 재검증과 순위 스크래핑 금지를 유지한다', () => {
    const fetchTarget = read('src/lib/scan/fetch-target.ts');
    assert.match(fetchTarget, /current = await assertPublicHttpUrl\(new URL\(loc, current\)\.toString\(\)\)/u);
    assert.match(fetchTarget, /current = await assertPublicHttpUrl\(new URL\(location, current\)\.toString\(\)\)/u);

    const scanSources = [
      'src/lib/scan/index.ts',
      'src/lib/scan/comparison.ts',
      'src/app/api/scan/route.ts',
    ].map(read).join('\n');
    assert.doesNotMatch(scanSources, /search\.naver\.com|google\.[a-z.]+\/search|bing\.com\/search/iu);
  });

  test('연구 문서는 S1~S4 근거·날짜와 진단 범위를 공개한다', () => {
    const research = read('../docs/SEO-GEO-AEO-KR.md');
    assert.match(research, /Last reviewed: 2026-07-21/u);
    assert.match(research, /score-calibration and robots error hardening/u);
    assert.match(research, /false-positive and response-time hardening/u);
    assert.match(research, /server-HTML diagnostic limitation/u);
    assert.match(research, /comparison-mode parity/u);
    assert.match(research, /developers\.google\.com\/crawling\/docs\/robots-txt/u);
    assert.match(research, /searchadvisor\.naver\.com\/guide\/seo-advanced-javascript/u);
    assert.match(research, /web\.dev\/articles\/ttfb/u);
  });
});
