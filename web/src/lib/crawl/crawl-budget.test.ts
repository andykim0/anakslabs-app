import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { crawlDesignatedSite } from './crawler-core';
import { DESIGNATED_CRAWL_POLICY } from './contracts';

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers ?? {}) },
    ...init,
  });
}

const validated = async (raw: string) => new URL(raw.replace(/^http:/u, 'https:'));

/** A site with more pages than any one crawl should take: every page links to the next two. */
function fanOutFetch(): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    if (init?.method === 'HEAD') return response('', { status: 200 });
    if (url.endsWith('/robots.txt')) {
      return response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } });
    }
    const n = Number(/\/p(\d+)/u.exec(url)?.[1] ?? '0');
    return response(
      `<html><head><title>Page ${n}</title></head><body><h1>Page ${n}</h1>`
      + `<p>${'source text '.repeat(40)}</p>`
      + `<a href="/p${n * 2 + 1}">next</a><a href="/p${n * 2 + 2}">other</a>`
      + '</body></html>',
    );
  };
}

describe('CRAWL A — the wall-clock budget is the bound the platform enforces', () => {
  test('예산에 닿으면 그때까지 수집한 아티팩트를 보존한 채 스스로 멈춘다', async () => {
    // A clock that advances a hundred seconds per page: the budget binds long before the cap.
    let clock = 0;
    const result = await crawlDesignatedSite(
      { url: 'http://example.com/p0' },
      {
        fetchFn: fanOutFetch(),
        validateUrl: validated,
        wait: async () => {},
        now: () => { clock += 100_000; return new Date(clock); },
      },
    );
    assert.equal(result.stoppedReason, 'time_budget');
    // Preserved, not discarded: a shorter artifact is the whole point of stopping deliberately.
    assert.ok(result.pages.length > 0, 'the partial artifact must survive the stop');
    assert.ok(result.pages.length < DESIGNATED_CRAWL_POLICY.maxPages);
    assert.ok(result.pages.every((page) => page.text.length > 0));
    assert.equal(result.robots.crawlerAllowed, true);
  });

  test('예산이 남아 있으면 페이지 상한이 이유가 된다', async () => {
    const result = await crawlDesignatedSite(
      { url: 'http://example.com/p0' },
      {
        fetchFn: fanOutFetch(),
        validateUrl: validated,
        wait: async () => {},
        // A clock that never advances: only the page cap can stop this crawl.
        now: () => new Date('2026-08-12T00:00:00.000Z'),
        pageLimit: 8,
      },
    );
    assert.equal(result.stoppedReason, 'page_limit');
    assert.equal(result.pages.length, 8);
  });

  test('정책 수치 — 지정 수집은 100페이지, 예산은 240초, 라우트 300초 아래다', () => {
    assert.equal(DESIGNATED_CRAWL_POLICY.maxPages, 100);
    assert.equal(DESIGNATED_CRAWL_POLICY.wallClockBudgetMs, 240_000);
    assert.equal(DESIGNATED_CRAWL_POLICY.minRequestIntervalMs, 1_000);
    assert.ok(DESIGNATED_CRAWL_POLICY.wallClockBudgetMs < 300_000);
  });
});
