import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { LandingCinematicShowcase } from '../LandingCinematicShowcase';
import { LandingFullFilm } from '../LandingFullFilm';
import { LandingStoryContinuation } from '../LandingStoryContinuation';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('D4 예시 안내의 필름 무대 편입', () => {
  test('예시 배지는 전역 필름 stage 안의 고정 overlay이며 /cases 링크와 기기 안내를 보존한다', () => {
    const html = renderToStaticMarkup(createElement(
      LandingFullFilm,
      null,
      createElement(LandingCinematicShowcase),
    ));
    const root = parse(html);
    const stage = root.querySelector('[data-landing-full-film-stage]');
    const badge = stage?.querySelector('[data-film-example-badge]');
    assert.ok(badge);
    assert.equal(badge.querySelector('a')?.getAttribute('href'), '/cases');
    assert.match(badge.textContent, /예시 · AI 영상 홈페이지 적용 시 · 적용 사례 보기/);
    assert.match(badge.textContent, /컴퓨터: 스크롤 반응 · 휴대폰: 부드러운 반복/);

    const showcase = read('src/components/marketing/LandingCinematicShowcase.tsx');
    assert.match(showcase, /\[data-landing-manifesto\] \[data-film-example-badge\] \{[\s\S]*position: fixed/);
    assert.match(showcase, /@media \(max-width: 767\.98px\)[\s\S]*top: 76px; right: 12px; left: 12px/);
    assert.match(read('src/lib/motion/runtime.ts'), /--film-badge-y[\s\S]*--film-badge-opacity/);
    assert.match(read('src/lib/motion/runtime.ts'), /data-upper-film-ended/);
  });

  test('예시 선언은 다섯 번째 semantic act이고 링크도 그 막 내부에 있다', () => {
    const root = parse(renderToStaticMarkup(createElement(LandingCinematicShowcase)));
    const acts = root.querySelectorAll('article[data-ss-act]');
    assert.equal(acts.length, 5);
    const declaration = acts[4]!;
    assert.match(declaration.textContent, /지금 보고 계신 이 홈페이지가 다보임으로 만든 예시입니다\./);
    assert.equal(declaration.querySelector('a[data-ss-act-link]')?.getAttribute('href'), '/cases');
    assert.match(declaration.querySelector('a[data-ss-act-link]')?.textContent ?? '', /적용 사례 보기/);
  });

  test('폐기한 별도 띠는 SSR과 컴포넌트 소스 어디에도 남지 않는다', () => {
    const continuation = renderToStaticMarkup(createElement(
      LandingStoryContinuation,
      null,
      createElement('section', null, '후속 내용'),
    ));
    assert.doesNotMatch(continuation, /data-story-bridge|landing-proof-heading/);
    assert.doesNotMatch(read('src/components/marketing/LandingStoryContinuation.tsx'), /data-story-bridge|landing-proof-heading/);
    assert.doesNotMatch(read('src/components/marketing/LandingFullFilm.tsx'), /예시 · AI 영상 홈페이지 적용 시 · 적용 사례 보기/);
    assert.equal((read('src/components/marketing/LandingCinematicShowcase.tsx').match(/예시 · AI 영상 홈페이지 적용 시 · 적용 사례 보기/g) ?? []).length, 1);
  });
});
