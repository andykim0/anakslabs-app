import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('M4 기본 홈페이지 vs AI 영상 홈페이지 비교', () => {
  const source = read('src/components/marketing/PricingMotionComparison.tsx');
  const page = read('src/app/(marketing)/pricing/page.tsx');

  test('같은 장면을 기본 모션과 지연 영상으로 나란히 비교한다', () => {
    assert.match(source, /const POSTER_SRC = '\/daboim-visibility-film-poster\.webp'/);
    assert.ok((source.match(/<Poster/g) ?? []).length >= 2, '두 버전이 같은 poster 컴포넌트를 공유하지 않음');
    assert.match(source, /기본 홈페이지 · 기본 모션 포함/);
    assert.match(source, /AI 영상 홈페이지 · \+\{formatKrw\(PRICING\.videoHeroAddon\)\}/);
    assert.match(source, /예시 연출/);
    assert.match(page, /<PricingMotionComparison \/>/);
    assert.doesNotMatch(page, /<PreviewVideo/);
  });

  test('poster-first·CLS 예약·video lazy·무음 정책을 지킨다', () => {
    assert.match(source, /width=\{1920\}/);
    assert.match(source, /height=\{1080\}/);
    assert.match(source, /loading="lazy"/);
    assert.match(source, /decoding="async"/);
    assert.match(source, /preload="none"/);
    assert.match(source, /muted/);
    assert.match(source, /playsInline/);
    assert.match(source, /videoInView && !reduce && !failed/);
    assert.match(source, /\{canLoadVideo \? \(/);
    assert.doesNotMatch(source, /autoPlay|autoplay/);
  });

  test('가격은 단일 소스이며 고객에게 티어로 표현하지 않는다', () => {
    assert.match(source, /PRICING\.videoHeroAddon/);
    assert.doesNotMatch(source, /200000|200,000|20만원/);
    assert.doesNotMatch(source, /베이식|프리미엄|basic tier|premium tier/i);
  });
});
