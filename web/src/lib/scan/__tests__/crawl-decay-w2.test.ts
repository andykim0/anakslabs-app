import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';
import { describe, test } from 'node:test';
import { AEO_RULES } from '@/lib/scan/checks/aeo';
import { GEO_RULES } from '@/lib/scan/checks/geo';
import { SEO_RULES } from '@/lib/scan/checks/seo';
import { DECAY_SLOT_CAPACITY } from '@/lib/scan/decay-contract';
import { evaluateDecayScore } from '@/lib/scan/decay';
import { extractVisibleText } from '@/lib/scan/document';
import { ALL_SCAN_RULES } from '@/lib/scan/rule-registry';
import { createRuleRunState, runRules, type RuleContext } from '@/lib/scan/rules';
import { buildScores } from '@/lib/scan/score';

const ROBOTS = {
  url: 'https://example.com/robots.txt',
  status: 200,
  ok: true,
  body: 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n',
  contentType: 'text/plain',
  truncated: false,
};
const SITEMAP = {
  url: 'https://example.com/sitemap.xml',
  status: 200,
  ok: true,
  body: '<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url></urlset>',
  contentType: 'application/xml',
  truncated: false,
};

function context(input: {
  html: string;
  url?: string;
  ttfbMs?: number;
  observedAt?: string;
  lastModified?: string;
  social?: RuleContext['socialLinks'];
}): RuleContext {
  const root = parse(input.html);
  return {
    root,
    rawHtml: input.html,
    visibleText: extractVisibleText(root),
    url: new URL(input.url ?? 'https://example.com/'),
    status: 200,
    contentType: 'text/html; charset=utf-8',
    xRobotsTag: '',
    truncated: false,
    ttfbMs: input.ttfbMs ?? 100,
    robots: ROBOTS,
    sitemap: SITEMAP,
    observedAt: input.observedAt ?? '2026-07-24T00:00:00.000Z',
    lastModified: input.lastModified,
    socialLinks: input.social,
  };
}

const HEALTHY_HTML = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>정원 디자인 회사</title><meta name="description" content="공간 설계 회사 소개">
<link rel="canonical" href="https://example.com/">
<meta property="og:title" content="정원 디자인 회사">
<meta property="og:description" content="공간 설계 회사 소개">
<meta property="og:image" content="https://example.com/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"정원 디자인","url":"https://example.com/"}</script>
</head><body><main><h1>정원 디자인 회사</h1><section><h2>사업 분야</h2><p>공간의 목적과 이용 흐름을 살펴 설계합니다.</p></section></main>
<footer>Copyright © 2026 정원 디자인</footer></body></html>`;

function coreProjection(ctx: RuleContext) {
  const state = createRuleRunState();
  const seo = runRules(SEO_RULES, ctx, state);
  const aeo = runRules(AEO_RULES, ctx, state);
  const geo = runRules(GEO_RULES, ctx, state);
  return {
    issues: [...seo.issues, ...aeo.issues, ...geo.issues],
    ...buildScores({ seo: seo.deducted, aeo: aeo.deducted, geo: geo.deducted }),
  };
}

describe('CRAWL W2 — separate decay score', () => {
  test('slot capacities form an isolated 100-point advisory budget', () => {
    assert.equal(Object.values(DECAY_SLOT_CAPACITY).reduce((sum, value) => sum + value, 0), 100);
    const decayRules = ALL_SCAN_RULES.filter((rule) => rule.decaySlot);
    assert.ok(decayRules.length >= 8);
    for (const rule of decayRules) {
      assert.ok(rule.decayWeight && rule.decayWeight <= DECAY_SLOT_CAPACITY[rule.decaySlot!]);
    }
  });

  test('healthy input is 100 and the same observedAt is byte deterministic', () => {
    const ctx = context({ html: HEALTHY_HTML, lastModified: 'Thu, 23 Jul 2026 10:00:00 GMT' });
    const first = evaluateDecayScore(ctx);
    const second = evaluateDecayScore(ctx);
    assert.equal(first.score, 100);
    assert.deepEqual(first, second);
    assert.match(first.disclosure, /성과를 보장하지 않습니다/u);
  });

  test('pilot-like HTTP and exact legacy fingerprint are signals while viewport remains healthy', () => {
    const ctx = context({
      html: HEALTHY_HTML
        .replace('<meta name="viewport" content="width=device-width">', '<meta name="viewport" content="width=device-width"><script src="/js/jquery.easing.1.3.js"></script>')
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/u, ''),
      url: 'http://iidgn.com/',
      lastModified: 'Fri, 24 Jul 2026 01:00:00 GMT',
    });
    const result = evaluateDecayScore(ctx);
    assert.equal(result.score, 50);
    assert.deepEqual(result.signals.map((signal) => signal.code).sort(), [
      'aeo_jsonld_missing',
      'decay_legacy_builder_fingerprint',
      'seo_https',
    ]);
    assert.equal(result.signals.some((signal) => signal.code === 'seo_viewport'), false);
    assert.equal(result.signals.some((signal) => signal.code === 'decay_last_modified_stale'), false);
  });

  test('unknown freshness and social probe results never deduct; hard 404 does', () => {
    const unknown = evaluateDecayScore(context({
      html: HEALTHY_HTML.replace('Copyright © 2026 정원 디자인', '정원 디자인'),
      lastModified: 'not-a-date',
      social: [{ url: 'https://instagram.com/example', status: 'unknown', httpStatus: 429 }],
    }));
    assert.equal(unknown.score, 100);

    const stale = evaluateDecayScore(context({
      html: HEALTHY_HTML.replace('Copyright © 2026', 'Copyright © 2018'),
      lastModified: 'Tue, 01 Jan 2019 00:00:00 GMT',
      social: [{ url: 'https://instagram.com/example', status: 'dead', httpStatus: 404 }],
    }));
    assert.equal(stale.score, 80);
    assert.equal(stale.signals.filter((signal) => signal.slot === 'freshness').length, 2);
  });

  test('decay evaluation cannot change the existing SEO/AEO/GEO snapshot bytes', () => {
    const ctx = context({
      html: HEALTHY_HTML.replace('Copyright © 2026', 'Copyright © 2018'),
      url: 'http://example.com/',
    });
    const before = JSON.stringify(coreProjection(ctx));
    evaluateDecayScore(ctx);
    const after = JSON.stringify(coreProjection(ctx));
    assert.equal(createHash('sha256').update(after).digest('hex'), createHash('sha256').update(before).digest('hex'));
    assert.equal(after, before);
  });
});
