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

  test('8초 한 타임라인이 선택→드래그→입력→색 변경의 완결된 순서를 갖는다', () => {
    const component = read(componentPath);
    const css = read(stylesPath);
    assert.match(component, /EDITOR_DEMO_DURATION_MS = 8_000/);
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

  test('이동·정착·누름·리플이 8초 타임라인에서 순차로 동기화된다', () => {
    const css = read(stylesPath);
    const durationMs = 8_000;
    const toMilliseconds = ([from, to]: readonly [number, number]) =>
      ((to - from) / 100) * durationMs;

    for (const move of [
      [7, 14],
      [21, 29],
      [36, 46],
      [51, 59],
      [67, 75],
      [92, 97],
    ] as const) {
      const milliseconds = toMilliseconds(move);
      assert.ok(milliseconds >= 400 && milliseconds <= 800, `move ${move.join('→')}%: ${milliseconds}ms`);
    }

    for (const hold of [
      [16.5, 21],
      [31.5, 36],
      [46, 51],
      [61.5, 67],
    ] as const) {
      const milliseconds = toMilliseconds(hold);
      assert.ok(milliseconds >= 300 && milliseconds <= 500, `hold ${hold.join('→')}%: ${milliseconds}ms`);
    }

    for (const settle of [
      [14, 15.5],
      [29, 30.5],
      [59, 60.5],
      [75, 76.5],
    ] as const) {
      assert.equal(toMilliseconds(settle), 120, `settle ${settle.join('→')}%`);
    }

    assert.match(
      css,
      /editor-cursor var\(--editor-demo-duration\) cubic-bezier\(0\.16, 1, 0\.3, 1\)/,
    );
    assert.doesNotMatch(css, /editor-cursor var\(--editor-demo-duration\) linear/);
    for (const ripple of ['editor-menu-ripple', 'editor-source-ripple', 'editor-mint-ripple']) {
      assert.match(css, new RegExp(`@keyframes ${ripple}\\b`));
    }
    for (const press of ['15.5', '30.5', '60.5', '76.5']) {
      assert.match(
        css,
        new RegExp(`${press.replace('.', '\\.')}% \\{ transform: translate3d\\([^}]+scale\\(0\\.86\\)`),
      );
    }
    assert.match(css, /@keyframes editor-menu-ripple[\s\S]*15\.5% \{[^}]*opacity: 0\.42/);
    assert.match(css, /@keyframes editor-source-ripple[\s\S]*30\.5% \{[^}]*opacity: 0\.42/);
    assert.match(css, /@keyframes editor-mint-ripple[\s\S]*76\.5% \{[^}]*opacity: 0\.48/);
  });

  test('커서 끝점을 클릭 좌표로 삼고 데스크톱·모바일 타깃 중심을 각각 선언한다', () => {
    const css = read(stylesPath);
    assert.match(css, /\.dbe-cursor\s*\{[^}]*transform-origin: 2\.86px 3\.32px;/);
    for (const variable of [
      '--dbe-rail-hit-x',
      '--dbe-menu-hit-y',
      '--dbe-source-hit-y',
      '--dbe-copy-hit-x',
      '--dbe-copy-hit-y',
      '--dbe-mint-hit-x',
      '--dbe-mint-hit-y',
    ]) {
      assert.equal(css.match(new RegExp(`${variable}:`, 'g'))?.length, 2, `${variable} desktop/mobile`);
    }
    assert.equal(css.match(/@keyframes editor-cursor\b/g)?.length, 1, '컨테이너별 중복 키프레임 금지');
  });

  test('이미지 블록은 중간 좌표를 거치는 곡선 경로로 이동하고 루프 끝은 숨긴 채 원점으로 돌아간다', () => {
    const css = read(stylesPath);
    assert.match(
      css,
      /@keyframes editor-block-drag[\s\S]*39\.5%[\s\S]*rotate\(-0\.6deg\)[\s\S]*43%[\s\S]*rotate\(0\.35deg\)[\s\S]*46%/,
    );
    assert.match(
      css,
      /@keyframes editor-cursor[\s\S]*92%[\s\S]*97%, 100% \{ transform: translate3d\(12cqw, 45px, 0\) scale\(1\); opacity: 0; \}/,
    );
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
