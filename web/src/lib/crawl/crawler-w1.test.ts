import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  APPROVED_TLS_HTTP_FALLBACK_HOSTS,
  DABOIM_CRAWLER_USER_AGENT,
  DESIGNATED_CRAWL_POLICY,
} from './contracts';
import { crawlDesignatedSite, CrawlError } from './crawler-core';
import { US_MEDICAL_OUTREACH_PROFILE_ID } from '@/lib/scan/profiles';

const ROOT = process.cwd();
const html = (body: string, links = '') => `<!doctype html><html><head>
  <title>인테리어 회사</title><meta name="description" content="공간 설계">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  </head><body><main>${body}${links}</main></body></html>`;

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}

function validated(raw: string): Promise<URL> {
  return Promise.resolve(new URL(raw));
}

describe('CRAWL W1 — designated crawl', () => {
  test('robots is fetched first, requests are serial, and same-origin pages are bounded', async () => {
    const calls: string[] = [];
    const waits: number[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (init?.method === 'HEAD') return response('', { status: 200 });
      if (url.endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } });
      }
      if (url.endsWith('/')) {
        return response(html('홈', [
          '<a href="/about">소개</a>',
          '<a href="/login">로그인</a>',
          '<a href="/index.php?mid=home&act=dispMemberLoginForm">회원 로그인</a>',
          '<a href="/index.php?mid=home&act=dispMemberSignUpForm">회원가입</a>',
          '<a href="/index.php?mid=home&act=dispMemberFindAccount">계정 찾기</a>',
          '<a href="/work?action=delete">삭제</a>',
          '<a href="https://outside.example/x">외부</a>',
          '<form method="post" action="/member/join"><p>회원가입 전용 문구</p></form>',
        ].join('')));
      }
      return response(html('소개'));
    };
    const result = await crawlDesignatedSite(
      { url: 'http://example.com/' },
      {
        fetchFn,
        validateUrl: validated,
        wait: async (milliseconds) => { waits.push(milliseconds); },
        now: () => new Date('2026-07-24T00:00:00.000Z'),
      },
    );
    assert.equal(calls[0], 'https://example.com/');
    assert.equal(calls[1], 'https://example.com/robots.txt');
    assert.deepEqual(result.pages.map((page) => page.url), [
      'https://example.com/',
      'https://example.com/about',
    ]);
    assert.ok(waits.every((value) => value <= DESIGNATED_CRAWL_POLICY.minRequestIntervalMs));
    assert.equal(result.pages.some((page) => page.url.includes('outside.example')), false);
    assert.equal(result.pages.some((page) => /login|action=delete/u.test(page.url)), false);
    assert.equal(result.pages[0].text.includes('회원가입 전용 문구'), false);
    assert.deepEqual(result.skippedUrls, [
      { url: 'https://example.com/login', reason: 'auth_or_account' },
      { url: 'https://example.com/index.php', reason: 'auth_or_account' },
      { url: 'https://example.com/work', reason: 'side_effect' },
    ]);
    assert.equal(calls.some((url) => /login|member|action=delete/iu.test(url)), false);
  });

  test('robots denial and platform multi-page targets fail closed', async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      if (init?.method === 'HEAD') return response('');
      if (String(input).endsWith('/robots.txt')) {
        return response('User-agent: DaboimCrawler\nDisallow: /', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      return response(html('홈'));
    };
    await assert.rejects(
      crawlDesignatedSite(
        { url: 'http://example.com/' },
        { fetchFn, validateUrl: validated, wait: async () => undefined },
      ),
      (error: unknown) => error instanceof CrawlError && error.code === 'ROBOTS_BLOCKED',
    );
    await assert.rejects(
      crawlDesignatedSite(
        { url: 'https://www.instagram.com/shop/' },
        { fetchFn, validateUrl: validated, wait: async () => undefined },
      ),
      (error: unknown) => error instanceof CrawlError && error.code === 'PLATFORM_HOST_BLOCKED',
    );
  });

  test('robots redirects may cross origins only within one registrable domain and record the chain', async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (init?.method === 'HEAD') return response('');
      if (url === 'https://example.com/robots.txt') {
        return response('', {
          status: 301,
          headers: { location: 'https://www.example.com/robots.txt' },
        });
      }
      if (url === 'https://www.example.com/robots.txt') {
        return response('User-agent: *\nAllow: /', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sitemap.xml')) return response('', { status: 404 });
      return response(html('홈'));
    };
    const result = await crawlDesignatedSite(
      { url: 'http://example.com/' },
      { fetchFn, validateUrl: validated, wait: async () => undefined },
    );
    assert.equal(result.robots.url, 'https://www.example.com/robots.txt');
    assert.deepEqual(result.robots.redirectChain, [
      'https://example.com/robots.txt',
      'https://www.example.com/robots.txt',
    ]);
    assert.equal(calls.includes('https://www.example.com/robots.txt'), true);
  });

  test('robots redirects to another registrable domain remain blocked before the target fetch', async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (init?.method === 'HEAD') return response('');
      if (url.endsWith('/robots.txt')) {
        return response('', {
          status: 302,
          headers: { location: 'https://outside.example/robots.txt' },
        });
      }
      return response(html('홈'));
    };
    await assert.rejects(
      crawlDesignatedSite(
        { url: 'http://example.com/' },
        { fetchFn, validateUrl: validated, wait: async () => undefined },
      ),
      (error: unknown) => error instanceof CrawlError && error.code === 'ROBOTS_UNAVAILABLE',
    );
    assert.equal(calls.includes('https://outside.example/robots.txt'), false);
  });

  test('an HTML robots destination is treated as absent while page redirects stay exact-origin', async () => {
    const htmlRobotsFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === 'HEAD') return response('');
      if (url.endsWith('/robots.txt')) return response(html('not a robots policy'));
      if (url.endsWith('/sitemap.xml')) return response('', { status: 404 });
      return response(html('홈'));
    };
    const result = await crawlDesignatedSite(
      { url: 'http://example.com/' },
      { fetchFn: htmlRobotsFetch, validateUrl: validated, wait: async () => undefined },
    );
    assert.equal(result.pages.length, 1);
    assert.equal(result.robots.crawlerAllowed, true);

    const calls: string[] = [];
    const pageRedirectFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (init?.method === 'HEAD') return response('');
      if (url.endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sitemap.xml')) return response('', { status: 404 });
      return response('', {
        status: 302,
        headers: { location: 'https://www.example.com/' },
      });
    };
    await assert.rejects(
      crawlDesignatedSite(
        { url: 'http://example.com/' },
        { fetchFn: pageRedirectFetch, validateUrl: validated, wait: async () => undefined },
      ),
      (error: unknown) => error instanceof CrawlError && error.code === 'NOT_HTML',
    );
    assert.equal(calls.includes('https://www.example.com/'), false);
  });

  test('pilot certificate fallback requires exact host allowlist and explicit admin flag', async () => {
    const certificateFailure = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' },
    });
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith('https://')) throw certificateFailure;
      if (url.endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } });
      }
      if (init?.method === 'HEAD') return response('');
      return response(html('인테리어'));
    };
    const approved = await crawlDesignatedSite(
      { url: 'http://iidgn.com/', allowTlsHttpFallback: true },
      { fetchFn, validateUrl: validated, wait: async () => undefined },
    );
    assert.equal(APPROVED_TLS_HTTP_FALLBACK_HOSTS.has('iidgn.com'), true);
    assert.deepEqual(approved.tls, {
      httpsUrl: 'https://iidgn.com/',
      status: 'certificate_error',
      errorCode: 'DEPTH_ZERO_SELF_SIGNED_CERT',
      httpFallbackApproved: true,
      httpFallbackUsed: true,
    });
    await assert.rejects(
      crawlDesignatedSite(
        { url: 'http://iidgn.com/' },
        { fetchFn, validateUrl: validated, wait: async () => undefined },
      ),
      (error: unknown) => (
        error instanceof CrawlError && error.code === 'TLS_FALLBACK_NOT_APPROVED'
      ),
    );
  });

  test('stored projection excludes raw HTML, bytes, cookies, IP and UA fields', async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      if (init?.method === 'HEAD') return response('');
      if (String(input).endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', {
          headers: {
            'content-type': 'text/plain',
            'set-cookie': 'secret=1',
          },
        });
      }
      return response(html('<img src="/room.jpg" alt="공간"><p>공간 설명</p>'), {
        headers: { 'set-cookie': 'secret=1' },
      });
    };
    const result = await crawlDesignatedSite(
      { url: 'http://example.com/' },
      { fetchFn, validateUrl: validated, wait: async () => undefined },
    );
    const serialized = JSON.stringify(result);
    for (const forbidden of ['rawHtml', 'imageBytes', 'set-cookie', 'secret=1', 'ipAddress', 'userAgent']) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    assert.equal(result.pages[0].images[0].url, 'https://example.com/room.jpg');
  });

  test('US medical crawl stores only deterministic palette preset + source hash projection', async () => {
    const source = html(
      '<style>:root{--practice-accent:#0e7a80}</style><p>Dental services and appointment information.</p>',
    );
    const fetchFn: typeof fetch = async (input, init) => {
      if (init?.method === 'HEAD') return response('');
      if (String(input).endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      return response(source);
    };
    const result = await crawlDesignatedSite(
      {
        url: 'http://example.com/',
        scanProfileId: US_MEDICAL_OUTREACH_PROFILE_ID,
      },
      { fetchFn, validateUrl: validated, wait: async () => undefined },
    );
    assert.deepEqual(result.clinicPaletteProjection, {
      version: 1,
      kind: 'css',
      sourceSha256: result.clinicPaletteProjection?.sourceSha256,
      accentPreset: 'clean-teal',
    });
    assert.match(result.clinicPaletteProjection?.sourceSha256 ?? '', /^[a-f0-9]{64}$/u);
    const serialized = JSON.stringify(result.clinicPaletteProjection);
    assert.doesNotMatch(serialized, /#0e7a80|--practice-accent|colors/iu);
  });

  test('protected redirects are recorded without following the login target', async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (init?.method === 'HEAD') return response('');
      if (url.endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sitemap.xml')) return response('', { status: 404 });
      if (url.endsWith('/')) return response(html('홈', '<a href="/private">회원 공간</a>'));
      if (url.endsWith('/private')) {
        return response('', { status: 302, headers: { location: '/login' } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const result = await crawlDesignatedSite(
      { url: 'http://example.com/' },
      { fetchFn, validateUrl: validated, wait: async () => undefined },
    );
    assert.deepEqual(result.skippedUrls, [
      { url: 'https://example.com/private', reason: 'auth_redirect' },
    ]);
    assert.equal(calls.includes('http://example.com/login'), false);
  });

  test('sitemap-discovered authentication query actions are rejected before fetch', async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (init?.method === 'HEAD') return response('');
      if (url.endsWith('/robots.txt')) {
        return response('User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml', {
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sitemap.xml')) {
        return response([
          '<urlset>',
          '<url><loc>https://example.com/</loc></url>',
          '<url><loc>https://example.com/index.php?mid=home&amp;act=dispMemberLoginForm</loc></url>',
          '<url><loc>https://example.com/index.php?mid=home&amp;act=dispMemberSignUpForm</loc></url>',
          '<url><loc>https://example.com/index.php?mid=home&amp;act=dispMemberFindAccount</loc></url>',
          '</urlset>',
        ].join(''), { headers: { 'content-type': 'application/xml' } });
      }
      return response(html('홈'));
    };
    const result = await crawlDesignatedSite(
      { url: 'http://example.com/' },
      { fetchFn, validateUrl: validated, wait: async () => undefined },
    );
    assert.deepEqual(result.pages.map((page) => page.url), ['https://example.com/']);
    assert.deepEqual(result.skippedUrls, [
      { url: 'https://example.com/index.php', reason: 'auth_or_account' },
    ]);
    assert.equal(calls.some((url) => /dispMember/iu.test(url)), false);
  });

  test('migration and admin boundary keep artifacts service-role only', () => {
    const migration = readFileSync(`${ROOT}/../supabase/migrations/0046_crawler_lite.sql`, 'utf8');
    const route = readFileSync(`${ROOT}/src/app/api/admin/crawl/route.ts`, 'utf8');
    assert.match(migration, /create table public\.crawl_artifacts/u);
    assert.match(migration, /create table public\.shared_site_previews/u);
    assert.match(migration, /revoke all on table public\.crawl_artifacts[\s\S]*public, anon, authenticated, service_role/u);
    assert.doesNotMatch(migration, /--[^\n]*\$/u);
    assert.match(route, /requireAdminOr403\(\)/u);
    assert.match(route, /allowTlsHttpFallback/u);
    assert.match(DABOIM_CRAWLER_USER_AGENT, /DaboimCrawler\/1\.0/u);
    assert.doesNotMatch(readFileSync(`${ROOT}/src/lib/crawl/crawler-core.ts`, 'utf8'), /method:\s*['"]POST/u);
  });
});
