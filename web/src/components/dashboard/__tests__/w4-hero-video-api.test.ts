import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import {
  ApiError,
  applyHeroVideoDraft,
  generateHeroVideoDrafts,
  type HeroVideoDraftDto,
} from '@/components/dashboard/api';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function draft(index: number): HeroVideoDraftDto {
  return {
    videoUrl: `/videos/hero-${index}.mp4`,
    posterUrl: `/posters/hero-${index}.webp`,
    prompt: `registered safe prompt ${index}`,
    model: 'veo-fast',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('W4 — 히어로 영상 dashboard API', () => {
  test('POST는 정제된 입력을 전달하고 요청한 개수의 검증된 시안만 반환한다', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const expected = [draft(1), draft(2)];
    globalThis.fetch = (async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return jsonResponse({ drafts: expected });
    }) as typeof fetch;

    const actual = await generateHeroVideoDrafts('site/한글', {
      count: 2,
      tone: ['차분한'],
      heroPhotoUrl: '/uploads/hero.webp',
    });

    assert.equal(requestUrl, '/api/sites/site%2F%ED%95%9C%EA%B8%80/hero-video');
    assert.equal(requestInit?.method, 'POST');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      count: 2,
      tone: ['차분한'],
      heroPhotoUrl: '/uploads/hero.webp',
    });
    assert.deepEqual(actual, expected);
  });

  test('1..2 밖의 count는 요청 전에 차단한다', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse({ drafts: [] });
    }) as typeof fetch;

    await assert.rejects(
      generateHeroVideoDrafts('site-1', { count: 3, tone: [] }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 400 &&
        error.code === 'VALIDATION_ERROR',
    );
    assert.equal(calls, 0);
  });

  test('시안 개수 불일치나 필수 문자열 누락 응답은 INVALID_RESPONSE로 거부한다', async () => {
    const responses: unknown[] = [
      { drafts: [draft(1)] },
      { drafts: [draft(1), { ...draft(2), videoUrl: '' }] },
    ];
    globalThis.fetch = (async () => jsonResponse(responses.shift())) as typeof fetch;

    for (let index = 0; index < 2; index += 1) {
      await assert.rejects(
        generateHeroVideoDrafts('site-1', { count: 2, tone: [] }),
        (error: unknown) =>
          error instanceof ApiError &&
          error.status === 500 &&
          error.code === 'INVALID_RESPONSE' &&
          error.message === 'Failed to create video draft.',
      );
    }
  });

  test('PATCH는 고른 시안을 그대로 적용하고 ok 응답을 검증한다', async () => {
    const selected = draft(1);
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (_url, init) => {
      requestInit = init;
      return jsonResponse({ ok: true });
    }) as typeof fetch;

    await applyHeroVideoDraft('site-1', selected);
    assert.equal(requestInit?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), selected);

    globalThis.fetch = (async () => jsonResponse({ ok: false })) as typeof fetch;
    await assert.rejects(
      applyHeroVideoDraft('site-1', selected),
      (error: unknown) =>
        error instanceof ApiError &&
        error.code === 'INVALID_RESPONSE' &&
        error.message === 'Failed to apply video.',
    );
  });

  test('서버 에러 메시지는 기존 Studio 오류 UX가 표시할 Error.message로 보존한다', async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        { error: { code: 'VIDEO_GEN_ADDON', message: 'AI 영상 홈페이지 승인이 필요합니다.' } },
        403,
      )) as typeof fetch;

    await assert.rejects(
      generateHeroVideoDrafts('site-1', { count: 2, tone: [] }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 403 &&
        error.code === 'VIDEO_GEN_ADDON' &&
        error.message === 'AI 영상 홈페이지 승인이 필요합니다.',
    );
  });
});
