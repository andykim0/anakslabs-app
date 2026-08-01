import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PricingMotionComparison } from '../PricingMotionComparison';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('M4 기본 홈페이지 vs AI 영상 홈페이지 비교', () => {
  const source = read('src/components/marketing/PricingMotionComparison.tsx');
  const page = read('src/app/(marketing)/pricing/page.tsx');

  test('같은 장면을 기본 모션과 지연 영상으로 나란히 비교한다', () => {
    assert.match(source, /const POSTER_SRC = '\/daboim-visibility-film-poster\.webp'/);
    assert.ok((source.match(/<Poster/g) ?? []).length >= 2, '두 버전이 같은 poster 컴포넌트를 공유하지 않음');
    assert.match(source, /기본 홈페이지 · 기본 모션 포함/);
    assert.match(source, /AI 영상 홈페이지 · 베이직 포함/);
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

  test('영상은 별도 가격 없이 베이직 포함으로 표현한다', () => {
    assert.doesNotMatch(source, /PRICING\.videoHeroAddon/);
    assert.doesNotMatch(source, /200000|200,000|20만원/);
    assert.match(source, /베이직 포함/);
    assert.doesNotMatch(source, /프리미엄|basic tier|premium tier/i);
  });

  test('M6 실제 SSR은 같은 poster 두 장과 포함 문구를 보여주고 영상은 초기 다운로드하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(PricingMotionComparison));
    assert.match(html, /data-pricing-motion-comparison/);
    assert.match(html, /기본 홈페이지 · 기본 모션 포함/);
    assert.match(html, /AI 영상 홈페이지/);
    assert.match(html, /베이직 포함/);
    assert.match(html, /예시 연출/);
    assert.equal((html.match(/src="\/daboim-visibility-film-poster\.webp"/g) ?? []).length, 2);
    assert.equal((html.match(/<article\b/g) ?? []).length, 2);
    assert.doesNotMatch(html, /<video\b/);
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  });
});
