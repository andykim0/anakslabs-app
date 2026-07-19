import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { LandingCinematicShowcase } from '../LandingCinematicShowcase';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('LP2$ F1 히어로 영상·확장 주입 hydration 경계', () => {
  test('Grammarly 같은 body 속성 주입만 root body에서 억제한다', () => {
    const layout = read('src/app/layout.tsx');
    assert.match(layout, /<body suppressHydrationWarning className="min-h-full flex flex-col">/);
    assert.equal((layout.match(/suppressHydrationWarning/g) ?? []).length, 1,
      '하위 hydration 오류까지 가리는 광범위한 억제를 추가하면 안 됨');
  });

  test('첫 화면은 같은 포스터를 배경과 카드에 이중 렌더하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(LandingCinematicShowcase));
    const root = parse(html);
    const prelude = root.querySelector('[data-lcs-prelude]');
    assert.ok(prelude);
    assert.equal(prelude.querySelectorAll('img[src*="daboim-visibility-film-poster"]').length, 1);
    assert.equal(prelude.querySelectorAll('[data-lcs-hero-ambient]').length, 1);
  });

  test('desktop film 경로는 autoplay 정책·poster-first·실패 폴백을 모두 갖는다', () => {
    const source = read('src/components/marketing/OptimizationConsole.tsx');
    assert.match(source, /autoPlay[\s\S]*muted[\s\S]*loop[\s\S]*playsInline/);
    assert.match(source, /poster="\/daboim-visibility-film-poster\.webp"/);
    assert.match(source, /onPlaying=\{\(\) => setPlaying\(true\)\}/);
    assert.match(source, /onError=\{\(\) => \{[\s\S]*setFailed\(true\)/);
    assert.match(source, /isDesktop && !reduce && !failed/);
    assert.doesNotMatch(source, /preload="auto"/);
  });
});
