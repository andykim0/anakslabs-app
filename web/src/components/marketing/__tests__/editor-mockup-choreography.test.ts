import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const componentPath = 'src/components/marketing/mockups/EditorMockup.tsx';
const stylesPath = 'src/components/marketing/mockups/EditorMockup.styles.ts';

describe('L4 — 하나로 이어지는 에디터 데모 안무', () => {
  test('랜딩과 기능 페이지가 동일한 프로덕션 목업을 사용한다', () => {
    for (const path of ['src/app/(marketing)/page.tsx', 'src/app/(marketing)/features/page.tsx']) {
      const source = read(path);
      assert.match(source, /from ['"]@\/components\/marketing\/mockups\/EditorMockup['"]/);
      assert.match(source, /<EditorMockup\b/);
    }
  });

  test('10초 한 타임라인이 선택→드래그→입력→색 변경의 완결된 순서를 갖는다', () => {
    const component = read(componentPath);
    const css = read(stylesPath);
    assert.match(component, /EDITOR_DEMO_DURATION_MS = 10_000/);
    for (const keyframe of [
      'editor-menu-selection',
      'editor-block-drag',
      'editor-image-drop',
      'editor-type-copy',
      'editor-accent-shift',
    ]) {
      assert.match(css, new RegExp(`@keyframes ${keyframe}\\b`));
    }
    assert.match(css, /var\(--editor-demo-duration\)/);
    assert.doesNotMatch(component, /framer-motion|setInterval|requestAnimationFrame/);
  });

  test('화면 밖·숨긴 탭·reduced-motion에서는 반복 작업이 정지하고 cleanup한다', () => {
    const component = read(componentPath);
    const css = read(stylesPath);
    assert.match(component, /new IntersectionObserver/);
    assert.match(component, /rootMargin: '0px'/);
    assert.match(component, /isIntersecting && !document\.hidden && !reducedMotion\.matches/);
    assert.match(component, /document\.addEventListener\('visibilitychange'/);
    assert.match(component, /reducedMotion\.addEventListener\('change'/);
    assert.match(component, /observer\.disconnect\(\)/);
    assert.match(component, /document\.removeEventListener\('visibilitychange'/);
    assert.match(component, /reducedMotion\.removeEventListener\('change'/);
    assert.match(css, /data-playing='true'[\s\S]*animation-play-state: running/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  });

  test('JS 없는 기본 DOM은 완성 상태이고 핵심 문구·시맨틱 구조가 그대로 존재한다', () => {
    const component = read(componentPath);
    const css = read(stylesPath);
    assert.match(component, /<figure\b[\s\S]*<figcaption\b/);
    assert.match(component, /data-editor-demo="continuous-canvas"/);
    assert.match(component, /<nav\b[\s\S]*<ol\b[\s\S]*<li\b/);
    assert.match(component, /<section\b[\s\S]*<h3\b/);
    assert.match(component, /<aside\b/);
    assert.match(component, /여름 메뉴를 소개해요/);
    assert.match(component, /대표 이미지/);
    assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(`${component}\n${css}`, /슬라이드/);
    assert.match(css, /The base DOM is the complete final state/);
    assert.match(css, /\.dbe-cursor\s*\{[^}]*opacity:\s*0;/);
    assert.doesNotMatch(css.split(".dbe-demo[data-enhanced='true']")[0], /clip-path:\s*inset\(0 100%/);
  });

  test('프레임 안무는 transform·opacity·clip-path·색만 바꾸고 레이아웃을 매 프레임 쓰지 않는다', () => {
    const css = read(stylesPath);
    const keyframeSource = [...css.matchAll(/@keyframes\s+[\w-]+\s*\{(?:[^{}]|\{[^{}]*\})*\}/g)]
      .map((match) => match[0])
      .join('\n');
    assert.ok(keyframeSource.length > 0, '키프레임 계약 누락');
    assert.doesNotMatch(keyframeSource, /(?:^|[;{]\s*)(?:top|left|right|bottom|width|height|margin|padding)\s*:/m);
    assert.doesNotMatch(keyframeSource, /filter:\s*(?:blur|brightness|contrast)/);
    assert.doesNotMatch(keyframeSource, /will-change/);
  });
});
