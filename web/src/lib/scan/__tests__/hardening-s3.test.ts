import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { ScanResultPanel } from '@/components/landing/LandingScanner';
import type { ScanIssue, ScanResult } from '@/lib/data/types';
import { SEO_RULES } from '@/lib/scan/checks/seo';
import {
  CLIENT_RENDER_RISK_CODE,
  CLIENT_RENDER_RISK_NOTICE,
  HTML_BASIS_NOTICE,
} from '@/lib/scan/limitations';
import { looksClientRendered } from '@/lib/scan/rendering-limit';
import { runRules, type RuleContext } from '@/lib/scan/rules';

function issue(): ScanIssue {
  return {
    code: CLIENT_RENDER_RISK_CODE,
    severity: 'info',
    label: '클라이언트 렌더링 위험',
    detail: '서버 HTML 기준 한계',
    pillar: 'seo',
    scoreDeducted: false,
  };
}

function result(issues: ScanIssue[]): ScanResult {
  return {
    id: 'scan-se3',
    url: 'https://example.kr/',
    scores: { seo: 72, aeo: 68, geo: 65, total: 68 },
    grade: 'C',
    issues,
    comparisons: [],
    clientId: null,
    createdAt: '2026-07-21T00:00:00.000Z',
  };
}

describe('SE$ S3 서버 HTML 진단 한계', () => {
  test('극소 본문과 앱 규모 JS 신호가 함께 있을 때만 클라이언트 렌더 위험을 감지한다', () => {
    const shell = parse('<html><head><title>앱</title></head><body><div id="root"></div><script src="/static/js/main.8af31c2.js"></script></body></html>');
    assert.equal(looksClientRendered(shell, '앱'), true);

    const noBundle = parse('<html><body><main><p>잠시만 기다려주세요.</p></main></body></html>');
    assert.equal(looksClientRendered(noBundle, '잠시만 기다려주세요.'), false);

    const serverContent = '가'.repeat(170);
    const hydrated = parse(`<html><body><main><p>${serverContent}</p></main><script src="/static/js/main.8af31c2.js"></script></body></html>`);
    assert.equal(looksClientRendered(hydrated, serverContent), false);
  });

  test('감지 규칙은 상세 상태만 만들고 SEO 점수를 차감하지 않는다', () => {
    const html = '<html><head><title>앱</title></head><body><div id="root"></div><script src="/assets/index-a1b2c3d4.js"></script></body></html>';
    const root = parse(html);
    const emptyProbe = { url: 'https://example.kr/robots.txt', status: 404, ok: false, body: '', contentType: 'text/plain', truncated: false };
    const ctx: RuleContext = {
      root,
      rawHtml: html,
      visibleText: '앱',
      url: new URL('https://example.kr/'),
      status: 200,
      contentType: 'text/html',
      xRobotsTag: '',
      truncated: false,
      ttfbMs: 100,
      robots: emptyProbe,
      sitemap: { ...emptyProbe, url: 'https://example.kr/sitemap.xml' },
    };
    const onlyRiskRule = SEO_RULES.filter((rule) => rule.code === CLIENT_RENDER_RISK_CODE);
    const run = runRules(onlyRiskRule, ctx);
    assert.equal(run.deducted, 0);
    assert.deepEqual(run.issues.map((item) => ({ code: item.code, severity: item.severity, scoreDeducted: item.scoreDeducted })), [
      { code: CLIENT_RENDER_RISK_CODE, severity: 'info', scoreDeducted: false },
    ]);
  });

  test('모든 결과에 HTML 기준 고지가 있고 감지된 결과만 상단 경고를 보인다', () => {
    const ordinary = renderToStaticMarkup(createElement(ScanResultPanel, { scan: result([]), shared: true }));
    assert.match(ordinary, new RegExp(HTML_BASIS_NOTICE));
    assert.doesNotMatch(ordinary, /role="alert"/u);

    const risky = renderToStaticMarkup(createElement(ScanResultPanel, { scan: result([issue()]), shared: true }));
    assert.match(risky, new RegExp(CLIENT_RENDER_RISK_NOTICE));
    assert.match(risky, /role="alert"/u);
    assert.match(risky, new RegExp(HTML_BASIS_NOTICE));
  });
});
