import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeMediaSrc, safeMediaSrc } from '@/lib/safe-url';

describe('safeMediaSrc — 정적 export 상대 자산', () => {
  test('수집기가 생성하는 좁은 assets/<sha1-8>.<ext> 형식만 허용한다', () => {
    assert.equal(safeMediaSrc('assets/0123abcd.mp4'), 'assets/0123abcd.mp4');
    assert.equal(safeMediaSrc('./assets/deadbeef.webp'), './assets/deadbeef.webp');
    assert.equal(isSafeMediaSrc('/media/hero.mp4'), true);
  });

  test('traversal·제어문자·query·임의 상대경로는 차단한다', () => {
    const unsafe = [
      'assets/../secret.mp4',
      '../assets/0123abcd.mp4',
      'assets/0123abcd.mp4?x=1',
      'assets/0123\nabcd.mp4',
      'media/0123abcd.mp4',
      'assets/notahash.mp4',
    ];
    for (const src of unsafe) assert.equal(isSafeMediaSrc(src), false, src);
  });
});
