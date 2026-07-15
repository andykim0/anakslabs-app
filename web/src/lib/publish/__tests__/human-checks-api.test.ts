import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { publishSite } from '@/components/dashboard/api';
import { publishSiteRequest } from '@/components/editor/api';
import type { PublishHumanChecks } from '@/lib/publish/human-checks';

const originalFetch = globalThis.fetch;
const confirmed: PublishHumanChecks = {
  heroPhotoAuthentic: true,
  copyIsFactual: true,
  worthThePrice: true,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function okResponse(): Response {
  return new Response(JSON.stringify({
    site: {},
    url: null,
    preflight: {
      warnings: ['운영 QA 확인'],
      needsQa: true,
      qaChecklist: [{ id: 'qa-1', title: '확인', description: '설명' }],
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('발행 클라이언트 휴먼 체크 배선', () => {
  test('에디터 경로가 사업자 확인과 실제 휴먼 체크값을 함께 전송한다', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return okResponse();
    }) as typeof fetch;

    const result = await publishSiteRequest('site/한글', confirmed);

    assert.equal(requestUrl, '/api/sites/site%2F%ED%95%9C%EA%B8%80/publish');
    assert.equal(requestInit?.method, 'POST');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      businessInfoConfirmed: true,
      humanChecks: confirmed,
    });
    assert.deepEqual(result.preflight.warnings, ['운영 QA 확인']);
  });

  test('대시보드 경로도 동일한 서버 계약을 전송한다', async () => {
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (_url, init) => {
      requestInit = init;
      return okResponse();
    }) as typeof fetch;

    const result = await publishSite('site-1', confirmed);

    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      businessInfoConfirmed: true,
      humanChecks: confirmed,
    });
    assert.equal(result.preflight.needsQa, true);
  });
});
