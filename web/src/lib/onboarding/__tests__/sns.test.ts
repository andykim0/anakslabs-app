/**
 * [v4 #2d] snsUrlFromHandle — 핸들/풀URL 어느 쪽이든 동일 정규화 URL.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SnsKind } from '@/lib/types/site';
import { snsUrlFromHandle, handleFromSnsUrl, SNS_BASES, hasHandleBase } from '@/lib/onboarding/sns';

describe('snsUrlFromHandle — 정규화', () => {
  const cases: { kind: SnsKind; inputs: string[]; expected: string }[] = [
    { kind: 'instagram', inputs: ['abc', '@abc', 'https://instagram.com/abc/', 'instagram.com/abc?igsh=x'], expected: 'https://instagram.com/abc' },
    { kind: 'youtube', inputs: ['abc', '@abc', 'https://youtube.com/@abc', 'youtube.com/@abc'], expected: 'https://youtube.com/@abc' },
    { kind: 'x', inputs: ['abc', '@abc', 'https://x.com/abc', 'x.com/abc?s=1'], expected: 'https://x.com/abc' },
    { kind: 'naver_blog', inputs: ['abc', 'https://blog.naver.com/abc', 'blog.naver.com/abc/'], expected: 'https://blog.naver.com/abc' },
    { kind: 'kakao_channel', inputs: ['abc', 'https://pf.kakao.com/abc', 'pf.kakao.com/abc'], expected: 'https://pf.kakao.com/abc' },
  ];

  for (const c of cases) {
    test(`${c.kind}: 모든 입력형이 ${c.expected}로`, () => {
      for (const input of c.inputs) {
        assert.equal(snsUrlFromHandle(c.kind, input), c.expected, `입력 "${input}"`);
      }
    });
  }

  test('custom은 입력(URL)을 그대로', () => {
    assert.equal(snsUrlFromHandle('custom', 'https://example.com/x'), 'https://example.com/x');
  });

  test('SNS_BASES 키는 전부 유효한 SnsKind (custom 제외)', () => {
    for (const k of Object.keys(SNS_BASES) as SnsKind[]) {
      assert.ok(hasHandleBase(k));
      assert.notEqual(k, 'custom');
    }
  });
});

describe('handleFromSnsUrl — 역추출(라운드트립)', () => {
  test('정규화 URL → 핸들 → 다시 정규화 = 동일', () => {
    for (const kind of ['instagram', 'youtube', 'x', 'naver_blog', 'kakao_channel'] as SnsKind[]) {
      const url = snsUrlFromHandle(kind, 'abc');
      const handle = handleFromSnsUrl(kind, url);
      assert.equal(handle, 'abc', `${kind} 역추출`);
      assert.equal(snsUrlFromHandle(kind, handle), url, `${kind} 라운드트립`);
    }
  });
});
