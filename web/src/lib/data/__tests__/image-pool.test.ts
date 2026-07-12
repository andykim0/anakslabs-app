/**
 * [F3 #2a] buildImagePool — 사용자 실사 우선, 부족분만 AI. shouldSkipAiPool.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePool, shouldSkipAiPool } from '@/lib/data/image-pool';

describe('buildImagePool — 실사 > AI 우선순위', () => {
  test('사진 있으면 히어로 = 첫 사진, 풀 선두 = 나머지 사진(→AI 뒤)', () => {
    const r = buildImagePool({
      storePhotos: ['/u/p1.jpg', '/u/p2.jpg', '/u/p3.jpg'],
      aiImages: ['/ai/a1.png', '/ai/a2.png'],
      heroFallback: '/cand/hero.svg',
    });
    assert.equal(r.heroImageUrl, '/u/p1.jpg', '히어로=첫 사진');
    // 나머지 사진이 AI보다 앞 → 섹션이 사진을 먼저 소비(부족분만 AI)
    assert.deepEqual(r.imagePool, ['/u/p2.jpg', '/u/p3.jpg', '/ai/a1.png', '/ai/a2.png']);
  });

  test('사진 없으면 히어로 = 폴백, 풀 = AI', () => {
    const r = buildImagePool({ storePhotos: [], aiImages: ['/ai/a1.png'], heroFallback: '/cand/hero.svg' });
    assert.equal(r.heroImageUrl, '/cand/hero.svg');
    assert.deepEqual(r.imagePool, ['/ai/a1.png']);
  });

  test('사진·AI 전무 시 풀은 히어로 폴백 1장(빈 풀 방지)', () => {
    const r = buildImagePool({ aiImages: [], heroFallback: '/cand/hero.svg' });
    assert.deepEqual(r.imagePool, ['/cand/hero.svg']);
  });

  test('사진 1장이면 히어로에만 쓰이고 풀은 AI', () => {
    const r = buildImagePool({ storePhotos: ['/u/only.jpg'], aiImages: ['/ai/a1.png'], heroFallback: '/f.svg' });
    assert.equal(r.heroImageUrl, '/u/only.jpg');
    assert.deepEqual(r.imagePool, ['/ai/a1.png']);
  });
});

describe('shouldSkipAiPool — 사진 충분 시 AI 생성 스킵(실비용 절감)', () => {
  test('2장 이상이면 스킵', () => {
    assert.equal(shouldSkipAiPool(['/a', '/b']), true);
    assert.equal(shouldSkipAiPool(['/a', '/b', '/c']), true);
  });
  test('0~1장이면 생성', () => {
    assert.equal(shouldSkipAiPool([]), false);
    assert.equal(shouldSkipAiPool(['/a']), false);
    assert.equal(shouldSkipAiPool(undefined), false);
  });
});
