import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { parse } from 'node-html-parser';
import { AEO_RULES } from '@/lib/scan/checks/aeo';
import { GEO_RULES } from '@/lib/scan/checks/geo';
import { SEO_RULES } from '@/lib/scan/checks/seo';
import type { ProbedResource } from '@/lib/scan/fetch-target';
import type { RuleContext, ScanRule } from '@/lib/scan/rules';
import { probeDeclaredSitemap } from '@/lib/scan/sitemap';
import { fastestTtfb } from '@/lib/scan/ttfb';

const ROBOTS: ProbedResource = {
  url: 'https://example.kr/robots.txt',
  status: 200,
  ok: true,
  body: 'User-agent: *\nAllow: /',
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

function context(html: string, overrides: Partial<RuleContext> = {}): RuleContext {
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

function failed(rules: ScanRule[], code: string, ctx: RuleContext): boolean {
  const rule = rules.find((candidate) => candidate.code === code);
  assert.ok(rule, `${code} 규칙이 없습니다`);
  return rule.failed(ctx);
}

function resource(url: string, options: Partial<ProbedResource> = {}): ProbedResource {
  return {
    ...SITEMAP,
    url,
    ...options,
  };
}

describe('SE$ S2 휴리스틱 오탐 방지', () => {
  test('문서 head의 title만 세고 SVG 접근성 title은 중복으로 세지 않는다', () => {
    const oneDocumentTitle = context(`
      <html><head><title>문서 제목</title></head><body>
        <svg aria-labelledby="chart-title"><title id="chart-title">차트 설명</title></svg>
      </body></html>
    `);
    assert.equal(failed(SEO_RULES, 'seo_title_multiple', oneDocumentTitle), false);

    const twoDocumentTitles = context(`
      <html><head><title>첫 제목</title><title>둘째 제목</title></head><body>
        <svg><title>아이콘 설명</title></svg>
      </body></html>
    `);
    assert.equal(failed(SEO_RULES, 'seo_title_multiple', twoDocumentTitles), true);
  });

  test('robots Sitemap 지시자를 먼저 따르고 선언이 있을 때 기본 경로를 섞지 않는다', async () => {
    const calls: string[] = [];
    const robots = {
      ...ROBOTS,
      body: [
        'User-agent: *',
        'Allow: /',
        'Sitemap: https://cdn.example.kr/broken.xml',
        'Sitemap: https://example.kr/custom-map.xml',
      ].join('\n'),
    };
    const result = await probeDeclaredSitemap('https://example.kr', robots, async (_origin, path) => {
      calls.push(path);
      return path.endsWith('custom-map.xml')
        ? resource(path)
        : resource(path, { status: 404, ok: false, body: '' });
    });
    assert.equal(result.url, 'https://example.kr/custom-map.xml');
    assert.deepEqual(calls, [
      'https://cdn.example.kr/broken.xml',
      'https://example.kr/custom-map.xml',
    ]);
    assert.equal(calls.includes('/sitemap.xml'), false);
  });

  test('robots에 Sitemap 지시자가 없을 때만 /sitemap.xml을 확인한다', async () => {
    const calls: string[] = [];
    await probeDeclaredSitemap('https://example.kr', ROBOTS, async (_origin, path) => {
      calls.push(path);
      return resource(new URL(path, 'https://example.kr').toString());
    });
    assert.deepEqual(calls, ['/sitemap.xml']);
  });

  test('수치 주장의 같은 문단·섹션 안 출처만 인정하고 떨어진 푸터 링크는 인정하지 않는다', () => {
    const remoteSource = context(`
      <html><head><title>조사 결과</title></head><body><main>
        <section><p>조사에 따르면 손님이 40% 증가했습니다.</p></section>
      </main><footer><a href="https://source.example/report">출처</a></footer></body></html>
    `);
    assert.equal(failed(GEO_RULES, 'geo_unsourced_claims', remoteSource), true);

    const localSource = context(`
      <html><head><title>조사 결과</title></head><body><main>
        <section><p>조사에 따르면 손님이 40% 증가했습니다.</p>
        <p><a href="https://source.example/report">조사 원문</a></p></section>
      </main></body></html>
    `);
    assert.equal(failed(GEO_RULES, 'geo_unsourced_claims', localSource), false);
  });

  test('구조화 데이터 상호는 로고 alt·aria-label·og:site_name에서도 확인한다', () => {
    const evidence = [
      '<img src="/logo.svg" alt="별빛상점">',
      '<a href="/" aria-label="별빛상점 홈"><span aria-hidden="true">★</span></a>',
      '<meta property="og:site_name" content="별빛상점">',
    ];
    for (const identity of evidence) {
      const ctx = context(`
        <html><head><title>공식 홈페이지</title>${identity}</head><body>
          ${identity.startsWith('<meta') ? '' : identity}
          <main><p>전화 02-1234-5678</p><p>주소 서울특별시 성동구 별빛로 12</p></main>
          <script type="application/ld+json">{
            "@context":"https://schema.org","@type":"Organization","name":"별빛상점",
            "url":"https://example.kr/","telephone":"02-1234-5678","address":"서울특별시 성동구 별빛로 12"
          }</script>
        </body></html>
      `);
      assert.equal(failed(AEO_RULES, 'aeo_jsonld_visibility', ctx), false, identity);
    }
  });

  test('전화·주소는 접근성 이름으로 숨길 수 없고 실제 본문에 있어야 한다', () => {
    const ctx = context(`
      <html><head><title>공식 홈페이지</title><meta property="og:site_name" content="별빛상점"></head>
      <body aria-label="전화 02-1234-5678 주소 서울특별시 성동구 별빛로 12">
        <main><p>공식 안내입니다.</p></main>
        <script type="application/ld+json">{
          "@context":"https://schema.org","@type":"Organization","name":"별빛상점",
          "url":"https://example.kr/","telephone":"02-1234-5678","address":"서울특별시 성동구 별빛로 12"
        }</script>
      </body></html>
    `);
    assert.equal(failed(AEO_RULES, 'aeo_jsonld_visibility', ctx), true);
  });

  test('TTFB는 2회 중 빠른 값이며 검증 시간 제외·SSRF hop 재검증 계약을 유지한다', () => {
    assert.equal(fastestTtfb([1_240, 690]), 690);
    assert.equal(fastestTtfb([Number.NaN, 830]), 830);

    const source = readFileSync(join(process.cwd(), 'src/lib/scan/fetch-target.ts'), 'utf8');
    const sample = source.slice(
      source.indexOf('async function fetchTargetSample'),
      source.indexOf('/**\n * 본문을 읽는 첫 요청'),
    );
    assert.ok(sample.indexOf('assertPublicHttpUrl(rawUrl)') < sample.indexOf('const requestStarted'));
    assert.match(sample, /current = await assertPublicHttpUrl\(new URL\(loc, current\)\.toString\(\)\)/u);
    assert.match(source, /fetchTargetSample\(rawUrl, true\)/u);
    assert.match(source, /fetchTargetSample\(rawUrl, false\)/u);

    const slow = SEO_RULES.find((rule) => rule.code === 'seo_speed_slow');
    const verySlow = SEO_RULES.find((rule) => rule.code === 'seo_speed_very_slow');
    assert.equal(slow?.weight, 2);
    assert.equal(verySlow?.weight, 3);
    assert.match(`${slow?.detail} ${verySlow?.detail}`, /2회 측정/u);
    assert.match(`${slow?.detail} ${verySlow?.detail}`, /진단 서버 위치/u);
    assert.match(`${slow?.detail} ${verySlow?.detail}`, /참고 지표/u);
  });
});
