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

  test('첫 화면은 전역 필름의 포스터 하나만 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(LandingCinematicShowcase));
    const root = parse(html);
    const prelude = root.querySelector('[data-lcs-prelude]');
    assert.ok(prelude);
    assert.equal(prelude.querySelectorAll('img[src*="daboim-visibility-film-poster"]').length, 0);
    assert.equal(root.querySelectorAll('img[src*="daboim-visibility-film-poster"]').length, 1);
    assert.equal(prelude.querySelectorAll('[aria-hidden].absolute.inset-0').length, 0);
  });

  test('desktop film 경로는 autoplay 정책·poster-first·실패 폴백을 모두 갖는다', () => {
    const source = read('src/components/marketing/OptimizationConsole.tsx');
    assert.match(source, /autoPlay[\s\S]*muted[\s\S]*loop[\s\S]*playsInline/);
    assert.match(source, /poster="\/daboim-visibility-film-poster\.webp"/);
    assert.match(source, /onPlaying=\{\(\) => setPlaying\(true\)\}/);
    assert.match(source, /onError=\{\(\) => \{[\s\S]*setFailed\(true\)/);
    assert.match(source, /isDesktop && !reduce && !failed/);
    assert.match(source, /useFailClosedReducedMotion/);
    const reducedSource = read('src/components/marketing/use-fail-closed-reduced-motion.ts');
    assert.match(reducedSource, /useState\(true\)/,
      'SSR와 첫 hydration render는 정적으로 fail-closed 해야 함');
    assert.match(reducedSource, /useEffect\([\s\S]*window\.matchMedia[\s\S]*setReduce\(query\.matches\)/,
      '실제 모션 허용은 mount 뒤 브라우저 preference를 읽은 후에만 가능해야 함');
    assert.doesNotMatch(source, /preload="auto"/);
  });

  test('무료 진단 CTA의 조건부 빛 스윕도 SSR·reduced hydration에서 fail-closed 한다', () => {
    const scanner = read('src/components/landing/LandingScanner.tsx');
    assert.match(scanner, /useFailClosedReducedMotion\(\)/);
    assert.doesNotMatch(scanner, /useReducedMotion/,
      '서버 false·브라우저 true로 갈리는 hook이 조건부 DOM을 바꾸면 hydration이 깨짐');
    assert.match(scanner, /!reduce && !url && !scanning/);
  });
});
