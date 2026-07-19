import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const componentPath = 'src/components/marketing/mockups/SiteExampleMockup.tsx';

describe('F7 — 공유 업종 미니 브라우저 쇼케이스', () => {
  test('랜딩·기능·사례는 하나의 공유 쇼케이스를 사용한다', () => {
    for (const path of [
      'src/app/(marketing)/page.tsx',
      'src/app/(marketing)/features/page.tsx',
      'src/app/(marketing)/cases/page.tsx',
    ]) {
      const source = read(path);
      assert.match(source, /from ['"]@\/components\/marketing\/mockups\/SiteExampleMockup['"]/);
      assert.match(source, /<SiteExampleMockup\b/);
    }
  });

  test('회전 카드 덱 대신 하나의 브라우저 안에서 opacity·scale로 연속 교차 전환한다', () => {
    const source = read(componentPath);
    assert.equal((source.match(/const SHOWCASE_TIMING\b/g) ?? []).length, 1);
    assert.match(source, /daboim\.site\/industry-demo/);
    assert.match(source, /className="absolute inset-0 origin-center"/);
    assert.match(source, /animate=\{\{ opacity: active \? 1 : 0, scale: active \? 1 : 0\.975 \}\}/);
    assert.match(source, /transition=\{reduce \? \{ duration: 0 \} : SHOWCASE_TIMING\.transition\}/);
    assert.doesNotMatch(source, /DeckPhase|STACK_POSES|FAN_POSES|DEPARTING_POSE|zIndex|rotate|setInterval/);
  });

  test('IO·탭 가시성·hover·focus가 자동 교대를 멈추고 모두 정리된다', () => {
    const source = read(componentPath);
    assert.match(source, /new IntersectionObserver/);
    assert.match(source, /observer\.observe\(node\)/);
    assert.match(source, /return \(\) => observer\.disconnect\(\)/);
    assert.match(source, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/);
    assert.match(source, /document\.removeEventListener\('visibilitychange', onVisibilityChange\)/);
    assert.match(source, /if \(reduce \|\| !inViewport \|\| !pageVisible \|\| pointerPaused \|\| focusPaused\) return;/);
    assert.match(source, /onMouseEnter=\{\(\) => setPointerPaused\(true\)\}/);
    assert.match(source, /onMouseLeave=\{\(\) => setPointerPaused\(false\)\}/);
    assert.match(source, /onFocusCapture=\{\(\) => setFocusPaused\(true\)\}/);
    assert.match(source, /setFocusPaused\(false\)/);
    assert.match(source, /window\.clearTimeout\(id\)/);
  });

  test('reduced-motion은 자동재생이 없고 수동 선택은 즉시·접근 가능하게 유지한다', () => {
    const source = read(componentPath);
    assert.match(source, /const reduce = useReducedMotion\(\) \?\? false/);
    assert.match(source, /if \(reduce \|\| !inViewport/);
    assert.match(source, /reduce \? \{ duration: 0 \}/);
    assert.equal((source.match(/aria-pressed=\{active\}/g) ?? []).length, 1);
    assert.match(source, /aria-label=\{`\$\{site\.label\} 홈페이지 예시 보기`\}/);
    assert.match(source, /onClick=\{\(\) => setActiveIndex\(index\)\}/);
    assert.match(source, /focus-visible:outline-\[#174DDA\]/);
  });

  test('기존 사용처의 고정 geometry를 유지하고 업종별 화면은 실제로 서로 다르다', () => {
    const source = read(componentPath);
    assert.equal((source.match(/h-\[168px\] w-\[236px\]/g) ?? []).length, 1);
    assert.match(source, /function CafeVisual/);
    assert.match(source, /function ClinicVisual/);
    assert.match(source, /function AcademyVisual/);
    assert.match(source, /site\.key === 'cafe'/);
    assert.match(source, /site\.key === 'clinic'/);
    assert.match(source, /site\.key === 'academy'/);
    assert.match(source, /data-industry-showcase/);
  });
});
