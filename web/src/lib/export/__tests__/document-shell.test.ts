/**
 * [S-batch] 정적 발행 문서 셸 — canonical + JSON-LD(단일 소스) 방출.
 * (renderStaticDocument는 server-only — 문서 조립부(buildDocumentShell)를 직접 검증.
 *  본문 직렬화는 static-motion-smoke가 SiteRenderer 미러로 커버.)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SiteConfig } from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import { buildDocumentShell, heroPosterPreloadHtml } from '@/lib/export/document-shell';
import { canonicalUrlFor, jsonLdScriptContent, siteUrlOf } from '@/lib/seo/structured-data';

function cfg(): SiteConfig {
  const c = emptySiteConfig('소소한자리');
  c.meta = { title: '소소한자리 — 카페 · 서울 연희동', description: '서울 연희동 소소한자리 · 음식점' };
  c.pages = [
    { id: 'home', title: '홈', slug: '', sections: [{ id: 'sec-hero', type: 'hero', name: '히어로', height: 800, background: {}, elements: [] }] },
    { id: 'menu', title: '메뉴', slug: 'menu', sections: [{ id: 'sec-menu', type: 'menu', name: '메뉴', height: 600, background: {}, elements: [] }] },
  ];
  return c;
}
const SITE_URL = 'https://soso.anakslabs.com';

function shell(pageSlug: string, siteUrl?: string): string {
  return buildDocumentShell({ config: cfg(), pageSlug, headerHtml: '', bodyHtml: '<div class="anaks-site"></div>', siteUrl });
}

describe('structured-data 단일 소스', () => {
  test('siteUrlOf / canonicalUrlFor — 홈·서브·미상·트레일링 슬래시', () => {
    assert.equal(siteUrlOf('soso.anakslabs.com'), SITE_URL);
    assert.equal(siteUrlOf(null), '');
    assert.equal(canonicalUrlFor(SITE_URL, ''), SITE_URL);
    assert.equal(canonicalUrlFor(`${SITE_URL}/`, 'menu'), `${SITE_URL}/menu`);
    assert.equal(canonicalUrlFor('', 'menu'), null);
  });
  test("jsonLdScriptContent — '<' 이스케이프(스크립트 탈출 차단) + JSON 동치", () => {
    const c = cfg();
    c.meta.description = '</script><b>주입';
    const s = jsonLdScriptContent(c, SITE_URL);
    assert.ok(!s.includes('</script>'), '스크립트 탈출 문자열 잔존');
    const parsed = JSON.parse(s) as { description?: string }[];
    assert.ok(parsed.some((n) => n.description === '</script><b>주입'), '이스케이프 후 JSON 의미 보존');
  });
});

describe('buildDocumentShell — 서빙 레이어 방출', () => {
  test('default document language is English and an explicit en-US tag is preserved', () => {
    assert.match(shell(''), /<html lang="en">/u);
    const config = cfg();
    config.meta.locale = 'en-US';
    config.meta.jurisdiction = 'US';
    const html = buildDocumentShell({
      config,
      pageSlug: '',
      headerHtml: '',
      bodyHtml: '<main></main>',
      lang: config.meta.locale,
      siteUrl: SITE_URL,
    });
    assert.match(html, /<html lang="en-US">/u);
    assert.match(html, /property="og:locale" content="en_US"/u);
  });

  test('standalone legal export declares English instead of the retired Korean default', () => {
    const source = readFileSync(new URL('../legal-html.ts', import.meta.url), 'utf8');
    assert.match(source, /<html lang="en">/u);
    assert.doesNotMatch(source, /<html lang="ko">/u);
  });

  test('canonical — 홈·서브페이지 URL 정확', () => {
    assert.ok(shell('', SITE_URL).includes(`<link rel="canonical" href="${SITE_URL}">`));
    assert.ok(shell('menu', SITE_URL).includes(`<link rel="canonical" href="${SITE_URL}/menu">`));
  });
  test('ld+json 존재 + JSON 파싱 가능 + @type 적합(LocalBusiness·WebSite)', () => {
    const html = shell('', SITE_URL);
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(m, 'ld+json 스크립트 없음');
    const nodes = JSON.parse(m![1]) as { '@type': string }[];
    const types = nodes.map((n) => n['@type']);
    assert.ok(types.includes('LocalBusiness'), `menu 섹션 보유 → LocalBusiness (실제: ${types.join(',')})`);
    assert.ok(types.includes('WebSite'));
  });
  test('meta description + title 규칙(서브="페이지명 · 사이트명") 유지', () => {
    const html = shell('menu', SITE_URL);
    assert.ok(html.includes('name="description"'));
    assert.ok(html.includes('<title>메뉴 · 소소한자리 — 카페 · 서울 연희동</title>'));
  });
  test('검색 발췌 허용과 절대 OG 이미지 URL을 방출', () => {
    const config = cfg();
    config.meta.ogImage = '/images/cover.webp';
    const html = buildDocumentShell({
      config,
      pageSlug: '',
      headerHtml: '',
      bodyHtml: '<main></main>',
      siteUrl: SITE_URL,
    });
    assert.ok(
      html.includes(
        'name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"',
      ),
    );
    assert.ok(
      html.includes(`property="og:image" content="${SITE_URL}/images/cover.webp"`),
    );
  });
  test('siteUrl 미상이면 canonical·ld+json 생략(오프라인 zip 하위호환)', () => {
    const html = shell('');
    assert.ok(!html.includes('rel="canonical"'));
    assert.ok(!html.includes('ld+json'));
  });

  test('페이지 히어로 영상 poster를 <head>에서 high priority preload한다', () => {
    const config = cfg();
    config.pages[0].sections[0].background.video = {
      src: 'assets/0123abcd.mp4',
      poster: 'assets/deadbeef.webp',
      bytes: 2_000_000,
    };
    const preload = '<link rel="preload" as="image" href="assets/deadbeef.webp" fetchpriority="high">';
    const reactAutoPreload = '<link rel="preload" as="image" href="assets/deadbeef.webp" fetchPriority="high"/>';
    const html = buildDocumentShell({ config, pageSlug: '', headerHtml: '', bodyHtml: `${reactAutoPreload}<main></main>` });
    assert.equal(heroPosterPreloadHtml(config, ''), preload);
    assert.ok(html.slice(0, html.indexOf('</head>')).includes(preload), 'poster preload가 head 밖에 있음');
    assert.equal((html.match(/href="assets\/deadbeef\.webp"/g) ?? []).length, 1, 'React 자동 preload와 중복됨');
    assert.doesNotMatch(html.slice(html.indexOf('<body>')), /rel="preload"[^>]*deadbeef/);
  });

  test('hero가 아닌 섹션 poster와 임의 상대경로는 preload하지 않는다', () => {
    const config = cfg();
    config.pages[0].sections[0].background.video = { src: '/hero.mp4', poster: '../escape.webp' };
    config.pages[0].sections.push({
      id: 'video-later', type: 'features', name: '후속', height: 400,
      background: { video: { src: '/later.mp4', poster: '/later.webp' } }, elements: [],
    });
    assert.equal(heroPosterPreloadHtml(config, ''), '');
  });

  test('v2 시그니처가 첫 섹션을 소유하면 해당 poster만 LCP 후보가 된다', () => {
    const config = cfg();
    config.pages[0].sections[0].background.video = { src: '/legacy.mp4', poster: '/legacy.webp' };
    config.motion = {
      presetId: 'base-premium-v2', intensity: 'normal', catalogVersion: 2,
      signatures: [{
        signatureId: 'cinematic-scrub', pageId: 'home', sectionId: 'sec-hero', heading: '시네마틱',
        media: {
          id: 'signature-video', kind: 'video', src: 'assets/0123abcd.mp4', poster: 'assets/deadbeef.webp',
          alt: '브랜드 영상', width: 1920, height: 1080, provenance: 'customer-provided',
        },
      }],
    };
    assert.equal(
      heroPosterPreloadHtml(config, ''),
      '<link rel="preload" as="image" href="assets/deadbeef.webp" fetchpriority="high">',
    );
  });

  test('정적 히어로 이미지는 영상이 없어도 단 하나의 LCP 후보가 된다', () => {
    const config = cfg();
    config.pages[0].sections[0].background.image = { src: 'assets/deadbeef.webp' };
    assert.equal(
      heroPosterPreloadHtml(config, ''),
      '<link rel="preload" as="image" href="assets/deadbeef.webp" fetchpriority="high">',
    );
  });
});
